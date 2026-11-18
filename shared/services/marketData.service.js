// server/services/marketData.service.js

/**
 * 批量读取最新价格服务
 * 从 Price 集合中按 symbol 查找最新一条记录（按 date 降序），
 * 并返回 { [symbol]: closePrice|null } 的映射表
 */

const Asset = require('../models/asset');
const Price = require('../models/price');
const { normalizeSymbol, toStorageSymbol } = require('../utils/symbol');
const { logger } = require('../config/logger');

async function getLatestPrices(symbols) {
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
        result[symbol] = doc.price;
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

module.exports = { getLatestPrices };
