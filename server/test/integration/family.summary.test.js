const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-family-summary-test-logs';

const { buildFamilySummary, buildCurrencyBuckets } = require('../../services/familySummary.service');

// ───────────────────────── 纯函数：buildCurrencyBuckets ─────────────────────────

test('buildCurrencyBuckets：多币种聚合，缺价桶为 null', () => {
  const buckets = buildCurrencyBuckets([
    { symbol: 'VOO', currency: 'USD', marketValue: 10000 },
    { symbol: 'XEQT', currency: 'CAD', marketValue: 5000.005 },
    { symbol: '0700.HK', currency: 'HKD', marketValue: null } // 缺价
  ]);
  assert.equal(buckets.USD, 10000);
  assert.equal(buckets.CAD, 5000.01);
  assert.equal(buckets.HKD, null);
});

test('buildCurrencyBuckets：空持仓返回空对象', () => {
  assert.deepEqual(buildCurrencyBuckets([]), {});
});

// ───────────────────────── 纯函数：buildFamilySummary ─────────────────────────

test('多币种组合折算 RMB：总资产与分桶正确', () => {
  const summary = buildFamilySummary({
    portfolioValues: [
      { portfolioId: 'p1', name: 'CA-TFSA', currency: 'CAD', buckets: { CAD: 5000, USD: 3000 } },
      { portfolioId: 'p2', name: 'CN-天天', currency: 'CNY', buckets: { CNY: 12000 } },
      { portfolioId: 'p3', name: 'HK-雪球', currency: 'HKD', buckets: { HKD: 8000 } }
    ],
    rates: { USD: 7.2, CAD: 5.3, HKD: 0.92 }
  });

  assert.equal(summary.totalCny, 5000 * 5.3 + 3000 * 7.2 + 12000 + 8000 * 0.92);
  assert.equal(summary.buckets.USD.amount, 3000);
  assert.equal(summary.buckets.USD.cnyValue, 3000 * 7.2);
  assert.equal(summary.buckets.HKD.cnyValue, 8000 * 0.92);
  assert.equal(summary.buckets.CNY.rate, 1);

  const p1 = summary.portfolioContributions.find(item => item.portfolioId === 'p1');
  assert.equal(p1.cnyValue, 5000 * 5.3 + 3000 * 7.2);
  assert.ok(p1.ratio > 0);
  // 占比合计 ≈ 100%
  const ratioSum = summary.portfolioContributions.reduce((sum, item) => sum + item.ratio, 0);
  assert.ok(Math.abs(ratioSum - 100) < 0.01, `占比合计应约 100%，实际 ${ratioSum}`);
});

test('缺汇率币种：该组合折算标 null 且不计入家庭总额', () => {
  const summary = buildFamilySummary({
    portfolioValues: [
      { portfolioId: 'p1', name: '无汇率组合', currency: 'USD', buckets: { USD: 1000 } },
      { portfolioId: 'p2', name: '正常组合', currency: 'CNY', buckets: { CNY: 5000 } }
    ],
    rates: { /* USD 汇率缺失 */ CNY: 1 }
  });
  assert.equal(summary.totalCny, 5000);
  const p1 = summary.portfolioContributions.find(item => item.portfolioId === 'p1');
  assert.equal(p1.cnyValue, null);
  assert.equal(p1.ratio, null);
});

test('缺价持仓桶：组合折算标 null 不误报，分桶跳过 null', () => {
  const summary = buildFamilySummary({
    portfolioValues: [
      { portfolioId: 'p1', name: '缺价组合', currency: 'CAD', buckets: { CAD: null } }
    ],
    rates: { CAD: 5.3 }
  });
  assert.equal(summary.totalCny, 0);
  assert.equal(summary.portfolioContributions[0].cnyValue, null);
  assert.deepEqual(summary.buckets, {});
});

test('无组合与无持仓：总额 0，占比为空', () => {
  const empty = buildFamilySummary({ portfolioValues: [], rates: { USD: 7.2 } });
  assert.equal(empty.totalCny, 0);
  assert.deepEqual(empty.portfolioContributions, []);
  assert.deepEqual(empty.buckets, {});
});

// ───────────────────────── HTTP 契约 ─────────────────────────

const app = require('../../app');
const familySummaryService = require('../../services/familySummary.service');
const fxRateService = require('../../services/fxRate.service');
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

test('GET /api/family/summary 返回家庭汇总结构', async (t) => {
  const summary = {
    totalCny: 88000,
    buckets: { CAD: { amount: 5000, cnyValue: 26500, rate: 5.3 } },
    fxRates: { CAD: 5.3 },
    portfolioContributions: [{ portfolioId: 'p1', name: 'CA-TFSA', ratio: 30.11 }],
    recentTransactions: [],
    recentRebalanceRecords: []
  };
  t.mock.method(familySummaryService, 'computeFamilySummary', async () => summary);

  const result = await request('/api/family/summary');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.totalCny, 88000);
  assert.equal(result.body.data.portfolioContributions.length, 1);
});

test('GET /api/family/fx/rates 返回最新汇率列表', async (t) => {
  t.mock.method(fxRateService, 'getLatestRateDocs', async () => [
    { currency: 'USD', rateToCny: 7.2, date: new Date('2026-08-31'), source: 'er-api' }
  ]);
  const result = await request('/api/family/fx/rates');
  assert.equal(result.status, 200);
  assert.equal(result.body.data[0].currency, 'USD');
});

test('PUT /api/family/fx/rates/:currency 非法币种返回 400', async () => {
  const result = await request('/api/family/fx/rates/EUR', {
    method: 'PUT', body: { rateToCny: 7.8 }
  });
  assert.equal(result.status, 400);
});

test('PUT /api/family/fx/rates/:currency 成功录入（手动）', async (t) => {
  t.mock.method(fxRateService, 'upsertRate', async (input) => ({
    currency: input.currency, rateToCny: input.rateToCny, date: input.date, source: 'manual'
  }));
  const result = await request('/api/family/fx/rates/USD', {
    method: 'PUT', body: { rateToCny: 7.25 }
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.data.rateToCny, 7.25);
  assert.equal(result.body.data.source, 'manual');
});

test('POST /api/family/fx/sync 成功返回采集记录数', async (t) => {
  t.mock.method(fxRateService, 'syncLatestRates', async () => [
    { currency: 'USD', rateToCny: 7.2 }, { currency: 'CAD', rateToCny: 5.3 }, { currency: 'HKD', rateToCny: 0.92 }
  ]);
  const result = await request('/api/family/fx/sync', { method: 'POST' });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.count, 3);
});

test('POST /api/family/fx/sync 采集失败返回 502', async (t) => {
  t.mock.method(fxRateService, 'syncLatestRates', async () => { throw new Error('provider down'); });
  const result = await request('/api/family/fx/sync', { method: 'POST' });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
});
