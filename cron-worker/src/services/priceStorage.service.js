// cron-worker/src/services/priceStorage.service.js
// 价格入库：saveLatest（单条 upsert）与 saveHistory（批量 bulkWrite upsert）。
// 依赖 Price 的 (symbol, timestamp) 唯一索引：同一 ETF 同一天重复写入只会更新，不会产生重复记录。
// 与 ../server/services/priceStorage.service.js 行为一致。

const Price = require('../models/price');
const { canonicalDayTimestamp } = require('../utils/marketTime');

function normalizeDailyRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Price record is required');
  return {
    ...record,
    symbol: String(record.symbol || '').trim().toUpperCase(),
    timestamp: canonicalDayTimestamp(record.timestamp || new Date())
  };
}

async function saveLatest(record) {
  const data = normalizeDailyRecord(record);
  try {
    return await Price.findOneAndUpdate(
      { symbol: data.symbol, timestamp: data.timestamp },
      { $set: data },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // 并发 upsert 竞态由唯一索引兜底；冲突后更新已存在记录。
    if (error.code !== 11000) throw error;
    return Price.findOneAndUpdate(
      { symbol: data.symbol, timestamp: data.timestamp },
      { $set: data },
      { new: true, runValidators: true }
    );
  }
}

async function saveHistory(records) {
  if (!Array.isArray(records)) throw new Error('Price history must be an array');
  if (records.length === 0) return { matchedCount: 0, upsertedCount: 0 };
  const uniqueRecords = new Map();
  for (const record of records) {
    const data = normalizeDailyRecord(record);
    uniqueRecords.set(`${data.symbol}:${data.timestamp.toISOString()}`, data);
  }
  const operations = [...uniqueRecords.values()].map(data => ({
    updateOne: {
      filter: { symbol: data.symbol, timestamp: data.timestamp },
      update: { $set: data },
      upsert: true
    }
  }));
  return Price.bulkWrite(operations, { ordered: false });
}

module.exports = { saveLatest, saveHistory, normalizeDailyRecord };
