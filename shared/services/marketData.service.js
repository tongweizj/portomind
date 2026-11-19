// server/services/marketData.service.js

/**
 * 批量读取最新价格服务
 * 从 Price 集合中按 symbol 查找最新一条记录（按 date 降序），
 * 并返回 { [symbol]: closePrice|null } 的映射表
 */

const Asset = require('../models/asset');
const Price = require('../models/price');
const { marketFromSuffix, normalizeSymbol, toStorageSymbol } = require('../utils/symbol');
const { logger } = require('../config/logger');
const { MARKETS } = require('../config/markets');
const { isMarketOpenToday, normalizeMarket } = require('./calendar.service');
const { marketDate, todayString } = require('../utils/marketTime');

const STALE_AFTER_TRADING_DAYS = 2;
const DAY_MS = 86_400_000;

async function getLatestPriceRecords(symbols) {
  if (symbols.length === 0) return {};
  const normalizedSymbols = symbols.map(normalizeSymbol);
  const lookupSymbols = [...new Set([...symbols, ...normalizedSymbols])];
  let assets;
  try {
    // 聚合保留原始 symbol 查询值，避免 Mongoose uppercase setter 改写旧键。
    assets = await Asset.aggregate([
      { $match: { symbol: { $in: lookupSymbols } } },
      { $project: { _id: 0, symbol: 1, market: 1 } }
    ]);
  } catch (err) {
    logger.error('PRICE_ASSET_LOOKUP_ERROR', { error: err.message });
    return Object.fromEntries(symbols.map(symbol => [symbol, null]));
  }
  const markets = new Map(assets.map(asset => [asset.symbol, asset.market]));
  const result = Object.fromEntries(symbols.map(symbol => [symbol, null]));

  // 并行从 MongoDB 查询每个 symbol 的最新价格
  await Promise.all(symbols.map(async (symbol, index) => {
    const market = markets.get(symbol) ?? markets.get(normalizedSymbols[index]);
    try {
      // 找到按 date 排序的第一条文档
      const doc = await Price
        .findOne({ symbol: toStorageSymbol(symbol, market) })
        .sort({ timestamp: -1 })
        .lean();

      if (doc && typeof doc.price === 'number') {
        result[symbol] = {
          price: doc.price,
          timestamp: doc.timestamp,
          market: market ?? doc.market ?? marketFromSuffix(symbol)
        };
      } else {
        // 未找到或数据不完整
        result[symbol] = null;
        logger.warn('PRICE_DB_MISSING', { symbol });
      }
    } catch (err) {
      // 查询出错，记录日志并返回 null
      result[symbol] = null;
      logger.error('PRICE_DB_ERROR', { symbol, error: err.message, stack: err.stack });
    }
  }));

  return result;
}

async function getLatestPrices(symbols) {
  const records = await getLatestPriceRecords(symbols);
  return Object.fromEntries(Object.entries(records).map(([symbol, record]) => [symbol, record?.price ?? null]));
}

function priceIsStale(timestamp, market, now) {
  const calendar = MARKETS[normalizeMarket(market)];
  if (!calendar || !timestamp) return null;

  const priceDay = new Date(`${todayString(timestamp)}T12:00:00Z`);
  let day = new Date(`${marketDate(now, calendar.timezone)}T12:00:00Z`);
  let tradingDays = 0;
  while (day > priceDay) {
    if (isMarketOpenToday(market, day) && ++tradingDays > STALE_AFTER_TRADING_DAYS) return true;
    // 以 UTC 中午移动日历标签，避免夏令时造成重复或跳过一天。
    day = new Date(day.getTime() - DAY_MS);
  }
  return false;
}

async function loadKnownMarketRecords(symbols, markets, now) {
  if (!symbols.length) return {};
  const keys = new Map(symbols.map(symbol => [symbol, toStorageSymbol(symbol, markets.get(symbol))]));
  let rows;
  try {
    rows = await Price.aggregate([
      { $match: { symbol: { $in: [...new Set(keys.values())] }, timestamp: { $lte: now } } },
      { $sort: { symbol: 1, timestamp: -1 } },
      { $group: { _id: '$symbol', price: { $first: '$price' }, timestamp: { $first: '$timestamp' } } }
    ]);
  } catch (error) {
    logger.error('PRICE_DETAILS_DB_ERROR', { error: error.message });
    return Object.fromEntries(symbols.map(symbol => [symbol, null]));
  }
  const prices = new Map(rows.map(row => [row._id, row]));
  return Object.fromEntries(symbols.map(symbol => {
    const row = prices.get(keys.get(symbol));
    return [symbol, typeof row?.price === 'number'
      ? { price: row.price, timestamp: row.timestamp, market: markets.get(symbol) }
      : null];
  }));
}

async function getLatestPriceDetails(symbols, { now = new Date(), markets } = {}) {
  const records = markets
    ? await loadKnownMarketRecords(symbols, markets, now)
    : await getLatestPriceRecords(symbols);
  return Object.fromEntries(Object.entries(records).map(([symbol, record]) => {
    if (!record) return [symbol, null];
    const timestamp = record.timestamp instanceof Date && Number.isFinite(record.timestamp.getTime())
      ? record.timestamp
      : null;
    return [symbol, { price: record.price, timestamp, stale: priceIsStale(timestamp, record.market, now) }];
  }));
}

module.exports = { getLatestPrices, getLatestPriceDetails, STALE_AFTER_TRADING_DAYS };
