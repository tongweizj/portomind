const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-valuation-test-logs';

const Valuation = require('../../models/valuation');
const valuationService = require('../../services/valuation.service');

// ───────────────────────── 服务：upsert / 查询 ─────────────────────────

test('upsertValuation：非法 metric 拒绝', async () => {
  await assert.rejects(
    valuationService.upsertValuation({ indexCode: '000300', metric: 'eps', value: 10, percentile: 50 }),
    /metric must be one of/
  );
});

test('upsertValuation：percentile 越界拒绝', async () => {
  await assert.rejects(
    valuationService.upsertValuation({ indexCode: '000300', metric: 'pe', value: 10, percentile: 101 }),
    /percentile must be between 0 and 100/
  );
});

test('upsertValuation：幂等 upsert 且规范化 indexCode 大写', async (t) => {
  const calls = [];
  t.mock.method(Valuation, 'findOneAndUpdate', async (filter, update, options) => {
    calls.push({ filter, update, options });
    return { ...filter, ...update.$set };
  });

  const doc = await valuationService.upsertValuation({
    indexCode: ' 000300 ', metric: 'pe', value: 12.5, percentile: 25, source: 'manual'
  });
  assert.equal(doc.indexCode, '000300');
  assert.equal(doc.percentile, 25);
  assert.deepEqual(calls[0].filter, { indexCode: '000300', metric: 'pe', date: calls[0].filter.date });
  assert.equal(calls[0].options.upsert, true);
});

test('getLatestValuations：每 (indexCode, metric) 取最新一条', async (t) => {
  t.mock.method(Valuation, 'find', () => ({
    sort: () => ({ lean: async () => [
      { indexCode: '000300', metric: 'pe', percentile: 25, date: new Date('2026-08-31') },
      { indexCode: '000300', metric: 'pe', percentile: 20, date: new Date('2026-08-01') },
      { indexCode: '000300', metric: 'pb', percentile: 30, date: new Date('2026-08-31') }
    ] })
  }));

  const latest = await valuationService.getLatestValuations();
  assert.equal(latest.length, 2);
  const pe = latest.find(item => item.metric === 'pe');
  assert.equal(pe.percentile, 25, '取日期最新一条');
});

// ───────────────────────── HTTP 契约 ─────────────────────────

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

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: response.status, body: await response.json() };
}

test('GET /api/valuations 返回最新估值列表', async (t) => {
  t.mock.method(valuationService, 'getLatestValuations', async () => [
    { indexCode: '000300', indexName: '沪深300', metric: 'pe', percentile: 25 }
  ]);
  const result = await request('/api/valuations');
  assert.equal(result.status, 200);
  assert.equal(result.body.data[0].indexCode, '000300');
});

test('PUT /api/valuations/:indexCode/:metric 非法 percentile 返回 400', async () => {
  const result = await request('/api/valuations/000300/pe', {
    method: 'PUT', body: { value: 12, percentile: 150 }
  });
  assert.equal(result.status, 400);
});

test('PUT /api/valuations/:indexCode/:metric 合法录入返回 201', async (t) => {
  t.mock.method(valuationService, 'upsertValuation', async (input) => ({
    indexCode: input.indexCode, metric: input.metric, value: input.value, percentile: input.percentile, source: 'manual'
  }));
  const result = await request('/api/valuations/000300/pe', {
    method: 'PUT', body: { value: 12.5, percentile: 25, indexName: '沪深300' }
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.data.percentile, 25);
  assert.equal(result.body.data.source, 'manual');
});
