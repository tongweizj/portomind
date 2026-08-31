const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-asset-class-test-logs';

const {
  aggregateByAssetClass,
  buildClassPositions,
  hasClassTargets,
  deriveSymbolTargets,
  UNCLASSIFIED
} = require('../../services/portfolio/assetClassAggregator');
const { evaluateThresholds } = require('../../services/rebalance/thresholdChecker');

// ───────────────────────── 聚合器纯函数 ─────────────────────────

test('aggregateByAssetClass：按大类聚合市值，未分类归 UNCLASSIFIED', () => {
  const positions = [
    { symbol: 'VOO', marketValue: 6000 },
    { symbol: 'XEQT', marketValue: 4000 },
    { symbol: 'BND', marketValue: 3000 },
    { symbol: 'GLD', marketValue: 1000 },
    { symbol: 'MISSING', marketValue: 500 } // 无映射 → 未分类
  ];
  const result = aggregateByAssetClass(positions, {
    VOO: 'equity', XEQT: 'equity', BND: 'bond', GLD: 'gold'
  });
  assert.deepEqual(result, [
    { assetClass: 'bond', marketValue: 3000, symbols: ['BND'] },
    { assetClass: 'equity', marketValue: 10000, symbols: ['VOO', 'XEQT'] },
    { assetClass: 'gold', marketValue: 1000, symbols: ['GLD'] },
    { assetClass: UNCLASSIFIED, marketValue: 500, symbols: ['MISSING'] }
  ]);
});

test('aggregateByAssetClass：缺价持仓不参与聚合', () => {
  const result = aggregateByAssetClass(
    [{ symbol: 'VOO', marketValue: null }, { symbol: 'BND', marketValue: 100 }],
    { VOO: 'equity', BND: 'bond' }
  );
  assert.deepEqual(result, [{ assetClass: 'bond', marketValue: 100, symbols: ['BND'] }]);
});

test('buildClassPositions：产出可喂给 evaluateThresholds 的伪持仓', () => {
  const positions = [
    { symbol: 'VOO', marketValue: 6000 },
    { symbol: 'BND', marketValue: 4000 }
  ];
  const classPositions = buildClassPositions(positions, { VOO: 'equity', BND: 'bond' });
  assert.deepEqual(classPositions, [
    { symbol: 'bond', marketValue: 4000, currency: 'AGG' },
    { symbol: 'equity', marketValue: 6000, currency: 'AGG' }
  ]);
});

test('hasClassTargets：检测大类目标模式', () => {
  assert.equal(hasClassTargets([{ symbol: 'VTI', targetRatio: 100, level: 'asset' }]), false);
  assert.equal(hasClassTargets([{ symbol: 'equity', targetRatio: 100, level: 'asset_class' }]), true);
  // 缺省 level 视为 asset
  assert.equal(hasClassTargets([{ symbol: 'VTI', targetRatio: 100 }]), false);
});

test('deriveSymbolTargets：大类目标按类内市值占比摊分到 symbol', () => {
  const positions = [
    { symbol: 'VOO', marketValue: 6000 },
    { symbol: 'XEQT', marketValue: 4000 },
    { symbol: 'BND', marketValue: 5000 }
  ];
  const { targets, symbolClassMap } = deriveSymbolTargets({
    targets: [
      { symbol: 'equity', targetRatio: 60, level: 'asset_class' },
      { symbol: 'bond', targetRatio: 40, level: 'asset_class' }
    ],
    positions,
    assetClassBySymbol: { VOO: 'equity', XEQT: 'equity', BND: 'bond' }
  });
  // equity 类内 VOO 占 60%、XEQT 占 40% → 派生目标 36% / 24%；bond 100% → 40%
  assert.deepEqual(targets.sort((a, b) => a.symbol.localeCompare(b.symbol)), [
    { symbol: 'BND', targetRatio: 40, level: 'asset' },
    { symbol: 'VOO', targetRatio: 36, level: 'asset' },
    { symbol: 'XEQT', targetRatio: 24, level: 'asset' }
  ]);
  assert.equal(symbolClassMap.VOO, 'equity');
  assert.equal(symbolClassMap.BND, 'bond');
});

test('deriveSymbolTargets：目标大类无持仓时该大类不摊分', () => {
  const { targets } = deriveSymbolTargets({
    targets: [
      { symbol: 'gold', targetRatio: 20, level: 'asset_class' },
      { symbol: 'equity', targetRatio: 80, level: 'asset_class' }
    ],
    positions: [{ symbol: 'VOO', marketValue: 10000 }],
    assetClassBySymbol: { VOO: 'equity' }
  });
  assert.deepEqual(targets, [{ symbol: 'VOO', targetRatio: 80, level: 'asset' }]);
});

// ───────────────────────── threshold 大类模式 ─────────────────────────

test('evaluateThresholds 大类伪持仓：偏离触发与 symbol 级口径一致', () => {
  const classPositions = buildClassPositions(
    [
      { symbol: 'VOO', marketValue: 4000 },
      { symbol: 'BND', marketValue: 1000 }
    ],
    { VOO: 'equity', BND: 'bond' }
  );
  // 目标 50/50，当前 80/20 → 绝对偏离 30% > 5% → 触发
  const result = evaluateThresholds({
    targets: [
      { symbol: 'equity', targetRatio: 50, level: 'asset_class' },
      { symbol: 'bond', targetRatio: 50, level: 'asset_class' }
    ],
    positions: classPositions,
    settings: { absoluteDeviation: 5, relativeDeviation: 10, timeInterval: 60 }
  });
  assert.equal(result.needsRebalance, true);
  assert.ok(result.triggeredThresholds.includes('absoluteDeviation'));
  assert.ok(result.details.find(item => item.symbol === 'equity'));

  // 完全对齐（2500/2500）不触发；lastExecutedAt 传 1 天前避免 timeInterval 干扰
  const now = new Date('2026-08-31T12:00:00.000Z');
  const aligned = evaluateThresholds({
    targets: [
      { symbol: 'equity', targetRatio: 50, level: 'asset_class' },
      { symbol: 'bond', targetRatio: 50, level: 'asset_class' }
    ],
    positions: buildClassPositions(
      [
        { symbol: 'VOO', marketValue: 2500 },
        { symbol: 'BND', marketValue: 2500 }
      ],
      { VOO: 'equity', BND: 'bond' }
    ),
    settings: { absoluteDeviation: 5, relativeDeviation: 10, timeInterval: 60 },
    lastExecutedAt: new Date(now.getTime() - 86400000),
    now
  });
  assert.equal(aligned.needsRebalance, false);
});

// ───────────────────────── actualRatios 大类模式 ─────────────────────────

test('computeActualRatios level=asset_class：按币种内大类占比返回', async (t) => {
  const { computeActualRatios } = require('../../services/portfolio/actualRatios');
  const tracker = require('../../services/portfolio/positionTracker');
  const aggregator = require('../../services/portfolio/assetClassAggregator');

  t.mock.method(tracker, 'aggregate', async () => [
    { symbol: 'VOO', currency: 'USD', marketValue: 6000 },
    { symbol: 'BND', currency: 'USD', marketValue: 4000 },
    { symbol: '510300', currency: 'CNY', marketValue: 10000 }
  ]);
  t.mock.method(aggregator, 'getAssetClassMap', async () => ({
    VOO: 'equity', BND: 'bond', '510300': 'equity'
  }));

  const ratios = await computeActualRatios('pid', { level: 'asset_class' });
  assert.deepEqual(ratios, [
    { symbol: 'bond', currency: 'USD', ratio: 40 },
    { symbol: 'equity', currency: 'CNY', ratio: 100 },
    { symbol: 'equity', currency: 'USD', ratio: 60 }
  ]);
});

// ───────────────────────── HTTP 契约 ─────────────────────────

const app = require('../../app');
const Portfolio = require('../../models/portfolio');
const PortfolioService = require('../../services/portfolio');
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

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: response.status, body: await response.json() };
}

test('POST /api/portfolios：大类目标组合创建成功（level 透传）', async (t) => {
  t.mock.method(Portfolio.prototype, 'save', async function save() { return this; });
  const result = await request('/api/portfolios', {
    method: 'POST',
    body: {
      name: '大类组合', type: '稳健', currency: 'CAD',
      targets: [
        { symbol: 'equity', targetRatio: 60, level: 'asset_class' },
        { symbol: 'bond', targetRatio: 40, level: 'asset_class' }
      ]
    }
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.data.targets[0].level, 'asset_class');
});

test('POST /api/portfolios：混合目标（资产级+大类级）返回 400', async () => {
  const result = await request('/api/portfolios', {
    method: 'POST',
    body: {
      name: '混合组合', type: '稳健', currency: 'CAD',
      targets: [
        { symbol: 'VTI', targetRatio: 50 },
        { symbol: 'bond', targetRatio: 50, level: 'asset_class' }
      ]
    }
  });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /Mixed targets/);
});

test('GET actual-ratios?level=asset_class：参数透传到服务层', async (t) => {
  const calls = [];
  t.mock.method(PortfolioService, 'computeActualRatios', async (id, options) => {
    calls.push({ id, options });
    return [];
  });
  await request('/api/portfolios/64b0000000000000000000aa/stats/actual-ratios?level=asset_class');
  assert.deepEqual(calls[0], { id: '64b0000000000000000000aa', options: { level: 'asset_class' } });

  await request('/api/portfolios/64b0000000000000000000aa/stats/actual-ratios');
  assert.equal(calls[1].options.level, 'asset');
});
