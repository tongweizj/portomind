const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchLaunchDate } = require('@portomind/shared/fetchers/launchDateFetcher');
const { backfillLaunchDates } = require('@portomind/shared/tasks/launchDateFetch');
const Asset = require('@portomind/shared/models/asset');

function yahooQuotes(result) {
  return '<script type="application/json" data-sveltekit-fetched>' +
    JSON.stringify({ body: JSON.stringify({ quoteResponse: { result } }) }) + '</script>';
}

test('按实际网页字段读取正确标的的成立日或上市日', async () => {
  const pages = {
    'https://fundf10.eastmoney.com/001180.html': '<th>基金代码</th><td>001180（前端）<label>成立日期：<span>2015-05-06</span></label>',
    'https://finance.yahoo.com/quote/VOO/': yahooQuotes([{ symbol: 'VOO', quoteType: 'ETF', firstTradeDateMilliseconds: 1284039000000 }]) +
      '<p title="2010-09-07">2010-09-07</p> <h3>Inception Date</h3>',
    'https://ca.finance.yahoo.com/quote/VFV.TO/': yahooQuotes([{ symbol: 'VFV.TO', quoteType: 'ETF', firstTradeDateMilliseconds: 1352385000000 }]) +
      '<p title="2012-11-02">2012-11-02</p> <h3>Inception Date</h3>',
    'https://finance.yahoo.com/quote/0700.HK/': yahooQuotes([{ symbol: 'OTHER', firstTradeDateMilliseconds: 1 }]) +
      yahooQuotes([{ symbol: '0700.HK', quoteType: 'EQUITY', firstTradeDateMilliseconds: 1087349400000 }])
  };
  const http = { get: async url => ({ data: pages[url] }) };
  for (const [symbol, market, day] of [
    ['001180.CN', 'CN-FUND', '2015-05-06'], ['VOO.US', 'US', '2010-09-07'],
    ['VFV.TO', 'CA', '2012-11-02'], ['0700.HK', 'HK', '2004-06-16']
  ]) {
    assert.equal((await fetchLaunchDate({ symbol, market }, { http })).launchDate.toISOString(), `${day}T12:00:00.000Z`);
  }
  assert.equal((await fetchLaunchDate({ symbol: '0701.HK', market: 'HK' }, { http })).reason, 'DATE_NOT_FOUND');
  assert.equal((await fetchLaunchDate({ symbol: '600519.SS', market: 'CN-SH' }, { http })).reason, 'SOURCE_UNSUPPORTED');
});

test('预览不写库，应用仅填仍缺失的日期并保留未知原因', async (t) => {
  const date = new Date('2010-09-07T12:00:00Z');
  const found = { _id: 'found', symbol: 'VOO.US', market: 'US' };
  const unknown = { _id: 'unknown', symbol: 'OTHER.US', market: 'US' };
  const saved = { _id: 'saved', symbol: 'EXISTING.US', market: 'US', launchDate: date };
  const write = t.mock.method(Asset, 'updateOne', async () => ({ modifiedCount: 1 }));
  const dependencies = {
    listAssets: async () => [found, unknown, saved],
    fetchDate: async asset => {
      assert.notEqual(asset, saved);
      return asset === found ? { launchDate: date, provider: 'YAHOO' } : { reason: 'DATE_NOT_FOUND', provider: 'YAHOO' };
    }
  };
  const preview = await backfillLaunchDates({ dependencies });
  assert.deepEqual(preview.results.map(row => row.status), ['PREVIEW', 'UNKNOWN', 'PRESERVED']);
  assert.equal(write.mock.callCount(), 0);
  const applied = await backfillLaunchDates({ apply: true, dependencies });
  assert.deepEqual(applied.results.map(row => row.status), ['UPDATED', 'UNKNOWN', 'PRESERVED']);
  assert.equal(applied.results[1].reason, 'DATE_NOT_FOUND');
  assert.deepEqual(write.mock.calls[0].arguments, [
    { _id: 'found', symbol: 'VOO.US', market: 'US', active: true, launchDate: null }, { $set: { launchDate: date } }
  ]);
});
