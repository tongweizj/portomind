// shared/services/priceCoverage.service.js
//
// TASK-068：逐资产「目标市场日 + 最近 N 个市场日」的价格覆盖计算。
// TASK-068 从已退休的 assetIntegrity.service 抽出；运维中心资产总表使用这一份
// 目标市场日/窗口口径，禁止再写第二份。

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const Price = require('../models/price');
const { normalizeMarket } = require('./calendar.service');
const { toStorageSymbol } = require('../utils/symbol');
const { PRICE_TARGET_MAX_LOOKBACK_DAYS } = require('../constants/cronStatus.constants');
const { marketDate, dateBounds, MARKET_TIMEZONE } = require('../utils/marketTime');
const {
  pickTargetInfo,
  lastOpenDayBefore,
  expectedBucketCandidates,
  isMarketOpenOn,
  marketTimezone
} = require('./marketDay.service');

const MARKET_DAY_COUNT = 3;
const MAX_MISSING_RANGES = 20;

// 目标市场日 + 其前（MARKET_DAY_COUNT - 1）个开市日；buckets 兼容 CN 价格跨 ET 日入桶。
function priceWindow(market, now, tz) {
  const { targetMarketDate } = pickTargetInfo(market, now, tz);
  const dates = [];
  if (targetMarketDate) {
    const lower = dayjs.utc(targetMarketDate)
      .subtract(PRICE_TARGET_MAX_LOOKBACK_DAYS - 1, 'day').format('YYYY-MM-DD');
    let date = targetMarketDate;
    while (date && date >= lower && dates.length < MARKET_DAY_COUNT) {
      dates.push(date);
      if (dates.length < MARKET_DAY_COUNT) date = lastOpenDayBefore(market, date, tz);
    }
  }
  const buckets = new Set(dates);
  for (const date of dates) {
    for (const candidate of expectedBucketCandidates(market, date)) {
      // 窗外开市日的桶可能是它自己的价格。只有休市日的旧桶可无歧义归给窗口。
      if (!buckets.has(candidate) && !isMarketOpenOn(market, candidate)) buckets.add(candidate);
    }
  }
  return { dates, buckets };
}

async function loadPrices(symbols, buckets) {
  if (!symbols.length || !buckets.size) return [];
  return Price.find({
    symbol: { $in: symbols },
    $or: [...buckets].map((day) => {
      const { start, end } = dateBounds(day);
      return { timestamp: { $gte: start, $lt: end } };
    })
  }).select('symbol price timestamp').lean();
}

// symbol → 有价的 MARKET_TIMEZONE 入桶日期集合；无效价格/时间戳一律忽略。
function pricedDaysBySymbol(prices) {
  const pricedDays = new Map();
  for (const { symbol, price, timestamp } of prices) {
    if (!Number.isFinite(price) || !(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) continue;
    if (!pricedDays.has(symbol)) pricedDays.set(symbol, new Set());
    pricedDays.get(symbol).add(marketDate(timestamp, MARKET_TIMEZONE));
  }
  return pricedDays;
}

// 某市场日「有价」：任一候选入桶日命中即算（与 price-integrity-check 的 countAsset 同口径）。
function matchedPriceDate(pricedDays, market, date) {
  if (!pricedDays) return null;
  return expectedBucketCandidates(market, date).find((candidate) => pricedDays.has(candidate)) || null;
}

// 窗口内任一日有价即视为有覆盖；与资产完整性的“最近 3 个市场日全空”判定同口径。
function anyPriceInWindow(window, pricedDays) {
  if (!window || !pricedDays) return false;
  return [...window.buckets].some((day) => pricedDays.has(day));
}


// 市场本地日期串；launchDate 可能带时间分量。
function marketLocalDate(value, market) {
  return dayjs(value).tz(marketTimezone(market)).format('YYYY-MM-DD');
}

// 最近一个已完成的目标市场日（不是市场本地自然日）。
function targetMarketDay(market, now, tz = MARKET_TIMEZONE) {
  return pickTargetInfo(market, now, tz).targetMarketDate;
}

// [from, to] 内按市场交易日历应有的开市日。
function expectedTradingDates(market, from, to) {
  const tz = marketTimezone(market);
  const dates = [];
  let cursor = dayjs.tz(from, tz);
  const end = dayjs.tz(to, tz);
  while (cursor.isBefore(end, 'day') || cursor.isSame(end, 'day')) {
    const date = cursor.format('YYYY-MM-DD');
    if (isMarketOpenOn(market, date)) dates.push(date);
    cursor = cursor.add(1, 'day');
  }
  return dates;
}

async function storedBucketDates(symbol, from, to, PriceModel = Price) {
  const { start } = dateBounds(from);
  const { end } = dateBounds(to);
  const docs = await PriceModel.find(
    { symbol, timestamp: { $gte: start, $lt: end } },
    { timestamp: 1, _id: 0 }
  ).lean();
  return docs.map((doc) => marketDate(doc.timestamp, MARKET_TIMEZONE));
}

// 逐资产覆盖：actual 只统计匹配应有交易日的有效记录，不是原始桶数量。
async function countAssetCoverage(asset, from, to, dependencies = {}) {
  const market = asset.market;
  const expectedFn = dependencies.expectedTradingDates || expectedTradingDates;
  const storedFn = dependencies.storedBucketDates || storedBucketDates;
  const lower = normalizeMarket(market) === 'CN'
    ? dayjs.utc(from).subtract(1, 'day').format('YYYY-MM-DD')
    : from;

  const [expectedDates, storedDates] = await Promise.all([
    expectedFn(market, from, to),
    storedFn(toStorageSymbol(asset.symbol, market), lower, to)
  ]);
  const storedSet = new Set(storedDates);
  const matchedDates = expectedDates.filter((date) =>
    expectedBucketCandidates(market, date).some((candidate) => storedSet.has(candidate))
  );
  const matchedSet = new Set(matchedDates);
  const missingDates = expectedDates.filter((date) => !matchedSet.has(date));
  const expectedCount = expectedDates.length;
  const actualCount = matchedDates.length;
  const missingCount = missingDates.length;

  return {
    expectedDates,
    matchedDates,
    missingDates,
    expectedCount,
    actualCount,
    missingCount,
    completenessRatio: expectedCount > 0 ? actualCount / expectedCount : null
  };
}

function groupMissingRanges(missingDates, mergeDays = 3) {
  if (!missingDates.length) return [];
  const sorted = [...missingDates].sort();
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    if (dayjs(sorted[index]).diff(dayjs(prev), 'day') <= mergeDays) {
      prev = sorted[index];
    } else {
      ranges.push({ from: start, to: prev });
      start = sorted[index];
      prev = sorted[index];
    }
  }
  ranges.push({ from: start, to: prev });
  return ranges;
}

// 有界缺失区间：合并后最多 MAX_MISSING_RANGES 个，超出截断并标记。
function boundedMissingRanges(missingDates, mergeDays = 3, maxRanges = MAX_MISSING_RANGES) {
  const ranges = groupMissingRanges(missingDates, mergeDays);
  return {
    ranges: ranges.slice(0, maxRanges),
    truncated: ranges.length > maxRanges
  };
}

function clipRepairRanges(missingRanges, to, repairMaxDays) {
  if (!Number.isInteger(repairMaxDays) || repairMaxDays <= 0) {
    return { repairable: [], deferred: missingRanges };
  }
  const cutoff = dayjs(to).subtract(repairMaxDays, 'day').format('YYYY-MM-DD');
  const repairable = [];
  const deferred = [];
  for (const range of missingRanges) {
    const from = range.from < cutoff ? cutoff : range.from;
    if (from <= range.to) repairable.push({ from, to: range.to });
    else deferred.push(range);
  }
  return { repairable, deferred };
}

module.exports = {
  MARKET_DAY_COUNT,
  MAX_MISSING_RANGES,
  marketLocalDate,
  targetMarketDay,
  expectedTradingDates,
  storedBucketDates,
  countAssetCoverage,
  groupMissingRanges,
  boundedMissingRanges,
  clipRepairRanges,
  priceWindow,
  loadPrices,
  pricedDaysBySymbol,
  matchedPriceDate,
  anyPriceInWindow
};
