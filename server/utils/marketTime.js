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

function todayString(now = new Date()) {
  return dayjs(now).tz(MARKET_TIMEZONE).format('YYYY-MM-DD');
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
  todayString,
  canonicalDayTimestamp
};
