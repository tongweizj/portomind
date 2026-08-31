// cron-worker/src/services/calendar.service.js
// 交易日历校验：判断某市场在指定日期是否开市（排除周末与法定节假日）。
// US/CA 节假日按规则计算（周几 + 复活节 + 周末顺延，可覆盖任意年份）；
// CN/HK 节假日依赖农历与官方公告，闭市日静态表见 src/config/markets.js，需逐年维护。
// CN/HK 年份未在表中维护时打 warn（每 (market, year) 一次），避免「无节假日」被静默当作全开市。

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { MARKETS, CN_HOLIDAYS, HK_HOLIDAYS } = require('../config/markets');
const { logger } = require('../config/logger');

dayjs.extend(utc);
dayjs.extend(timezone);

function normalizeMarket(market) {
  const normalized = String(market || '').trim().toUpperCase();
  if (normalized === 'CN-SH' || normalized === 'CN-SZ' || normalized === 'CN-FUND') return 'CN';
  return normalized;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function isWeekend(date, timeZone) {
  const day = dayjs(date).tz(timeZone).day();
  return day === 0 || day === 6;
}

// 第 nth 个星期 weekday（0=周日…6=周六）的日期。
function nthWeekday(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

// 某月最后一个星期 weekday。
function lastWeekday(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, lastDay));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, lastDay - offset));
}

// 复活节（Anonymous Gregorian algorithm）。
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// 美国（NYSE/NASDAQ）周末顺延：周六 → 前移周五，周日 → 顺延周一。
function observedUS(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay();
  if (day === 0) return toDateStr(addDays(date, 1));
  if (day === 6) return toDateStr(addDays(date, -1));
  return dateStr;
}

// 加拿大（TSX）周末顺延：周六/周日 → 顺延周一。
function observedCA(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return toDateStr(addDays(date, 1));
  return dateStr;
}

// 维多利亚日：5 月 25 日之前的那个周一。
function victoriaDay(year) {
  const may25 = new Date(Date.UTC(year, 4, 25));
  const diff = (may25.getUTCDay() - 1 + 7) % 7;
  return toDateStr(addDays(may25, diff === 0 ? -7 : -diff));
}

// 美股闭市日（NYSE 休市）。
function usHolidays(year) {
  return new Set([
    observedUS(`${year}-01-01`),                        // New Year's Day
    toDateStr(nthWeekday(year, 0, 1, 3)),               // MLK Day
    toDateStr(nthWeekday(year, 1, 1, 3)),               // Presidents' Day
    toDateStr(addDays(easterSunday(year), -2)),         // Good Friday
    toDateStr(lastWeekday(year, 4, 1)),                 // Memorial Day
    observedUS(`${year}-06-19`),                        // Juneteenth
    observedUS(`${year}-07-04`),                        // Independence Day
    toDateStr(nthWeekday(year, 8, 1, 1)),               // Labor Day
    toDateStr(nthWeekday(year, 10, 4, 4)),              // Thanksgiving
    observedUS(`${year}-12-25`)                         // Christmas
  ]);
}

// 加股闭市日（TSX 休市）。
function caHolidays(year) {
  return new Set([
    observedCA(`${year}-01-01`),                        // New Year's Day
    toDateStr(addDays(easterSunday(year), -2)),         // Good Friday
    victoriaDay(year),                                  // Victoria Day
    observedCA(`${year}-07-01`),                        // Canada Day
    toDateStr(nthWeekday(year, 8, 1, 1)),               // Labour Day
    observedCA(`${year}-09-30`),                        // National Day for Truth and Reconciliation
    toDateStr(nthWeekday(year, 9, 1, 2)),               // Thanksgiving
    observedCA(`${year}-12-25`),                        // Christmas
    observedCA(`${year}-12-26`)                         // Boxing Day
  ]);
}

const warnedYears = new Set();

// CN/HK 闭市日表：未维护年份按空表处理并告警（每 (label, year) 一次），避免静默高估交易日。
// 事件名沿用各市场既有约定：CN_HOLIDAYS_YEAR_NOT_MAINTAINED / HK_HOLIDAYS_YEAR_NOT_MAINTAINED。
function staticHolidaysFor(table, label, eventName, year) {
  const closed = table[year];
  if (!closed) {
    const key = `${label}:${year}`;
    if (!warnedYears.has(key)) {
      warnedYears.add(key);
      logger.warn(eventName, {
        year,
        market: label,
        message: `${label}节假日闭市表未维护 ${year} 年，将按无节假日判定，理论交易日可能被高估`
      });
    }
    return [];
  }
  return closed;
}

// 判断 market（US / CA / CN* / HK）在 date（默认当天，按市场时区解释）是否为交易日。
function isMarketOpenToday(market, date = new Date()) {
  const normalized = normalizeMarket(market);
  const config = MARKETS[normalized];
  if (!config) throw new Error(`Unsupported market: ${market}`);

  const marketDay = dayjs(date).tz(config.timezone);
  const dateStr = marketDay.format('YYYY-MM-DD');
  const year = marketDay.year();

  if (isWeekend(date, config.timezone)) return false;

  if (normalized === 'CN') {
    const closed = staticHolidaysFor(CN_HOLIDAYS, 'CN', 'CN_HOLIDAYS_YEAR_NOT_MAINTAINED', year);
    return !closed.includes(dateStr);
  }

  if (normalized === 'HK') {
    const closed = staticHolidaysFor(HK_HOLIDAYS, 'HK', 'HK_HOLIDAYS_YEAR_NOT_MAINTAINED', year);
    return !closed.includes(dateStr);
  }

  const holidays = normalized === 'US' ? usHolidays(year) : caHolidays(year);
  return !holidays.has(dateStr);
}

module.exports = { isMarketOpenToday, normalizeMarket, easterSunday };
