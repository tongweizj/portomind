// server/test/integration/priceCoverage.test.js
//
// TASK-073：旧 assetIntegrity.service 退休后，保留其价格窗口边界覆盖。
// 直接验证 shared priceCoverage 的目标市场日窗口与“窗内外”归桶语义。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  priceWindow,
  anyPriceInWindow
} = require('@portomind/shared/services/priceCoverage.service');

const TZ = 'America/Toronto';
const NOW = new Date('2026-11-23T18:00:00.000Z');

test('窗外的正常开市日旧价不能填补最早一个窗内开市日', () => {
  const window = priceWindow('CN-FUND', NOW, TZ);

  assert.equal(anyPriceInWindow(window, new Set(['2026-11-18'])), false);
  assert.equal(anyPriceInWindow(window, new Set(['2026-11-19'])), true);
});

test('CN 午间目标日切换后窗口向前推进，当日净值在到点后纳入', () => {
  const before = priceWindow('CN-FUND', new Date('2026-11-18T16:59:59.000Z'), TZ);
  const after = priceWindow('CN-FUND', new Date('2026-11-18T17:00:00.000Z'), TZ);

  assert.notEqual(before.dates[0], after.dates[0]);
  assert.equal(anyPriceInWindow(before, new Set(['2026-11-18'])), false);
  assert.equal(anyPriceInWindow(after, new Set(['2026-11-18'])), true);
});

const {
  expectedTradingDates,
  countAssetCoverage,
  boundedMissingRanges,
  clipRepairRanges
} = require('@portomind/shared/services/priceCoverage.service');

test('expectedTradingDates 排除周末与市场假期', () => {
  // 2026-11-26 为美国感恩节；11-28/29 为周末。
  assert.deepEqual(
    expectedTradingDates('US', '2026-11-23', '2026-11-29'),
    ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27']
  );
});

test('countAssetCoverage：actual 只统计匹配应有交易日，无价时为 0 且 ratio 为 0', async () => {
  const asset = { symbol: 'VOO.US', market: 'US' };
  const dependencies = {
    expectedTradingDates: () => ['2026-11-18', '2026-11-19', '2026-11-20'],
    storedBucketDates: async () => ['2026-11-19', '2026-11-20']
  };
  const partial = await countAssetCoverage(asset, '2026-11-18', '2026-11-20', dependencies);
  assert.equal(partial.expectedCount, 3);
  assert.equal(partial.actualCount, 2);
  assert.equal(partial.missingCount, 1);
  assert.deepEqual(partial.missingDates, ['2026-11-18']);
  assert.equal(partial.completenessRatio, 2 / 3);

  const empty = await countAssetCoverage(asset, '2026-11-18', '2026-11-20', {
    ...dependencies,
    storedBucketDates: async () => []
  });
  assert.equal(empty.actualCount, 0);
  assert.equal(empty.completenessRatio, 0);
});

test('boundedMissingRanges 最多保留 20 个区间并标记截断', () => {
  const dates = Array.from({ length: 25 }, (_, index) => (
    new Date(Date.UTC(2026, 0, 1 + index * 5)).toISOString().slice(0, 10)
  ));
  const result = boundedMissingRanges(dates);
  assert.equal(result.ranges.length, 20);
  assert.equal(result.truncated, true);
});

test('clipRepairRanges 只保留最近窗口内的可修复区间', () => {
  const result = clipRepairRanges([
    { from: '2026-10-01', to: '2026-10-02' },
    { from: '2026-10-05', to: '2026-11-02' }
  ], '2026-11-10', 30);
  assert.deepEqual(result.deferred, [{ from: '2026-10-01', to: '2026-10-02' }]);
  assert.deepEqual(result.repairable, [{ from: '2026-10-11', to: '2026-11-02' }]);
});
