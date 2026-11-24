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
