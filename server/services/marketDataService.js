// server/services/marketDataService.js

/**
 * 批量读取最新价格服务
 * 从 Price 集合中按 symbol 查找最新一条记录（按 date 降序），
 * 并返回 { [symbol]: closePrice|null } 的映射表
 */

const Price = require('../models/price');
const { logger } = require('../config/logger');

async function getLatestPrices(symbols) {
  const result = {};

  // 并行从 MongoDB 查询每个 symbol 的最新价格
  await Promise.all(symbols.map(async (symbol) => {
    try {
      // 找到按 date 排序的第一条文档
      const doc = await Price
        .findOne({ symbol })
        .sort({ timestamp: -1 })
        .lean();

        console.log("doc:",doc)

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
