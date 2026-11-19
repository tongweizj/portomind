"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const dailySync = require('../src/tasks/dailySync');
const { syncActiveAssetPrices, marketDate } = dailySync;
const TaskRun = require('@portomind/shared/models/taskRun');
const { dateBounds, canonicalDayTimestamp } = require('@portomind/shared/utils/marketTime');
const tiantian = require('@portomind/shared/fetchers/tiantianFetcher');

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

test('同日两组使用独立 runKey 并顺序入锁，手动入口继续全量处理', async (t) => {
  const now = new Date('2026-11-13T17:00:00Z');
  const runs = [];
  const saved = [];
  t.mock.method(TaskRun, 'create', async row => {
    runs.push(row);
    return { _id: row.runKey };
  });
  t.mock.method(TaskRun, 'updateOne', async () => ({}));
  const dependencies = {
    getActiveAssets: async () => ['CN-SH', 'CN-SZ', 'CN-FUND', 'HK', 'US', 'CA'].map(market => ({ symbol: market, market })),
    isMarketOpenToday: () => true,
    fetchLatest: async asset => ({ ...asset, timestamp: now }),
    saveLatest: async (data, batch) => saved.push([data.market, batch.runKey])
  };
  const day = marketDate(now);
  const [cn, usCa] = await Promise.all([
    dailySync({ marketGroup: 'CN', now, dependencies }),
    dailySync({ marketGroup: 'US_CA', now, dependencies })
  ]);
  const manual = await dailySync({ trigger: 'MANUAL', now, dependencies });
  assert.deepEqual(runs.map(({ taskName, runKey }) => [taskName, runKey]), [
    ['daily-price-sync', `${day}:CN`], ['daily-price-sync', `${day}:US_CA`],
    ['daily-price-sync', `manual:${now.toISOString()}`]
  ]);
  assert.deepEqual([cn.successCount, usCa.successCount, manual.successCount], [4, 2, 6]);
  assert.deepEqual(saved.slice(0, 6).map(([market]) => market), ['CN-SH', 'CN-SZ', 'CN-FUND', 'HK', 'US', 'CA']);
  assert.deepEqual([cn.result.marketGroup, usCa.result.marketGroup, manual.result.marketGroup], ['CN', 'US_CA', undefined]);
});

test('CN 周五 ET 中午采集实际 FSRQ 解析结果，夏冬令均写当日桶', async () => {
  const cases = [
    ['2026-08-21', '2026-08-20', '2026-08-21T16:00:00Z', '2026-08-22'],
    ['2026-11-13', '2026-11-12', '2026-11-13T17:00:00Z', '2026-11-14']
  ];
  for (const [day, priorDay, noonEt, shanghaiDay] of cases) {
    assert.equal(marketDate(new Date(noonEt), 'America/Toronto'), day);
    assert.equal(marketDate(new Date(noonEt), 'Asia/Shanghai'), shanghaiDay);
    const prices = new Map([[dateBounds(priorDay).start.toISOString(), 1.1]]);
    const result = await syncActiveAssetPrices({
      getActiveAssets: async () => [{ symbol: '001180.CN', market: 'CN-FUND' }],
      fetchLatest: () => tiantian.fetchLatest('001180', {
        get: async () => ({ data: { Data: { LSJZList: [{ FSRQ: day, DWJZ: '1.2' }] } } })
      }),
      saveLatest: async record => prices.set(canonicalDayTimestamp(record.timestamp).toISOString(), record.price)
    }, { marketGroup: 'CN', scheduledDay: day });
    assert.equal(result.successCount, 1);
    assert.equal(prices.get(dateBounds(day).start.toISOString()), 1.2);
    assert.equal(prices.get(dateBounds(priorDay).start.toISOString()), 1.1);
  }
  assert.equal(canonicalDayTimestamp('2026-11-13T15:00:00Z').toISOString(), dateBounds('2026-11-13').start.toISOString());
});

test('CN 定时批次收到前一日净值时保留旧桶并记录资产失败', async (t) => {
  const now = new Date('2026-11-13T17:00:00Z');
  const day = '2026-11-13';
  const priorDay = '2026-11-12';
  const priorBucket = dateBounds(priorDay).start.toISOString();
  const prices = new Map([[priorBucket, 1.10]]);
  t.mock.method(TaskRun, 'create', async () => ({ _id: 'test-run' }));
  const updateRun = t.mock.method(TaskRun, 'updateOne', async () => ({}));
  const dependencies = {
    getActiveAssets: async () => [{ symbol: '001180.CN', market: 'CN-FUND' }],
    fetchLatest: () => tiantian.fetchLatest('001180', {
      get: async () => ({ data: { Data: { LSJZList: [{ FSRQ: priorDay, DWJZ: '1.25' }] } } })
    }),
    saveLatest: async record => prices.set(canonicalDayTimestamp(record.timestamp).toISOString(), record.price)
  };
  const result = await dailySync({ marketGroup: 'CN', now, dependencies });
  assert.deepEqual([...prices], [[priorBucket, 1.10]]);
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCount, 1);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.failures[0].item, '001180.CN');
  assert.equal(result.failures[0].category, 'UPSTREAM');
  assert.equal(result.failures[0].provider, 'TIANTIAN');
  assert.match(result.failures[0].message, new RegExp(`${day}.*${priorDay}`));
  assert.equal(updateRun.mock.calls[0].arguments[1].$set.status, 'PARTIAL');

  const manual = await dailySync({ trigger: 'MANUAL', now, dependencies });
  assert.equal(manual.successCount, 1);
  assert.deepEqual([...prices], [[priorBucket, 1.25]]);
});
