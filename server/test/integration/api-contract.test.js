const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-api-contract-test-logs';

const priceService = require('../../services/price.service');
const assetService = require('../../services/asset.service');
const executeService = require('../../services/rebalance/executeRebalance');
const Asset = require('../../models/asset');

let capturedPriceQuery;
let capturedHistoryQuery;
let capturedTodayQuery;
const prices = new Map();
let capturedAssetQuery;
const assetId = '64b000000000000000000001';

priceService.getPricesByDate = async (date, query) => {
  capturedPriceQuery = { date, ...query };
  return { total: 42, data: [{ symbol: 'VTI', price: 300 }] };
};
priceService.getTodayLatest = async query => {
  capturedTodayQuery = query;
  return { total: 21, data: [{ symbol: 'VTI', price: 300 }] };
};
priceService.getPriceHistory = async (symbol, query) => {
  capturedHistoryQuery = { symbol, ...query };
  return { total: 2, data: [{ symbol, price: 299 }] };
};
priceService.getPriceById = async (id) => {
  if (id === 'boom') throw new Error('database unavailable');
  return prices.get(id) || null;
};
priceService.createPrice = async (data) => {
  const price = { _id: 'price-1', ...data };
  prices.set(price._id, price);
  return price;
};
priceService.updatePrice = async (id, data) => {
  if (!prices.has(id)) return null;
  const price = { ...prices.get(id), ...data };
  prices.set(id, price);
  return price;
};
priceService.deletePrice = async (id) => {
  const price = prices.get(id) || null;
  prices.delete(id);
  return price;
};

const assets = new Map();
assetService.getAllAssets = async (query) => {
  capturedAssetQuery = query;
  return {
    total: assets.size,
    data: [...assets.values()].slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
  };
};
assetService.createAsset = async (data) => {
  if ([...assets.values()].some(asset => asset.symbol === data.symbol.toUpperCase())) {
    const error = new Error(`Asset symbol "${data.symbol.toUpperCase()}" already exists`);
    error.status = 409;
    error.code = 'ASSET_SYMBOL_EXISTS';
    throw error;
  }
  const asset = { _id: assetId, ...data, symbol: data.symbol.toUpperCase() };
  assets.set(asset._id, asset);
  return asset;
};
assetService.getAssetById = async (id) => assets.get(id) || null;
assetService.updateAsset = async (id, data) => {
  if (!assets.has(id)) return null;
  const asset = { ...assets.get(id), ...data };
  assets.set(id, asset);
  return asset;
};
assetService.deleteAsset = async (id) => {
  const asset = assets.get(id) || null;
  assets.delete(id);
  return asset;
};
executeService.executeRebalance = async (_pid, { mode }) => ({
  _id: 'record-1', status: `EXECUTED:${mode}`, executedTransactionIds: ['tx-1']
});

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

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.headers || {}) }
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

test('固定价格路由优先于 /:id 且当日最新价支持分页', async () => {
  const result = await request('/api/prices/today?page=2&pageSize=10');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data[0].symbol, 'VTI');
  assert.deepEqual(capturedTodayQuery, { page: 2, pageSize: 10 });
  assert.deepEqual(result.body.pagination, { page: 2, pageSize: 10, total: 21 });
});

test('指定日期价格统一返回 total 分页并传递分页参数', async () => {
  const result = await request('/api/prices/date/2026-08-01?page=2&pageSize=10');
  assert.deepEqual(capturedPriceQuery, { date: '2026-08-01', page: 2, pageSize: 10 });
  assert.deepEqual(result.body.pagination, { page: 2, pageSize: 10, total: 42 });
  assert.ok(Array.isArray(result.body.data));
});

test('历史价格传递年月过滤和分页', async () => {
  const result = await request('/api/prices/symbol/VTI/history?year=2026&month=8&page=3&pageSize=5');
  assert.equal(result.status, 200);
  assert.deepEqual(capturedHistoryQuery, {
    symbol: 'VTI', year: 2026, month: 8, from: undefined, to: undefined, page: 3, pageSize: 5
  });
  assert.deepEqual(result.body.pagination, { page: 3, pageSize: 5, total: 2 });
});

test('400 与 404 使用统一错误结构并包含 traceId', async () => {
  const invalid = await request('/api/prices/symbol/VTI/history?month=13');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.success, false);
  assert.ok(invalid.body.traceId);

  const missing = await request('/api/not-a-route');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.success, false);
  assert.ok(missing.body.traceId);
});

test('历史价格支持日期范围并拒绝冲突过滤条件', async () => {
  const result = await request('/api/prices/symbol/VTI/history?from=2026-08-01&to=2026-08-20');
  assert.equal(result.status, 200);
  assert.equal(capturedHistoryQuery.from, '2026-08-01');
  assert.equal(capturedHistoryQuery.to, '2026-08-20');

  const conflict = await request('/api/prices/symbol/VTI/history?year=2026&from=2026-01-01');
  assert.equal(conflict.status, 400);
});

test('未处理异常明确返回 500 和可追踪错误结构', async () => {
  const result = await request('/api/prices/boom');
  assert.equal(result.status, 500);
  assert.deepEqual(
    { success: result.body.success, message: result.body.message },
    { success: false, message: 'Internal Server Error' }
  );
  assert.ok(result.body.traceId);
});

test('再平衡执行接受对象请求体并拒绝裸数组', async () => {
  const invalid = await request('/api/portfolios/p1/rebalance/execute', {
    method: 'POST', body: JSON.stringify([{ symbol: 'VTI' }])
  });
  assert.equal(invalid.status, 400);

  const valid = await request('/api/portfolios/p1/rebalance/execute', {
    method: 'POST', body: JSON.stringify({
      recordId: 'record-1',
      suggestions: [{ symbol: 'VTI' }],
      mode: 'MANUAL'
    })
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body.data, {
    recordId: 'record-1', status: 'EXECUTED:MANUAL', transactionIds: ['tx-1']
  });
});

test('Asset 主要 CRUD 都遵循统一契约', async () => {
  const created = await request('/api/assets', {
    method: 'POST', body: JSON.stringify({ symbol: 'VTI', name: 'Total Market' })
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);

  const duplicate = await request('/api/assets', {
    method: 'POST', body: JSON.stringify({ symbol: 'VTI', name: 'Duplicate' })
  });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.message, /VTI.*already exists/);

  const listed = await request('/api/assets?page=1&pageSize=20&search=total&sortBy=name&sortOrder=desc');
  assert.equal(listed.body.pagination.total, 1);
  assert.deepEqual(capturedAssetQuery, {
    page: 1,
    pageSize: 20,
    search: 'total',
    sortBy: 'name',
    sortOrder: 'desc',
    active: undefined,
    watchlist: undefined,
    assetClass: undefined
  });

  const found = await request(`/api/assets/${assetId}`);
  assert.equal(found.body.data.symbol, 'VTI');

  const updated = await request(`/api/assets/${assetId}`, {
    method: 'PUT', body: JSON.stringify({ name: 'Updated' })
  });
  assert.equal(updated.body.data.name, 'Updated');

  const deleted = await request(`/api/assets/${assetId}`, { method: 'DELETE' });
  assert.equal(deleted.body.data._id, assetId);

  const missing = await request(`/api/assets/${assetId}`);
  assert.equal(missing.status, 404);
  assert.ok(missing.body.traceId);
});

test('Asset 查询参数和字段枚举会拒绝无效输入', async () => {
  const invalidSort = await request('/api/assets?sortBy=unknown');
  assert.equal(invalidSort.status, 400);
  assert.match(invalidSort.body.message, /sortBy/);

  const invalidPage = await request('/api/assets?page=0');
  assert.equal(invalidPage.status, 400);

  const invalidActive = await request('/api/assets?active=yes');
  assert.equal(invalidActive.status, 400);

  const invalidAsset = new Asset({
    symbol: 'BAD SYMBOL',
    name: 'Bad',
    market: 'UNKNOWN',
    currency: 'EUR',
    type: 'crypto'
  });
  const validation = invalidAsset.validateSync();
  assert.ok(validation.errors.symbol);
  assert.ok(validation.errors.market);
  assert.ok(validation.errors.currency);
  assert.ok(validation.errors.type);

  const fund = new Asset({
    symbol: '005827',
    name: 'Fund',
    market: 'CN-FUND',
    currency: 'CNY',
    type: 'fund'
  });
  assert.equal(fund.validateSync(), undefined);
});

test('Price 主要 CRUD 都遵循统一契约', async () => {
  const created = await request('/api/prices', {
    method: 'POST', body: JSON.stringify({ symbol: 'VXUS', price: 70 })
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data._id, 'price-1');

  const found = await request('/api/prices/price-1');
  assert.equal(found.status, 200);
  assert.equal(found.body.data.symbol, 'VXUS');

  const updated = await request('/api/prices/price-1', {
    method: 'PUT', body: JSON.stringify({ price: 71 })
  });
  assert.equal(updated.body.data.price, 71);

  const deleted = await request('/api/prices/price-1', { method: 'DELETE' });
  assert.equal(deleted.body.data._id, 'price-1');

  const missing = await request('/api/prices/price-1');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.success, false);
});
