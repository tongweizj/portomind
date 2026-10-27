// server/test/integration/cronStatus.service.test.js
//
// TASK-054 单元测试（AC2 / AC4 / AC7 / AC9 + D-16 有效目标日）。
// 落点说明：本仓没有 test/unit/ 目录，`server/package.json` 的唯一入口是
// `node --test test/integration/*.test.js`，因此单测与集成测试同目录（与
// taskrun.logging.test.js 测 shared 代码的既有做法一致）。
//
// 依赖注入方式：猴补模型静态方法（server/test/helpers/modelStubs.js），不连数据库。

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

// 必须在 require app / logger 之前设置，避免沙箱/只读目录写日志失败
process.env.LOG_DIR = path.join(os.tmpdir(), 'portomind-cronstatus-unit-logs');

const service = require('@portomind/shared/services/cronStatus.service');
const { applyWorld, getCapturedPipelines } = require('../helpers/modelStubs');

const TASK_NAMES = [
  'daily-price-sync',
  'price-integrity-check',
  'alert-evaluate',
  'fx-rate-sync',
  'rebalance-check'
];

let restore = () => {};
function useWorld(world) {
  restore();
  restore = applyWorld(world);
}

test.afterEach(() => {
  restore();
  restore = () => {};
});

const priceAt = (symbol, dateStr) => ({ symbol, timestamp: new Date(`${dateStr}T12:00:00Z`) });
const asset = (symbol, market, extra = {}) => ({
  symbol,
  name: `${symbol} name`,
  market,
  launchDate: extra.launchDate ?? null
});
const priceRun = (over = {}) => ({
  taskName: 'daily-price-sync',
  runKey: '2026-10-23',
  trigger: 'SCHEDULED',
  status: 'SUCCEEDED',
  startedAt: new Date('2026-10-23T07:00:00.000Z'),
  endedAt: new Date('2026-10-23T07:00:01.000Z'),
  durationMs: 1000,
  totalCount: 1,
  successCount: 1,
  failureCount: 0,
  failures: [],
  ...over
});
const latest = (taskName, over = {}) => ({ _id: taskName, doc: priceRun({ taskName, ...over }) });
const taskEntry = (data, index) => data.tasks[index];

// ---------------------------------------------------------------------------
// AC2 / D-16：目标日与 expected/fetched
// ---------------------------------------------------------------------------

test('U1 目标日 = 该市场最近一次已到点同步应覆盖的交易日（不是"今天"）', async () => {
  useWorld({
    assets: [asset('AAA', 'US'), asset('BBB', 'US'), asset('CCC', 'US')],
    prices: [
      priceAt('AAA', '2026-10-22'),
      priceAt('BBB', '2026-10-22'),
      priceAt('CCC', '2026-10-23'), // 只有周五桶：必须被判为缺价（证明按 timestamp 归桶）
      priceAt('AAA', '2026-10-23') // 周五桶：不属于周四目标日，不得计数
    ]
  });

  const data = await service.getStatus({ now: new Date('2026-10-23T14:00:00.000Z') });
  const ds = taskEntry(data, 0).dataState;

  assert.equal(ds.targetMarketDate, '2026-10-22');
  assert.equal(ds.calendarPrevOpenDay, '2026-10-22');
  assert.equal(ds.expected, 3);
  assert.equal(ds.fetched, 2);
  assert.deepEqual(ds.missing.map((item) => item.symbol), ['CCC']);
  assert.equal(taskEntry(data, 0).dataStateLevel, 'warn');
});

test('U2 节假日回退：CN 国庆长假期间目标日早于 10-01', async () => {
  useWorld({
    assets: [asset('015532.CN', 'CN-FUND')],
    prices: []
  });

  const data = await service.getStatus({ now: new Date('2026-10-05T14:00:00.000Z') });
  const ds = taskEntry(data, 0).dataState;

  assert.equal(ds.targetMarketDate, '2026-09-29');
  assert.ok(ds.targetMarketDate < '2026-10-01');
  assert.equal(ds.calendarPrevOpenDay, '2026-09-30');
  assert.equal(ds.expected, 1);
  assert.equal(ds.fetched, 0);
  assert.equal(taskEntry(data, 0).dataStateLevel, 'bad');
});

test('U3 expected=0 不得当作"齐了"（level=unknown + EXPECTED_ZERO）', async () => {
  useWorld({ assets: [], prices: [] });

  const data = await service.getStatus({ now: new Date('2026-10-23T14:00:00.000Z') });
  const entry = taskEntry(data, 0);
  const ds = entry.dataState;

  assert.equal(ds.expected, 0);
  assert.equal(ds.fetched, 0);
  assert.deepEqual(ds.missing, []);
  assert.equal(ds.targetMarketDate, null);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.ok(entry.notes.some((note) => note.code === 'EXPECTED_ZERO'));
});

test('U4 多市场不同目标日：byMarket 逐市场、顶层求和、顶层取最晚', async () => {
  useWorld({
    assets: [asset('AAA', 'US'), asset('015532.CN', 'CN-FUND')],
    prices: [priceAt('AAA', '2026-10-07'), priceAt('015532.CN', '2026-09-30')]
  });

  const data = await service.getStatus({ now: new Date('2026-10-08T14:00:00.000Z') });
  const ds = taskEntry(data, 0).dataState;

  assert.equal(ds.targetMarketDate, '2026-10-07'); // 最晚
  assert.equal(ds.byMarket.US.targetMarketDate, '2026-10-07');
  assert.equal(ds.byMarket['CN-FUND'].targetMarketDate, '2026-09-30'); // CN 10-01~07 长假
  assert.equal(ds.expected, 2); // = 各市场之和
  assert.equal(ds.fetched, 2);
  assert.equal(taskEntry(data, 0).dataStateLevel, 'ok');
});

// ---------------------------------------------------------------------------
// AC7：僵尸 RUNNING 只对"最新一条"判定
// ---------------------------------------------------------------------------

test('U5 最新一条 RUNNING 超阈值 → stale=true 且对外呈现 STALE', async () => {
  const now = new Date('2026-10-26T14:00:00.000Z');
  useWorld({
    latestRuns: [latest('daily-price-sync', {
      status: 'RUNNING',
      startedAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
      endedAt: null,
      durationMs: null
    })]
  });

  const data = await service.getStatus({ now });
  const entry = taskEntry(data, 0);

  assert.equal(entry.stale, true);
  assert.equal(entry.lastRun.status, 'STALE');
  assert.equal(entry.lastRun.rawStatus, 'RUNNING');
  assert.equal(entry.lastRun.endedAt, null);
  assert.equal(entry.lastRun.durationMs, null);
});

test('U6 最新一条 RUNNING 未超阈值 → stale=false（负向对照）', async () => {
  const now = new Date('2026-10-26T14:00:00.000Z');
  useWorld({
    latestRuns: [latest('daily-price-sync', {
      status: 'RUNNING',
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      endedAt: null
    })]
  });

  const data = await service.getStatus({ now });
  const entry = taskEntry(data, 0);

  assert.equal(entry.stale, false);
  assert.equal(entry.lastRun.status, 'RUNNING');
});

test('U14 非最新 RUNNING 不误判：latest 为 SUCCEEDED 时 stale=false', async () => {
  useWorld({
    latestRuns: [latest('daily-price-sync', { status: 'SUCCEEDED' })]
  });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const entry = taskEntry(data, 0);

  assert.equal(entry.stale, false);
  assert.equal(entry.lastRun.status, 'SUCCEEDED');
  assert.equal(entry.lastRun.rawStatus, 'SUCCEEDED');
});

// ---------------------------------------------------------------------------
// AC9：空态不撒谎
// ---------------------------------------------------------------------------

test('U7 全空集合：lastRun=null、无 SUCCEEDED、价格项 expected=0', async () => {
  useWorld({ assets: [], prices: [], portfolios: [], fxCount: null });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });

  assert.equal(data.tasks.length, 5);
  assert.deepEqual(data.tasks.map((t) => t.taskName), TASK_NAMES);
  for (const entry of data.tasks) assert.equal(entry.lastRun, null);
  assert.equal(taskEntry(data, 0).dataState.expected, 0);
  assert.equal(taskEntry(data, 0).contractReady, true); // 价格数据态不依赖 taskruns
  for (const index of [1, 2, 3, 4]) {
    assert.equal(taskEntry(data, index).contractReady, false);
    assert.equal(taskEntry(data, index).dataStateLevel, 'unknown');
  }
  assert.ok(!JSON.stringify(data).includes('SUCCEEDED'));
  assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
  assert.equal(typeof data.timezone, 'string');
});

// ---------------------------------------------------------------------------
// AC3 / AC4 / AC5 / AC6：result 缺失必须显式降级，不得用 status 冒充
// ---------------------------------------------------------------------------

test('U8 完整性：result 缺失 → 数值全 null（不是 0）+ CONTRACT_NOT_READY', async () => {
  useWorld({ latestRuns: [latest('price-integrity-check', { status: 'SUCCEEDED' })] });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const entry = taskEntry(data, 1);

  assert.equal(entry.dataState.expectedCount, null);
  assert.equal(entry.dataState.actualCount, null);
  assert.equal(entry.dataState.missingCount, null);
  assert.equal(entry.dataState.completenessRatio, null);
  assert.equal(entry.dataState.skippedNoLaunchDate, null);
  assert.deepEqual(entry.dataState.gapAssets, []);
  assert.equal(entry.contractReady, false);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.ok(entry.notes.some((note) => note.code === 'CONTRACT_NOT_READY'));
});

test('U9 再平衡：父任务 result 缺失 → due=null（不是 0/4），perPortfolio 仍可读', async () => {
  const pid = '64b000000000000000000001';
  const other = '64b000000000000000000002';
  const startedAt = new Date('2026-10-26T04:00:00.000Z');
  useWorld({
    portfolios: [
      { _id: pid, name: 'A股-长钱组合', accountType: 'tiantian', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } },
      { _id: other, name: 'CA-RRSP组合', accountType: 'rrsp', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } }
    ],
    rebalanceRuns: [
      { _id: `rebalance-suggestions:${pid}`, doc: priceRun({ taskName: `rebalance-suggestions:${pid}`, startedAt }) },
      {
        _id: `rebalance-suggestions:${other}`,
        doc: priceRun({
          taskName: `rebalance-suggestions:${other}`,
          startedAt,
          status: 'PARTIAL',
          failures: [{ item: 'X', category: 'SYMBOL_NOT_FOUND', message: 'symbol not found' }]
        })
      }
    ]
  });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const entry = taskEntry(data, 4);
  const ds = entry.dataState;

  assert.equal(ds.due, null);
  assert.equal(ds.totalPortfolios, null);
  assert.equal(ds.generatedCount, null);
  assert.equal(ds.perPortfolio.length, 2);
  assert.deepEqual(ds.perPortfolio.map((row) => row.runStatus), ['SUCCEEDED', 'PARTIAL']);
  assert.equal(ds.failures.length, 1);
  assert.equal(ds.failures[0].category, 'SYMBOL_NOT_FOUND');
  assert.equal(ds.perPortfolioDate, '2026-10-26');
  assert.equal(entry.contractReady, false);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.ok(entry.notes.some((note) => note.code === 'CONTRACT_NOT_READY'));
});

test('U10 汇率：fxCount 可只读得到，但 currencies 必须 null、不得反推币种成功', async () => {
  useWorld({ fxCount: 3 });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const entry = taskEntry(data, 3);

  assert.equal(entry.dataState.fxCount, 3);
  assert.equal(entry.dataState.currencies, null);
  assert.equal(entry.contractReady, false);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.ok(entry.notes.some((note) => note.code === 'CONTRACT_NOT_READY'));
});

test('U11 提醒：created=0 属正常态（不是 warn/bad），四字段原样透传', async () => {
  useWorld({
    latestRuns: [latest('alert-evaluate', {
      result: { evaluated: 12, created: 0, archived: 1, failed: 0 }
    })]
  });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const entry = taskEntry(data, 2);

  assert.deepEqual(entry.dataState, { evaluated: 12, created: 0, archived: 1, failed: 0 });
  assert.equal(entry.contractReady, true);
  assert.equal(entry.dataStateLevel, 'ok');
});

// ---------------------------------------------------------------------------
// D-16：周末 / 每日 03:00 前不报假缺口
// ---------------------------------------------------------------------------

test('U12 周末：目标日回退到"已到点采集"覆盖的交易日，并给 TARGET_LAGGED', async () => {
  useWorld({
    assets: [asset('AAA', 'US')],
    prices: [priceAt('AAA', '2026-10-22')] // 周四桶（周五收盘价要等下周一 03:00 才入库）
  });

  const data = await service.getStatus({ now: new Date('2026-10-25T14:00:00.000Z') }); // 周日
  const entry = taskEntry(data, 0);
  const ds = entry.dataState;

  assert.equal(ds.targetMarketDate, '2026-10-22'); // 不是 10-23
  assert.equal(ds.calendarPrevOpenDay, '2026-10-23');
  assert.equal(ds.expected, 1);
  assert.equal(ds.fetched, 1);
  assert.equal(entry.dataStateLevel, 'ok'); // 不得因为周五价未采而全红
  assert.ok(entry.notes.some((note) => note.code === 'TARGET_LAGGED'));
});

test('U13 每日 03:00 前：目标日不得取"昨天已完成但尚未采集"的交易日', async () => {
  useWorld({
    assets: [asset('AAA', 'US')],
    prices: [priceAt('AAA', '2026-10-22')]
  });

  const data = await service.getStatus({ now: new Date('2026-10-26T06:00:00.000Z') }); // 周一 02:00 EDT
  const ds = taskEntry(data, 0).dataState;

  assert.equal(ds.targetMarketDate, '2026-10-22');
  assert.notEqual(ds.targetMarketDate, '2026-10-23');
  assert.equal(ds.fetched, 1);
});

test('真实停摆仍要报红：今日 03:00 已过但当天无采集 → 目标日缺失即报缺口', async () => {
  useWorld({
    assets: [asset('AAA', 'US')],
    prices: [priceAt('AAA', '2026-10-22')]
  });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }); // 周一 10:00 EDT
  const entry = taskEntry(data, 0);

  assert.equal(entry.dataState.targetMarketDate, '2026-10-23'); // 周五该采未采
  assert.equal(entry.dataState.fetched, 0);
  assert.equal(entry.dataStateLevel, 'bad');
});

// ---------------------------------------------------------------------------
// 脏数据 / 查询形状（Reviewer F2、F4 整改）
// ---------------------------------------------------------------------------

test('U16 result 内含 null 元素不得把整个端点打成 500（Mixed 未校验）', async () => {
  const pid = '64b000000000000000000001';
  useWorld({
    latestRuns: [
      latest('price-integrity-check', {
        result: {
          totals: { expectedCount: 10, actualCount: 9, missingCount: 1 },
          gapAssets: [null, { symbol: 'X', missingCount: 1 }]
        }
      }),
      latest('alert-evaluate', {
        result: { evaluated: 1, created: 0, archived: 0, failed: 0, alertsFired: [null] }
      }),
      latest('fx-rate-sync', {
        result: { currencies: { USD: { ok: true, rateToCny: 7.1 }, CAD: null } }
      })
    ],
    rebalanceRuns: [
      {
        _id: 'rebalance-check',
        doc: priceRun({
          taskName: 'rebalance-check',
          result: {
            totalPortfolios: 1,
            skippedCount: 0,
            perPortfolio: [null, { portfolioId: pid, due: true, needsRebalance: true, suggestionsCount: 2, recordId: 'r1' }]
          }
        })
      },
      {
        _id: `rebalance-suggestions:${pid}`,
        doc: priceRun({
          taskName: `rebalance-suggestions:${pid}`,
          failures: [null, { item: 'X', category: 'SYMBOL_NOT_FOUND', message: 'not found' }]
        })
      }
    ],
    portfolios: [{ _id: pid, name: 'P', accountType: 'other', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } }]
  });

  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });

  const integrity = taskEntry(data, 1);
  assert.equal(integrity.dataState.missingCount, 1);
  assert.deepEqual(integrity.dataState.gapAssets, [{ symbol: 'X', missingCount: 1 }]);

  const rebalance = taskEntry(data, 4);
  assert.equal(rebalance.dataState.perPortfolio.length, 1);
  assert.equal(rebalance.dataState.due, 1);
  assert.equal(rebalance.dataState.failures.length, 1);
  assert.equal(rebalance.dataState.failures[0].category, 'SYMBOL_NOT_FOUND');
});

test('U17 查询形状：Q1 每任务只取最新一条、Q5 按最新汇率日聚合（D-19 / D-18 的真实执行载体）', async () => {
  useWorld({ fxCount: 3 });

  await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const pipelines = getCapturedPipelines();

  const taskRunPipelines = pipelines
    .filter((item) => item.model === 'TaskRun')
    .map((item) => JSON.stringify(item.pipeline));

  // Q1：$match taskName $in + 按 startedAt 倒序 + 按 taskName 取首条 —— 这才是"只判最新一条"的保证
  const latestPipeline = taskRunPipelines.find(
    (text) => text.includes('daily-price-sync') && text.includes('$group')
  );
  assert.ok(latestPipeline, 'Q1 聚合管线应存在');
  assert.ok(latestPipeline.includes('"$sort":{"startedAt":-1}'), 'Q1 必须按 startedAt 倒序');
  assert.ok(latestPipeline.includes('"$first":"$$ROOT"'), 'Q1 必须只取每个任务首条');

  // Q6：再平衡父任务 + 子任务前缀都必须在 $match 里
  const rebalancePipeline = taskRunPipelines.find((text) => text.includes('rebalance-suggestions'));
  assert.ok(rebalancePipeline, 'Q6 聚合管线应存在');
  assert.ok(rebalancePipeline.includes('rebalance-check'));

  // Q5：按日期分组 + 计数 + 取最新一天
  const fxPipelines = pipelines.filter((item) => item.model === 'FxRate');
  assert.equal(fxPipelines.length, 1);
  const fxText = JSON.stringify(fxPipelines[0].pipeline);
  assert.ok(fxText.includes('$dateToString'));
  assert.ok(fxText.includes('"$sum":1'));
  assert.ok(fxText.includes('"$limit":1'));
});
