const dayjs = require('dayjs');
const { isMarketOpenToday, normalizeMarket } = require('./calendar.service');
const { MARKETS } = require('../config/markets');
const { MARKET_TIMEZONE, marketDate } = require('../utils/marketTime');
const { PRICE_SYNC_GROUPS, priceSyncGroupOf } = require('../config/priceSync');
const { PRICE_TARGET_MAX_LOOKBACK_DAYS } = require('../constants/cronStatus.constants');

// T12:00:00Z 构造候选日：对 UTC−4…+8 的所有市场都落在同一日历日（ExecPlan D-12）
function isMarketOpenOn(market, dateStr) {
  return isMarketOpenToday(market, new Date(`${dateStr}T12:00:00.000Z`));
}

function syncInstantOf(dateStr, tz, schedule) {
  const hour = String(schedule.hour).padStart(2, '0');
  const minute = String(schedule.minute).padStart(2, '0');
  return dayjs.tz(`${dateStr} ${hour}:${minute}:00`, tz);
}

// 从 dateStr 前一天起逐日回退，找最近开市日（不含 dateStr 本身）
function lastOpenDayBefore(market, dateStr, tz) {
  let cursor = dayjs.tz(dateStr, tz).subtract(1, 'day');
  for (let i = 0; i < PRICE_TARGET_MAX_LOOKBACK_DAYS; i += 1) {
    const candidate = cursor.format('YYYY-MM-DD');
    if (isMarketOpenOn(market, candidate)) return candidate;
    cursor = cursor.subtract(1, 'day');
  }
  return null;
}

/**
 * CN/HK 中午采当日价。US/CA 保留 D-16 的前一开市日口径。
 */
function pickTargetInfo(market, now, tz) {
  const group = priceSyncGroupOf(market) || 'US_CA';
  const todayStr = marketDate(now, tz);
  const calendarPrevOpenDay = lastOpenDayBefore(market, todayStr, tz);
  let todayOpen = false;
  try {
    todayOpen = isMarketOpenOn(market, todayStr);
  } catch (error) {
    todayOpen = false;
  }
  const syncPassed = !dayjs(now).isBefore(syncInstantOf(todayStr, tz, PRICE_SYNC_GROUPS[group]));
  const effectiveSyncDay = todayOpen && syncPassed ? todayStr : calendarPrevOpenDay;
  const targetMarketDate = group === 'CN' || !effectiveSyncDay
    ? effectiveSyncDay
    : lastOpenDayBefore(market, effectiveSyncDay, tz);
  return { todayStr, effectiveSyncDay, targetMarketDate, calendarPrevOpenDay };
}

function marketTimezone(market) {
  const normalized = normalizeMarket(market);
  const config = MARKETS[normalized];
  if (!config) throw new Error(`Unsupported market: ${market}`);
  return config.timezone;
}

// 市场交易日 dateStr 可能落入的 ET 桶日期：US/CA 即当日；CN 因时区领先可落入前一日或当日。
function expectedBucketCandidates(market, dateStr) {
  if (normalizeMarket(market) === 'CN') {
    const marketMidnight = dayjs.tz(dateStr, marketTimezone(market));
    const etDate = marketMidnight.tz(MARKET_TIMEZONE).format('YYYY-MM-DD');
    return [etDate, dayjs(etDate).add(1, 'day').format('YYYY-MM-DD')];
  }
  return [dateStr];
}

module.exports = { isMarketOpenOn, lastOpenDayBefore, pickTargetInfo, marketTimezone, expectedBucketCandidates };
