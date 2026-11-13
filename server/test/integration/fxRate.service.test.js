// server/test/integration/fxRate.service.test.js
//
// TASK-051：汇率方向（`rateToCny` = 1 外币 = X CNY）回归测试。
//
// 背景：采集源 `https://open.er-api.com/v6/latest/CNY` 以 **CNY 为 base**，
// `rates.USD ≈ 0.149` 表示「1 CNY = 0.149 USD」。而 `rateToCny` 的语义是
// 「1 外币 = X CNY」（模型注释 / schema / 手动录入 / familySummary 乘法均按此），
// 因此采集端必须取倒数后再入库。
//
// 本文件在**未修复实现**上必须失败（AC1 / AC3），修好后转绿。
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-fxrate-test-logs';

const FxRate = require('@portomind/shared/models/fxRate');
const Portfolio = require('@portomind/shared/models/portfolio');
const Transaction = require('@portomind/shared/models/transaction');
const RebalanceRecord = require('@portomind/shared/models/rebalanceRecord');
const fxRateService = require('@portomind/shared/services/fxRate.service');
const familySummaryService = require('@portomind/shared/services/familySummary.service');
const tracker = require('@portomind/shared/services/portfolio/positionTracker');

// provider 固定响应：1 CNY = X 外币（与 er-api base=CNY 的真实量级一致）
const PROVIDER_RATES = { USD: 0.149448, CAD: 0.210271, HKD: 1.172876 };

// 期望的 rateToCny = 1 外币 = X CNY（= 1 / provider 值）
const EXPECTED = {
  USD: 1 / PROVIDER_RATES.USD, // 6.691286...
  CAD: 1 / PROVIDER_RATES.CAD, // 4.755818...
  HKD: 1 / PROVIDER_RATES.HKD // 0.852605...
};

const TOLERANCE = 0.01;

/** 造一个只提供固定 rates 的 http 替身（模拟 axios）。 */
function fixedProviderHttp(rates = PROVIDER_RATES) {
  return {
    get: async () => ({ data: { rates } })
  };
}

/** 内存版 FxRate 存储：让 syncLatestRates → upsertRate → getLatestRates 走真实代码路径。 */
function useInMemoryFxStore(t) {
  const store = [];
  let seq = 0;

  const matches = (doc, query) => {
    if (!query) return true;
    if (query.date && query.date.$lte != null) {
      return new Date(doc.date) <= new Date(query.date.$lte);
    }
    return true;
  };

  t.mock.method(FxRate, 'find', (query) => {
    const rows = store.filter(doc => matches(doc, query));
    const chain = {
      sort: () => chain,
      lean: async () => rows.slice()
    };
    return chain;
  });

  t.mock.method(FxRate, 'findOneAndUpdate', async (filter, update) => {
    const dayStart = new Date(filter.date);
    const existing = store.find(
      doc => doc.currency === filter.currency && new Date(doc.date).getTime() === dayStart.getTime()
    );
    if (existing) {
      Object.assign(existing, update.$set);
      return { ...existing };
    }
    seq += 1;
    const doc = {
      _id: `fx-${seq}`,
      currency: filter.currency,
      date: dayStart,
      ...update.$set
    };
    store.push(doc);
    return { ...doc };
  });

  return store;
}

// ───────────────────────── AC1：采集方向 ─────────────────────────

test('fetchFromProvider：CNY base 的 provider 值必须取倒数（1 外币 = X CNY）', async () => {
  const result = await fxRateService.fetchFromProvider(fixedProviderHttp());

  for (const currency of ['USD', 'CAD', 'HKD']) {
    assert.ok(
      Math.abs(result[currency] - EXPECTED[currency]) < TOLERANCE,
      `${currency} 期望约 ${EXPECTED[currency].toFixed(4)}（1 外币 = X CNY），实际 ${result[currency]}`
    );
  }
});

test('fetchFromProvider：量级断言——USD/CAD > 1，HKD < 1', async () => {
  const result = await fxRateService.fetchFromProvider(fixedProviderHttp());

  assert.ok(result.USD > 1, `USD 折算率应 > 1，实际 ${result.USD}`);
  assert.ok(result.CAD > 1, `CAD 折算率应 > 1，实际 ${result.CAD}`);
  assert.ok(result.HKD < 1, `HKD 折算率应 < 1，实际 ${result.HKD}`);
});

test('fetchFromProvider：非法值抛错且错误信息含币种', async () => {
  await assert.rejects(
    () => fxRateService.fetchFromProvider(fixedProviderHttp({ ...PROVIDER_RATES, CAD: 0 })),
    /CAD/,
    'provider 返回 0 应抛错并指明币种'
  );
  await assert.rejects(
    () => fxRateService.fetchFromProvider(fixedProviderHttp({ ...PROVIDER_RATES, HKD: -1 })),
    /HKD/,
    'provider 返回负数应抛错并指明币种'
  );
  await assert.rejects(
    () => fxRateService.fetchFromProvider(fixedProviderHttp({ USD: 'abc', CAD: 0.21, HKD: 1.17 })),
    /USD/,
    'provider 返回非数应抛错并指明币种'
  );
  await assert.rejects(
    () => fxRateService.fetchFromProvider(fixedProviderHttp({ USD: 0.149, CAD: 0.21 })),
    /HKD/,
    'provider 缺字段应抛错并指明币种'
  );
});

test('syncLatestRates：入库的 rateToCny 是「1 外币 = X CNY」', async (t) => {
  const store = useInMemoryFxStore(t);

  await fxRateService.syncLatestRates({ http: fixedProviderHttp(), date: new Date('2026-11-11T00:00:00Z') });

  assert.equal(store.length, 3, '三个币种各写一条');
  for (const currency of ['USD', 'CAD', 'HKD']) {
    const doc = store.find(item => item.currency === currency);
    assert.ok(
      Math.abs(doc.rateToCny - EXPECTED[currency]) < TOLERANCE,
      `${currency} 入库值应为 ${EXPECTED[currency].toFixed(4)}，实际 ${doc.rateToCny}`
    );
  }
});

// ───────────────────────── AC2：upsertRate 校验与幂等 ─────────────────────────

test('upsertRate：拒绝 0 / 负数 / NaN / 非数', async () => {
  for (const bad of [0, -1, -0.5, NaN, 'abc', null, undefined, Infinity]) {
    await assert.rejects(
      () => fxRateService.upsertRate({ currency: 'USD', rateToCny: bad }),
      /positive number/,
      `rateToCny=${String(bad)} 应被拒绝`
    );
  }
});

test('upsertRate：非法币种拒绝', async () => {
  await assert.rejects(
    () => fxRateService.upsertRate({ currency: 'EUR', rateToCny: 7.8 }),
    /Unsupported currency/
  );
});

test('upsertRate：同 (currency, date) 幂等，不新增文档', async (t) => {
  const store = useInMemoryFxStore(t);
  const date = new Date('2026-11-11T08:30:00Z');

  await fxRateService.upsertRate({ currency: 'USD', rateToCny: 7.1, date });
  await fxRateService.upsertRate({ currency: 'USD', rateToCny: 7.2, date });

  assert.equal(store.length, 1, '同币种同日只应有一条');
  assert.equal(store[0].rateToCny, 7.2, '后写覆盖前写');
});

// ───────────────────────── AC3：端到端折算方向 ─────────────────────────

test('端到端：固定 provider → 入库 → getLatestRates → buildFamilySummary 与人算一致', async (t) => {
  useInMemoryFxStore(t);

  // 真实采集路径写入（不 mock getLatestRates）
  await fxRateService.syncLatestRates({ http: fixedProviderHttp(), date: new Date('2026-11-11T00:00:00Z') });

  // 真实读取路径
  const rates = await fxRateService.getLatestRates(new Date('2026-11-12T00:00:00Z'));
  assert.ok(Math.abs(rates.USD - EXPECTED.USD) < TOLERANCE, 'getLatestRates 读到的 USD 方向正确');

  // 手工构造 USD 1000 持仓
  const summary = familySummaryService.buildFamilySummary({
    portfolioValues: [
      { portfolioId: 'p-us', name: 'US-TFSA', currency: 'USD', buckets: { USD: 1000 } }
    ],
    rates
  });

  // 人算：USD 1000 × 6.691286 ≈ 6,691.29（若方向反了则是 1000 × 0.149 ≈ 149）
  const expectedTotal = 1000 * EXPECTED.USD;
  assert.ok(
    Math.abs(summary.totalCny - expectedTotal) < 0.5,
    `totalCny 期望约 ${expectedTotal.toFixed(2)}，实际 ${summary.totalCny}`
  );
  assert.ok(summary.totalCny > 6000, `totalCny 应 > 6000（方向反了会得到约 149），实际 ${summary.totalCny}`);
  assert.equal(summary.buckets.USD.rate, rates.USD);
});

test('端到端：computeFamilySummary 全链路（不 mock getLatestRates）', async (t) => {
  useInMemoryFxStore(t);
  await fxRateService.syncLatestRates({ http: fixedProviderHttp(), date: new Date('2026-11-11T00:00:00Z') });

  const portfolio = { _id: '64b0000000000000000000c1', name: 'US-TFSA', currency: 'USD' };
  t.mock.method(Portfolio, 'find', () => ({ sort: () => ({ lean: async () => [portfolio] }) }));
  t.mock.method(tracker, 'aggregate', async () => [
    { symbol: 'VOO', currency: 'USD', marketValue: 1000 }
  ]);
  t.mock.method(Transaction, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
  t.mock.method(RebalanceRecord, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));

  const result = await familySummaryService.computeFamilySummary({ now: new Date('2026-11-12T00:00:00Z') });

  const expectedTotal = 1000 * EXPECTED.USD;
  assert.ok(
    Math.abs(result.totalCny - expectedTotal) < 0.5,
    `全链路 totalCny 期望约 ${expectedTotal.toFixed(2)}，实际 ${result.totalCny}`
  );
  assert.equal(result.buckets.USD.amount, 1000);
  assert.ok(result.buckets.USD.cnyValue > 6000, 'USD 分桶折算值应 > 6000');
});

// ───────────────────────── AC4：采集与手动录入同语义 ─────────────────────────

test('采集与手动录入同语义：同一量级', async (t) => {
  const store = useInMemoryFxStore(t);

  // 自动采集
  await fxRateService.syncLatestRates({ http: fixedProviderHttp(), date: new Date('2026-11-10T00:00:00Z') });
  const auto = await fxRateService.getLatestRates(new Date('2026-11-10T23:00:00Z'));

  // 手动录入（用户按 UI placeholder「如 7.20」的语义填写）
  store.length = 0;
  await fxRateService.upsertRate({
    currency: 'USD', rateToCny: 6.69, date: new Date('2026-11-10T00:00:00Z'), source: 'manual'
  });
  const manual = await fxRateService.getLatestRates(new Date('2026-11-10T23:00:00Z'));

  assert.ok(auto.USD > 1 && manual.USD > 1, '两者 USD 均 > 1');
  assert.ok(Math.abs(auto.USD - manual.USD) < 0.1, `采集 ${auto.USD} 与手动 ${manual.USD} 应同量级`);

  // 手动录入后折算方向不变
  const summary = familySummaryService.buildFamilySummary({
    portfolioValues: [{ portfolioId: 'p1', name: 'US', currency: 'USD', buckets: { USD: 1000 } }],
    rates: manual
  });
  assert.ok(summary.totalCny > 6000, '手动录入后折算仍是乘法正向');
});
