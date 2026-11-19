const Price = require('../models/price');
const { taskLogger } = require('../config/logger');
const { toStorageSymbol } = require('../utils/symbol');
const { canonicalDayTimestamp } = require('../utils/marketTime');

function normalizeDailyRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Price record is required');
  return {
    ...record,
    symbol: toStorageSymbol(record.symbol, record.market),
    timestamp: canonicalDayTimestamp(record.timestamp || new Date())
  };
}

async function saveLatest(record, context = {}) {
  const data = normalizeDailyRecord(record);
  const key = { symbol: data.symbol, timestamp: data.timestamp };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const previous = await Price.findOne(key, { price: 1 }).lean();
    // 条件更新确保记录的旧价确实是这次覆盖的值，并发变更时重新读取。
    const filter = { ...key, price: previous?.price === undefined ? { $exists: false } : previous.price };
    if (previous) filter._id = previous._id;
    let saved;
    try {
      saved = await Price.findOneAndUpdate(filter, { $set: data }, {
        upsert: !previous, new: true, runValidators: true, setDefaultsOnInsert: true
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      continue;
    }
    if (!saved) continue;

    const audit = {
      symbol: data.symbol, timestamp: data.timestamp.toISOString(), market: data.market,
      trigger: context.trigger, marketGroup: context.marketGroup, batch: context.runKey,
      writtenAt: new Date().toISOString()
    };
    taskLogger.info('PRICE_UPSERT_PREVIOUS', { ...audit, existing: previous?.price ?? null });
    taskLogger.info('PRICE_UPSERTED', { ...audit, price: data.price, overwritten: Boolean(previous) });
    return saved;
  }
  throw new Error(`Price changed repeatedly during upsert: ${data.symbol} ${data.timestamp.toISOString()}`);
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
