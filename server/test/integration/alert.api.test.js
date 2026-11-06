const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-alert-api-test-logs';

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const AlertRule = require('@portomind/shared/models/alertRule');
const AlertEvent = require('@portomind/shared/models/alertEvent');
const Portfolio = require('@portomind/shared/models/portfolio');
const alertEngine = require('@portomind/shared/services/alertEngine.service');

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

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', cookie: authHeaders().cookie },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: response.status, body: await response.json() };
}

const RULE_ID = '64b0000000000000000000e1';
const B_PORTFOLIO_ID = '64b0000000000000000000b1';

function mockVisiblePortfolios(t, ids) {
  t.mock.method(Portfolio, 'find', () => ({
    lean: async () => ids.map((_id) => ({ _id }))
  }));
}

function matchesFilter(event, filter) {
  if (!filter) return true;
  if (Array.isArray(filter.$and)) return filter.$and.every((part) => matchesFilter(event, part));
  if (Array.isArray(filter.$or)) return filter.$or.some((part) => matchesFilter(event, part));
  if (filter.status && event.status !== filter.status) return false;
  if (filter.portfolioId === null) return event.portfolioId === null;
  if (filter.portfolioId && filter.portfolioId.$in) {
    return filter.portfolioId.$in.map(String).includes(String(event.portfolioId));
  }
  if (filter.portfolioId) return String(event.portfolioId) === String(filter.portfolioId);
  return true;
}


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
  mockVisiblePortfolios(t, [B_PORTFOLIO_ID]);
  t.mock.method(AlertEvent, 'countDocuments', async () => 5);
  const result = await request('/api/alerts/events/unread-count');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.count, 5);
});

test('GET /api/alerts/events：按 status 筛选并分页', async (t) => {
  mockVisiblePortfolios(t, [B_PORTFOLIO_ID]);
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
  assert.deepEqual(calls[0], {
    $and: [
      { status: 'unread' },
      { $or: [{ portfolioId: { $in: [B_PORTFOLIO_ID] } }, { portfolioId: null }] }
    ]
  });
});

test('AC-01/02/03/04：删组合后事件隐藏但库中保留，资产级仍可见', async (t) => {
  const A_ID = '64b0000000000000000000a1';
  const B_ID = '64b0000000000000000000b1';
  const allEvents = [
    { _id: 'a-1', portfolioId: A_ID, status: 'unread', level: 'info', title: 'A-1', triggeredAt: new Date('2026-01-01') },
    { _id: 'a-2', portfolioId: A_ID, status: 'unread', level: 'info', title: 'A-2', triggeredAt: new Date('2026-01-02') },
    { _id: 'a-3', portfolioId: A_ID, status: 'unread', level: 'info', title: 'A-3', triggeredAt: new Date('2026-01-03') },
    { _id: 'b-1', portfolioId: B_ID, status: 'unread', level: 'info', title: 'B-1', triggeredAt: new Date('2026-01-04') },
    { _id: 'asset-1', portfolioId: null, status: 'unread', level: 'info', title: '资产级', triggeredAt: new Date('2026-01-05') }
  ];
  let visiblePortfolios = [{ _id: A_ID }, { _id: B_ID }];

  t.mock.method(Portfolio, 'find', () => ({ lean: async () => visiblePortfolios }));
  t.mock.method(AlertEvent, 'countDocuments', async (filter) => allEvents.filter((event) => matchesFilter(event, filter)).length);
  t.mock.method(AlertEvent, 'find', (filter) => ({
    sort: () => ({ skip: () => ({ limit: async () => allEvents.filter((event) => matchesFilter(event, filter)) }) })
  }));

  // 负向对照：未删除 A 时，列表与全局未读一致（5 = A3 + B1 + 资产级1）
  let events = await request('/api/alerts/events?page=1&pageSize=50');
  assert.equal(events.body.data.length, 5);
  let unread = await request('/api/alerts/events/unread-count');
  assert.equal(unread.body.data.count, 5);

  // 删除 A：只有组合 A 从可见组合集合消失，事件本身不删除
  visiblePortfolios = [{ _id: B_ID }];
  events = await request('/api/alerts/events?page=1&pageSize=50');
  assert.equal(events.body.data.length, 2);
  assert.ok(events.body.data.some((event) => event.title === 'B-1'));
  assert.ok(events.body.data.some((event) => event.title === '资产级'));
  assert.ok(!events.body.data.some((event) => String(event.portfolioId) === A_ID));

  // 全站未读减 3；A 的 3 条仍在库中（隐藏不是物理删除）
  unread = await request('/api/alerts/events/unread-count');
  assert.equal(unread.body.data.count, 2);
  assert.equal(await AlertEvent.countDocuments({ portfolioId: A_ID }), 3);
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
