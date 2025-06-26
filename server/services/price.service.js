// services/price.service.js (CommonJS 版)

const Price = require('../models/price');

async function getPricesByDate(dateStr) {
  let startDate, endDate;

  if (dateStr) {
    // 指定日期
    startDate = new Date(`${dateStr}T00:00:00.000Z`);
    endDate = new Date(`${dateStr}T23:59:59.999Z`);
  } else {
    // 默认为今天（UTC 时间）
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    const dateStrToday = `${yyyy}-${mm}-${dd}`;

    startDate = new Date(`${dateStrToday}T00:00:00.000Z`);
    endDate = new Date(`${dateStrToday}T23:59:59.999Z`);
    dateStr = dateStrToday;
  }

  const data = await Price.find({
    timestamp: { $gte: startDate, $lte: endDate }
  }).sort({ symbol: 1 });

  return { date: dateStr, data };
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
  getPricesByDate,
  getPriceById,
  createPrice,
  updatePrice,
  deletePrice,
  getPricesBySymbol,
  getTodayPrices,
};
