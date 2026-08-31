const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-alert-engine-test-logs';

const AlertRule = require('../../models/alertRule');
const AlertEvent = require('../../models/alertEvent');
const marketData = require('../../services/marketData.service');
const {
  evaluateRule,
  evaluateAll,
  shouldSuppress
} = require('../../services/alertEngine.service');

// 工具：stub AlertEvent.findOne 的链式 .sort().lean()
function mockFindOneEvent(t, doc) {
  t.mock.method(AlertEvent, 'findOne', () => ({ sort: () => ({ lean: async () => doc }) }));
}

// ───────────────────────── 纯函数：evaluateRule 边界 ─────────────────────────

const baseRule = overrides => ({
  _id: '64b0000000000000000000e1',
  scope: 'asset',
  portfolioId: null,
  symbol: '0700.HK',
  name: '腾讯到价',
  ruleType: 'price_above',
  params: { threshold: 450 },
  cooldownDays: 7,
  active: true,
  ...overrides
});

test('price_above：严格大于才触发，恰好等于不触发', () => {
  const rule = baseRule();
  assert.ok(evaluateRule(rule, { latestPrices: { '0700.HK': 453 } }));
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 450 } }), null, '恰好等于阈值不触发');
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 400 } }), null);
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': null } }), null, '缺价不触发');
  assert.equal(evaluateRule(rule, { latestPrices: {} }), null);
});

test('price_below：严格小于才触发，恰好等于不触发', () => {
  const rule = baseRule({ ruleType: 'price_below', params: { threshold: 300 } });
  assert.ok(evaluateRule(rule, { latestPrices: { '0700.HK': 280 } }));
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 300 } }), null);
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 350 } }), null);
});

test('gain_loss_pct：正 pct 浮盈超阈值触发，负 pct 浮亏超阈值触发', () => {
  const position = { symbol: 'XEQT', avgCost: 40, latestPrice: 50, pnlPct: 25 };
  const rule = baseRule({ symbol: 'XEQT', ruleType: 'gain_loss_pct', params: { pct: 20 } });
  assert.ok(evaluateRule(rule, { positionsBySymbol: { XEQT: position } }));
  assert.equal(
    evaluateRule(rule, { positionsBySymbol: { XEQT: { ...position, pnlPct: 20 } } }),
    null,
    '恰好等于阈值不触发'
  );
  assert.equal(evaluateRule(rule, { positionsBySymbol: { XEQT: { ...position, pnlPct: 15 } } }), null);

  const lossRule = baseRule({ symbol: 'XEQT', ruleType: 'gain_loss_pct', params: { pct: -10 } });
  assert.ok(evaluateRule(lossRule, { positionsBySymbol: { XEQT: { ...position, pnlPct: -15 } } }));
  assert.equal(
    evaluateRule(lossRule, { positionsBySymbol: { XEQT: { ...position, pnlPct: -10 } } }),
    null,
    '恰好等于阈值不触发'
  );
  assert.equal(evaluateRule(lossRule, { positionsBySymbol: { XEQT: { ...position, pnlPct: -5 } } }), null);
  assert.equal(evaluateRule(lossRule, { positionsBySymbol: {} }), null, '无持仓不触发');
});

test('drift_exceed：漂移阈值触发才产生事件', () => {
  const rule = baseRule({ scope: 'portfolio', portfolioId: '64b0000000000000000000a1', ruleType: 'drift_exceed', params: { drift: 5 } });
  const drifted = { needsRebalance: true, triggeredThresholds: ['absoluteDeviation'] };
  assert.ok(evaluateRule(rule, { drift: drifted }));
  assert.equal(evaluateRule(rule, { drift: { needsRebalance: false, triggeredThresholds: [] } }), null);
  assert.equal(evaluateRule(rule, { drift: null }), null);
});

// ───────────────────────── AL-09：52 周新高/新低 ─────────────────────────

test('high_52w：最新价严格突破 52 周高点才触发', () => {
  const rule = baseRule({ ruleType: 'high_52w', params: { lookbackDays: 365 } });
  const rangeStats = { '0700.HK': { maxPrice: 450, minPrice: 200 } };
  assert.ok(evaluateRule(rule, { latestPrices: { '0700.HK': 453 }, rangeStats }));
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 450 }, rangeStats }), null, '恰好等于 52 周高点不触发');
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 400 }, rangeStats }), null);
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 453 } }), null, '缺历史区间不触发');
});

test('low_52w：最新价严格跌破 52 周低点才触发', () => {
  const rule = baseRule({ ruleType: 'low_52w' });
  const rangeStats = { '0700.HK': { maxPrice: 500, minPrice: 300 } };
  assert.ok(evaluateRule(rule, { latestPrices: { '0700.HK': 280 }, rangeStats }));
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 300 }, rangeStats }), null, '恰好等于 52 周低点不触发');
  assert.equal(evaluateRule(rule, { latestPrices: { '0700.HK': 350 }, rangeStats }), null);
});

// ───────────────────────── AL-10：估值分位（输入来自 AS-11） ─────────────────────────

const VALUATION = {
  indexCode: '000300', indexName: '沪深300', metric: 'pe',
  value: 12.5, percentile: 25
};

test('valuation_percentile：above → 分位严格大于阈值（高估）触发', () => {
  const rule = baseRule({ ruleType: 'valuation_percentile', params: { indexCode: '000300', metric: 'pe', threshold: 20, direction: 'above' } });
  const valuations = { '000300:pe': VALUATION };
  assert.ok(evaluateRule(rule, { valuations }));
  assert.equal(
    evaluateRule(rule, { valuations: { '000300:pe': { ...VALUATION, percentile: 20 } } }),
    null,
    '恰好等于阈值不触发'
  );
  assert.equal(evaluateRule(rule, { valuations: { '000300:pe': { ...VALUATION, percentile: 15 } } }), null);
  assert.equal(evaluateRule(rule, { valuations: {} }), null, '缺估值数据不触发');
});

test('valuation_percentile：below → 分位严格小于阈值（低估）触发', () => {
  const rule = baseRule({ ruleType: 'valuation_percentile', params: { indexCode: '000300', metric: 'pb', threshold: 30, direction: 'below' } });
  const valuations = { '000300:pb': { ...VALUATION, metric: 'pb', percentile: 12 } };
  assert.ok(evaluateRule(rule, { valuations }));
  assert.equal(
    evaluateRule(rule, { valuations: { '000300:pb': { ...VALUATION, metric: 'pb', percentile: 30 } } }),
    null,
    '恰好等于阈值不触发'
  );
});

// ───────────────────────── 静默/幂等：shouldSuppress ─────────────────────────

test('shouldSuppress：cooldown 内抑制，超期放行', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const rule = baseRule({ cooldownDays: 7 });

  mockFindOneEvent(t, { triggeredAt: new Date('2026-08-27T12:00:00.000Z') }); // 4 天前 → 冷却中
  assert.equal(await shouldSuppress(rule, now), true);

  mockFindOneEvent(t, { triggeredAt: new Date('2026-08-20T12:00:00.000Z') }); // 11 天前 → 超期放行
  assert.equal(await shouldSuppress(rule, now), false);
});

test('shouldSuppress：同日幂等（cooldown=0 也生效）', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const rule = baseRule({ cooldownDays: 0 });

  mockFindOneEvent(t, { triggeredAt: new Date('2026-08-31T08:00:00.000Z') }); // 同日 → 抑制（幂等）
  assert.equal(await shouldSuppress(rule, now), true);

  mockFindOneEvent(t, { triggeredAt: new Date('2026-08-30T08:00:00.000Z') }); // 前一日 → 放行
  assert.equal(await shouldSuppress(rule, now), false);
});

// ───────────────────────── 编排：evaluateAll ─────────────────────────

const RULE_ID_A = '64b0000000000000000000f1'; // price_above 触发
const RULE_ID_SIG = '64b0000000000000000000f2'; // signal

function makeRule(overrides) {
  return {
    _id: overrides._id || RULE_ID_A,
    scope: 'asset',
    portfolioId: null,
    symbol: '0700.HK',
    name: '规则',
    ruleType: 'price_above',
    params: { threshold: 450 },
    direction: null,
    reason: '',
    validUntil: null,
    cooldownDays: 7,
    active: true,
    ...overrides
  };
}

test('evaluateAll：price 规则触发生成事件，同日重复跑批幂等', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const rules = [makeRule({})];
  t.mock.method(AlertRule, 'find', () => ({ lean: async () => rules }));
  t.mock.method(marketData, 'getLatestPrices', async () => ({ '0700.HK': 453 }));
  mockFindOneEvent(t, null); // 无历史事件
  t.mock.method(AlertEvent, 'create', async (data) => ({ _id: 'evt-1', ...data }));

  const first = await evaluateAll({ now });
  assert.equal(first.created, 1);
  assert.equal(first.failed, 0);

  // 同日重复跑批：存在同日事件 → 幂等抑制
  mockFindOneEvent(t, { triggeredAt: now });
  const second = await evaluateAll({ now });
  assert.equal(second.created, 0, '同日重复跑批不产生重复事件');
});

test('evaluateAll：cooldown 内条件持续满足不重复产生事件', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const rules = [makeRule({})];
  t.mock.method(AlertRule, 'find', () => ({ lean: async () => rules }));
  t.mock.method(marketData, 'getLatestPrices', async () => ({ '0700.HK': 500 }));
  mockFindOneEvent(t, { triggeredAt: new Date('2026-08-30T12:00:00.000Z') });
  t.mock.method(AlertEvent, 'create', async () => { throw new Error('should not create'); });

  const stats = await evaluateAll({ now });
  assert.equal(stats.created, 0, '冷却期内不产生新事件');
  assert.equal(stats.failed, 0);
});

test('evaluateAll：signal 过期归档（active=false），事件保留', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const rules = [makeRule({
    _id: RULE_ID_SIG,
    ruleType: 'signal',
    direction: 'sell',
    reason: 'E大：卖出一份沪深300',
    validUntil: new Date('2026-08-01T00:00:00.000Z') // 已过期
  })];
  t.mock.method(AlertRule, 'find', () => ({ lean: async () => rules }));
  const updateMock = t.mock.method(AlertRule, 'updateOne', async () => ({}));
  t.mock.method(AlertEvent, 'create', async () => { throw new Error('should not create'); });

  const stats = await evaluateAll({ now });
  assert.equal(stats.archived, 1);
  assert.equal(stats.created, 0);
  assert.equal(updateMock.mock.callCount(), 1);
  assert.deepEqual(updateMock.mock.calls[0].arguments[1], { $set: { active: false } });
});

test('evaluateAll：signal 有效期内常显——已有未处理事件不重复创建', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const rules = [makeRule({
    _id: RULE_ID_SIG,
    ruleType: 'signal',
    direction: 'buy',
    reason: '有知有行：买入',
    validUntil: new Date('2026-09-30T00:00:00.000Z')
  })];
  t.mock.method(AlertRule, 'find', () => ({ lean: async () => rules }));
  // 已有未 dismissed 事件 → 常显不重复
  mockFindOneEvent(t, { _id: 'evt-existing', status: 'unread' });
  const createMock = t.mock.method(AlertEvent, 'create', async () => ({ _id: 'evt-new' }));

  const stats = await evaluateAll({ now });
  assert.equal(stats.created, 0);
  assert.equal(createMock.mock.callCount(), 0);

  // 全部 dismissed → 视为已手动处理，不自动重建
  mockFindOneEvent(t, null);
  const second = await evaluateAll({ now });
  assert.equal(second.created, 1);
});

test('evaluateAll：逐规则故障隔离——单规则异常不中断批次', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const badRule = makeRule({ _id: RULE_ID_A });
  const goodRule = makeRule({
    _id: '64b0000000000000000000f3',
    symbol: 'VOO',
    ruleType: 'price_above',
    params: { threshold: 500 }
  });
  const rules = [badRule, goodRule];
  t.mock.method(AlertRule, 'find', () => ({ lean: async () => rules }));
  t.mock.method(marketData, 'getLatestPrices', async () => ({ '0700.HK': 453, VOO: 510 }));
  mockFindOneEvent(t, null);
  t.mock.method(AlertEvent, 'create', async (data) => {
    if (data.ruleId && data.ruleId.toString() === RULE_ID_A) throw new Error('boom');
    return { _id: 'evt-good', ...data };
  });

  const stats = await evaluateAll({ now });
  assert.equal(stats.failed, 1, '异常规则计入失败');
  assert.equal(stats.created, 1, '其余规则正常产出事件');
});

test('evaluateAll：组合级 drift 规则触发口径与组合卡片一致', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  // 目标 50/50，当前 4000/1000 → 绝对偏离 30% > 5% → drift 触发（与组合卡片徽标同口径）
  const { buildPortfolioSummary } = require('../../services/portfolio/summary');
  const drift = buildPortfolioSummary({
    portfolio: {
      targets: [
        { symbol: 'XEQT', targetRatio: 50 },
        { symbol: 'VGRO', targetRatio: 50 }
      ],
      rebalanceSettings: { absoluteDeviation: 5, relativeDeviation: 10, timeInterval: 60 }
    },
    positions: [
      { symbol: 'XEQT', currency: 'CAD', marketValue: 4000 },
      { symbol: 'VGRO', currency: 'CAD', marketValue: 1000 }
    ],
    lastExecutedAt: null,
    now
  }).drift;
  assert.ok(drift.needsRebalance);
  assert.ok(drift.triggeredThresholds.includes('absoluteDeviation'));

  // drift_exceed 规则在该 drift 输入下触发
  const rule = {
    _id: RULE_ID_A,
    scope: 'portfolio',
    portfolioId: '64b0000000000000000000a1',
    ruleType: 'drift_exceed',
    params: { drift: 5 }
  };
  assert.ok(evaluateRule(rule, { drift }));
  assert.equal(evaluateRule(rule, { drift: { needsRebalance: false, triggeredThresholds: [] } }), null);
});

test('evaluateAll：52 周新高 + 估值分位规则聚合输入并触发生成事件', async (t) => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const Price = require('../../models/price');
  const valuationService = require('../../services/valuation.service');
  const rules = [
    makeRule({ _id: RULE_ID_A, ruleType: 'high_52w', params: { lookbackDays: 365 } }),
    makeRule({
      _id: '64b0000000000000000000f4',
      ruleType: 'valuation_percentile',
      params: { indexCode: '000300', metric: 'pe', threshold: 20, direction: 'above' }
    })
  ];
  t.mock.method(AlertRule, 'find', () => ({ lean: async () => rules }));
  t.mock.method(marketData, 'getLatestPrices', async () => ({ '0700.HK': 453 }));
  // 52 周窗口：历史最高 450 < 最新 453 → 新高触发
  t.mock.method(Price, 'aggregate', async () => [
    { _id: '0700.HK', maxPrice: 450, minPrice: 200 }
  ]);
  // 估值：沪深300 PE 分位 25 > 20 → 高估触发
  t.mock.method(valuationService, 'getLatestValuations', async () => [
    { indexCode: '000300', indexName: '沪深300', metric: 'pe', value: 12.5, percentile: 25 }
  ]);
  mockFindOneEvent(t, null);
  const created = [];
  t.mock.method(AlertEvent, 'create', async (data) => { created.push(data); return { _id: 'evt-x', ...data }; });

  const stats = await evaluateAll({ now });
  assert.equal(stats.created, 2);
  assert.equal(stats.failed, 0);
  const titles = created.map(item => item.title);
  assert.ok(titles.some(title => title.includes('52 周新高')));
  assert.ok(titles.some(title => title.includes('市盈率分位高估')));
});
