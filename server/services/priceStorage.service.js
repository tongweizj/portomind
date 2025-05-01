// server/services/priceStorage.service.js

const Price = require('../models/price');

/**
 * 存储最新价：对同 symbol + 当日 做 upsert
 */
exports.saveLatest = async function(data) {
  const dayStart = new Date(data.timestamp);
  dayStart.setHours(0,0,0,0);
  await Price.findOneAndUpdate(
    { symbol: data.symbol, timestamp: { $gte: dayStart } },
    data,
    { upsert: true }
  );
};

/**
 * 批量存储历史价：bulkWrite 去重
 */
exports.saveHistory = async function(records) {
  if (!records.length) return;
  const ops = records.map(rec => ({
    updateOne: {
      filter: { symbol: rec.symbol, timestamp: rec.timestamp },
      update: rec,
      upsert: true
    }
  }));
  await Price.bulkWrite(ops);
};
