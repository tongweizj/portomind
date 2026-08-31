const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-alert-api-test-logs';

const app = require('../../app');
const AlertRule = require('../../models/alertRule');
const AlertEvent = require('../../models/alertEvent');
const alertEngine = require('../../services/alertEngine.service');

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

const RULE_ID = '64b0000000000000000000e1';

// ─────────────────────── 规则 CRUD ───────────────────────

test('POST /api/alerts/rules：scope=asset 缺 symbol 返回 400', async () => {
  const result = await request('/api/alerts/rules', {
    method: 'POST',
    body: { name: '无符号规则', scope: 'asset', ruleType: 'price_above', params: { threshold: 100 } }
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});

test('POST /api/alerts/rules：signal 缺 direction 返回 400', async () => {
  const result = await request('/api/alerts/rules', {
    method: 'POST',
    body: { name: '信号', scope: 'portfolio', portfolioId: RULE_ID, ruleType: 'signal' }
  });
  assert.equal(result.status, 400);
});

test('POST /api/alerts/rules：price 规则缺 threshold 返回 400', async () => {
  const result = await request('/api/alerts/rules', {
    method: 'POST',
    body: { name: '到价', scope: 'asset', symbol: '0700.HK', ruleType: 'price_above', params: {} }
  });
  assert.equal(result.status, 400);
});

test('POST /api/alerts/rules：合法规则创建成功并大写 symbol', async (t) => {
  t.mock.method(AlertRule.prototype, 'save', async function save() { return this; });
  const result = await request('/api/alerts/rules', {
    method: 'POST',
    body: {
      name: '腾讯到价 450', scope: 'asset', symbol: '0700.hk',
      ruleType: 'price_above', params: { threshold: 450 }, cooldownDays: 7, active: true
    }
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.symbol, '0700.HK');
  assert.equal(result.body.data.ruleType, 'price_above');
});

test('GET /api/alerts/rules：分页列表', async (t) => {
  const rules = [{ _id: RULE_ID, name: '腾讯到价', ruleType: 'price_above', active: true, scope: 'asset', symbol: '0700.HK' }];
  t.mock.method(AlertRule, 'countDocuments', async () => 1);
  t.mock.method(AlertRule, 'find', () => ({
    sort: () => ({ skip: () => ({ limit: async () => rules }) })
  }));
  const result = await request('/api/alerts/rules?page=1&pageSize=20');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.pagination.total, 1);
});

// ─────────────────────── 事件 ───────────────────────

test('GET /api/alerts/events/unread-count 返回未读数', async (t) => {
  t.mock.method(AlertEvent, 'countDocuments', async () => 5);
  const result = await request('/api/alerts/events/unread-count');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.count, 5);
});

test('GET /api/alerts/events：按 status 筛选并分页', async (t) => {
  const events = [{ _id: 'evt-1', status: 'unread', level: 'info', title: '到价' }];
  const calls = [];
  t.mock.method(AlertEvent, 'countDocuments', async (filter) => { calls.push(filter); return 1; });
  t.mock.method(AlertEvent, 'find', (filter) => {
    calls.push(filter);
    return { sort: () => ({ skip: () => ({ limit: async () => events }) }) };
  });
  const result = await request('/api/alerts/events?status=unread&page=1&pageSize=20');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.deepEqual(calls[0], { status: 'unread' });
});

test('PATCH /api/alerts/events/:id/read 标记已读', async (t) => {
  t.mock.method(AlertEvent, 'findByIdAndUpdate', async () => ({ _id: 'evt-1', status: 'read' }));
  const result = await request('/api/alerts/events/64b0000000000000000000aa/read', {
    method: 'PATCH', body: { status: 'read' }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.status, 'read');
});

test('PATCH /api/alerts/events/:id/read 非法 status 返回 400', async () => {
  const result = await request('/api/alerts/events/64b0000000000000000000aa/read', {
    method: 'PATCH', body: { status: 'spam' }
  });
  assert.equal(result.status, 400);
});

// ─────────────────────── 手动跑批 ───────────────────────

test('POST /api/alerts/evaluate 返回跑批统计', async (t) => {
  t.mock.method(alertEngine, 'evaluateAll', async () => ({ evaluated: 3, created: 2, archived: 0, failed: 0 }));
  const result = await request('/api/alerts/evaluate', { method: 'POST' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { evaluated: 3, created: 2, archived: 0, failed: 0 });
});
