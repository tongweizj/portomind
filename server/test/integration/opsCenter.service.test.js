// server/test/integration/opsCenter.service.test.js
//
// TASK-068：运维中心资产总表聚合服务。
// 只验证外部可观察结果：每行资产的今日价格状态、基础信息缺失字段、
// 有效性（最近 3 个目标市场日）与 history 占位契约。
// 时间固定注入，不依赖运行当天的真实日期。

process.env.SCHEDULER_TIMEZONE = 'America/Toronto';

const test = require('node:test');
const assert = require('node:assert/strict');

const Asset = require('@portomind/shared/models/asset');
const Price = require('@portomind/shared/models/price');
const { getAssetsOverview } = require('@portomind/shared/services/opsCenter.service');

// 2026-11-23 是周一；13:00 America/Toronto，US 当日 03:00 同步已过、CN 当日 12:00 同步已过。
const NOW_SYNCED = new Date('2026-11-23T18:00:00.000Z');
// 周一凌晨 01:00 America/Toronto：两个市场的当日同步都未到点。
const NOW_NOT_DUE = new Date('2026-11-23T06:00:00.000Z');
// 周六：两个市场当日都休市。
const NOW_CLOSED = new Date('2026-11-21T18:00:00.000Z');

const priceAt = (symbol, bucketDate) => ({
  symbol,
  price: 100,
  // dateBounds 的 MARKET_TIMEZONE 起始时刻（EST = UTC-5）。
  timestamp: new Date(`${bucketDate}T05:00:00.000Z`)
});

function matchesActive(filter, asset) {
  return filter.active === undefined || asset.active === filter.active;
}

/**
 * Asset.countDocuments / Asset.find 的最小链式替身，供 asset.service.getAllAssets 使用。
 * 记录查询过滤条件与 skip/limit，用来断言「默认 active + 分页」。
 */
function stubAssets(t, assets) {
  const calls = { filters: [], skip: null, limit: null };
  t.mock.method(Asset, 'countDocuments', async (filter) => {
    calls.filters.push(filter);
    return assets.filter((asset) => matchesActive(filter, asset)).length;
  });
  t.mock.method(Asset, 'find', (filter) => {
    calls.filters.push(filter);
    const rows = assets.filter((asset) => matchesActive(filter, asset));
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
  return calls;
}

function stubPrices(t, prices) {
  t.mock.method(Price, 'find', () => ({
    select() { return this; },
    lean: async () => prices
  }));
}

function asset(over = {}) {
  return {
    _id: 'a1',
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

const byId = (items, id) => items.find((item) => item.assetId === id);

test('默认 active、pageSize=50，并按今日价格/基础信息/有效性返回可观察状态', async (t) => {
  const assets = [
    asset({ _id: 'a1', symbol: 'VOO.US' }),
    asset({ _id: 'a2', symbol: 'MISS.US', name: 'Missing Price' }),
    asset({ _id: 'a3', symbol: 'NEW.US', name: 'Not Listed', launchDate: new Date('2026-12-01T00:00:00.000Z') }),
    asset({ _id: 'a4', symbol: 'NOL.US', name: 'No Launch', launchDate: null }),
    asset({ _id: 'a5', symbol: '510300.CN', name: '沪深300ETF', market: 'CN-SH', currency: 'CNY' }),
    asset({ _id: 'a6', symbol: 'OLD.US', name: 'Inactive', active: false })
  ];
  const prices = [
    priceAt('VOO.US', '2026-11-20'),
    priceAt('510300.CN', '2026-11-23')
  ];
  const calls = stubAssets(t, assets);
  stubPrices(t, prices);

  const result = await getAssetsOverview({ now: NOW_SYNCED });

  assert.equal(result.total, 5, '停用资产不计入总数');
  assert.equal(result.data.length, 5);
  assert.deepEqual(calls.filters[0], { active: true });
  assert.equal(calls.limit, 50);
  assert.equal(calls.skip, 0);

  const voo = byId(result.data, 'a1');
  assert.deepEqual(voo.todayPrice, {
    marketDay: '2026-11-20',
    status: 'priced',
    priceDate: '2026-11-20'
  });
  assert.deepEqual(voo.basicInfo, { complete: true, missingFields: [] });
  assert.deepEqual(voo.validity, { status: 'normal' });
  assert.deepEqual(voo.history, { status: 'unavailable' });

  const missing = byId(result.data, 'a2');
  assert.equal(missing.todayPrice.marketDay, '2026-11-20');
  assert.equal(missing.todayPrice.status, 'missing');
  assert.equal(missing.todayPrice.priceDate, null, '缺价不得伪造价格日期');
  assert.equal(missing.validity.status, 'needs_review');

  const notListed = byId(result.data, 'a3');
  assert.equal(notListed.todayPrice.marketDay, '2026-11-20');
  assert.equal(notListed.todayPrice.status, 'not_listed');
  assert.equal(notListed.validity.status, 'unknown', '样本不足 3 个市场日不得猜测');

  const noLaunch = byId(result.data, 'a4');
  assert.equal(noLaunch.todayPrice.status, 'missing');
  assert.deepEqual(noLaunch.basicInfo, { complete: false, missingFields: ['launchDate'] });
  assert.equal(noLaunch.validity.status, 'unknown');

  const cn = byId(result.data, 'a5');
  assert.deepEqual(cn.todayPrice, {
    marketDay: '2026-11-23',
    status: 'priced',
    priceDate: '2026-11-23'
  });
  assert.equal(cn.validity.status, 'normal');
  assert.equal('price' in cn.todayPrice, false, '总表不返回原始价格序列/数值');
});

test('休市与未到点不误报为缺价', async (t) => {
  stubAssets(t, [asset({ _id: 'a1' })]);
  stubPrices(t, []);

  const closed = await getAssetsOverview({ now: NOW_CLOSED });
  assert.equal(closed.data[0].todayPrice.status, 'market_closed');
  assert.equal(closed.data[0].todayPrice.marketDay, '2026-11-21', '休市时展示状态所指的当前市场日');

  const notDue = await getAssetsOverview({ now: NOW_NOT_DUE });
  assert.equal(notDue.data[0].todayPrice.status, 'not_due');
  assert.equal(notDue.data[0].todayPrice.marketDay, '2026-11-23', '未到点时展示当前市场日');
  assert.equal(notDue.data[0].todayPrice.priceDate, null);
});

test('基础信息只检查 5 个元数据字段，并把非法值折算到对应字段', async (t) => {
  const assets = [
    asset({ _id: 'b1', symbol: 'bad symbol', name: '   ', currency: 'CAD' }),
    asset({ _id: 'b2', market: 'XX', currency: 'USD', symbol: 'BAD.XX' })
  ];
  stubAssets(t, assets);
  stubPrices(t, []);

  const result = await getAssetsOverview({ now: NOW_SYNCED });
  const b1 = byId(result.data, 'b1');
  assert.equal(b1.basicInfo.complete, false);
  assert.deepEqual(b1.basicInfo.missingFields, ['symbol', 'name', 'currency']);
  const b2 = byId(result.data, 'b2');
  assert.deepEqual(b2.basicInfo.missingFields, ['market']);
  assert.equal(b2.todayPrice.status, 'unknown', '不支持的市场不得猜测目标市场日');
  assert.equal(b2.todayPrice.marketDay, null);
  assert.equal(b2.validity.status, 'unknown');
});

test('分页参数原样落到服务端查询，不从全量结果切片', async (t) => {
  const assets = [
    asset({ _id: 'p1', symbol: 'AAA.US' }),
    asset({ _id: 'p2', symbol: 'BBB.US' }),
    asset({ _id: 'p3', symbol: 'CCC.US' }),
    asset({ _id: 'p4', symbol: 'DDD.US' }),
    asset({ _id: 'p5', symbol: 'EEE.US' })
  ];
  const calls = stubAssets(t, assets);
  stubPrices(t, []);

  const result = await getAssetsOverview({ page: 2, pageSize: 2, now: NOW_SYNCED });

  assert.equal(result.total, 5);
  assert.deepEqual(result.data.map((item) => item.assetId), ['p3', 'p4']);
  assert.equal(calls.skip, 2);
  assert.equal(calls.limit, 2);
});

test('最近 3 个市场日包含任一有价日即视为正常，全空才待核查', async (t) => {
  const assets = [
    asset({ _id: 'v1', symbol: 'ONE.US', launchDate: new Date('2020-01-01T00:00:00.000Z') }),
    asset({ _id: 'v2', symbol: 'NONE.US', launchDate: new Date('2020-01-01T00:00:00.000Z') })
  ];
  stubAssets(t, assets);
  // VOO 的窗口是 2026-11-20 / 19 / 18；只有最早一天有价也算正常。
  stubPrices(t, [priceAt('ONE.US', '2026-11-18')]);

  const result = await getAssetsOverview({ now: NOW_SYNCED });
  assert.equal(byId(result.data, 'v1').validity.status, 'normal');
  assert.equal(byId(result.data, 'v2').validity.status, 'needs_review');
});

test('上市不足 3 个市场日（落在窗口内部）判为无法判断，而不是待核查', async (t) => {
  const assets = [
    // US 窗口为 2026-11-20 / 19 / 18；11-19 上市只有 2 个市场日样本。
    asset({ _id: 'r1', symbol: 'RECENT.US', launchDate: new Date('2026-11-19T12:00:00.000Z') }),
    // 11-18 上市恰好覆盖 3 个市场日，可以判断。
    asset({ _id: 'r2', symbol: 'EDGE.US', launchDate: new Date('2026-11-18T12:00:00.000Z') })
  ];
  stubAssets(t, assets);
  stubPrices(t, []);

  const result = await getAssetsOverview({ now: NOW_SYNCED });
  assert.equal(byId(result.data, 'r1').validity.status, 'unknown');
  assert.equal(byId(result.data, 'r2').validity.status, 'needs_review');
});

test('价格源查询失败时降级为 unknown，不伪造缺价/待核查', async (t) => {
  stubAssets(t, [asset({ _id: 'd1' })]);
  t.mock.method(Price, 'find', () => {
    throw new Error('price store unavailable');
  });

  const result = await getAssetsOverview({ now: NOW_SYNCED });

  assert.equal(result.data[0].todayPrice.status, 'unknown');
  assert.equal(result.data[0].todayPrice.priceDate, null);
  assert.equal(result.data[0].validity.status, 'unknown');
  assert.deepEqual(result.data[0].history, { status: 'unavailable' });
});
