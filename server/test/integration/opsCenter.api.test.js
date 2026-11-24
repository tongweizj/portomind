// server/test/integration/opsCenter.api.test.js
//
// TASK-068：GET /api/ops-center/assets 的协议契约。
// 起真实 Express app + fetch，服务层用替身；认证闸门执行真实逻辑。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-ops-center-api-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const opsCenterService = require('@portomind/shared/services/opsCenter.service');
const {
  installAdminSession,
  uninstallSessionStub,
  setSessionUser,
  authHeaders,
  ADMIN_USER,
  MEMBER_USER
} = require('../helpers/auth');

const ITEM = {
  assetId: '64b000000000000000000068',
  symbol: 'VOO.US',
  name: 'Vanguard S&P 500 ETF',
  market: 'US',
  currency: 'USD',
  launchDate: '2010-09-07T00:00:00.000Z',
  todayPrice: { marketDay: '2026-11-20', status: 'priced', priceDate: '2026-11-20' },
  basicInfo: { complete: true, missingFields: [] },
  validity: { status: 'normal' },
  history: { status: 'unavailable' }
};

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
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.afterEach(() => {
  setSessionUser(ADMIN_USER);
});

async function request(pathname, options = {}, { authenticated = true } = {}) {
  const headers = { ...(options.headers || {}) };
  if (authenticated) headers.cookie = authHeaders().cookie;
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function stubOverview(t, payload) {
  return t.mock.method(opsCenterService, 'getAssetsOverview', async () => payload);
}

test('未登录返回 401，不进入业务服务', async (t) => {
  const service = stubOverview(t, { total: 0, data: [] });

  const result = await request('/api/ops-center/assets', {}, { authenticated: false });

  assert.equal(result.status, 401);
  assert.equal(result.body.success, false);
  assert.equal(service.mock.callCount(), 0);
});

test('默认返回 active 第 1 页，pageSize=50，并带 items + pagination 契约', async (t) => {
  const service = stubOverview(t, { total: 1, data: [ITEM] });

  const result = await request('/api/ops-center/assets');

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data, [ITEM]);
  assert.deepEqual(result.body.pagination, { page: 1, pageSize: 50, total: 1 });
  assert.deepEqual(service.mock.calls[0].arguments[0], { page: 1, pageSize: 50 });
});

test('page/pageSize 透传服务端分页；筛选与排序参数本票不接收', async (t) => {
  const service = stubOverview(t, { total: 12, data: [ITEM] });

  const result = await request('/api/ops-center/assets?page=2&pageSize=10&market=US&sortBy=name&search=VV');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.pagination, { page: 2, pageSize: 10, total: 12 });
  assert.deepEqual(service.mock.calls[0].arguments[0], { page: 2, pageSize: 10 });
});

test('非法分页参数返回 400，不调用服务', async (t) => {
  for (const query of ['page=0', 'page=abc', 'pageSize=0', 'pageSize=abc', 'pageSize=101']) {
    const service = stubOverview(t, { total: 0, data: [] });
    const result = await request(`/api/ops-center/assets?${query}`);
    assert.equal(result.status, 400, query);
    assert.equal(result.body.success, false, query);
    assert.equal(service.mock.callCount(), 0, query);
  }
});

test('空态返回 200 + 空数组 + total=0', async (t) => {
  stubOverview(t, { total: 0, data: [] });

  const result = await request('/api/ops-center/assets');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, []);
  assert.deepEqual(result.body.pagination, { page: 1, pageSize: 50, total: 0 });
});

test('member 登录可读：服务端只要求登录，不新增 admin 校验', async (t) => {
  setSessionUser(MEMBER_USER);
  const service = stubOverview(t, { total: 1, data: [ITEM] });

  const result = await request('/api/ops-center/assets');

  assert.equal(result.status, 200);
  assert.equal(service.mock.callCount(), 1);
});
