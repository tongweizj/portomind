const Price = require('../models/price');
const Asset = require('../models/asset');
const { ASSET_MARKETS } = require('../constants/asset.constants');
const { marketFromSuffix, normalizeSymbol, toStorageSymbol } = require('../utils/symbol');
const { dateBounds, monthBounds, todayString } = require('../utils/marketTime');

function pagedFind(query, { page, pageSize, sort = { timestamp: -1, symbol: 1 } }) {
  return Promise.all([
    Price.countDocuments(query),
    Price.find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
  ]).then(([total, data]) => ({ total, data }));
}

async function getPricesByDate(date, { page = 1, pageSize = 20 } = {}) {
  const { start, end } = dateBounds(date);
  return pagedFind(
    { timestamp: { $gte: start, $lt: end } },
    { page, pageSize, sort: { symbol: 1, timestamp: -1 } }
  );
}

async function getTodayLatest({ page = 1, pageSize = 20, now = new Date() } = {}) {
  const date = todayString(now);
  const { start, end } = dateBounds(date);
  const [result = { metadata: [], data: [] }] = await Price.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    { $sort: { timestamp: -1 } },
    { $group: {
      _id: '$symbol',
      symbol: { $first: '$symbol' },
      name: { $first: '$name' },
      price: { $first: '$price' },
      currency: { $first: '$currency' },
      market: { $first: '$market' },
      timestamp: { $first: '$timestamp' }
    } },
    { $project: { _id: 0, symbol: 1, name: 1, price: 1, currency: 1, market: 1, timestamp: 1 } },
    { $facet: {
      metadata: [{ $count: 'total' }],
      data: [
        { $sort: { symbol: 1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize }
      ]
    } }
  ]);
  return { date, total: result.metadata[0]?.total || 0, data: result.data };
}

function historyTimestampQuery({ year, month, from, to }) {
  if (year !== undefined) {
    if (month !== undefined) return monthBounds(year, month);
    const start = dateBounds(`${year}-01-01`).start;
    const end = dateBounds(`${year + 1}-01-01`).start;
    return { start, end };
  }

  const range = {};
  if (from) range.start = dateBounds(from).start;
  if (to) range.end = dateBounds(to).end;
  return range;
}

async function getPriceHistory(symbol, options = {}) {
  const { page = 1, pageSize = 20 } = options;
  const query = { symbol: normalizeSymbol(symbol) };
  const { start, end } = historyTimestampQuery(options);
  if (start || end) {
    query.timestamp = {};
    if (start) query.timestamp.$gte = start;
    if (end) query.timestamp.$lt = end;
  }
  return pagedFind(query, { page, pageSize, sort: { timestamp: -1 } });
}

const getPriceById = id => Price.findById(id);
async function normalizeManualPrice(data) {
  if (data.symbol == null) return data;

  const symbol = normalizeSymbol(data.symbol);
  let market = normalizeSymbol(data.market) || marketFromSuffix(symbol);
  if (symbol && !market) {
    // market 可省略。裸码只有在资产主数据给出唯一市场时才派生。
    const candidates = [symbol, ...ASSET_MARKETS.map(item => toStorageSymbol(symbol, item))];
    const markets = await Asset.distinct('market', { symbol: { $in: candidates }, market: { $in: ASSET_MARKETS } });
    if (markets.length === 1) market = markets[0];
  }

  return {
    ...data,
    symbol: toStorageSymbol(symbol, market),
    ...(market ? { market } : {})
  };
}

async function createPrice(data) {
  return Price.create(await normalizeManualPrice(data));
}

async function updatePrice(id, data) {
  let update = data;
  if (data.symbol !== undefined || data.market !== undefined) {
    if (data.symbol === undefined || data.market === undefined) {
      const current = await Price.findById(id).select('symbol market').lean();
      if (!current) return null;
      update = { symbol: current.symbol, market: current.market, ...data };
    }
    update = await normalizeManualPrice(update);
  }

  return Price.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
    context: 'query'
  });
}
const deletePrice = id => Price.findByIdAndDelete(id);

module.exports = {
  getPricesByDate,
  getTodayLatest,
  getPriceHistory,
  getPriceById,
  createPrice,
  updatePrice,
  deletePrice
};
