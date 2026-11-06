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

test('AC1 S5 对象形态：三币齐全且显式 ok:true 才整体 ok', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { fxCount: 3, currencies: {
    USD: { ok: true, rateToCny: 7.13 }, CAD: { ok: true, rateToCny: 5.21 }, HKD: { ok: true, rateToCny: 0.92 }
  } } })] });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(entry.contractReady, true);
  assert.equal(entry.dataStateLevel, 'ok');
  assert.deepEqual(entry.dataState.currencies, {
    USD: { ok: true, rateToCny: 7.13 },
    CAD: { ok: true, rateToCny: 5.21 },
    HKD: { ok: true, rateToCny: 0.92 }
  });
  assert.equal(entry.notes.some((n) => n.code === 'NUMERIC_OBSERVATION_ONLY'), false);
});

test('AC1 标量数值仅观测：ok:null、不判成功也不判失败，带 NUMERIC_OBSERVATION_ONLY', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { USD: 7.13, CAD: 5.21, HKD: 0.92 } } })] });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(entry.contractReady, true);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.deepEqual(entry.dataState.currencies.USD, { ok: null, rateToCny: 7.13 });
  assert.ok(entry.notes.some((n) => n.code === 'NUMERIC_OBSERVATION_ONLY'));
  assert.notEqual(entry.dataStateLevel, 'ok');
  assert.notEqual(entry.dataStateLevel, 'bad');
});

test('AC1 已知方向错误但合法正值（USD 0.14）仍只算观测，不声称方向已修', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { USD: 0.14, CAD: 5.21, HKD: 0.92 } } })] });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(entry.dataState.currencies.USD.rateToCny, 0.14);
  assert.equal(entry.dataState.currencies.USD.ok, null);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.ok(entry.notes.some((n) => n.code === 'NUMERIC_OBSERVATION_ONLY'));
});

test('AC1/AC2 0 / 负数 / NaN / Infinity 数值非法：contractReady=false + CURRENCY_INVALID', async () => {
  for (const badValue of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { USD: badValue, CAD: 5.21, HKD: 0.92 } } })] });
    const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
    assert.equal(entry.contractReady, false);
    assert.equal(entry.dataStateLevel, 'unknown');
    assert.ok(entry.notes.some((n) => n.code === 'CURRENCY_INVALID'));
    assert.equal(entry.dataState.currencies.USD.ok, null);
  }
});

test('AC2 空对象 {}：contractReady=false、unknown、解释 note，不假绿', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: {} } })] });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(entry.contractReady, false);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.equal(entry.dataState.currencies, null);
  assert.ok(entry.notes.some((n) => n.code === 'CONTRACT_NOT_READY'));
});

test('AC2 数组容器被拒绝：contractReady=false + CONTRACT_NOT_READY', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: [{ currency: 'USD', ok: true, rateToCny: 7.13 }] } })] });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(entry.contractReady, false);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.equal(entry.dataState.currencies, null);
  assert.ok(entry.notes.some((n) => n.code === 'CONTRACT_NOT_READY'));
});

test('AC2 缺 USD：缺记录（ok:null）与显式失败（ok:false）可区分', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { CAD: { ok: true, rateToCny: 5.21 }, HKD: { ok: true, rateToCny: 0.92 } } } })] });
  const missing = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(missing.contractReady, false);
  assert.equal(missing.dataStateLevel, 'warn');
  assert.equal(missing.dataState.currencies.USD.ok, null);
  assert.ok(missing.notes.some((n) => n.code === 'CURRENCY_MISSING'));

  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { USD: { ok: false }, CAD: { ok: true, rateToCny: 5.21 }, HKD: { ok: true, rateToCny: 0.92 } } } })] });
  const failed = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(failed.contractReady, true);
  assert.equal(failed.dataStateLevel, 'warn');
  assert.equal(failed.dataState.currencies.USD.ok, false);
  assert.ok(failed.notes.some((n) => n.code === 'FX_CURRENCY_FAILED'));
});

test('AC2 非法项（ok 非布尔）→ contractReady=false + CURRENCY_INVALID', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { USD: { ok: 'yes', rateToCny: 7.13 }, CAD: { ok: true, rateToCny: 5.21 }, HKD: { ok: true, rateToCny: 0.92 } } } })] });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(entry.contractReady, false);
  assert.equal(entry.dataState.currencies.USD.ok, null);
  assert.ok(entry.notes.some((n) => n.code === 'CURRENCY_INVALID'));
});

test('AC2 判级：三币全显式失败 bad；显式失败与成功混合 warn', async () => {
  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { USD: { ok: false }, CAD: { ok: false }, HKD: { ok: false } } } })] });
  const allFailed = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(allFailed.dataStateLevel, 'bad');
  assert.ok(allFailed.notes.some((n) => n.code === 'FX_CURRENCY_FAILED'));

  useWorld({ latestRuns: [latest('fx-rate-sync', { result: { currencies: { USD: { ok: false }, CAD: { ok: true, rateToCny: 5.21 }, HKD: { ok: true, rateToCny: 0.92 } } } })] });
  const mixed = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 3);
  assert.equal(mixed.dataStateLevel, 'warn');
  assert.ok(mixed.notes.some((n) => n.code === 'FX_CURRENCY_FAILED'));
});

test('AC3 S6 四语义：due=null 保持未知；未超阈 0 不算失败；生成数只计显式 >0', async () => {
  const p1 = '64b000000000000000000101';
  const p2 = '64b000000000000000000102';
  const p3 = '64b000000000000000000103';
  useWorld({
    portfolios: [p1, p2, p3].map((id) => ({ _id: id, name: id, accountType: 'other', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } })),
    rebalanceRuns: [{
      _id: 'rebalance-check',
      doc: priceRun({ taskName: 'rebalance-check', result: { totalPortfolios: 3, skippedCount: 0, perPortfolio: [
        { portfolioId: p1, due: true, needsRebalance: true, suggestionsCount: 2, recordId: 'rec1', status: 'SUCCEEDED' },
        { portfolioId: p2, due: true, needsRebalance: false, suggestionsCount: 0, recordId: null, status: 'SUCCEEDED' },
        { portfolioId: p3, due: false, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'SUCCEEDED' }
      ] } })
    }]
  });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 4);
  assert.equal(entry.contractReady, true);
  assert.equal(entry.dataStateLevel, 'ok');
  assert.equal(entry.dataState.due, 2);
  assert.equal(entry.dataState.generatedCount, 1);
  const byId = new Map(entry.dataState.perPortfolio.map((row) => [row.portfolioId, row]));
  assert.equal(byId.get(p3).due, false);
  assert.equal(byId.get(p3).suggestionsCount, null);
  assert.equal(byId.get(p2).needsRebalance, false);
  assert.equal(byId.get(p2).suggestionsCount, 0);
  assert.equal(byId.get(p2).recordId, null);
  assert.equal(byId.get(p1).suggestionsCount, 2);
});

test('AC3 显式失败 → bad（不是正常未超阈）；失败与未超阈可区分', async () => {
  const p1 = '64b000000000000000000111';
  const p2 = '64b000000000000000000112';
  useWorld({
    portfolios: [p1, p2].map((id) => ({ _id: id, name: id, accountType: 'other', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } })),
    rebalanceRuns: [{
      _id: 'rebalance-check',
      doc: priceRun({ taskName: 'rebalance-check', result: { totalPortfolios: 2, skippedCount: 0, perPortfolio: [
        { portfolioId: p1, due: true, needsRebalance: false, suggestionsCount: 0, recordId: null, status: 'SUCCEEDED' },
        { portfolioId: p2, due: true, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'FAILED', failureReason: 'DB_TIMEOUT' }
      ] } })
    }]
  });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 4);
  assert.equal(entry.dataStateLevel, 'bad');
  assert.ok(entry.notes.some((n) => n.code === 'REBALANCE_FAILED'));
  assert.equal(entry.dataState.perPortfolio.find((row) => row.portfolioId === p2).status, 'FAILED');
});

test('AC3 子任务 SKIPPED：status 呈现跳过、字段保持 null、level=warn', async () => {
  const p1 = '64b000000000000000000121';
  useWorld({
    portfolios: [{ _id: p1, name: 'P', accountType: 'other', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } }],
    rebalanceRuns: [{
      _id: 'rebalance-check',
      doc: priceRun({ taskName: 'rebalance-check', result: { totalPortfolios: 1, skippedCount: 0, perPortfolio: [
        { portfolioId: p1, due: true, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'SKIPPED', failureReason: 'SKIPPED:DUPLICATE_RUN_KEY' }
      ] } })
    }]
  });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 4);
  assert.equal(entry.dataStateLevel, 'warn');
  assert.ok(entry.notes.some((n) => n.code === 'REBALANCE_UNRESOLVED'));
  const row = entry.dataState.perPortfolio[0];
  assert.equal(row.status, 'SKIPPED');
  assert.equal(row.needsRebalance, null);
  assert.equal(row.suggestionsCount, null);
});

test('AC3 perPortfolio 缺项 → contractReady=false + PER_PORTFOLIO_INCOMPLETE', async () => {
  const p1 = '64b000000000000000000131';
  const p2 = '64b000000000000000000132';
  useWorld({
    portfolios: [p1, p2].map((id) => ({ _id: id, name: id, accountType: 'other', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } })),
    rebalanceRuns: [{
      _id: 'rebalance-check',
      doc: priceRun({ taskName: 'rebalance-check', result: { totalPortfolios: 2, skippedCount: 0, perPortfolio: [
        { portfolioId: p1, due: true, needsRebalance: false, suggestionsCount: 0, recordId: null, status: 'SUCCEEDED' }
      ] } })
    }]
  });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 4);
  assert.equal(entry.contractReady, false);
  assert.equal(entry.dataStateLevel, 'unknown');
  assert.equal(entry.dataState.due, null);
  assert.equal(entry.dataState.generatedCount, null);
  assert.ok(entry.notes.some((n) => n.code === 'PER_PORTFOLIO_INCOMPLETE'));
});

test('AC3 脏项逐项剔除并计 note，不打 500', async () => {
  const p1 = '64b000000000000000000141';
  useWorld({
    portfolios: [{ _id: p1, name: 'P', accountType: 'other', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } }],
    rebalanceRuns: [{
      _id: 'rebalance-check',
      doc: priceRun({ taskName: 'rebalance-check', result: { totalPortfolios: 1, skippedCount: 0, perPortfolio: [
        null,
        { portfolioId: p1, due: true, needsRebalance: false, suggestionsCount: 0, recordId: null, status: 'SUCCEEDED' }
      ] } })
    }]
  });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 4);
  assert.equal(entry.contractReady, true);
  assert.ok(entry.notes.some((n) => n.code === 'PER_PORTFOLIO_DIRTY'));
  assert.equal(entry.dataState.perPortfolio.length, 1);
});

test('AC3 due=null 必须保持 unknown（不得转 false）', async () => {
  const p1 = '64b000000000000000000151';
  useWorld({
    portfolios: [{ _id: p1, name: 'P', accountType: 'other', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } }],
    rebalanceRuns: [{
      _id: 'rebalance-check',
      doc: priceRun({ taskName: 'rebalance-check', result: { totalPortfolios: 1, skippedCount: 0, perPortfolio: [
        { portfolioId: p1, due: null, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'SUCCEEDED' }
      ] } })
    }]
  });
  const entry = taskEntry(await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }), 4);
  assert.equal(entry.dataStateLevel, 'warn');
  assert.equal(entry.dataState.perPortfolio[0].due, null);
  assert.ok(entry.notes.some((n) => n.code === 'REBALANCE_UNRESOLVED'));
});

test('AC4 lastSkip 与 lastRun 分离：skip 不覆盖/不冒充成功；无记录为 null', async () => {
  const skippedAt = new Date('2026-10-26T03:00:05.000Z');
  useWorld({
    latestRuns: [latest('daily-price-sync', { status: 'RUNNING', startedAt: new Date('2026-10-20T03:00:00.000Z'), endedAt: null })],
    taskSkips: [
      { _id: 'daily-price-sync', doc: { taskName: 'daily-price-sync', runKey: '2026-10-26', reason: 'ALREADY_RUNNING', skippedAt, trigger: 'SCHEDULED' } },
      { _id: 'rebalance-check', doc: { taskName: 'rebalance-check', runKey: '2026-10-26', reason: 'DUPLICATE_RUN_KEY', skippedAt, trigger: 'MANUAL' } }
    ]
  });
  const data = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const price = taskEntry(data, 0);
  assert.equal(price.lastRun.status, 'STALE');
  assert.equal(price.lastRun.rawStatus, 'RUNNING');
  assert.notEqual(price.lastRun.status, 'SKIPPED');
  assert.equal(price.lastSkip.taskName, 'daily-price-sync');
  assert.equal(price.lastSkip.reason, 'ALREADY_RUNNING');
  assert.equal(price.lastSkip.skippedAt, skippedAt.toISOString());
  assert.equal(price.lastSkip.runKey, '2026-10-26');
  assert.equal(taskEntry(data, 4).lastSkip.reason, 'DUPLICATE_RUN_KEY');
  assert.equal(taskEntry(data, 1).lastSkip, null);
});

test('AC4 无跳过记录/命名空间缺失 → lastSkip=null；其他 DB 错误必须抛出', async () => {
  useWorld({ taskSkips: [] });
  const empty = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  for (const entry of empty.tasks) assert.equal(entry.lastSkip, null);

  useWorld({ taskSkipError: Object.assign(new Error('ns not found'), { code: 26 }) });
  const missingNamespace = await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  for (const entry of missingNamespace.tasks) assert.equal(entry.lastSkip, null);

  useWorld({ taskSkipError: Object.assign(new Error('boom'), { code: 500 }) });
  await assert.rejects(
    () => service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') }),
    /boom/
  );
});

test('AC5 查询预算：主视图新增单次 TaskSkip 批量聚合；detail 不查询 skip', async () => {
  useWorld({ taskSkips: [{ _id: 'daily-price-sync', doc: { taskName: 'daily-price-sync', skippedAt: new Date() } }] });
  await service.getStatus({ now: new Date('2026-10-26T14:00:00.000Z') });
  const skipPipelines = getCapturedPipelines().filter((item) => item.model === 'TaskSkip');
  assert.equal(skipPipelines.length, 1);
  const skipText = JSON.stringify(skipPipelines[0].pipeline);
  assert.ok(skipText.includes('"$sort":{"skippedAt":-1}'));
  assert.ok(skipText.includes('"$group"'));
  assert.ok(skipText.includes('$first') && skipText.includes('$$ROOT'));
  assert.ok(skipText.includes('daily-price-sync'));
  const aggregateModels = getCapturedPipelines().map((item) => item.model);
  assert.equal(aggregateModels.filter((model) => model === 'TaskRun').length, 2);
  assert.equal(aggregateModels.filter((model) => model === 'FxRate').length, 1);
  assert.equal(aggregateModels.filter((model) => model === 'TaskSkip').length, 1);

  useWorld({ taskSkips: [] });
  await service.getStatus({ detail: 'rebalance', date: '2026-10-26' });
  assert.equal(getCapturedPipelines().filter((item) => item.model === 'TaskSkip').length, 0);
});
