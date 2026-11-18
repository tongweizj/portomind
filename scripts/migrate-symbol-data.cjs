#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { normalizeSymbol } = require('@portomind/shared/utils/symbol');
const {
  NAMES, EXACT, FIND, args, withDb, assertReadOnly, digest, bson, inventory, priceInventory,
  targetsOf, isAssetTarget, symbolIdentity, reportError
} = require('./symbol-data-tools.cjs');

const WRITE = { ...EXACT, writeConcern: { w: 'majority', j: true } };
const CHUNK = 250;
const VERSION = 1;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function loadJson(file) {
  const source = fs.readFileSync(file);
  return { contents: JSON.parse(source), sha256: digest(source) };
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function hashRows(rows) {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(bson(row) + '\n');
  return { count: rows.length, sha256: hash.digest('hex') };
}

async function identity(db) {
  const collections = await db.listCollections({ name: { $in: NAMES } }).toArray();
  return Object.fromEntries(NAMES.map(name => {
    const item = collections.find(collection => collection.name === name);
    check(item?.info?.uuid && item.type === 'collection', '库 ' + db.databaseName + ' 缺少实体集合或 UUID：' + name);
    return [name, item.info.uuid.toString()];
  }));
}

async function snapshot(db, names = NAMES) {
  const entries = await Promise.all(names.map(async name => {
    const collection = db.collection(name);
    const [rows, indexes] = await Promise.all([
      collection.find({}, FIND).sort({ _id: 1 }).toArray(),
      collection.indexes()
    ]);
    indexes.sort((a, b) => a.name.localeCompare(b.name));
    return [name, { rows, indexSha256: digest(bson(indexes)) }];
  }));
  return Object.fromEntries(entries);
}

function fingerprints(data) {
  return Object.fromEntries(NAMES.map(name => [
    name, { ...hashRows(data[name].rows), indexSha256: data[name].indexSha256 }
  ]));
}

function unique(set) {
  return set?.size === 1 ? [...set][0] : null;
}

function changes(data) {
  const index = inventory(data.assets.rows);
  const blockers = [];
  const unresolved = [];
  const mapping = [];
  const updates = { assets: [], transactions: [], portfolios: [] };
  const destinations = new Map();

  function add(collection, doc, fields) {
    updates[collection].push({ before: doc, after: { ...doc, ...fields }, fields });
  }

  for (const { doc, keys } of index.rows) {
    if (!keys) {
      blockers.push('资产缺少有效 market 或无法派生 symbol：' + doc._id + ' / ' + doc.symbol);
      continue;
    }
    const { canonical } = keys;
    if (destinations.has(canonical)) {
      blockers.push('归一后唯一键冲突：' + canonical + ' / ' + destinations.get(canonical)._id + ' / ' + doc._id);
    }
    destinations.set(canonical, doc);
    const occupied = index.exact.get(canonical);
    if (occupied && ![...occupied].every(row => row.doc === doc)) {
      blockers.push('有其它资产占用目标精确键：' + canonical + ' / ' + doc._id);
    }
    if (doc.symbol !== canonical) {
      add('assets', doc, { symbol: canonical });
      mapping.push({ collection: 'assets', id: String(doc._id), from: doc.symbol, to: canonical });
    }
  }

  for (const doc of data.transactions.rows) {
    const keys = symbolIdentity(doc.symbol, doc.market);
    if (!keys) {
      blockers.push('交易缺少有效 market 或无法派生 symbol：' + doc._id + ' / ' + doc.symbol);
      continue;
    }
    if (destinations.get(keys.canonical)?.market !== doc.market) {
      unresolved.push({ collection: 'transactions', id: String(doc._id), symbol: doc.symbol, market: doc.market });
      continue;
    }
    if (doc.symbol !== keys.canonical) {
      add('transactions', doc, { symbol: keys.canonical });
      mapping.push({ collection: 'transactions', id: String(doc._id), from: doc.symbol, to: keys.canonical });
    }
  }

  for (const doc of data.portfolios.rows) {
    let changed = false;
    const targets = targetsOf(doc).map((target, i) => {
      if (!isAssetTarget(target)) return target;
      const location = { collection: 'portfolios', id: String(doc._id), targetIndex: i };
      const exact = index.exact.get(target.symbol);
      const alias = index.aliases.get(normalizeSymbol(target.symbol));
      const owner = unique(exact) || unique(alias);
      // 目标本身没有 market。精确旧键与其他资产的目标键冲突时保留原值并阻断碰撞。
      if (!owner?.keys) {
        unresolved.push({ ...location, symbol: target.symbol, reason: exact || alias ? '归属歧义或 market 无效' : '资产未找到' });
        return target;
      }
      const canonical = owner.keys.canonical;
      if (target.symbol === canonical) return target;
      changed = true;
      mapping.push({ ...location, from: target.symbol, to: canonical });
      return { ...target, symbol: canonical };
    });
    if (changed) {
      const symbols = targets.filter(isAssetTarget).map(target => target.symbol);
      if (new Set(symbols).size !== symbols.length) blockers.push('归一后组合目标 symbol 重复：' + doc._id);
      add('portfolios', doc, { targets });
    }
  }

  return { index, blockers, unresolved, mapping, updates };
}

async function buildPlan(db, target) {
  const sourceId = await identity(db);
  const [data, stats] = await Promise.all([snapshot(db), assertReadOnly(db).priceStats()]);
  check(bson(sourceId) === bson(await identity(db)), '读取期间集合身份变化。');
  const { index, blockers, unresolved, mapping, updates } = changes(data);
  const { dual, ambiguous, stranded } = priceInventory(index, stats);
  for (const row of dual.filter(row => row.blocked)) {
    blockers.push('双键资产存在键归属歧义或有多于两套精确键：' + row.id + ' / ' + row.previous);
  }
  const deletionKeys = new Set(dual.filter(row => !row.blocked).flatMap(row => row.prices.map(price => price.symbol)));
  const documents = new Map([...deletionKeys].map(key => [key, []]));
  for (const row of data.prices.rows) documents.get(row.symbol)?.push(row);
  const deletions = dual.filter(row => !row.blocked).map(row => ({
    ...row,
    prices: row.prices.map(price => {
      const frozen = hashRows(documents.get(price.symbol));
      check(frozen.count === price.count, '价格探测期间清单发生变化：' + price.symbol);
      return { ...price, sha256: frozen.sha256 };
    })
  }));
  const manifest = {
    version: VERSION, target: target || { database: db.databaseName, collections: sourceId },
    before: fingerprints(data), mapping, deletions, ambiguous, stranded, unresolved, blockers
  };
  return { manifest, data, updates, documents, sourceId };
}

function exactDocument(doc) {
  return { _id: doc._id, $expr: { $eq: ['$$ROOT', { $literal: doc }] } };
}

function afterRows(run, name) {
  const replacements = new Map(run.updates[name].map(update => [bson(update.before._id), update.after]));
  return run.data[name].rows.map(doc => replacements.get(bson(doc._id)) || doc);
}

function verifySymbols(run, current, requireAfter) {
  for (const name of NAMES.slice(0, -1)) {
    const before = run.data[name].rows;
    const after = afterRows(run, name);
    const rows = current[name].rows;
    check(rows.length === before.length, name + ' 文档数量漂移。');
    for (const [i, row] of rows.entries()) {
      const actual = bson(row);
      check(actual === bson(after[i]) || (!requireAfter && actual === bson(before[i])),
        name + ' 数据漂移：' + row._id);
    }
  }
}

function verifyPrices(run, rows, history) {
  const current = new Map(rows.map(row => [bson(row._id), row]));
  const pending = new Map([...run.documents.keys()].map(key => [key, []]));
  for (const doc of run.data.prices.rows) {
    const id = bson(doc._id);
    const found = current.get(id);
    const phase = history.keys.get(doc.symbol);
    if (found) {
      check(phase !== 'done' && bson(found) === bson(doc), '价格内容或执行进度漂移：' + doc.symbol + ' / ' + doc._id);
      pending.get(doc.symbol)?.push(doc);
      current.delete(id);
    } else {
      check(phase === 'started' || phase === 'done', '未开始删除的价格已消失：' + doc.symbol + ' / ' + doc._id);
    }
  }
  const extra = current.values().next().value;
  check(!extra, '发现备份后新增的价格：' + extra?.symbol + ' / ' + extra?._id);
  return pending;
}

function readHistory(file, sha256, keys, counts) {
  const state = { normalizing: false, normalized: false, completed: false, keys: new Map(), after: null };
  if (!fs.existsSync(file)) return state;
  const raw = fs.readFileSync(file, 'utf8');
  check(raw.endsWith('\n'), '日志末尾不完整，保留现场并核对备份后恢复。');
  for (const line of raw.trimEnd().split('\n')) {
    const row = JSON.parse(line);
    check(row.sha256 === sha256 && !state.completed, '日志与已批准清单或执行顺序不一致。');
    if (row.event === 'normalizing' && !state.normalizing) state.normalizing = true;
    else if (row.event === 'normalized' && state.normalizing && !state.normalized) state.normalized = true;
    else if (row.event === 'started' && state.normalized && keys[state.keys.size] === row.key &&
      [...state.keys.values()].every(phase => phase === 'done')) state.keys.set(row.key, 'started');
    else if (row.event === 'done' && state.keys.get(row.key) === 'started' && row.deleted === counts.get(row.key)) {
      state.keys.set(row.key, 'done');
    }
    else if (row.event === 'completed' && state.normalized && keys.every(key => state.keys.get(key) === 'done') && row.after) {
      state.completed = true;
      state.after = row.after;
    } else {
      throw new Error('日志包含无法证明安全续跑的事件：' + row.event);
    }
  }
  return state;
}

function journal(file, sha256, event, details = {}) {
  const fd = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify({ at: new Date().toISOString(), sha256, event, ...details }) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function approvalAt(file) {
  check(file && fs.existsSync(file), '--force 需要 Human 确认及备份标记文件，请提供 --approval。');
  const marker = loadJson(file).contents;
  for (const key of ['approvedBy', 'approvedAt', 'backupDb', 'archive', 'archiveSha256', 'plan', 'planSha256']) {
    check(typeof marker?.[key] === 'string' && marker[key].trim(), '备份标记或批准字段为空：' + key);
  }
  check(Number.isFinite(Date.parse(marker.approvedAt)), '批准时间无效。');
  check(marker.writersStopped === true, '需确认已暂停目标库全部写入者。');
  check(/^[a-zA-Z0-9_-]+$/.test(marker.backupDb), '试还原库名无效。');
  const resolve = value => path.resolve(path.dirname(file), value);
  const planFile = fs.realpathSync(resolve(marker.plan));
  const { contents: plan, sha256 } = loadJson(planFile);
  check(marker.planSha256 === sha256 && plan?.version === VERSION, 'Human 确认的计划 SHA256 或版本不匹配。');
  return { ...marker, file: planFile, plan, sha256, archive: resolve(marker.archive) };
}

async function normalize(db, updates) {
  for (const name of NAMES.slice(0, -1)) {
    for (const { before, after, fields } of updates[name]) {
      const collection = db.collection(name);
      const result = await collection.updateOne(exactDocument(before), { $set: fields }, WRITE);
      if (!result.modifiedCount) {
        const current = await collection.findOne({ _id: before._id }, FIND);
        check(bson(current) === bson(after), '无法安全写入 ' + name + '/' + before._id);
      }
    }
  }
}

async function deleteKey(db, key, rows) {
  const prices = db.collection('prices');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const result = await prices.bulkWrite(batch.map(doc => ({
      deleteOne: { filter: { ...exactDocument(doc), symbol: key }, ...EXACT }
    })), { writeConcern: WRITE.writeConcern });
    check(result.deletedCount === batch.length, '删价期间价格内容发生变化：' + key);
  }
  check(!await prices.findOne({ symbol: key }, EXACT), '删价后精确键仍有记录：' + key);
}

function printAudit(plan, after) {
  console.log(JSON.stringify({
    target: plan.target, before: plan.before, after,
    mapping: plan.mapping,
    deletions: plan.deletions.map(row => ({
      ...row, prices: row.prices.map(price => ({ ...price, before: price.count, after: 0, deleted: price.count }))
    })),
    stranded: plan.stranded, unresolved: plan.unresolved
  }, null, 2));
}

async function execute(db, client, approval) {
  const { file, plan, sha256 } = approval;
  const verifyTarget = async () => check(
    plan.target?.database === db.databaseName && bson(plan.target.collections) === bson(await identity(db)),
    '实际目标库或集合 UUID 与 Human 确认的计划不一致。');
  await verifyTarget();
  check(!plan.blockers?.length, '冻结清单包含阻断项：' + plan.blockers?.join('；'));
  const log = file + '.journal.jsonl';
  const lock = file + '.lock';
  const counts = new Map(plan.deletions.flatMap(row => row.prices.map(price => [price.symbol, price.count])));
  const keys = [...counts.keys()];
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('已有执行锁。确认旧进程退出后，按手册核对日志和停写状态。');
  }

  try {
    const state = readHistory(log, sha256, keys, counts);
    if (state.completed) {
      console.error('原批准计划已完成，无需变更。');
      printAudit(plan, state.after);
      return 0;
    }
    check(approval.backupDb !== db.databaseName, '试还原库必须不同于目标库。');
    const archive = fs.statSync(approval.archive);
    check(archive.isFile() && archive.size > 0 && await hashFile(approval.archive) === approval.archiveSha256,
      '保留的归档不可用或 SHA256 不匹配。');
    const backup = await buildPlan(client.db(approval.backupDb), plan.target);
    check(NAMES.every(name => backup.sourceId[name] !== plan.target.collections[name]),
      '试还原集合与目标集合身份重叠。');
    check(JSON.stringify(backup.manifest) === JSON.stringify(plan), '试还原数据、索引或冻结清单不符。');

    const current = await snapshot(db);
    check(NAMES.every(name => current[name].indexSha256 === plan.before[name].indexSha256), '目标库索引发生变化。');
    if (!state.normalizing) {
      check(bson(fingerprints(current)) === bson(plan.before), '目标库与批准清单的迁移前数据不一致。');
    }
    verifySymbols(backup, current, state.normalized);
    const pending = verifyPrices(backup, current.prices.rows, state);
    await verifyTarget();
    if (!plan.mapping.length && !keys.length) {
      console.error('无需变更。');
      printAudit(plan, plan.before);
      return 0;
    }

    if (!state.normalizing) journal(log, sha256, 'normalizing');
    if (!state.normalized) {
      await normalize(db, backup.updates);
      verifySymbols(backup, await snapshot(db, NAMES.slice(0, -1)), true);
      journal(log, sha256, 'normalized');
    }
    for (const key of keys) {
      if (state.keys.get(key) === 'done') continue;
      if (state.keys.get(key) !== 'started') journal(log, sha256, 'started', { key });
      await deleteKey(db, key, pending.get(key));
      journal(log, sha256, 'done', { key, deleted: backup.documents.get(key).length });
      state.keys.set(key, 'done');
    }

    const final = await snapshot(db);
    verifySymbols(backup, final, true);
    verifyPrices(backup, final.prices.rows, state);
    await verifyTarget();
    const after = fingerprints(final);
    journal(log, sha256, 'completed', { after });
    printAudit(plan, after);
    return 0;
  } finally {
    fs.rmdirSync(lock);
  }
}

async function main(argv) {
  const options = args(argv, ['--uri', '--approval'], ['--force', '--dry-run', '--help']);
  if (options['--help']) {
    console.log('用法：node scripts/migrate-symbol-data.cjs [--uri <URI>] [--dry-run | --force] [--approval <标记.json>] [--help]\n' +
      '默认 dry-run，标准输出为可审阅的冻结 JSON。--force 需备份、试还原以及 Human 确认清单。');
    return 0;
  }
  check(!(options['--force'] && options['--dry-run']), '--dry-run 和 --force 不能同时使用。');
  check(!options['--approval'] || options['--force'], '--approval 仅用于 --force。');
  const approved = options['--force'] && approvalAt(options['--approval']);
  return withDb(options['--uri'], async (db, client) => {
    if (approved) return execute(db, client, approved);
    const { manifest } = await buildPlan(db);
    console.log(JSON.stringify(manifest, null, 2));
    if (!manifest.mapping.length && !manifest.deletions.length && !manifest.blockers.length) console.error('无需变更。');
    return manifest.blockers.length ? 1 : 0;
  });
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
  console.error(reportError(error));
  if (process.argv.includes('--force')) console.error('写入暂停。保留冻结清单、备份和日志，按手册判断续跑或试还原。');
  process.exitCode = 1;
});
