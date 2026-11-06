// server/scripts/verify-task-057.cjs
//
// TASK-057 验收脚本：真实 dev Mongo（server/.env 的 MONGO_URI）+ 真实 shared/cron-worker 代码。
//
// 安全约束（任务明确要求）：
//   - 不 drop 数据库/集合、不清库；
//   - 所有写入使用独立测试 runKey（test:057:<timestamp>...）或历史日期 2000-01-03，
//     结束后只删除本脚本创建的记录；不碰既有 276 条历史与业务记录；
//   - 不输出 MONGO_URI / 口令。
//
// 用法（worktree 无 .env 时）：
//   TASK057_ENV=D:/projects/portomind/server/.env node scripts/verify-task-057.cjs
//
// 覆盖：AC1（findById 回读）、AC2（裸字段丢弃）、AC3（五类任务 result 查库）、
//       AC4（父任务 rebalance-check / perPortfolio）、AC5（两类跳过事件 + 首跑不被覆盖）、
//       AC6（唯一索引 + 同 key 不产生两条）、AC7（状态机）、AC8（历史无 result 可读）。

const path = require('path');
const assert = require('assert');
const dotenv = require('dotenv');

const envPath = process.env.TASK057_ENV || path.join(__dirname, '..', 'server', '.env');
dotenv.config({ path: envPath });
if (!process.env.MONGO_URI) {
  console.error('FAILED: MONGO_URI not set（可用 TASK057_ENV 指向 server/.env）');
  process.exit(1);
}

const mongoose = require('mongoose');
const TaskRun = require('@portomind/shared/models/taskRun');
const TaskSkip = require('@portomind/shared/models/taskSkip');
const { runTrackedTask } = require('@portomind/shared/services/taskRunner');
const dailySync = require('@portomind/shared/tasks/dailySync');
const integrityCheck = require('../cron-worker/src/tasks/integrityCheck');
const Portfolio = require('@portomind/shared/models/portfolio');
const ThresholdChecker = require('@portomind/shared/services/rebalance/thresholdChecker');
const SuggestionGenerator = require('@portomind/shared/services/rebalance/suggestionGenerator');
const AlertCenterService = require('@portomind/shared/services/alertCenter.service');

const tag = `test:057:${Date.now()}`;
const results = [];
const createdRunKeys = [];
const createdSkipTaskNames = [];
let beforeCount = null;

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function readRun(taskName, runKey) {
  return TaskRun.findOne({ taskName, runKey }).lean();
}

async function cleanup() {
  // 只删除本脚本的测试键；2000-01-03 是本脚本专用的历史日期（运行前确认 count=0）。
  const runDelete = await TaskRun.deleteMany({
    $or: [
      { runKey: { $regex: '^test:057:' } },
      { runKey: '2000-01-03' },
      { runKey: { $regex: ':2000-01-03$' } }
    ]
  });
  const skipDelete = await TaskSkip.deleteMany({
    taskName: { $in: createdSkipTaskNames }
  });
  console.log(`cleanup: taskruns=${runDelete.deletedCount}, taskskips=${skipDelete.deletedCount}`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  beforeCount = await TaskRun.countDocuments({});
  console.log(`DB=${db.databaseName} taskruns_before=${beforeCount}`);

  const historical = await TaskRun.findOne({ result: { $exists: false } }).lean();
  const historicalCount = await TaskRun.countDocuments({ result: { $exists: false } });
  check('AC8 历史无 result 文档存在且可读（不是空对象）', Boolean(historical) && historical.result === undefined,
    `historical_count=${historicalCount}`);
  const statusService = require('@portomind/shared/services/cronStatus.service');
  const historicalStatus = await statusService.getStatus({ now: new Date('2026-10-26T12:00:00Z') });
  const historicalRebalance = historicalStatus.tasks.find((task) => task.taskName === 'rebalance-check');
  check('AC8 getStatus 读取历史无 result 数据不报错，且 rebalance contractReady=false',
    Boolean(historicalRebalance) && historicalRebalance.contractReady === false,
    `contractReady=${historicalRebalance && historicalRebalance.contractReady}`);

  const indexes = await TaskRun.collection.indexes();
  const unique = indexes.find((index) => index.key && index.key.taskName === 1 && index.key.runKey === 1);
  check('AC6 taskruns 唯一索引 {taskName,runKey} unique=true 仍在', Boolean(unique && unique.unique === true),
    JSON.stringify(unique || null));

  const historicalDate = '2000-01-03';
  check('AC4 2000-01-03 测试日期无既有 taskrun（安全清理前提）',
    (await TaskRun.countDocuments({ runKey: historicalDate })) === 0 &&
      (await TaskRun.countDocuments({ runKey: 'daily:2000-01-03' })) === 0,
    'count=0');

  // ── AC1/AC2/AC7：真实 TaskRun 回读 + 裸字段丢弃 + 状态机 ──
  const resultRunKey = `${tag}:result`;
  const resultSummary = await runTrackedTask({
    taskName: 'test:057:result',
    runKey: resultRunKey,
    trigger: 'MANUAL',
    execute: async () => ({
      totalCount: 1,
      successCount: 1,
      failureCount: 0,
      ok: 1,
      gap: 2,
      result: { kept: { a: 1 }, nested: 'yes' }
    })
  });
  const resultDoc = await TaskRun.findOne({ taskName: 'test:057:result', runKey: resultRunKey }).lean();
  check('AC1 findById/查库回读 result 非空', Boolean(resultDoc && resultDoc.result && resultDoc.result.kept && resultDoc.result.kept.a === 1),
    JSON.stringify(resultDoc && resultDoc.result));
  check('AC1 result 是嵌套字段，不是顶层裸字段', Boolean(resultDoc)
    && !Object.prototype.hasOwnProperty.call(resultDoc, 'kept')
    && resultDoc.result && resultDoc.result.nested === 'yes');
  check('AC2 顶层裸字段 ok/gap 被丢弃（白名单未变成全量透传）', Boolean(resultDoc)
    && !Object.prototype.hasOwnProperty.call(resultDoc, 'ok')
    && !Object.prototype.hasOwnProperty.call(resultDoc, 'gap'),
    `has_ok=${resultDoc && Object.prototype.hasOwnProperty.call(resultDoc, 'ok')}`);
  check('AC7 result 合法且 failureCount=0 → SUCCEEDED', resultSummary.status === 'SUCCEEDED', resultSummary.status);

  const partialSummary = await runTrackedTask({
    taskName: 'test:057:partial',
    runKey: `${tag}:partial`,
    trigger: 'MANUAL',
    execute: async () => ({ totalCount: 1, successCount: 0, failureCount: 1, result: { kept: true } })
  });
  check('AC7 failureCount>0 → PARTIAL（状态机零改动）', partialSummary.status === 'PARTIAL', partialSummary.status);

  const failedSummary = await runTrackedTask({
    taskName: 'test:057:failed',
    runKey: `${tag}:failed`,
    trigger: 'MANUAL',
    execute: async () => { throw Object.assign(new Error('boom'), { category: 'INTERNAL' }); }
  }).catch((error) => {
    check('AC7 未捕获异常仍抛给调用方（FAILED 记录由 taskRunner 写入）', /boom/.test(error.message));
    return null;
  });
  const failedDoc = await TaskRun.findOne({ taskName: 'test:057:failed', runKey: `${tag}:failed` }).lean();
  check('AC7 未捕获异常 → 落库 FAILED', !failedSummary && Boolean(failedDoc) && failedDoc.status === 'FAILED',
    failedDoc ? failedDoc.status : 'missing');

  // ── AC3-① 价格：result.skippedCount ──
  const priceRunKey = `${tag}:price`;
  await dailySync({
    runKey: priceRunKey,
    trigger: 'MANUAL',
    dependencies: {
      getActiveAssets: async () => [{ symbol: 'T057', market: 'CN' }],
      isMarketOpenToday: () => false,
      fetchLatest: async () => { throw new Error('should not fetch'); },
      saveLatest: async () => {}
    }
  });
  const priceDoc = await readRun('daily-price-sync', priceRunKey);
  check('AC3① 价格 result.skippedCount 查库可见', Boolean(priceDoc && priceDoc.result && priceDoc.result.skippedCount === 1),
    JSON.stringify(priceDoc && priceDoc.result));

  // ── AC3-② 完整性：totals/checkedCount/skippedCount/completenessRatio/gapAssets ──
  const integrityRunKey = `${tag}:integrity`;
  await integrityCheck({
    runKey: integrityRunKey,
    trigger: 'MANUAL',
    now: new Date('2026-01-05T12:00:00Z'),
    repair: false,
    getActiveAssets: async () => [{
      symbol: 'T057A',
      market: 'CN',
      launchDate: new Date('2026-01-01T00:00:00Z')
    }],
    countAsset: async () => ({
      expectedCount: 2,
      actualCount: 1,
      missingCount: 1,
      completenessRatio: 0.5,
      missingDates: ['2026-01-02']
    })
  });
  const integrityDoc = await readRun('price-integrity-check', integrityRunKey);
  const integrityResult = integrityDoc && integrityDoc.result;
  check('AC3② 完整性 result 摘要字段齐全',
    Boolean(integrityResult)
      && integrityResult.totals && integrityResult.totals.expectedCount === 2
      && integrityResult.totals.actualCount === 1
      && integrityResult.totals.missingCount === 1
      && integrityResult.checkedCount === 1
      && integrityResult.skippedCount === 0
      && integrityResult.completenessRatio === 0.5
      && Array.isArray(integrityResult.gapAssets)
      && integrityResult.gapAssets.length === 1
      && integrityResult.gapAssets[0].symbol === 'T057A'
      && integrityResult.gapAssets[0].missingCount === 1,
    JSON.stringify(integrityResult));
  check('AC3② 完整性不落全量 assets[]/missingRanges[]',
    Boolean(integrityResult)
      && !Object.prototype.hasOwnProperty.call(integrityResult, 'assets')
      && !Object.prototype.hasOwnProperty.call(integrityResult.gapAssets[0], 'missingRanges'));

  // ── AC3-③ 提醒：mock 业务引擎，验证 result 形状与落库 ──
  const alertEngine = require('@portomind/shared/services/alertEngine.service');
  alertEngine.evaluateAll = async () => ({ evaluated: 3, created: 1, archived: 0, failed: 2 });
  const alertScheduler = require('../cron-worker/src/schedulers/alertScheduler');
  const alertRunKey = `${tag}:alert`;
  await alertScheduler.evaluateAllTracked({ runKey: alertRunKey, trigger: 'MANUAL' });
  const alertDoc = await readRun('alert-evaluate', alertRunKey);
  check('AC3③ 提醒 result.evaluated/created/archived/failed 查库可见',
    Boolean(alertDoc && alertDoc.result && alertDoc.result.evaluated === 3
      && alertDoc.result.created === 1 && alertDoc.result.archived === 0 && alertDoc.result.failed === 2),
    JSON.stringify(alertDoc && alertDoc.result));

  // ── AC3-④ 汇率：mock provider，验证 currencies 数值与 ok:true ──
  const fxService = require('@portomind/shared/services/fxRate.service');
  fxService.syncLatestRates = async () => [
    { currency: 'USD', rateToCny: 7.1 },
    { currency: 'CAD', rateToCny: 5.2 },
    { currency: 'HKD', rateToCny: 0.91 }
  ];
  const fxScheduler = require('../cron-worker/src/schedulers/fxScheduler');
  const fxRunKey = `${tag}:fx`;
  await fxScheduler.syncLatestRatesTracked({ runKey: fxRunKey, trigger: 'MANUAL' });
  const fxDoc = await readRun('fx-rate-sync', fxRunKey);
  const fxResult = fxDoc && fxDoc.result;
  check('AC3④ 汇率 result.currencies 三币数值 + ok:true 查库可见',
    Boolean(fxResult && fxResult.fxCount === 3
      && fxResult.currencies.USD.ok === true && fxResult.currencies.USD.rateToCny === 7.1
      && fxResult.currencies.CAD.rateToCny === 5.2
      && fxResult.currencies.HKD.rateToCny === 0.91),
    JSON.stringify(fxResult));

  // ── AC4：真实 dev 组合（未归档 4 个）+ 父任务 rebalance-check ──
  const realPortfolios = await Portfolio.find({ archived: { $ne: true } }).lean();
  check('AC4 未归档组合动态基数为 4（实测）', realPortfolios.length === 4, `count=${realPortfolios.length}`);
  Portfolio.find = () => ({ lean: async () => realPortfolios });
  const firstPid = String(realPortfolios[0]._id);
  ThresholdChecker.checkThresholds = async (pid) => ({ needsRebalance: pid === firstPid });
  SuggestionGenerator.getSuggestions = async () => ({
    recordId: 'test-record-057',
    suggestions: [{ symbol: 'AAA' }, { symbol: 'BBB' }]
  });
  AlertCenterService.notify = async () => ({});

  const rebalanceScheduler = require('../cron-worker/src/schedulers/rebalanceScheduler');
  const parentSummary = await rebalanceScheduler.runRebalanceCheck({
    now: new Date('2000-01-03T12:00:00Z'),
    timezone: 'America/Toronto',
    trigger: 'MANUAL'
  });
  const parentDoc = await readRun('rebalance-check', '2000-01-03');
  const parentResult = parentDoc && parentDoc.result;
  check('AC4 父任务 rebalance-check 落库且 result.perPortfolio 长度 = 未归档组合数 4',
    Boolean(parentResult && Array.isArray(parentResult.perPortfolio)
      && parentResult.perPortfolio.length === realPortfolios.length),
    parentResult ? `length=${parentResult.perPortfolio.length}` : 'missing');
  check('AC4 父任务 flat summary 保留原字段',
    parentSummary.totalCount === realPortfolios.length
      && parentSummary.dueCount === realPortfolios.length
      && parentSummary.skippedCount === 0,
    JSON.stringify({ totalCount: parentSummary.totalCount, dueCount: parentSummary.dueCount, skippedCount: parentSummary.skippedCount }));

  const items = parentResult ? parentResult.perPortfolio : [];
  const requiredKeys = ['portfolioId', 'due', 'needsRebalance', 'suggestionsCount', 'recordId', 'status'];
  check('AC4 每项含 {portfolioId,due,needsRebalance,suggestionsCount,recordId,status}',
    items.length === realPortfolios.length
      && items.every((item) => requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(item, key))));
  const generated = items.find((item) => item.portfolioId === firstPid);
  const notGenerated = items.find((item) => item.portfolioId !== firstPid);
  check('AC4 生成建议 → recordId 非空且 suggestionsCount>0',
    Boolean(generated && generated.needsRebalance === true
      && generated.recordId === 'test-record-057'
      && generated.suggestionsCount === 2),
    JSON.stringify(generated));
  check('AC4 未超阈 → needsRebalance=false 且 suggestionsCount=0 / recordId=null',
    Boolean(notGenerated && notGenerated.needsRebalance === false
      && notGenerated.suggestionsCount === 0 && notGenerated.recordId === null),
    JSON.stringify(notGenerated));

  // ── AC5：ALREADY_RUNNING（首跑不被覆盖）+ DUPLICATE_RUN_KEY ──
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const firstPromise = runTrackedTask({
    taskName: 'test:057:already',
    runKey: `${tag}:already-a`,
    trigger: 'MANUAL',
    execute: async () => {
      await gate;
      return { totalCount: 1, successCount: 1, failureCount: 0, result: { done: true } };
    }
  });
  const alreadySkip = await runTrackedTask({
    taskName: 'test:057:already',
    runKey: `${tag}:already-b`,
    trigger: 'MANUAL',
    execute: async () => ({})
  });
  release();
  const first = await firstPromise;
  const skipDocs = await TaskSkip.find({ taskName: 'test:057:already' }).lean();
  createdSkipTaskNames.push('test:057:already');
  const firstDoc = await readRun('test:057:already', `${tag}:already-a`);
  check('AC5 ALREADY_RUNNING 有可查询的 taskskips 事件',
    alreadySkip.status === 'SKIPPED' && alreadySkip.reason === 'ALREADY_RUNNING'
      && alreadySkip.skipPersisted === true
      && skipDocs.length === 1 && skipDocs[0].reason === 'ALREADY_RUNNING',
    JSON.stringify(skipDocs.map((doc) => ({ reason: doc.reason, activeRunKey: doc.activeRunKey }))));
  check('AC5 并发首跑进行中触发第二次 → 首条 TaskRun 仍 SUCCEEDED（未被改成 SKIPPED）',
    first.status === 'SUCCEEDED' && Boolean(firstDoc) && firstDoc.status === 'SUCCEEDED');

  const dupRunKey = `${tag}:dup`;
  await TaskRun.create({
    taskName: 'test:057:dup',
    runKey: dupRunKey,
    trigger: 'MANUAL',
    status: 'SUCCEEDED',
    startedAt: new Date()
  });
  const dupSkip = await runTrackedTask({
    taskName: 'test:057:dup',
    runKey: dupRunKey,
    trigger: 'MANUAL',
    execute: async () => ({})
  });
  const dupDocs = await TaskSkip.find({ taskName: 'test:057:dup' }).lean();
  createdSkipTaskNames.push('test:057:dup');
  const dupCount = await TaskRun.countDocuments({ taskName: 'test:057:dup', runKey: dupRunKey });
  const dupDoc = await readRun('test:057:dup', dupRunKey);
  check('AC5 DUPLICATE_RUN_KEY 有可查询的 taskskips 事件', dupSkip.status === 'SKIPPED'
    && dupSkip.reason === 'DUPLICATE_RUN_KEY' && dupSkip.skipPersisted === true
    && dupDocs.length === 1 && dupDocs[0].reason === 'DUPLICATE_RUN_KEY');
  check('AC6 同 (taskName,runKey) 二次触发不产生第二条', dupCount === 1, `count=${dupCount}`);
  check('AC5 既有记录未被改成 SKIPPED', Boolean(dupDoc) && dupDoc.status === 'SUCCEEDED',
    dupDoc ? dupDoc.status : 'missing');

  // ── AC8 读侧历史降级（pure function；不写库） ──
  const cronStatus = require('@portomind/shared/services/cronStatus.service');
  if (typeof cronStatus.buildRebalanceRows === 'function') {
    const built = cronStatus.buildRebalanceRows({ runs: [], portfolios: [], tz: 'America/Toronto' });
    check('AC8 历史/缺失 result 读侧 contractReady=false（不当 {} 渲染）', built.contractReady === false);
  } else {
    check('AC8 历史/缺失 result 读侧 contractReady=false（通过 TaskRun 查询验证）',
      historicalCount > 0 && historical.result === undefined, `historical_count=${historicalCount}`);
  }

  await cleanup();
  const afterCount = await TaskRun.countDocuments({});
  check('DB taskruns 数量恢复（before=after）', afterCount === beforeCount, `before=${beforeCount} after=${afterCount}`);
}

main()
  .then(async () => {
    const failed = results.filter((item) => !item.ok);
    console.log(`\n===== TASK-057 实库验收：${results.length - failed.length}/${results.length} PASS =====`);
    if (failed.length) {
      console.log('FAILED:');
      for (const item of failed) console.log(` - ${item.name} — ${item.detail}`);
    }
    await mongoose.disconnect();
    process.exitCode = failed.length ? 1 : 0;
  })
  .catch(async (error) => {
    console.error('CRASH', error && error.stack ? error.stack : error);
    try { await cleanup(); } catch (cleanupError) { console.error('cleanup failed', cleanupError.message); }
    try { await mongoose.disconnect(); } catch (_) { /* noop */ }
    process.exitCode = 2;
  });
