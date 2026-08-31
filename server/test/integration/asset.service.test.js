const test = require('node:test');
const assert = require('node:assert/strict');

const Asset = require('../../models/asset');
const assetService = require('../../services/asset.service');

const original = {
  exists: Asset.exists,
  create: Asset.create,
  find: Asset.find,
  countDocuments: Asset.countDocuments
};

test.afterEach(() => {
  Object.assign(Asset, original);
});

test('createAsset 规范化 symbol 和 tags', async () => {
  Asset.exists = async () => false;
  Asset.create = async data => data;

  const created = await assetService.createAsset({
    symbol: ' vti ',
    name: ' Vanguard ',
    market: 'US',
    currency: 'USD',
    type: 'etf',
    tags: [' core ', 'core', '']
  });

  assert.equal(created.symbol, 'VTI');
  assert.equal(created.name, 'Vanguard');
  assert.deepEqual(created.tags, ['core']);
});

test('createAsset 在写入前识别重复 symbol', async () => {
  Asset.exists = async query => query.symbol === 'VTI';
  Asset.create = async () => assert.fail('duplicate asset must not be inserted');

  await assert.rejects(
    assetService.createAsset({ symbol: 'vti' }),
    error => error.status === 409 && /VTI.*already exists/.test(error.message)
  );
});

test('getAllAssets 对搜索内容转义并执行稳定分页排序', async () => {
  let capturedQuery;
  let capturedSort;
  let capturedSkip;
  let capturedLimit;
  Asset.countDocuments = async query => {
    capturedQuery = query;
    return 1;
  };
  Asset.find = query => {
    capturedQuery = query;
    return {
      sort(value) { capturedSort = value; return this; },
      skip(value) { capturedSkip = value; return this; },
      limit(value) { capturedLimit = value; return Promise.resolve([{ symbol: 'VTI' }]); }
    };
  };

  const result = await assetService.getAllAssets({
    page: 2,
    pageSize: 10,
    search: 'VTI.*',
    sortBy: 'name',
    sortOrder: 'desc'
  });

  assert.equal(capturedQuery.$or[0].symbol.test('VTI.*'), true);
  assert.equal(capturedQuery.$or[0].symbol.test('VTIXYZ'), false);
  assert.deepEqual(capturedSort, { name: -1, _id: 1 });
  assert.equal(capturedSkip, 10);
  assert.equal(capturedLimit, 10);
  assert.equal(result.total, 1);
});

test('getActiveAssets 只查询 active，不读取 watchlist', async () => {
  let capturedQuery;
  Asset.find = query => {
    capturedQuery = query;
    return { sort: async () => [{ symbol: 'VTI' }] };
  };

  const assets = await assetService.getActiveAssets();
  assert.deepEqual(capturedQuery, { active: true });
  assert.equal(assets.length, 1);
});

test('getAllAssets 可独立过滤 active 和 watchlist', async () => {
  let capturedQuery;
  Asset.countDocuments = async query => { capturedQuery = query; return 0; };
  Asset.find = query => {
    capturedQuery = query;
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return Promise.resolve([]); }
    };
  };

  await assetService.getAllAssets({ active: true, watchlist: false });
  assert.deepEqual(capturedQuery, { active: true, watchlist: false });
});

// ─────────────────────── AS-09：assetClass 大类 ───────────────────────

test('createAsset 规范化 assetClass：空串→null、大写→小写', async () => {
  Asset.exists = async () => false;
  Asset.create = async data => data;

  const unclassified = await assetService.createAsset({
    symbol: 'GLD', name: '黄金 ETF', market: 'US', currency: 'USD', type: 'etf', assetClass: ''
  });
  assert.equal(unclassified.assetClass, null);

  const gold = await assetService.createAsset({
    symbol: 'GLD2', name: '黄金 ETF 2', market: 'US', currency: 'USD', type: 'etf', assetClass: 'GOLD'
  });
  assert.equal(gold.assetClass, 'gold');
});

test('createAsset 非法 assetClass 拒绝（400）', async () => {
  Asset.exists = async () => false;
  await assert.rejects(
    assetService.createAsset({
      symbol: 'XYZ', name: '非法', market: 'US', currency: 'USD', type: 'stock', assetClass: 'realestate'
    }),
    error => error.status === 400
  );
});

test('getAllAssets 支持 assetClass 筛选（unclassified → null）', async () => {
  let capturedQuery;
  Asset.countDocuments = async query => { capturedQuery = query; return 0; };
  Asset.find = query => {
    capturedQuery = query;
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return Promise.resolve([]); }
    };
  };

  await assetService.getAllAssets({ assetClass: 'gold' });
  assert.equal(capturedQuery.assetClass, 'gold');

  await assetService.getAllAssets({ assetClass: 'unclassified' });
  assert.equal(capturedQuery.assetClass, null);
});

test('asset 模型：assetClass 枚举校验（真实 validateSync）', () => {
  const valid = new Asset({ symbol: 'BND', name: '债', market: 'US', currency: 'USD', type: 'etf', assetClass: 'bond' });
  assert.equal(valid.validateSync(), undefined);
  assert.equal(valid.assetClass, 'bond');

  const unclassified = new Asset({ symbol: 'CASH', name: '现金', market: 'US', currency: 'USD', type: 'cash' });
  assert.equal(unclassified.validateSync(), undefined);
  assert.equal(unclassified.assetClass, null);

  const invalid = new Asset({ symbol: 'BAD', name: '错', market: 'US', currency: 'USD', type: 'stock', assetClass: 'realestate' });
  const error = invalid.validateSync();
  assert.ok(error && error.errors.assetClass, '非法 assetClass 应触发枚举校验');
});
