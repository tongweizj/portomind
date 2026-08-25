"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const historySync = require('../src/tasks/historySync.cjs');

test('historySync 按符号列表抓取并限制并发', async () => {
  let active = 0;
  let maxActive = 0;
  const deps = {
    symbols: ['VOO', 'XEQT.TO', '510300', '159915', '588000'],
    concurrency: 3,
    fetchHistory: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 15));
      active -= 1;
      return [{ price: 1, timestamp: new Date() }];
    },
    saveHistory: async records => records.length
  };

  const results = await historySync(new Date('2026-01-01'), new Date('2026-08-25'), deps);
  assert.equal(results.length, 5);
  assert.ok(maxActive <= 3, `实际最大并发 ${maxActive} 应 <= 3`);
  assert.ok(results.every(result => !result.error));
});

test('historySync 单符号失败不中断其余', async () => {
  const deps = {
    symbols: ['VOO', 'BAD', '510300'],
    concurrency: 2,
    fetchHistory: async symbol => {
      if (symbol === 'BAD') {
        const error = new Error('not found');
        error.category = 'NOT_FOUND';
        error.retryable = false;
        throw error;
      }
      return [{ price: 1, timestamp: new Date() }];
    },
    saveHistory: async records => records.length
  };

  const results = await historySync(new Date('2026-01-01'), new Date('2026-08-25'), deps);
  assert.equal(results.length, 3);
  assert.equal(results.filter(result => result.error).length, 1);
  const failed = results.find(result => result.error);
  assert.equal(failed.symbol, 'BAD');
  assert.equal(failed.error.category, 'NOT_FOUND');
  assert.equal(failed.error.retryable, false);
});

test('未指定 symbols 时使用全部激活资产并传入资产对象', async () => {
  const deps = {
    getActiveAssets: async () => [
      { symbol: 'VOO', market: 'US' },
      { symbol: '510300', market: 'CN-SH' }
    ],
    concurrency: 2,
    fetchHistory: async asset => {
      assert.ok(asset && asset.symbol && asset.market, '应收到资产对象');
      return [{ symbol: asset.symbol, price: 1, timestamp: new Date() }];
    },
    saveHistory: async records => records.length
  };

  const results = await historySync(new Date('2026-01-01'), new Date('2026-08-25'), deps);
  assert.equal(results.length, 2);
  assert.ok(results.every(result => !result.error));
});
