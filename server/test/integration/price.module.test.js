const test = require('node:test');
const assert = require('node:assert/strict');

const Price = require('@portomind/shared/models/price');
const Asset = require('@portomind/shared/models/asset');
const { getLatestPrices } = require('@portomind/shared/services/marketData.service');
const { toStorageSymbol, toProviderSymbol } = require('@portomind/shared/utils/symbol');
const storage = require('@portomind/shared/services/priceStorage.service');
const priceService = require('@portomind/shared/services/price.service');
const tiantianFetcher = require('@portomind/shared/fetchers/tiantianFetcher');
const priceFetch = require('@portomind/shared/services/priceFetch.service');
const { dateBounds } = require('@portomind/shared/utils/marketTime');
const { withMarketDataTimeout } = require('@portomind/shared/fetchers/timeout');
const { MARKET_DATA_ERROR, classifyMarketDataError } = require('@portomind/shared/fetchers/errors');
const { taskLogger } = require('@portomind/shared/config/logger');

const originalFindOneAndUpdate = Price.findOneAndUpdate;
const originalBulkWrite = Price.bulkWrite;
const originalCountDocuments = Price.countDocuments;
const originalFind = Price.find;
const originalAggregate = Price.aggregate;
const originalTiantianLatest = tiantianFetcher.fetchLatest;

test.afterEach(() => {
  Price.findOneAndUpdate = originalFindOneAndUpdate;
  Price.bulkWrite = originalBulkWrite;
  Price.countDocuments = originalCountDocuments;
  Price.find = originalFind;
  Price.aggregate = originalAggregate;
  tiantianFetcher.fetchLatest = originalTiantianLatest;
});

test('Price 定义 symbol + timestamp 唯一索引', () => {
  const index = Price.schema.indexes().find(([fields]) =>
    fields.symbol === 1 && fields.timestamp === 1
  );
  assert.ok(index);
  assert.equal(index[1].unique, true);
});

test('手动新建和更新价格按派生键写入，估值读取可命中', async (t) => {
  const timestamp = new Date('2026-08-24T19:12:34Z');
  let stored;
  t.mock.method(Price, 'create', async data => {
    stored = new Price(data).toObject();
    return stored;
  });
  t.mock.method(Price, 'findById', () => ({ select: () => ({ lean: async () => stored }) }));
  t.mock.method(Price, 'findByIdAndUpdate', async (_id, data) => {
    stored = new Price({ ...stored, ...data }).toObject();
    return stored;
  });
  t.mock.method(Asset, 'aggregate', async () => [{ symbol: 'VOO.US', market: 'US' }]);
  t.mock.method(Price, 'findOne', ({ symbol }) => ({
    sort: () => ({ lean: async () => stored.symbol === symbol ? stored : null })
  }));

  const created = await priceService.createPrice({ symbol: ' voo ', market: 'US', price: 100, timestamp });
  assert.equal(created.symbol, 'VOO.US');
  assert.deepEqual(created.timestamp, timestamp);
  assert.deepEqual(await getLatestPrices(['VOO.US']), { 'VOO.US': 100 });

  const updated = await priceService.updatePrice(created._id, { symbol: 'voo.to', price: 101 });
  assert.equal(updated.symbol, 'VOO.US');
  assert.deepEqual(updated.timestamp, timestamp);
  assert.deepEqual(await getLatestPrices(['VOO.US']), { 'VOO.US': 101 });

  const moved = await priceService.updatePrice(created._id, { market: 'CA' });
  assert.equal(moved.symbol, 'VOO.TO');
  assert.equal(moved.market, 'CA');
});

test('手动新建可省略 market，采用标准后缀或唯一资产市场', async (t) => {
  t.mock.method(Price, 'create', async data => new Price(data).toObject());
  const markets = t.mock.method(Asset, 'distinct', async (_field, query) => {
    const symbols = query.symbol.$in;
    if (symbols.includes('VOO.US')) return ['US'];
    if (symbols.includes('BND.US')) return ['US', 'CA'];
    return [];
  });

  const fund = await priceService.createPrice({ symbol: '001180.cn', price: 1 });
  assert.equal(fund.symbol, '001180.CN');
  assert.equal(fund.market, 'CN-FUND');
  assert.equal(markets.mock.callCount(), 0);
  const voo = await priceService.createPrice({ symbol: 'voo', price: 100 });
  assert.equal(voo.symbol, 'VOO.US');
  assert.equal(voo.market, 'US');
  for (const symbol of ['BND', 'UNKNOWN']) {
    const price = await priceService.createPrice({ symbol, price: 90 });
    assert.equal(price.symbol, symbol);
    assert.equal(price.market, undefined);
  }
});

test('手动更新仅改数值时保留旧键，部分身份更新对不存在的记录返回 null', async (t) => {
  const read = t.mock.method(Price, 'findById', () => ({ select: () => ({ lean: async () => null }) }));
  const update = t.mock.method(Price, 'findByIdAndUpdate', async (_id, data) => data);
  assert.deepEqual(await priceService.updatePrice('legacy', { price: 25 }), { price: 25 });
  assert.equal(read.mock.callCount(), 0);
  assert.equal(await priceService.updatePrice('missing', { market: 'US' }), null);
  assert.equal(update.mock.callCount(), 1);
});

test('市场日期边界遵循 America/Toronto 的夏令时', () => {
  const spring = dateBounds('2026-03-08');
  const autumn = dateBounds('2026-11-01');
  assert.equal(spring.end - spring.start, 23 * 60 * 60 * 1000);
  assert.equal(autumn.end - autumn.start, 25 * 60 * 60 * 1000);
});

test('历史价格月份过滤转换为市场时区边界并分页', async () => {
  let capturedQuery;
  let capturedSkip;
  Price.countDocuments = async query => { capturedQuery = query; return 22; };
  Price.find = query => {
    capturedQuery = query;
    return {
      sort() { return this; },
      skip(value) { capturedSkip = value; return this; },
      limit() { return Promise.resolve([]); }
    };
  };

  const result = await priceService.getPriceHistory('vti', {
    year: 2026,
    month: 3,
    page: 2,
    pageSize: 10
  });
  assert.equal(capturedQuery.symbol, 'VTI');
  assert.equal(capturedQuery.timestamp.$gte.toISOString(), '2026-03-01T05:00:00.000Z');
  assert.equal(capturedQuery.timestamp.$lt.toISOString(), '2026-04-01T04:00:00.000Z');
  assert.equal(capturedSkip, 10);
  assert.equal(result.total, 22);
});

test('当日最新价格先按 symbol 聚合再分页', async () => {
  let pipeline;
  Price.aggregate = async value => {
    pipeline = value;
    return [{ metadata: [{ total: 25 }], data: [{ symbol: 'VTI' }] }];
  };
  const result = await priceService.getTodayLatest({
    page: 2,
    pageSize: 10,
    now: new Date('2026-08-24T16:00:00Z')
  });
  const facet = pipeline.find(stage => stage.$facet).$facet;
  assert.deepEqual(facet.data.slice(-2), [{ $skip: 10 }, { $limit: 10 }]);
  assert.equal(result.total, 25);
  assert.equal(result.date, '2026-08-24');
});

test('saveLatest 同一市场日覆盖同一键并记录前值、后值和批次', async (t) => {
  const filters = [];
  let saved;
  t.mock.method(Price, 'findOne', () => ({ lean: async () => saved }));
  t.mock.method(Price, 'findOneAndUpdate', async (filter, update) => {
    filters.push(filter);
    saved = { ...update.$set, _id: 'existing-price' };
    return saved;
  });
  const logger = t.mock.method(taskLogger, 'info', () => {});
  const scheduled = { trigger: 'SCHEDULED', marketGroup: 'CN', runKey: '2026-08-24:CN' };
  const manual = { trigger: 'MANUAL', runKey: 'manual:2026-08-24T19:00:00.000Z' };
  await storage.saveLatest({ symbol: '001180.cn', market: 'CN-FUND', price: 300, timestamp: new Date('2026-08-24T14:00:00Z') }, scheduled);
  await storage.saveLatest({ symbol: '001180', market: 'CN-FUND', price: 301, timestamp: new Date('2026-08-24T19:00:00Z') }, manual);

  assert.equal(filters[0].symbol, '001180.CN');
  assert.equal(filters[1].symbol, filters[0].symbol);
  assert.deepEqual(filters[1].timestamp, filters[0].timestamp);
  assert.equal(filters[1].price, 300);
  assert.equal(saved.price, 301);
  const [[firstEvent, first], [firstSaved, inserted], [secondEvent, second], [secondSaved, updated]] =
    logger.mock.calls.map(call => call.arguments);
  assert.deepEqual([firstEvent, firstSaved, secondEvent, secondSaved], [
    'PRICE_UPSERT_PREVIOUS', 'PRICE_UPSERTED', 'PRICE_UPSERT_PREVIOUS', 'PRICE_UPSERTED'
  ]);
  assert.deepEqual([first.existing, inserted.overwritten, second.existing, updated.overwritten], [null, false, 300, true]);
  assert.deepEqual([inserted.batch, inserted.marketGroup, updated.batch, updated.trigger, updated.price],
    [scheduled.runKey, 'CN', manual.runKey, 'MANUAL', 301]);
  assert.equal(updated.timestamp, filters[0].timestamp.toISOString());
  assert.ok(Number.isFinite(Date.parse(updated.writtenAt)));
});

test('saveHistory 在 bulkWrite 前合并重复日记录', async () => {
  let operations;
  Price.bulkWrite = async value => { operations = value; return {}; };
  await storage.saveHistory([
    { symbol: 'VTI.US', market: 'US', price: 300, timestamp: new Date('2026-08-24T12:00:00Z') },
    { symbol: 'vti.hk', market: 'US', price: 301, timestamp: new Date('2026-08-24T18:00:00Z') }
  ]);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].updateOne.upsert, true);
  assert.equal(operations[0].updateOne.update.$set.price, 301);
});

test('天天基金调度保留请求 symbol 后缀', async () => {
  tiantianFetcher.fetchLatest = async () => ({
    symbol: '005827',
    price: 1.23,
    timestamp: new Date('2026-08-24T12:00:00Z')
  });
  const record = await priceFetch.fetchLatest('005827.cn');
  assert.equal(record.symbol, '005827.CN');
});

test('外部行情超时和限流具有明确分类', async () => {
  await assert.rejects(
    withMarketDataTimeout('TEST', () => new Promise(() => {}), 5),
    error => error.category === MARKET_DATA_ERROR.TIMEOUT && error.retryable === true
  );
  const rateLimit = classifyMarketDataError({ response: { status: 429 } }, 'TEST');
  assert.equal(rateLimit.category, MARKET_DATA_ERROR.RATE_LIMIT);
  assert.equal(rateLimit.retryable, true);
});

test('symbol 单一派生覆盖六个市场、错误后缀、港股位数和未知 market', () => {
  const cases = [
    ['US', 'voo', 'VOO.US', 'VOO'],
    ['CA', 'bnd', 'BND.TO', 'BND.TO'],
    ['HK', '0700', '0700.HK', '0700.HK'],
    ['CN-FUND', '001180', '001180.CN', '001180'],
    ['CN-SH', '600519', '600519.SS', '600519'],
    ['CN-SZ', '000001', '000001.SZ', '000001']
  ];
  for (const [market, bare, stored, provider] of cases) {
    for (const input of [bare, stored, stored.toLowerCase(), ` ${bare}.HK `]) {
      assert.equal(toStorageSymbol(input, market), stored);
      assert.equal(toProviderSymbol(input, market), provider);
    }
  }
  assert.equal(toStorageSymbol('700', 'HK'), '700.HK');
  assert.equal(toStorageSymbol('brk.b', 'US'), 'BRK.B.US');
  assert.equal(toStorageSymbol(' voo ', undefined), 'VOO');
  assert.equal(toStorageSymbol(' voo.hk ', 'unknown'), 'VOO.HK');
  assert.equal(toStorageSymbol(' voo ', 'toString'), 'VOO');
  assert.equal(toStorageSymbol('  ', 'US'), '');
});

test('getLatestPrices 批量读取原始资产键并以 market 派生，保留输入映射与缺价 null', async (t) => {
  const lookup = t.mock.method(Asset, 'aggregate', async () => [
    { symbol: '001180.cn', market: 'CN-FUND' }, { symbol: 'VTI', market: 'US' }
  ]);
  const price = t.mock.method(Price, 'findOne', ({ symbol }) => ({
    sort: () => ({ lean: async () => symbol === '001180.CN' ? { price: 1.23 } : null })
  }));

  assert.deepEqual(await getLatestPrices(['001180.cn', 'vti', 'unknown']), {
    '001180.cn': 1.23, vti: null, unknown: null
  });
  assert.equal(lookup.mock.callCount(), 1);
  assert.deepEqual(lookup.mock.calls[0].arguments[0][0].$match.symbol.$in,
    ['001180.cn', 'vti', 'unknown', '001180.CN', 'VTI', 'UNKNOWN']);
  assert.deepEqual(price.mock.calls.map(call => call.arguments[0].symbol), ['001180.CN', 'VTI.US', 'UNKNOWN']);
});

test('getLatestPrices 资产查询失败时保留所有缺价键为 null', async (t) => {
  t.mock.method(Asset, 'aggregate', async () => { throw new Error('offline'); });
  const price = t.mock.method(Price, 'findOne', () => assert.fail('market lookup failed'));
  assert.deepEqual(await getLatestPrices(['VOO']), { VOO: null });
  assert.equal(price.mock.callCount(), 0);
});

test('saveLatest 并发唯一键冲突后以同一派生键更新', async (t) => {
  let reads = 0;
  t.mock.method(Price, 'findOne', () => ({ lean: async () => ++reads === 1 ? null : { _id: 'winner', price: 299 } }));
  const logger = t.mock.method(taskLogger, 'info', () => {});
  const update = t.mock.method(Price, 'findOneAndUpdate', async (filter, payload, options) => {
    if (options.upsert) throw Object.assign(new Error('duplicate'), { code: 11000 });
    return payload.$set;
  });

  const record = await storage.saveLatest({
    symbol: 'voo.to', market: 'US', price: 301, timestamp: new Date('2026-08-24T19:00:00Z')
  });
  assert.equal(record.symbol, 'VOO.US');
  assert.equal(record.price, 301);
  assert.equal(update.mock.callCount(), 2);
  const [insertFilter, updateFilter] = update.mock.calls.map(call => call.arguments[0]);
  assert.equal(insertFilter.symbol, updateFilter.symbol);
  assert.deepEqual(insertFilter.timestamp, updateFilter.timestamp);
  assert.deepEqual(insertFilter.price, { $exists: false });
  assert.equal(updateFilter._id, 'winner');
  assert.equal(updateFilter.price, 299);
  assert.equal(logger.mock.calls[0].arguments[1].existing, 299);
});
