const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const { getLatestPrices } = require('@portomind/shared/services/marketData.service');
const { getStatus } = require('@portomind/shared/services/cronStatus.service');
const { saveLatest } = require('@portomind/shared/services/priceStorage.service');
const { dateBounds } = require('@portomind/shared/utils/marketTime');
const { digest, NAMES } = require('./symbol-data-tools.cjs');

const uri = process.env.TASK077_TEST_URI;
const migrate = path.join(__dirname, 'migrate-symbol-data.cjs');
const probe = path.join(__dirname, 'probe-symbol-data-quality.cjs');
const timestamp = new Date('2025-01-01T05:00:00Z');
const secondDay = new Date('2025-01-02T05:00:00Z');
const thirdDay = new Date('2025-01-03T05:00:00Z');

function run(command, args, env) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
  if (result.error) throw result.error;
  return result;
}

function pointAt(connection, db) {
  return connection.replace(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?/, '$1/' + db);
}

test('TASK-077 MongoDB probe, backup guards, exact writes and crash recovery', { skip: !uri }, async () => {
  const target = 'portomind_077_' + Date.now() + '_' + process.pid + '_test';
  const backup = target.replace('_test', '_backup_test');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portomind-task077-test-'));
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  const db = client.db(target);
  const targetEnv = { MONGO_URI: pointAt(uri, target) };
  const report = path.join(dir, 'probe.md');
  const plan = path.join(dir, 'plan.json');
  const archive = path.join(dir, 'dump.archive');
  const marker = path.join(dir, 'approval.json');
  const log = plan + '.journal.jsonl';
  const assets = db.collection('assets');
  const prices = db.collection('prices');
  const transactions = db.collection('transactions');
  const portfolios = db.collection('portfolios');
  const taskruns = db.collection('taskruns');
  const price = (symbol, day) => ({ symbol, timestamp: day, price: 4.25 });
  const force = (env = targetEnv, nodeFlags = []) =>
    run(process.execPath, [...nodeFlags, migrate, '--force', '--approval', marker], env);
  const preview = () => run(process.execPath, [migrate], targetEnv);
  const scan = () => run(process.execPath, [probe, '--out', report], targetEnv);
  const contents = async () => Promise.all([...NAMES, 'taskruns'].map(name =>
    db.collection(name).find().sort({ _id: 1 }).toArray()));

  try {
    assert.equal(await assets.countDocuments(), 0);
    await assets.createIndex({ symbol: 1 }, { unique: true });
    await prices.createIndex({ symbol: 1, timestamp: 1 }, { unique: true });
    await assets.insertMany([
      { symbol: '001180.cn', market: 'CN-FUND', currency: 'CNY', active: true },
      { symbol: 'SINGLE', market: 'US', currency: 'USD', active: true },
      { symbol: 'INACTIVE.TO', market: 'CA', currency: 'CAD', active: false }
    ]);
    await prices.insertMany([
      price('001180', timestamp), price('001180', secondDay), price('001180.CN', timestamp),
      price('SINGLE', timestamp), price('INACTIVE', timestamp), price('INACTIVE.TO', timestamp)
    ]);
    await transactions.insertMany([
      { symbol: '001180.CN', market: 'CN-FUND', date: timestamp },
      { symbol: 'SINGLE', market: 'US', date: timestamp },
      { symbol: 'ORPHAN', market: 'US', date: timestamp }
    ]);
    const broadTarget = { level: 'asset_class', symbol: 'equity', targetRatio: 100 };
    await portfolios.insertMany([
      { targets: [{ level: 'asset', symbol: '001180', targetRatio: 100 }] },
      { targets: [broadTarget] }
    ]);
    const failed = { taskName: 'daily-price-sync', status: 'FAILED', failures: [
      { item: '001180.cn', provider: 'EASTMONEY', category: 'NOT_FOUND' }
    ] };
    await taskruns.insertMany([
      { taskName: 'daily-price-sync', runKey: 'zombie', status: 'RUNNING', startedAt: timestamp },
      { ...failed, startedAt: timestamp }, { ...failed, startedAt: secondDay }
    ]);

    for (const cli of [migrate, probe]) assert.equal(run(process.execPath, [cli, '--help']).status, 0);
    const before = await contents();
    assert.equal(scan().status, 0);
    const markdown = fs.readFileSync(report, 'utf8');
    assert.match(markdown, /"001180" × 2.*"001180.CN" × 1/);
    assert.match(markdown, /EASTMONEY.*CNY.*\| 2 \|/);
    assert.match(markdown, /ORPHAN/);
    assert.match(markdown, /zombie/);
    assert.doesNotMatch(markdown, /equity/);

    const noApproval = run(process.execPath, [migrate, '--force'], targetEnv);
    assert.equal(noApproval.status, 1);
    assert.match(noApproval.stderr, /备份标记/);
    assert.equal(preview().status, 0);
    assert.deepEqual(await contents(), before);

    const collision = await assets.insertOne({ symbol: '001180.CN', market: 'CN-FUND', active: true });
    const collisionPlan = preview();
    assert.equal(collisionPlan.status, 1);
    assert.match(collisionPlan.stdout, /归一后唯一键冲突/);
    assert.equal(await prices.countDocuments(), 6);
    await assets.deleteOne({ _id: collision.insertedId });

    const ambiguous = await assets.insertOne({ symbol: '001180.US', market: 'US', active: false });
    assert.equal(scan().status, 0);
    assert.match(fs.readFileSync(report, 'utf8'), /归属歧义/);
    assert.equal(preview().status, 1);
    await assets.deleteOne({ _id: ambiguous.insertedId });

    const missingMarket = await assets.insertOne({ symbol: 'UNKNOWN', active: true });
    const missingPlan = preview();
    assert.equal(missingPlan.status, 1);
    assert.match(missingPlan.stdout, /缺少有效 market/);
    await assets.deleteOne({ _id: missingMarket.insertedId });

    const candidate = preview();
    assert.equal(candidate.status, 0, candidate.stderr);
    const manifest = JSON.parse(candidate.stdout);
    assert.equal(manifest.deletions.length, 1);
    assert.equal(manifest.stranded[0].canonical, 'SINGLE.US');
    assert.equal(manifest.unresolved[0].symbol, 'ORPHAN');
    fs.writeFileSync(plan, candidate.stdout);
    const approval = {
      approvedBy: 'synthetic verification only',
      approvedAt: new Date().toISOString(),
      writersStopped: true,
      plan, planSha256: digest(fs.readFileSync(plan)),
      backupDb: backup, archive, archiveSha256: 'missing'
    };
    const setMarker = () => fs.writeFileSync(marker, JSON.stringify(approval));
    setMarker();
    assert.equal(force().status, 1);
    assert.deepEqual(await contents(), before);

    const dump = run(process.env.MONGODUMP_BIN || 'mongodump', [
      '--uri=' + targetEnv.MONGO_URI, '--gzip', '--archive=' + archive
    ]);
    assert.equal(dump.status, 0, 'test fixture mongodump');
    const restore = run(process.env.MONGORESTORE_BIN || 'mongorestore', [
      '--uri=' + pointAt(uri, backup), '--gzip', '--archive=' + archive,
      '--nsInclude=' + target + '.*', '--nsFrom=' + target + '.*', '--nsTo=' + backup + '.*'
    ]);
    assert.equal(restore.status, 0, 'test fixture mongorestore');
    approval.archiveSha256 = digest(fs.readFileSync(archive));
    setMarker();
    assert.match(force({ MONGO_URI: pointAt(uri, backup) }).stderr, /实际目标库/);

    const changedBackup = client.db(backup).collection('prices');
    await changedBackup.updateOne({ symbol: 'SINGLE' }, { $set: { price: 99 } });
    const badBackup = force();
    assert.equal(badBackup.status, 1);
    assert.match(badBackup.stderr, /试还原数据、索引或冻结清单不符/);
    await changedBackup.updateOne({ symbol: 'SINGLE' }, { $set: { price: 4.25 } });
    assert.deepEqual(await contents(), before);

    // 在两个确定的 I/O 边界强制退出真实 CLI。生产脚本没有故障注入参数。
    const hook = path.join(dir, 'interrupt.cjs');
    const stop = (source, event) => {
      fs.writeFileSync(hook, source);
      const result = force(targetEnv, ['--require', hook]);
      assert.ok(result.signal === 'SIGKILL' || result.status !== 0, result.stderr);
      assert.ok(fs.existsSync(plan + '.lock'), result.stderr);
      assert.match(fs.readFileSync(log, 'utf8'), new RegExp('"event":"' + event + '"'));
      fs.rmdirSync(plan + '.lock');
    };
    stop(
      "const fs=require('node:fs'); const write=fs.writeFileSync; const sync=fs.fsyncSync;" +
      "let fd; fs.writeFileSync=function(file,data,...args){const result=write(file,data,...args);" +
      "if(typeof file==='number' && String(data).includes('\"event\":\"normalized\"')) fd=file; return result;};" +
      "fs.fsyncSync=function(file){sync(file); if(file===fd) process.kill(process.pid,'SIGKILL');};",
      'normalized'
    );
    assert.ok(await assets.findOne({ symbol: '001180.CN' }));
    assert.ok(await transactions.findOne({ symbol: 'SINGLE.US' }));
    assert.equal(await prices.countDocuments(), 6);

    stop(
      "const {Collection}=require(" + JSON.stringify(require.resolve('mongodb')) + ");" +
      "const bulk=Collection.prototype.bulkWrite; Collection.prototype.bulkWrite=async function(ops,options){" +
      "await bulk.call(this,ops.slice(0,1),options); process.kill(process.pid,'SIGKILL');};",
      'started'
    );
    assert.equal(await prices.countDocuments({ symbol: '001180' }), 1);

    const capture = await prices.insertOne(price('001180.CN', thirdDay));
    const drift = force();
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /新增的价格/);
    assert.equal(await prices.countDocuments(), 6);
    await prices.deleteOne({ _id: capture.insertedId });

    const finish = force();
    assert.equal(finish.status, 0, finish.stderr);
    const audit = JSON.parse(finish.stdout);
    assert.deepEqual(audit.deletions[0].prices.map(item => [item.symbol, item.before, item.after, item.deleted]),
      [['001180', 2, 0, 2], ['001180.CN', 1, 0, 1]]);
    assert.deepEqual(await prices.find().sort({ _id: 1 }).toArray(),
      before[3].filter(row => !['001180', '001180.CN'].includes(row.symbol)));
    assert.ok(await portfolios.findOne({ 'targets.symbol': '001180.CN' }));
    assert.deepEqual((await portfolios.findOne({ 'targets.level': 'asset_class' })).targets, [broadTarget]);
    assert.ok(await transactions.findOne({ symbol: 'ORPHAN' }));

    const now = new Date('2026-11-13T20:00:00Z');
    await mongoose.connect(targetEnv.MONGO_URI, { autoCreate: false, autoIndex: false });
    const getPriceState = async () => (await getStatus({ now })).tasks.find(
      task => task.taskName === 'daily-price-sync').dataState;
    const initial = await getPriceState();
    await prices.insertOne(price('SINGLE', dateBounds(initial.byMarket.US.targetMarketDate).start));
    const collected = await saveLatest({
      ...price('001180', dateBounds(initial.byMarket['CN-FUND'].targetMarketDate).start),
      market: 'CN-FUND', currency: 'CNY'
    });
    assert.equal(collected.symbol, '001180.CN');
    assert.deepEqual(await getLatestPrices(['001180.CN', 'SINGLE.US']), { '001180.CN': 4.25, 'SINGLE.US': null });
    const status = await getPriceState();
    assert.deepEqual([status.fetched, status.expected], [1, 2]);
    assert.deepEqual(status.missing.map(item => item.symbol), ['SINGLE.US']);
    const after = await contents();
    assert.equal(force().status, 0);
    assert.match(preview().stderr, /无需变更/);
    assert.deepEqual(await contents(), after);

    await taskruns.drop();
    assert.equal(scan().status, 1);
    const partial = fs.readFileSync(report, 'utf8');
    assert.match(partial, /扫描失败.*taskruns/);
    assert.match(partial, /ORPHAN/);
  } finally {
    await mongoose.disconnect();
    await Promise.allSettled([db.dropDatabase(), client.db(backup).dropDatabase()]);
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
