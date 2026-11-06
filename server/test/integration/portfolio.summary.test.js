const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-portfolio-summary-test-logs';

const { buildPortfolioSummary, computeSummary } = require('@portomind/shared/services/portfolio/summary');
const PortfolioService = require('@portomind/shared/services/portfolio');
const Portfolio = require('@portomind/shared/models/portfolio');
const RebalanceRecord = require('@portomind/shared/models/rebalanceRecord');
const AlertEvent = require('@portomind/shared/models/alertEvent');
const tracker = require('@portomind/shared/services/portfolio/positionTracker');
const { Types } = require('mongoose');

// ───────────────────────── 纯函数表驱动测试 ─────────────────────────

function makePosition(overrides = {}) {
  return {
    symbol: 'XEQT',
    currency: 'CAD',
    quantity: 100,
    remainingCost: 3000,
    latestPrice: 40,
    marketValue: 4000,
    ...overrides
  };
}

function makePortfolio(overrides = {}) {
  return {
    name: '测试组合',
    currency: 'CAD',
    targets: [{ symbol: 'XEQT', targetRatio: 100 }],
    rebalanceSettings: { absoluteDeviation: 5, relativeDeviation: 10, timeInterval: 60 },
    ...overrides
  };
}

test('单币种组合：市值分桶与持仓数', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio(),
    positions: [makePosition(), makePosition({ symbol: 'VGRO', marketValue: 1000.005 })]
  });
  assert.equal(stats.positionCount, 2);
  assert.deepEqual(stats.marketValueByCurrency, { CAD: 5000.01 });
});

test('多币种组合：分桶展示不跨币种合计', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio(),
    positions: [
      makePosition({ currency: 'CAD', marketValue: 4000 }),
      makePosition({ symbol: '510300', currency: 'CNY', marketValue: 12000 })
    ]
  });
  assert.deepEqual(stats.marketValueByCurrency, { CAD: 4000, CNY: 12000 });
});

test('缺价的币种桶为 null，不影响其他币种', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio(),
    positions: [
      makePosition({ currency: 'CAD', marketValue: 4000 }),
      makePosition({ symbol: '0700', currency: 'HKD', marketValue: null })
    ]
  });
  assert.equal(stats.marketValueByCurrency.CAD, 4000);
  assert.equal(stats.marketValueByCurrency.HKD, null);
});

test('无目标配置或无持仓时 drift 为 null（卡片显示 —）', () => {
  const noTargets = buildPortfolioSummary({
    portfolio: makePortfolio({ targets: [] }),
    positions: [makePosition()]
  });
  assert.equal(noTargets.drift, null);

  const noPositions = buildPortfolioSummary({
    portfolio: makePortfolio(),
    positions: []
  });
  assert.equal(noPositions.drift, null);
  assert.deepEqual(noPositions.marketValueByCurrency, {});
});

test('偏离超阈值触发 needsRebalance；未超阈值不触发', () => {
  // 目标 50/50，当前 4000/1000=5000 → 80%/20% → 绝对偏离 30% > 5%
  const drifted = buildPortfolioSummary({
    portfolio: makePortfolio({
      targets: [
        { symbol: 'XEQT', targetRatio: 50 },
        { symbol: 'VGRO', targetRatio: 50 }
      ]
    }),
    positions: [
      makePosition({ marketValue: 4000 }),
      makePosition({ symbol: 'VGRO', marketValue: 1000 })
    ]
  });
  assert.equal(drifted.drift.needsRebalance, true);
  assert.ok(drifted.drift.triggeredThresholds.includes('absoluteDeviation'));

  // 2500/2500 → 50%/50%，完全对齐
  const aligned = buildPortfolioSummary({
    portfolio: makePortfolio({
      targets: [
        { symbol: 'XEQT', targetRatio: 50 },
        { symbol: 'VGRO', targetRatio: 50 }
      ]
    }),
    positions: [
      makePosition({ marketValue: 2500 }),
      makePosition({ symbol: 'VGRO', marketValue: 2500 })
    ]
  });
  assert.equal(aligned.drift.needsRebalance, false);
});

test('仅时间间隔触发不计入漂移徽标', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio({
      targets: [{ symbol: 'XEQT', targetRatio: 100 }],
      rebalanceSettings: { absoluteDeviation: 100, relativeDeviation: 100, timeInterval: 60 }
    }),
    // 完全对齐：无偏离；lastExecutedAt 很久以前 → timeInterval 触发但被过滤
    positions: [makePosition({ marketValue: 5000 })],
    lastExecutedAt: new Date(Date.now() - 90 * 86400000)
  });
  assert.equal(stats.drift.needsRebalance, false);
  assert.deepEqual(stats.drift.triggeredThresholds, []);
  // AC-02：三项同断言——时间维度只暴露 dueByTime，不得扩义 needsRebalance
  assert.equal(stats.drift.dueByTime, true);
  assert.equal(stats.drift.overThresholdCount, 0);
});

test('存在缺价持仓时不评估漂移', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio(),
    positions: [makePosition({ marketValue: null })]
  });
  assert.equal(stats.drift, null);
  assert.equal(stats.marketValueByCurrency.CAD, null);
});

// ───────────────────────── US-004 四字段 / 查询预算 ─────────────────────────

test('AC-01：stats 回传 lastExecutedAt / pendingRebalanceCount，drift 带 dueByTime / overThresholdCount', () => {
  const at = new Date('2026-01-02T03:04:05.000Z');
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio({ rebalanceSettings: { absoluteDeviation: 5, relativeDeviation: 10 } }),
    positions: [makePosition()],
    lastExecutedAt: at,
    pendingRebalanceCount: 3
  });

  assert.equal(stats.lastExecutedAt, at);
  assert.equal(stats.pendingRebalanceCount, 3);
  assert.equal(typeof stats.drift.dueByTime, 'boolean');
  assert.equal(stats.drift.dueByTime, false);
  assert.equal(typeof stats.drift.overThresholdCount, 'number');
  assert.equal(stats.drift.overThresholdCount, 0);
});

test('AC-01：drift 为 null 时不带 dueByTime / overThresholdCount', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio({ targets: [] }),
    positions: [makePosition()]
  });

  assert.equal(stats.drift, null);
  assert.equal(stats.pendingRebalanceCount, 0);
  assert.equal(stats.lastExecutedAt, null);
});

test('AC-04：overThresholdCount 是标的数，不是顶层阈值类型数', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio({
      targets: [
        { symbol: 'XEQT', targetRatio: 100 },
        { symbol: 'VGRO', targetRatio: 0 },
        { symbol: 'CASH', targetRatio: 0 }
      ],
      rebalanceSettings: { absoluteDeviation: 7, relativeDeviation: 9 }
    }),
    positions: [
      makePosition({ symbol: 'XEQT', marketValue: 90 }),
      makePosition({ symbol: 'VGRO', marketValue: 5 }),
      makePosition({ symbol: 'CASH', marketValue: 5 })
    ]
  });

  // XEQT 同时触发绝对/相对两种阈值；VGRO/CASH 各偏离 5% 未过 7%。
  assert.equal(stats.drift.triggeredThresholds.length, 2);
  assert.equal(stats.drift.overThresholdCount, 1);
});

test('AC-03：pendingRebalanceCount 单次聚合，仅 PENDING 计入', async (t) => {
  const p1 = makePortfolio({ _id: new Types.ObjectId(), name: 'P1' });
  const p2 = makePortfolio({ _id: new Types.ObjectId(), name: 'P2' });
  const executedAt = new Date('2026-02-03T00:00:00.000Z');

  t.mock.method(Portfolio, 'find', () => ({
    sort: () => ({ lean: async () => [p1, p2] }),
    lean: async () => [p1, p2]
  }));
  t.mock.method(AlertEvent, 'aggregate', async () => []);

  let pipeline = null;
  const records = [
    { portfolioId: p1._id, status: 'PENDING' },
    { portfolioId: p1._id, status: 'PENDING' },
    { portfolioId: p2._id, status: 'PENDING' },
    { portfolioId: p1._id, status: 'EXECUTED' },
    { portfolioId: p2._id, status: 'REVOKED' }
  ];
  t.mock.method(RebalanceRecord, 'aggregate', async (nextPipeline) => {
    pipeline = nextPipeline;
    const grouped = new Map();
    for (const record of records) {
      if (record.status !== 'PENDING') continue;
      const key = record.portfolioId.toString();
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    return [...grouped.entries()].map(([id, count]) => ({ _id: id, count }));
  });

  let findOneCalls = 0;
  let countDocumentsCalls = 0;
  t.mock.method(RebalanceRecord, 'countDocuments', async () => {
    countDocumentsCalls += 1;
    return 0;
  });
  t.mock.method(RebalanceRecord, 'findOne', () => {
    findOneCalls += 1;
    return {
      sort: () => ({ lean: async () => ({ executedAt }) })
    };
  });
  t.mock.method(tracker, 'aggregate', async () => [makePosition()]);

  const result = await computeSummary();

  assert.deepEqual(pipeline[0], { $match: { status: 'PENDING' } });
  assert.deepEqual(pipeline[1].$group, { _id: '$portfolioId', count: { $sum: 1 } });
  assert.equal(result[0].stats.pendingRebalanceCount, 2);
  assert.equal(result[1].stats.pendingRebalanceCount, 1);
  assert.equal(result[0].stats.lastExecutedAt.getTime(), executedAt.getTime());
  assert.equal(findOneCalls, 2);
  assert.equal(countDocumentsCalls, 0);
});

test('AC-04：10 个组合时 RebalanceRecord 查询 ≤ 11，countDocuments = 0', async (t) => {
  const portfolios = Array.from({ length: 10 }, (_, index) => makePortfolio({
    _id: new Types.ObjectId(),
    name: `P${index + 1}`
  }));

  t.mock.method(Portfolio, 'find', () => ({
    sort: () => ({ lean: async () => portfolios }),
    lean: async () => portfolios
  }));
  t.mock.method(AlertEvent, 'aggregate', async () => []);

  let aggregateCalls = 0;
  let findOneCalls = 0;
  let countDocumentsCalls = 0;
  t.mock.method(RebalanceRecord, 'aggregate', async () => {
    aggregateCalls += 1;
    return [];
  });
  t.mock.method(RebalanceRecord, 'findOne', () => {
    findOneCalls += 1;
    return {
      sort: () => ({ lean: async () => null })
    };
  });
  t.mock.method(RebalanceRecord, 'countDocuments', async () => {
    countDocumentsCalls += 1;
    return 0;
  });
  t.mock.method(tracker, 'aggregate', async () => [makePosition()]);

  const result = await computeSummary();

  assert.equal(result.length, 10);
  assert.equal(aggregateCalls, 1);
  assert.equal(findOneCalls, 10);
  assert.equal(aggregateCalls + findOneCalls, 11);
  assert.ok(aggregateCalls + findOneCalls <= 11);
  assert.equal(countDocumentsCalls, 0);
});

test('AC-02/05：summary 的 unreadAgg 只统计现存组合，删除 A 后 B 不变', async (t) => {
  const A = new Types.ObjectId();
  const B = new Types.ObjectId();
  const a = makePortfolio({ _id: A, name: 'A' });
  const b = makePortfolio({ _id: B, name: 'B' });
  let visible = [a, b];
  const pipelines = [];

  t.mock.method(Portfolio, 'find', () => ({
    sort: () => ({ lean: async () => visible }),
    lean: async () => visible.map((portfolio) => ({ _id: portfolio._id }))
  }));
  t.mock.method(AlertEvent, 'aggregate', async (pipeline) => {
    pipelines.push(pipeline);
    return [{ _id: B, count: 1 }];
  });
  t.mock.method(RebalanceRecord, 'aggregate', async () => []);
  t.mock.method(RebalanceRecord, 'findOne', () => ({
    sort: () => ({ lean: async () => null })
  }));
  t.mock.method(tracker, 'aggregate', async () => [makePosition()]);

  const before = await computeSummary();
  assert.equal(before.length, 2);
  assert.equal(before.find((item) => String(item._id) === String(B)).stats.unreadAlertCount, 1);
  assert.deepEqual(pipelines[0][0].$match, {
    status: 'unread',
    $or: [
      { portfolioId: { $in: [A, B] } },
      { portfolioId: null }
    ]
  });

  // 删除 A：组合集合只剩 B；B 的未读仍为 1，A 不再出现
  visible = [b];
  const after = await computeSummary();
  assert.equal(after.length, 1);
  assert.equal(after[0].stats.unreadAlertCount, 1);
  assert.deepEqual(pipelines[1][0].$match, {
    status: 'unread',
    $or: [
      { portfolioId: { $in: [B] } },
      { portfolioId: null }
    ]
  });
});

// ───────────────────────── HTTP 契约测试 ─────────────────────────

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
let server;
let baseUrl;

test.before(async () => {
  installAdminSession();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  uninstallSessionStub();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: authHeaders().cookie } });
  return { status: response.status, body: await response.json() };
}

test('GET /api/portfolios/summary 返回全部组合及统计', async () => {
  const summary = [{
    _id: '64b000000000000000000010',
    name: 'CA-TFSA',
    currency: 'CAD',
    stats: { positionCount: 2, marketValueByCurrency: { CAD: 5000.01 }, drift: { needsRebalance: false, triggeredThresholds: [] } }
  }];
  PortfolioService.computeSummary = async () => summary;

  const result = await request('/api/portfolios/summary');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.data[0].name, 'CA-TFSA');
  assert.equal(result.body.data[0].stats.marketValueByCurrency.CAD, 5000.01);
});

test('GET /api/portfolios/summary 空组合返回空数组', async () => {
  PortfolioService.computeSummary = async () => [];
  const result = await request('/api/portfolios/summary');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, []);
});

test('GET /api/portfolios/:id 不会误匹配 summary 路由', async () => {
  PortfolioService.computeSummary = async () => [];
  // summary 注册于 /:id 之前；/summary 命中汇总路由而非按 id 查询
  const result = await request('/api/portfolios/summary');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
});
