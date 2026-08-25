"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const { syncActiveAssetPrices, marketDate } = require('../src/tasks/dailySync');

test('syncActiveAssetPrices 区分开市/休市/失败三类资产', async () => {
  const assets = [
    { symbol: 'VOO', market: 'US' },
    { symbol: 'XEQT.TO', market: 'CA' },
    { symbol: '510300', market: 'CN-SH' }
  ];
  const deps = {
    getActiveAssets: async () => assets,
    isMarketOpenToday: market => market !== 'CA', // 仅 CA 休市
    fetchLatest: async asset => {
      if (asset.symbol === '510300') {
        const error = new Error('upstream boom');
        error.category = 'UPSTREAM';
        error.retryable = true;
        throw error;
      }
      return { symbol: asset.symbol, price: 1, currency: 'USD', market: asset.market, timestamp: new Date() };
    },
    saveLatest: async record => record
  };

  const summary = await syncActiveAssetPrices(deps);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.successCount, 1); // VOO
  assert.equal(summary.skippedCount, 1); // XEQT.TO（CA 休市）
  assert.equal(summary.failureCount, 1); // 510300
  assert.equal(summary.failures[0].item, '510300');
  assert.equal(summary.failures[0].category, 'UPSTREAM');
  assert.equal(summary.failures[0].retryable, true);
});

test('marketDate 按 SCHEDULER_TIMEZONE 归一化', () => {
  assert.equal(marketDate(new Date('2026-08-25T02:00:00Z'), 'America/Toronto'), '2026-08-24');
  assert.equal(marketDate(new Date('2026-08-25T12:00:00Z'), 'America/Toronto'), '2026-08-25');
});
