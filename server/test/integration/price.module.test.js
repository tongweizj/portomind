const test = require('node:test');
const assert = require('node:assert/strict');

const Price = require('../../models/price');
const storage = require('../../services/priceStorage.service');
const priceService = require('../../services/price.service');
const tiantianFetcher = require('../../services/fetchers/tiantianFetcher');
const priceFetch = require('../../services/priceFetch.service');
const { dateBounds } = require('../../utils/marketTime');
const { withMarketDataTimeout } = require('../../services/fetchers/timeout');
const { MARKET_DATA_ERROR, classifyMarketDataError } = require('../../services/fetchers/errors');

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

test('saveLatest 将同一市场日规范为相同唯一键', async () => {
  const filters = [];
  Price.findOneAndUpdate = async filter => {
    filters.push(filter);
    return filter;
  };

  await storage.saveLatest({ symbol: 'vti', price: 300, timestamp: new Date('2026-08-24T14:00:00Z') });
  await storage.saveLatest({ symbol: 'VTI', price: 301, timestamp: new Date('2026-08-24T19:00:00Z') });

  assert.equal(filters[0].symbol, 'VTI');
  assert.equal(filters[0].timestamp.toISOString(), filters[1].timestamp.toISOString());
});

test('saveHistory 在 bulkWrite 前合并重复日记录', async () => {
  let operations;
  Price.bulkWrite = async value => { operations = value; return {}; };
  await storage.saveHistory([
    { symbol: 'VTI', price: 300, timestamp: new Date('2026-08-24T12:00:00Z') },
    { symbol: 'vti', price: 301, timestamp: new Date('2026-08-24T18:00:00Z') }
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
