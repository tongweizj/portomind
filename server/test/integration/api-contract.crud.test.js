// server/test/integration/api-contract.crud.test.js
//
// TASK-072（P2）：契约残差收敛 —— CRUD 全链路 + 响应形状一致性。
//
// 目的：把「组合 / 交易 / 提醒规则」的 CRUD 契约、`GET /api/users` 的 {items} 包装例外、
// 以及列表端点 pagination 形状固化为可执行断言。
//
// 风格沿用 api-contract.test.js：**stub service / model，不连真实 Mongo**；
// 认证走 helpers/auth.js 的 installAdminSession()（只替换会话查询，真实闸门照跑）。
// 本文件只新增用例，不改动既有 api-contract.test.js 的任何断言。

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-api-contract-crud-test-logs';

const mongoose = require('mongoose');

const Portfolio = require('@portomind/shared/models/portfolio');
const AlertRule = require('@portomind/shared/models/alertRule');
const AlertEvent = require('@portomind/shared/models/alertEvent');

const portfolioService = require('@portomind/shared/services/portfolio');
const transactionService = require('@portomind/shared/services/transaction.service');
const priceService = require('@portomind/shared/services/price.service');
const assetService = require('@portomind/shared/services/asset.service');
const alertEngine = require('@portomind/shared/services/alertEngine.service');
const cronStatusService = require('@portomind/shared/services/cronStatus.service');
const userService = require('@portomind/shared/services/user.service');
const valuationService = require('@portomind/shared/services/valuation.service');
const fxRateService = require('@portomind/shared/services/fxRate.service');

const { applyWorld } = require('../helpers/modelStubs');

// ─────────────────────────────────────────────────────────────
// 固定 ID（均为合法 ObjectId 形态，便于校验 400/404 的区分）
// ─────────────────────────────────────────────────────────────

const PORTFOLIO_ID = '64b000000000000000000101';
const TRANSACTION_ID = '64b000000000000000000201';
const RULE_ID = '64b000000000000000000301';
const INVALID_ID = 'not-an-object-id';

// ─────────────────────────────────────────────────────────────
// 组合 CRUD stub：内存 Map，行为与 controller 对 service 的调用形态一致
// ─────────────────────────────────────────────────────────────

const portfolios = new Map();

Portfolio.prototype.save = async function save() {
  const doc = this.toObject ? this.toObject() : this;
  const _id = doc._id || new mongoose.Types.ObjectId(PORTFOLIO_ID);
  const stored = { _id, ...doc };
  portfolios.set(String(_id), stored);
  return stored;
};

// controller 里是 `await Portfolio.findById(...)`，返回 Promise 即可
Portfolio.findById = async (id) => portfolios.get(String(id)) || null;

Portfolio.findByIdAndUpdate = (id, body) => Promise.resolve().then(() => {
  const current = portfolios.get(String(id));
  if (!current) return null;
  const updated = { ...current, ...body };
  portfolios.set(String(id), updated);
  return updated;
});

portfolioService.deletePortfolioCascade = async (id) => {
  const current = portfolios.get(String(id));
  if (!current) return null;
  portfolios.delete(String(id));
  return {
    portfolio: current,
    deletedTransactions: 2,
    deletedRebalanceRecords: 1
  };
};

portfolioService.computeSummary = async () => ([
  { _id: PORTFOLIO_ID, name: '契约测试组合', positionCount: 0, marketValueByCurrency: { CNY: 0 }, drift: null }
]);

// ─────────────────────────────────────────────────────────────
// 交易 stub
// ─────────────────────────────────────────────────────────────

const transactions = new Map();

function buildTransaction(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(TRANSACTION_ID),
    portfolioId: PORTFOLIO_ID,
    symbol: 'VTI',
    action: 'buy',
    quantity: 10,
    price: 300,
    date: new Date('2026-08-01'),
    market: 'US',
    toObject() { return { ...this }; },
    ...overrides
  };
}

transactionService.createTransaction = async (input) => {
  const doc = buildTransaction({
    symbol: String(input.symbol).toUpperCase(),
    action: input.action,
    quantity: input.quantity,
    price: input.price
  });
  transactions.set(String(doc._id), doc);
  return doc;
};

transactionService.getTransactions = async ({ page, pageSize }) => {
  const all = [...transactions.values()];
  return {
    total: all.length,
    data: all.slice((page - 1) * pageSize, page * pageSize)
  };
};

transactionService.getTransactionsByPortfolio = async (portfolioId, { page, pageSize }) => {
  const all = [...transactions.values()].filter(
    (item) => String(item.portfolioId) === String(portfolioId)
  );
  return {
    total: all.length,
    data: all.slice((page - 1) * pageSize, page * pageSize)
  };
};

transactionService.getTransactionById = async (id) => transactions.get(String(id)) || null;

transactionService.deleteTransaction = async (id) => {
  const doc = transactions.get(String(id)) || null;
  transactions.delete(String(id));
  return doc;
};

// detectLotWarnings 保留真实实现（纯函数），因此 201 响应必然带 warnings 字段
transactionService.detectLotWarnings = () => ([]);

// ─────────────────────────────────────────────────────────────
// 提醒规则 stub
// ─────────────────────────────────────────────────────────────

const rules = new Map();

function buildRule(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(RULE_ID),
    name: '契约测试规则',
    scope: 'asset',
    symbol: 'VTI',
    ruleType: 'price_above',
    params: { threshold: 300 },
    cooldownDays: 7,
    active: true,
    ...overrides
  };
}

AlertRule.prototype.save = async function save() {
  const doc = this.toObject ? this.toObject() : this;
  const _id = doc._id || new mongoose.Types.ObjectId(RULE_ID);
  const stored = { _id, ...doc };
  rules.set(String(_id), stored);
  return stored;
};

AlertRule.findById = (id) => Promise.resolve(rules.get(String(id)) || null);

AlertRule.findByIdAndUpdate = (id, body) => Promise.resolve().then(() => {
  const current = rules.get(String(id));
  if (!current) return null;
  const updated = { ...current, ...body };
  rules.set(String(id), updated);
  return updated;
});

AlertRule.findByIdAndDelete = (id) => Promise.resolve().then(() => {
  const current = rules.get(String(id)) || null;
  rules.delete(String(id));
  return current;
});

AlertRule.countDocuments = async () => rules.size;

AlertRule.find = () => {
  const rows = () => [...rules.values()];
  return {
    sort: () => ({ skip: () => ({ limit: async () => rows() }) }),
    lean: async () => rows()
  };
};

// 规则列表会读组合可见性（alertVisibility）；本文件只验证规则自身形状，放行即可
const restoreAlertWorld = applyWorld({ portfolios: [] });

alertEngine.evaluateAll = async () => ({ evaluated: 0, created: 0, archived: 0, failed: 0 });

// ─────────────────────────────────────────────────────────────
// 其他列表端点 stub（第 7 / 8 条）
// ─────────────────────────────────────────────────────────────

assetService.getAllAssets = async ({ page, pageSize }) => ({
  total: 1,
  data: [{ _id: '64b000000000000000000401', symbol: 'VTI', name: 'Total Market' }].slice(
    (page - 1) * pageSize,
    page * pageSize
  )
});

priceService.getTodayLatest = async () => ({ total: 1, data: [{ symbol: 'VTI', price: 300 }] });

cronStatusService.getStatus = async () => ({
  generatedAt: '2026-11-11T00:00:00.000Z',
  tasks: [],
  notes: []
});

userService.listUsers = async () => ([
  {
    id: '64b0000000000000000000aa',
    username: 'admin',
    role: 'admin',
    mustChangePassword: false,
    active: true,
    lastLoginAt: null,
    createdAt: null
  }
]);

valuationService.getLatestValuations = async () => ([
  { indexCode: '000300', metric: 'pe', value: 12.3, percentile: 40 }
]);

fxRateService.getLatestRateDocs = async () => ([
  { currency: 'USD', rate: 7.1, date: '2026-11-10' }
]);

Portfolio.countDocuments = async () => portfolios.size;

Portfolio.find = () => {
  const rows = () => [...portfolios.values()];
  return {
    sort: () => ({ skip: () => ({ limit: async () => rows() }) }),
    lean: async () => rows()
  };
};

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
  restoreAlertWorld();
  uninstallSessionStub();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
      cookie: authHeaders().cookie
    }
  });
  return { status: response.status, body: await response.json() };
}

const paginationShape = (body) => Object.keys(body.pagination || {}).sort();

// ─────────────────────────────────────────────────────────────
// 1. 组合 CRUD 全链路
// ─────────────────────────────────────────────────────────────

test('组合 CRUD 全链路：POST 201 → GET 200 → PUT 200 → DELETE 200 且返回级联删除计数', async () => {
  const created = await request('/api/portfolios', {
    method: 'POST',
    body: JSON.stringify({ name: '契约测试组合', type: '长期', currency: 'CNY' })
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  const id = String(created.body.data._id);

  const found = await request(`/api/portfolios/${id}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.data.name, '契约测试组合');

  const updated = await request(`/api/portfolios/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: '契约测试组合（改名）' })
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, '契约测试组合（改名）');

  const deleted = await request(`/api/portfolios/${id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.success, true);
  // 级联删除必须在 data 中回报三个键，前端据此提示删除数量
  assert.deepEqual(
    {
      portfolio: deleted.body.data.portfolio.name,
      deletedTransactions: deleted.body.data.deletedTransactions,
      deletedRebalanceRecords: deleted.body.data.deletedRebalanceRecords
    },
    {
      portfolio: '契约测试组合（改名）',
      deletedTransactions: 2,
      deletedRebalanceRecords: 1
    }
  );
});

// ─────────────────────────────────────────────────────────────
// 2. 组合 404 / 非法 id 400
// ─────────────────────────────────────────────────────────────

test('组合 404 与非法 id 400 均返回 success:false 且带 traceId', async () => {
  const missing = await request('/api/portfolios/64b0000000000000000009ff');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.success, false);
  assert.ok(missing.body.traceId);

  const invalid = await request(`/api/portfolios/${INVALID_ID}`);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.success, false);
  assert.ok(invalid.body.traceId);
});

// ─────────────────────────────────────────────────────────────
// 3. 交易 CRUD
// ─────────────────────────────────────────────────────────────

test('交易 CRUD：POST 201 含 warnings → 列表 data[]+pagination → :id 404 → DELETE 200', async () => {
  const created = await request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      portfolioId: PORTFOLIO_ID,
      symbol: 'vti',
      action: 'buy',
      quantity: 10,
      price: 300,
      date: '2026-08-01'
    })
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  // TR-08：整手软警告字段必须存在（即使为空数组），前端消费该键
  assert.ok(Object.prototype.hasOwnProperty.call(created.body.data, 'warnings'));
  assert.ok(Array.isArray(created.body.data.warnings));
  const id = String(created.body.data._id);

  const listed = await request('/api/transactions?page=1&pageSize=20');
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.body.data));
  assert.deepEqual(listed.body.pagination, { page: 1, pageSize: 20, total: 1 });

  const missing = await request('/api/transactions/64b0000000000000000009ff');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.success, false);

  const deleted = await request(`/api/transactions/${id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.success, true);
});

// ─────────────────────────────────────────────────────────────
// 4. 组合交易子资源
// ─────────────────────────────────────────────────────────────

test('GET /api/portfolios/:pid/transactions 返回 data[] + pagination，默认 pageSize=50', async () => {
  const result = await request(`/api/portfolios/${PORTFOLIO_ID}/transactions`);
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.data));
  assert.deepEqual(paginationShape(result.body), ['page', 'pageSize', 'total']);
  // 子资源默认 pageSize=50（与 /api/transactions 默认 20 区分）
  assert.equal(result.body.pagination.page, 1);
  assert.equal(result.body.pagination.pageSize, 50);
  assert.equal(typeof result.body.pagination.total, 'number');
});

// ─────────────────────────────────────────────────────────────
// 5. 提醒规则 CRUD
// ─────────────────────────────────────────────────────────────

test('提醒规则 CRUD：POST 201 → 列表 → GET :id 200 → PUT 200 → DELETE 200 → 再 GET 404', async () => {
  const created = await request('/api/alerts/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: '契约测试规则',
      scope: 'asset',
      symbol: 'VTI',
      ruleType: 'price_above',
      params: { threshold: 300 }
    })
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  const id = String(created.body.data._id);

  const listed = await request('/api/alerts/rules?page=1&pageSize=20');
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.body.data));
  assert.equal(listed.body.pagination.total, 1);

  const found = await request(`/api/alerts/rules/${id}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.data.name, '契约测试规则');

  const updated = await request(`/api/alerts/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: '契约测试规则（改名）',
      scope: 'asset',
      symbol: 'VTI',
      ruleType: 'price_above',
      params: { threshold: 320 }
    })
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, '契约测试规则（改名）');

  const deleted = await request(`/api/alerts/rules/${id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.success, true);

  const gone = await request(`/api/alerts/rules/${id}`);
  assert.equal(gone.status, 404);
  assert.equal(gone.body.success, false);
});

// ─────────────────────────────────────────────────────────────
// 6. GET /api/users 的 {items} 包装例外
// ─────────────────────────────────────────────────────────────

test('GET /api/users 的 data 是 {items:[...]} 而非数组，且不含 passwordHash', async () => {
  const result = await request('/api/users');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  // 全仓唯一的包装式列表：data.items，不是 data[]
  assert.equal(Array.isArray(result.body.data), false, 'data 不应是数组');
  assert.ok(result.body.data && typeof result.body.data === 'object');
  assert.ok(Array.isArray(result.body.data.items), 'data.items 应是数组');
  assert.equal(result.body.data.items.length, 1);
  // 任何用户对象都不得泄漏密码哈希
  for (const user of result.body.data.items) {
    assert.equal(Object.prototype.hasOwnProperty.call(user, 'passwordHash'), false);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(result.body.data, 'items'), true);
});

// ─────────────────────────────────────────────────────────────
// 7. 列表分页形状一致性
// ─────────────────────────────────────────────────────────────

test('列表端点 pagination 形状一致：恰好 {page,pageSize,total}', async () => {
  const endpoints = [
    '/api/assets?page=1&pageSize=20',
    '/api/portfolios?page=1&pageSize=20',
    '/api/transactions?page=1&pageSize=20',
    '/api/prices/today?page=1&pageSize=20'
  ];

  for (const endpoint of endpoints) {
    const result = await request(endpoint);
    assert.equal(result.status, 200, `${endpoint} 应返回 200`);
    assert.ok(Array.isArray(result.body.data), `${endpoint} 的 data 应是数组`);
    assert.ok(result.body.pagination, `${endpoint} 应返回 pagination`);
    assert.deepEqual(
      paginationShape(result.body),
      ['page', 'pageSize', 'total'],
      `${endpoint} 的 pagination 键应恰为 page/pageSize/total`
    );
    assert.equal(typeof result.body.pagination.page, 'number');
    assert.equal(typeof result.body.pagination.pageSize, 'number');
    assert.equal(typeof result.body.pagination.total, 'number');
  }
});

// ─────────────────────────────────────────────────────────────
// 8. 非列表端点无 pagination
// ─────────────────────────────────────────────────────────────

test('非列表端点不含 pagination 键：/summary、/cron/status、/users', async () => {
  const endpoints = [
    '/api/portfolios/summary',
    '/api/cron/status',
    '/api/users'
  ];

  for (const endpoint of endpoints) {
    const result = await request(endpoint);
    assert.equal(result.status, 200, `${endpoint} 应返回 200`);
    assert.equal(result.body.success, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.body, 'pagination'),
      false,
      `${endpoint} 不应含 pagination 键`
    );
  }
});
