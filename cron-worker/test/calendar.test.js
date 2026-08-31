"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const { isMarketOpenToday, easterSunday } = require('../src/services/calendar.service');
const { logger } = require('../src/config/logger');

test('复活节计算：已知年份', () => {
  assert.equal(easterSunday(2024).toISOString().slice(0, 10), '2024-03-31');
  assert.equal(easterSunday(2025).toISOString().slice(0, 10), '2025-04-20');
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
});

test('周末全部市场闭市', () => {
  assert.equal(isMarketOpenToday('US', '2024-08-25'), false); // 周日
  assert.equal(isMarketOpenToday('CA', '2024-08-24'), false); // 周六
  assert.equal(isMarketOpenToday('CN', '2024-08-25'), false); // 周日
});

test('美股法定节假日闭市', () => {
  for (const date of [
    '2024-01-15', '2024-03-29', '2024-05-27', '2024-06-19',
    '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25'
  ]) {
    assert.equal(isMarketOpenToday('US', date), false, `${date} 应为美股休市日`);
  }
});

test('美股周末顺延（observed）', () => {
  assert.equal(isMarketOpenToday('US', '2021-07-05'), false); // 独立日(周日)顺延周一
  assert.equal(isMarketOpenToday('US', '2020-07-03'), false); // 独立日(周六)前移周五
});

test('美股普通工作日开市', () => {
  assert.equal(isMarketOpenToday('US', '2024-08-26'), true);
  assert.equal(isMarketOpenToday('US', '2024-07-05'), true); // 独立日次日
});

test('加股法定节假日闭市', () => {
  for (const date of [
    '2024-01-01', '2024-03-29', '2024-05-20', '2024-07-01',
    '2024-09-02', '2024-09-30', '2024-10-14', '2024-12-25', '2024-12-26'
  ]) {
    assert.equal(isMarketOpenToday('CA', date), false, `${date} 应为加股休市日`);
  }
  assert.equal(isMarketOpenToday('CA', '2024-08-05'), true); // Civic Holiday TSX 不休市
});

test('A 股节假日闭市（静态表）', () => {
  for (const date of [
    '2024-01-01', '2024-02-09', '2024-05-01', '2024-10-01', '2024-10-07',
    '2025-01-28', '2025-10-01', '2026-01-01', '2026-09-25'
  ]) {
    assert.equal(isMarketOpenToday('CN', date), false, `${date} 应为 A 股休市日`);
  }
  assert.equal(isMarketOpenToday('CN-SH', '2024-10-01'), false);
  assert.equal(isMarketOpenToday('CN-SZ', '2024-10-01'), false);
});

test('A 股普通工作日开市', () => {
  assert.equal(isMarketOpenToday('CN', '2024-08-26'), true);
  assert.equal(isMarketOpenToday('CN', '2024-10-08'), true); // 2024 国庆假期之后首个工作日
});

test('港股法定节假日闭市（静态表，AS-08）', () => {
  for (const date of [
    '2024-01-01',                                   // 元旦
    '2024-02-12', '2024-02-13',                     // 农历新年
    '2024-03-29', '2024-04-01',                     // 耶稣受难节 / 复活节星期一
    '2024-04-04',                                   // 清明
    '2024-05-15',                                   // 佛诞
    '2024-06-10',                                   // 端午
    '2024-07-01',                                   // 特区成立纪念日
    '2024-09-18',                                   // 中秋翌日
    '2024-10-01', '2024-10-11',                     // 国庆 / 重阳
    '2024-12-25', '2024-12-26',                     // 圣诞 / 圣诞翌日
    '2025-01-29', '2025-01-30', '2025-01-31',       // 2025 农历新年（初一至初三）
    '2025-10-07',                                   // 2025 中秋翌日
    '2026-02-17', '2026-02-18', '2026-02-19',       // 2026 农历新年
    '2026-04-03', '2026-06-19', '2026-10-01'        // 2026 耶稣受难节 / 端午 / 国庆
  ]) {
    assert.equal(isMarketOpenToday('HK', date), false, `${date} 应为港股休市日`);
  }
});

test('港股普通工作日开市', () => {
  assert.equal(isMarketOpenToday('HK', '2024-08-26'), true);
  assert.equal(isMarketOpenToday('HK', '2024-02-14'), true);   // 2024 农历新年假期之后首个工作日
  assert.equal(isMarketOpenToday('HK', '2025-05-06'), true);   // 2025 佛诞之后首个工作日
  // 中秋翌日（9/18）之外的中秋当周交易日正常开市
  assert.equal(isMarketOpenToday('HK', '2024-09-17'), true);
});

test('CN 未维护年份：按工作日判定并告警一次', () => {
  const originalWarn = logger.warn;
  const warns = [];
  logger.warn = (...args) => warns.push(args);

  try {
    // 2027 不在 CN_HOLIDAYS 表中：周一按开市处理，但必须产生告警，且同一年只告警一次
    assert.equal(isMarketOpenToday('CN', '2027-01-04'), true);
    assert.equal(isMarketOpenToday('CN', '2027-01-05'), true);
    assert.equal(isMarketOpenToday('CN', '2027-10-01'), true); // 实际应为国庆，仅示例未维护后果
    assert.equal(isMarketOpenToday('CN-SH', '2027-01-04'), true);

    const relevant = warns.filter(args => args[0] === 'CN_HOLIDAYS_YEAR_NOT_MAINTAINED');
    assert.equal(relevant.length, 1, '同一年应只告警一次');
    assert.equal(relevant[0][1].year, 2027);
    assert.equal(relevant[0][1].market, 'CN');
  } finally {
    logger.warn = originalWarn;
  }
});

test('不支持的市场抛错', () => {
  assert.throws(() => isMarketOpenToday('JP', '2024-08-26'), /Unsupported market/);
});

test('HK 未维护年份：按工作日判定并告警一次', () => {
  const originalWarn = logger.warn;
  const warns = [];
  logger.warn = (...args) => warns.push(args);

  try {
    // 2027 不在 HK_HOLIDAYS 表中：工作日按开市处理，但必须产生告警，且同一年只告警一次
    assert.equal(isMarketOpenToday('HK', '2027-01-04'), true);
    assert.equal(isMarketOpenToday('HK', '2027-01-05'), true);
    assert.equal(isMarketOpenToday('HK', '2027-10-01'), true); // 实际应为国庆休市，仅示例未维护后果

    const relevant = warns.filter(args => args[0] === 'HK_HOLIDAYS_YEAR_NOT_MAINTAINED');
    assert.equal(relevant.length, 1, '同一年应只告警一次');
    assert.equal(relevant[0][1].year, 2027);
    assert.equal(relevant[0][1].market, 'HK');
  } finally {
    logger.warn = originalWarn;
  }
});
