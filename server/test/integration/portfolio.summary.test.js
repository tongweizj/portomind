const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-portfolio-summary-test-logs';

const { buildPortfolioSummary } = require('../../services/portfolio/summary');
const PortfolioService = require('../../services/portfolio');

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
});

test('存在缺价持仓时不评估漂移', () => {
  const stats = buildPortfolioSummary({
    portfolio: makePortfolio(),
    positions: [makePosition({ marketValue: null })]
  });
  assert.equal(stats.drift, null);
  assert.equal(stats.marketValueByCurrency.CAD, null);
});

// ───────────────────────── HTTP 契约测试 ─────────────────────────

const app = require('../../app');
let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
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
