// scripts/verify-task-064.cjs
//
// TASK-064 真实 Mongo 集成验收（测试临时夹具，不是产品写路径）。
//
// 背景：TASK-057 的验收脚本跑完即清理，dev 库当前没有可复用的 S1～S10 真实 result 记录；
// 本脚本把 S1/S2/S3/S5/S6/S8 形态写入**独立测试文档**，调用真实 getStatus 读侧，
// 断言完成后只删除本次插入的文档。既有 276 条 taskruns 不被修改；不 drop、不清库。
// 这不是产品写侧证据（写侧持久化由 TASK-057 提供），只证明 064 adapter 能读真实 MongoDB。
//
// 用法：
//   TASK064_ENV=D:/projects/portomind/server/.env node scripts/verify-task-064.cjs

const path = require('path');
const assert = require('assert');
const dotenv = require('dotenv');

const envPath = process.env.TASK064_ENV || path.join(__dirname, '..', 'server', '.env');
dotenv.config({ path: envPath });
if (!process.env.MONGO_URI) {
  console.error('FAILED: MONGO_URI not set（可用 TASK064_ENV 指向 server/.env）');
  process.exit(1);
}

const mongoose = require('mongoose');
const TaskRun = require('@portomind/shared/models/taskRun');
const TaskSkip = require('@portomind/shared/models/taskSkip');
const Portfolio = require('@portomind/shared/models/portfolio');
const service = require('@portomind/shared/services/cronStatus.service');

const tag = `test:064:${Date.now()}`;
const results = [];
let insertedRunIds = [];
let insertedSkipIds = [];
let beforeRuns = null;
let beforeSkips = null;

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function baseRun(taskName, runKey, over = {}) {
  return {
    taskName,
    runKey,
    trigger: 'MANUAL',
    status: 'SUCCEEDED',
    startedAt: new Date(Date.now() + 60 * 60 * 1000),
    endedAt: new Date(),
    durationMs: 1000,
    totalCount: 1,
    successCount: 1,
    failureCount: 0,
    failures: [],
    ...over
  };
}

async function cleanup() {
  if (insertedRunIds.length > 0) {
    await TaskRun.deleteMany({ _id: { $in: insertedRunIds } });
  }
  if (insertedSkipIds.length > 0) {
    await TaskSkip.deleteMany({ _id: { $in: insertedSkipIds } });
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  beforeRuns = await TaskRun.countDocuments({});
  beforeSkips = await TaskSkip.countDocuments({});
  const historicalCount = await TaskRun.countDocuments({ result: { $exists: false } });
  console.log(`DB=${db.databaseName} taskruns_before=${beforeRuns} taskskips_before=${beforeSkips} historical_no_result=${historicalCount}`);

  const portfolios = await Portfolio.find({ archived: { $ne: true } }).lean();
  check('AC4/AC6 真实未归档组合 >= 4（动态基数）', portfolios.length >= 4, `count=${portfolios.length}`);
  if (portfolios.length < 4) throw new Error('需要至少 4 个未归档组合来验证 S6 四语义');

  const p1 = String(portfolios[0]._id);
  const p2 = String(portfolios[1]._id);
  const p3 = String(portfolios[2]._id);
  const p4 = String(portfolios[3]._id);

  const runs = [
    baseRun('daily-price-sync', `${tag}:price`, {
      status: 'SUCCEEDED',
      totalCount: 40,
      successCount: 38,
      failureCount: 0,
      result: { skippedCount: 2 }
    }),
    baseRun('price-integrity-check', `${tag}:integrity`, {
      status: 'PARTIAL',
      totalCount: 40,
      successCount: 38,
      failureCount: 2,
      result: {
        totals: { expectedCount: 40, actualCount: 38, missingCount: 2 },
        checkedCount: 40,
        skippedCount: 1,
        completenessRatio: 0.95,
        gapAssets: [{ symbol: '000191', missingCount: 3 }]
      }
    }),
    baseRun('alert-evaluate', `${tag}:alert`, {
      result: { evaluated: 12, created: 0, archived: 0, failed: 0 }
    }),
    baseRun('fx-rate-sync', `${tag}:fx`, {
      result: {
        fxCount: 3,
        currencies: {
          USD: { ok: true, rateToCny: 7.13 },
          CAD: { ok: true, rateToCny: 5.21 },
          HKD: { ok: true, rateToCny: 0.92 }
        }
      }
    }),
    baseRun('rebalance-check', `${tag}:rebalance`, {
      status: 'PARTIAL',
      totalCount: 4,
      successCount: 3,
      failureCount: 1,
      result: {
        totalPortfolios: 4,
        dueCount: 3,
        skippedCount: 0,
        perPortfolio: [
          { portfolioId: p1, due: true, needsRebalance: true, suggestionsCount: 2, recordId: 'test-rec-064', status: 'SUCCEEDED' },
          { portfolioId: p2, due: true, needsRebalance: false, suggestionsCount: 0, recordId: null, status: 'SUCCEEDED' },
          { portfolioId: p3, due: false, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'SUCCEEDED' },
          { portfolioId: p4, due: true, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'FAILED', failureReason: 'DB_TIMEOUT' }
        ]
      }
    })
  ];
  const insertedRuns = await TaskRun.collection.insertMany(runs);
  insertedRunIds = Object.values(insertedRuns.insertedIds);

  const skippedAt = new Date();
  const insertedSkips = await TaskSkip.collection.insertMany([
    {
      taskName: 'daily-price-sync',
      runKey: `${tag}:skip-price`,
      trigger: 'SCHEDULED',
      reason: 'ALREADY_RUNNING',
      skippedAt,
      activeRunKey: `${tag}:price`
    },
    {
      taskName: 'rebalance-check',
      runKey: `${tag}:skip-rebalance`,
      trigger: 'MANUAL',
      reason: 'DUPLICATE_RUN_KEY',
      skippedAt
    }
  ]);
  insertedSkipIds = Object.values(insertedSkips.insertedIds);

  const now = new Date();
  const data = await service.getStatus({ now });
  const byTask = new Map(data.tasks.map((task) => [task.taskName, task]));

  check('AC6 真实 Mongo：主视图 5 个任务、顺序不变', data.tasks.length === 5
    && data.tasks.map((t) => t.taskName).join(',') === 'daily-price-sync,price-integrity-check,alert-evaluate,fx-rate-sync,rebalance-check');

  check('AC6 真实 Mongo：S1 价格 lastRun 可读（价格数据态不由 result 派生）',
    byTask.get('daily-price-sync').lastRun && byTask.get('daily-price-sync').lastRun.runKey === `${tag}:price`,
    JSON.stringify(byTask.get('daily-price-sync').lastRun));

  const integrity = byTask.get('price-integrity-check').dataState;
  check('AC3/AC6 真实 Mongo：S3 完整性摘要与 gapAssets 可读',
    integrity.expectedCount === 40
      && integrity.actualCount === 38
      && integrity.missingCount === 2
      && integrity.gapAssets.length === 1
      && integrity.gapAssets[0].symbol === '000191',
    JSON.stringify(integrity));

  const fx = byTask.get('fx-rate-sync');
  check('AC1/AC6 真实 Mongo：S5 汇率对象形态三币 ok:true + 数值',
    fx.contractReady === true && fx.dataStateLevel === 'ok'
      && fx.dataState.currencies.USD.ok === true
      && fx.dataState.currencies.CAD.rateToCny === 5.21,
    JSON.stringify(fx.dataState));

  check('AC4/AC6 真实 Mongo：S6 父任务 perPortfolio 长度=4、四语义可读',
    byTask.get('rebalance-check').contractReady === true
      && byTask.get('rebalance-check').dataState.perPortfolio.length === 4
      && byTask.get('rebalance-check').dataState.due === 3
      && byTask.get('rebalance-check').dataState.generatedCount === 1,
    JSON.stringify(byTask.get('rebalance-check').dataState));

  const rows = byTask.get('rebalance-check').dataState.perPortfolio;
  const row1 = rows.find((row) => row.portfolioId === p1);
  const row2 = rows.find((row) => row.portfolioId === p2);
  const row3 = rows.find((row) => row.portfolioId === p3);
  const row4 = rows.find((row) => row.portfolioId === p4);
  check('AC3/AC4 真实 Mongo：生成建议 / 未超阈 / 未到期 / 失败可区分',
    row1.needsRebalance === true && row1.suggestionsCount === 2 && row1.recordId === 'test-rec-064'
      && row2.needsRebalance === false && row2.suggestionsCount === 0 && row2.recordId === null
      && row3.due === false && row3.needsRebalance === null
      && row4.status === 'FAILED' && row4.needsRebalance === null);

  const priceTask = byTask.get('daily-price-sync');
  const rebalanceTask = byTask.get('rebalance-check');
  check('AC4 真实 Mongo：lastSkip 与 lastRun 分离且来源 taskskips',
    priceTask.lastSkip && priceTask.lastSkip.reason === 'ALREADY_RUNNING'
      && priceTask.lastSkip.activeRunKey === undefined
      && priceTask.lastSkip.runKey === `${tag}:skip-price`
      && priceTask.lastRun.runKey === `${tag}:price`
      && rebalanceTask.lastSkip && rebalanceTask.lastSkip.reason === 'DUPLICATE_RUN_KEY',
    JSON.stringify({ priceSkip: priceTask.lastSkip, lastRun: priceTask.lastRun.runKey }));

  check('AC4 真实 Mongo：无跳过事件的 task lastSkip=null',
    byTask.get('price-integrity-check').lastSkip === null
      && byTask.get('alert-evaluate').lastSkip === null
      && byTask.get('fx-rate-sync').lastSkip === null);

  const detail = await service.getStatus({ detail: 'rebalance', now });
  check('AC6 detail=rebalance 真实 Mongo：契约就绪、summary.generated 保持既有口径（1）',
    detail.contractReady === true
      && detail.summary.generated === 1
      && Array.isArray(detail.rows)
      && detail.rows.length === portfolios.length,
    JSON.stringify(detail.summary));
  check('AC3 detail 回归：未到期 due=false 行不猜、未超阈未计入 generated',
    Array.isArray(detail.rows)
      && detail.rows.some((row) => row.due === false)
      && detail.rows.filter((row) => row.suggestionsCount !== null && row.suggestionsCount > 0).length === 1);

  await cleanup();
  insertedRunIds = [];
  insertedSkipIds = [];
  const afterRuns = await TaskRun.countDocuments({});
  const afterSkips = await TaskSkip.countDocuments({});
  check('DB 恢复：taskruns 前后一致', afterRuns === beforeRuns, `before=${beforeRuns} after=${afterRuns}`);
  check('DB 恢复：taskskips 前后一致', afterSkips === beforeSkips, `before=${beforeSkips} after=${afterSkips}`);
}

main()
  .then(async () => {
    const failed = results.filter((item) => !item.ok);
    console.log(`\n===== TASK-064 真实 Mongo 验收：${results.length - failed.length}/${results.length} PASS =====`);
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
