const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectAssetIntegrity, assetCompletenessSnapshot } = require('@portomind/shared/services/assetIntegrity.service');
const { dateBounds } = require('@portomind/shared/utils/marketTime');

const launchDate = new Date('2020-01-02T12:00:00Z');
const asset = (_id, symbol, market, currency, extra = {}) => ({ _id, symbol, market, currency, name: symbol, launchDate, ...extra });
const price = (symbol, day, value = 1) => ({ symbol, timestamp: dateBounds(day).start, price: value });

test('三个开市日含 TASK-078 目标日，跨周末并兼容 CN 旧桶', async () => {
  const assets = [
    asset('a', '001180.CN', 'CN-FUND', 'CNY'), asset('b', '001181.CN', 'CN-FUND', 'CNY'),
    asset('c', 'VOO.US', 'US', 'USD'), asset('d', 'BND.US', 'US', 'USD', { launchDate: null, name: ' ' })
  ];
  const loadPrices = async () => [price('001180.CN', '2026-11-22'), price('001181.CN', '2026-11-22', null),
    price('VOO.US', '2026-11-23'), price('BND.US', '2026-11-18')];
  const result = await inspectAssetIntegrity({ now: new Date('2026-11-23T18:00:00Z'), dependencies: {
    listAssets: async () => assets, loadPrices
  } });
  assert.equal(result.total, 4);
  assert.equal(result.complete, 1);
  assert.equal(result.priceEmpty3MarketDays, 2);
  assert.equal(result.launchDateMissing, 1);
  assert.deepEqual(result.incompleteAssets.map(row => [row.assetId, row.reasons]), [
    ['b', ['PRICE_EMPTY_3_MARKET_DAYS']], ['c', ['PRICE_EMPTY_3_MARKET_DAYS']], ['d', ['NAME_EMPTY', 'LAUNCH_DATE_MISSING']]
  ]);
});

test('窗外的正常开市日旧价不能填补最早一个窗内开市日', async () => {
  const assets = [asset('a', '001180.CN', 'CN-FUND', 'CNY')];
  const now = new Date('2026-11-23T18:00:00Z');
  const load = day => inspectAssetIntegrity({ now, dependencies: {
    listAssets: async () => assets,
    loadPrices: async () => [price('001180.CN', day)]
  } });
  const outside = await load('2026-11-18');
  assert.equal(outside.complete, 0);
  assert.equal(outside.priceEmpty3MarketDays, 1);
  assert.equal((await load('2026-11-19')).complete, 1);
});

test('CN 午间目标日切换，非空当日净值仅在到点后纳入', async () => {
  const dependencies = { listAssets: async () => [asset('a', '001180.CN', 'CN-FUND', 'CNY')],
    loadPrices: async () => [price('001180.CN', '2026-11-18')] };
  const before = await inspectAssetIntegrity({ now: new Date('2026-11-18T16:59:59Z'), dependencies });
  const after = await inspectAssetIntegrity({ now: new Date('2026-11-18T17:00:00Z'), dependencies });
  assert.equal(before.priceEmpty3MarketDays, 1);
  assert.equal(after.priceEmpty3MarketDays, 0);
});

test('只读快照覆盖已受检资产的日期原因，保留价格原因、分母和原检查记录', async () => {
  const now = new Date('2026-11-23T18:00:00Z');
  const known = asset('b', 'BND.US', 'US', 'USD');
  const missing = asset('a', 'VOO.US', 'US', 'USD', { launchDate: null });
  const result = await inspectAssetIntegrity({ now, dependencies: {
    listAssets: async () => [missing, known],
    loadPrices: async () => [price('BND.US', '2026-11-20')]
  } });
  const run = { status: 'SUCCEEDED', endedAt: now, result };
  const original = structuredClone(run);
  const snapshot = await assetCompletenessSnapshot(run, [
    { ...missing, launchDate }, { ...known, launchDate: null }, asset('c', 'UNSEEN.US', 'US', 'USD', { launchDate: null })
  ], now);
  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.launchDateMissing, 1);
  assert.equal(snapshot.priceEmpty3MarketDays, 1);
  assert.deepEqual(snapshot.incompleteAssets.map(row => [row.assetId, row.reasons]), [
    ['a', ['PRICE_EMPTY_3_MARKET_DAYS']], ['b', ['LAUNCH_DATE_MISSING']]
  ]);
  assert.deepEqual(snapshot.checkedAt, now);
  assert.deepEqual(run, original);
});
