// server/test/integration/opsCenter.api.test.js
//
// TASK-068：GET /api/ops-center/assets 的 HTTP 集成契约。
// 起真实 Express app + fetch + 真实 shared 聚合服务，只替换模型查询；
// 认证闸门执行真实逻辑，时间用 mock timers 固定，不依赖运行当天。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-ops-center-api-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const Asset = require('@portomind/shared/models/asset');
const Price = require('@portomind/shared/models/price');
const {
  installAdminSession,
  uninstallSessionStub,
  setSessionUser,
  authHeaders,
  ADMIN_USER,
  MEMBER_USER
} = require('../helpers/auth');

const NOW_SYNCED = Date.parse('2026-11-23T18:00:00.000Z');

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

function makeAsset(over = {}) {
  return {
    _id: '64b000000000000000000001',
    symbol: 'VOO.US',
    name: 'Vanguard S&P 500 ETF',
    market: 'US',
    currency: 'USD',
    type: 'etf',
    active: true,
    launchDate: new Date('2010-09-07T00:00:00.000Z'),
    ...over
  };
}

/**
 * 真实服务的模型替身：active 过滤、服务端 skip/limit 与分页计数都走真实 asset.service。
 * 返回计数供「未进入查询」类断言使用。
 */
function stubWorld(t, { assets = [], prices = [] } = {}) {
  const calls = { countDocuments: 0, filters: [], skip: null, limit: null };
  t.mock.method(Asset, 'countDocuments', async (filter) => {
    calls.countDocuments += 1;
    calls.filters.push(filter);
    return assets.filter((asset) => filter.active === undefined || asset.active === filter.active).length;
  });
  t.mock.method(Asset, 'find', (filter) => {
    calls.filters.push(filter);
    const rows = assets
      .filter((asset) => filter.active === undefined || asset.active === filter.active)
      .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
    const chain = {
      sort() { return chain; },
      skip(value) { calls.skip = value; return chain; },
      limit(value) { calls.limit = value; return chain; },
      then(resolve, reject) {
        const start = calls.skip ?? 0;
        const end = calls.limit == null ? rows.length : start + calls.limit;
        Promise.resolve(rows.slice(start, end)).then(resolve, reject);
      }
    };
    return chain;
  });
  t.mock.method(Price, 'find', () => ({
    select() { return this; },
    lean: async () => prices
  }));
  return calls;
}

const priceAt = (symbol, bucketDate) => ({
  symbol,
  price: 100,
  timestamp: new Date(`${bucketDate}T05:00:00.000Z`)
});

const bySymbol = (items, symbol) => items.find((item) => item.symbol === symbol);

test('未登录返回 401，不进入聚合查询', async (t) => {
  const calls = stubWorld(t);

  const result = await request('/api/ops-center/assets', {}, { authenticated: false });

  assert.equal(result.status, 401);
  assert.equal(result.body.success, false);
  assert.equal(calls.countDocuments, 0);
});

test('默认 active 第 1 页 pageSize=50，返回今日价格/基础信息/有效性/history 契约', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW_SYNCED });
  const calls = stubWorld(t, {
    assets: [
      makeAsset({ _id: 'a1', symbol: 'VOO.US' }),
      makeAsset({ _id: 'a2', symbol: 'MISS.US', name: 'Missing Price' }),
      makeAsset({ _id: 'a3', symbol: 'NOL.US', name: 'No Launch', launchDate: null }),
      makeAsset({ _id: 'a4', symbol: 'OFF.US', name: 'Inactive', active: false })
    ],
    prices: [priceAt('VOO.US', '2026-11-20')]
  });

  const result = await request('/api/ops-center/assets');

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.pagination, { page: 1, pageSize: 50, total: 3 });
  assert.equal(result.body.data.length, 3);
  assert.ok(calls.filters.every((filter) => filter.active === true), '只查询 active 资产');
  assert.equal(calls.skip, 0);
  assert.equal(calls.limit, 50);

  const priced = bySymbol(result.body.data, 'VOO.US');
  assert.deepEqual(priced.todayPrice, {
    marketDay: '2026-11-20', status: 'priced', priceDate: '2026-11-20'
  });
  assert.deepEqual(priced.validity, { status: 'normal' });
  assert.deepEqual(priced.basicInfo, { complete: true, missingFields: [] });
  assert.deepEqual(priced.history, { status: 'unavailable' });
  assert.equal(priced.launchDate, '2010-09-07T00:00:00.000Z');

  const missing = bySymbol(result.body.data, 'MISS.US');
  assert.equal(missing.todayPrice.status, 'missing');
  assert.equal(missing.todayPrice.priceDate, null);
  assert.deepEqual(missing.validity, { status: 'needs_review' });

  const noLaunch = bySymbol(result.body.data, 'NOL.US');
  assert.deepEqual(noLaunch.basicInfo, { complete: false, missingFields: ['launchDate'] });
  assert.deepEqual(noLaunch.validity, { status: 'unknown' });
  assert.equal('0' in noLaunch.todayPrice, false);
});

test('page/pageSize 由服务端分页；筛选/排序参数本票不接收', async (t) => {
  const assets = Array.from({ length: 12 }, (_, index) => makeAsset({
    _id: `p${index}`,
    symbol: `A${String(index).padStart(2, '0')}.US`,
    name: `Asset ${index}`
  }));
  const calls = stubWorld(t, { assets });

  const result = await request('/api/ops-center/assets?page=2&pageSize=10&market=US&sortBy=name&search=A1');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.pagination, { page: 2, pageSize: 10, total: 12 });
  assert.deepEqual(result.body.data.map((item) => item.symbol), ['A10.US', 'A11.US']);
  assert.equal(calls.skip, 10);
  assert.equal(calls.limit, 10);
  assert.ok(calls.filters.every((filter) => filter.active === true), '未把筛选参数下推给模型');
});

test('非法分页参数返回 400，不进入聚合查询', async (t) => {
  const calls = stubWorld(t, { assets: [makeAsset()] });
  for (const query of ['page=0', 'page=abc', 'pageSize=0', 'pageSize=abc', 'pageSize=101']) {
    const result = await request(`/api/ops-center/assets?${query}`);
    assert.equal(result.status, 400, query);
    assert.equal(result.body.success, false, query);
  }
  assert.equal(calls.countDocuments, 0);
});

test('空态返回 200 + 空数组 + total=0', async (t) => {
  stubWorld(t);

  const result = await request('/api/ops-center/assets');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, []);
  assert.deepEqual(result.body.pagination, { page: 1, pageSize: 50, total: 0 });
});

test('member 登录可读：服务端只要求登录，不新增 admin 校验', async (t) => {
  setSessionUser(MEMBER_USER);
  stubWorld(t, { assets: [makeAsset()] });

  const result = await request('/api/ops-center/assets');

  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.data[0].symbol, 'VOO.US');
});
