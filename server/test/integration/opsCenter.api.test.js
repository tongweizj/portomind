// server/test/integration/opsCenter.api.test.js
//
// TASK-068 / TASK-069：GET /api/ops-center/assets 的 HTTP 集成契约。
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

function matchesQuery(query, asset) {
  if (query.active !== undefined && asset.active !== query.active) return false;
  if (query.market && asset.market !== query.market) return false;
  if (query.$or) {
    return query.$or.some((condition) => {
      const field = Object.keys(condition)[0];
      return condition[field].test(String(asset[field] ?? ''));
    });
  }
  return true;
}

/**
 * 真实服务的模型替身：Asset.find(query).sort().lean() + Price.find。
 * 记录查询供筛选下推断言。
 */
function stubWorld(t, { assets = [], prices = [] } = {}) {
  const calls = { queries: [] };
  t.mock.method(Asset, 'find', (query) => {
    calls.queries.push(query);
    const rows = assets
      .filter((asset) => matchesQuery(query, asset))
      .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
    const chain = {
      sort() { return chain; },
      lean: async () => rows
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
  assert.equal(calls.queries.length, 0);
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
  assert.deepEqual(calls.queries[0], { active: true }, '默认只查询 active 资产');

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

test('筛选、排序与分页由服务端完成；参数下推到模型查询', async (t) => {
  const assets = Array.from({ length: 12 }, (_, index) => makeAsset({
    _id: `p${index}`,
    symbol: `A${String(index).padStart(2, '0')}.US`,
    name: `Asset ${index}`
  }));
  const calls = stubWorld(t, { assets });

  const result = await request('/api/ops-center/assets?page=2&pageSize=10&market=US&active=all&sortBy=symbol&sortOrder=asc');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.pagination, { page: 2, pageSize: 10, total: 12 });
  assert.deepEqual(result.body.data.map((item) => item.symbol), ['A10.US', 'A11.US']);
  assert.deepEqual(calls.queries[0], { market: 'US' }, 'active=all 不限制启用状态');
});

test('filter/search 参数进入服务端查询；missingType=history_gap 不把 unavailable 当缺口', async (t) => {
  const assets = [
    makeAsset({ _id: 'f1', symbol: 'AAA.US', name: 'Alpha' }),
    makeAsset({ _id: 'f2', symbol: 'OFF.US', name: 'Off', active: false }),
    makeAsset({ _id: 'f3', symbol: 'VOO.US', name: 'Vanguard' })
  ];
  const calls = stubWorld(t, { assets });

  const result = await request('/api/ops-center/assets?active=false&search=off&missingType=validity&sortBy=priority&sortOrder=desc');

  assert.equal(result.status, 200);
  assert.equal(result.body.pagination.total, 1);
  assert.equal(result.body.data[0].symbol, 'OFF.US');
  assert.equal(calls.queries[0].active, false);
  assert.equal(calls.queries[0].$or.length, 2);
});

test('非法筛选/排序/分页参数返回 400，不进入聚合查询', async (t) => {
  const calls = stubWorld(t, { assets: [makeAsset()] });
  const invalidQueries = [
    'page=0', 'page=abc', 'pageSize=0', 'pageSize=abc', 'pageSize=101',
    'market=XX', 'active=maybe', 'missingType=foo', 'sortBy=foo', 'sortOrder=sideways',
    `search=${'x'.repeat(101)}`
  ];
  for (const query of invalidQueries) {
    const result = await request(`/api/ops-center/assets?${query}`);
    assert.equal(result.status, 400, query);
    assert.equal(result.body.success, false, query);
  }
  assert.equal(calls.queries.length, 0);
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
