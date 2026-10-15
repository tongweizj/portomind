// cron-worker/src/utils/marketTime.js
// 与 ../server/utils/marketTime.js 逐字节一致：价格日期的 MARKET_TIMEZONE 规范化，
// 确保与 server 已写入的历史价格保持同一日期边界。

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const MARKET_TIMEZONE = process.env.MARKET_TIMEZONE || 'America/Toronto';

try {
  new Intl.DateTimeFormat('en-US', { timeZone: MARKET_TIMEZONE }).format();
} catch {
  throw new Error(`Invalid MARKET_TIMEZONE: ${MARKET_TIMEZONE}`);
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  return dayjs.tz(value, MARKET_TIMEZONE).format('YYYY-MM-DD') === value;
}

function dateBounds(date) {
  if (!isDateString(date)) throw new Error('Invalid date format. Use YYYY-MM-DD.');
  const start = dayjs.tz(date, MARKET_TIMEZONE).startOf('day');
  const nextDate = dayjs.utc(`${date}T00:00:00Z`).add(1, 'day').format('YYYY-MM-DD');
  const end = dayjs.tz(nextDate, MARKET_TIMEZONE).startOf('day');
  return { start: start.utc().toDate(), end: end.utc().toDate() };
}

function monthBounds(year, month) {
  const value = `${year}-${String(month).padStart(2, '0')}-01`;
  if (!Number.isInteger(year) || year < 1970 || year > 9999 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid year/month.');
  }
  const start = dayjs.tz(value, MARKET_TIMEZONE).startOf('month');
  const nextMonth = dayjs.utc(`${value}T00:00:00Z`).add(1, 'month').format('YYYY-MM-DD');
  const end = dayjs.tz(nextMonth, MARKET_TIMEZONE).startOf('month');
  return { start: start.utc().toDate(), end: end.utc().toDate() };
}

// 时区日期字符串：date（UTC 时间点）按 timeZone 解释为 YYYY-MM-DD。
// 默认时区遵循「调度时区优先，其次 MARKET_TIMEZONE，最后 America/Toronto」（与任务 runKey 语义一致）。
function marketDate(date = new Date(), timeZone = process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

// MARKET_TIMEZONE 语义下的「今天」，即 marketDate 的 MARKET_TIMEZONE 特例。
function todayString(now = new Date()) {
  return marketDate(now, MARKET_TIMEZONE);
}

function canonicalDayTimestamp(value) {
  const date = dayjs(value);
  if (!date.isValid()) throw new Error('Invalid price timestamp');
  const marketDate = date.tz(MARKET_TIMEZONE).format('YYYY-MM-DD');
  return dateBounds(marketDate).start;
}

module.exports = {
  MARKET_TIMEZONE,
  isDateString,
  dateBounds,
  monthBounds,
  marketDate,
  todayString,
  canonicalDayTimestamp
};
