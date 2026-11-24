// shared/services/priceCoverage.service.js
//
// TASK-068：逐资产「目标市场日 + 最近 N 个市场日」的价格覆盖计算。
// 该口径原先只存在于 assetIntegrity.service 的私有函数中；运维中心资产总表
// 需要同一口径判断今日价格与有效性，因此抽到此单一实现，禁止再写第二份。

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const Price = require('../models/price');
const { PRICE_TARGET_MAX_LOOKBACK_DAYS } = require('../constants/cronStatus.constants');
const { marketDate, dateBounds, MARKET_TIMEZONE } = require('../utils/marketTime');
const {
  pickTargetInfo,
  lastOpenDayBefore,
  expectedBucketCandidates,
  isMarketOpenOn
} = require('./marketDay.service');

const MARKET_DAY_COUNT = 3;

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

// 窗口内任一日有价即视为有覆盖；与 asset-integrity-check 的 PRICE_EMPTY_3_MARKET_DAYS 同口径。
function anyPriceInWindow(window, pricedDays) {
  if (!window || !pricedDays) return false;
  return [...window.buckets].some((day) => pricedDays.has(day));
}

module.exports = {
  MARKET_DAY_COUNT,
  priceWindow,
  loadPrices,
  pricedDaysBySymbol,
  matchedPriceDate,
  anyPriceInWindow
};
