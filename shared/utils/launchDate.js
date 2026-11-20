const { isDateString, todayString } = require('./marketTime');

function launchDateFromDay(day, now = new Date()) {
  if (typeof day !== 'string' || !isDateString(day) || day > todayString(now)) return null;
  // UTC 正午在所有受支持市场仍是同一个自然日，完整性任务按市场时区读回时不会偏一天。
  return new Date(`${day}T12:00:00.000Z`);
}

module.exports = { launchDateFromDay };
