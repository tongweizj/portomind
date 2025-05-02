// services/price.service.js (CommonJS 版)

const Price = require('../models/price');

async function getAllPrices() {
  return await Price.find().sort({ timestamp: -1 });
}

async function getPriceById(id) {
  return await Price.findById(id);
}

/**
 * 查询所有资产今天的最新价格
 * @returns {Promise<Array<{ symbol, price, currency, market, timestamp }>>}
 */
async function getTodayPrices() {
  // 1. 计算今天的起止时间（东部时区）
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(start);
  end.setDate(end.getDate() + 1);

  // 2. 聚合：按 symbol 取 timestamp 最大的一条记录
  const docs = await Price.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    { $sort: { timestamp: -1 } },
    { $group: {
        _id: '$symbol',
        symbol:        { $first: '$symbol' },
        price:         { $first: '$price' },
        currency:      { $first: '$currency' },
        market:        { $first: '$market' },
        timestamp:     { $first: '$timestamp' }
    }},
    { $project: {
        _id: 0,
        symbol:    1,
        price:     1,
        currency:  1,
        market:    1,
        timestamp: 1
    }}
  ]);

  return docs;
}


async function createPrice(data) {
  return await Price.create(data);
}

async function updatePrice(id, data) {
  return await Price.findByIdAndUpdate(id, data, { new: true });
}

async function deletePrice(id) {
  return await Price.findByIdAndDelete(id);
}

// 按 symbol 查询
async function getPricesBySymbol(symbol) {
  return await Price.find({ symbol }).sort({ timestamp: -1 });
}

module.exports = {
  getAllPrices,
  getPriceById,
  createPrice,
  updatePrice,
  deletePrice,
  getPricesBySymbol,
  getTodayPrices,
};
