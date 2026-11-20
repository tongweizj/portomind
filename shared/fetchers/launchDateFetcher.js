const axios = require('axios');
const { resolveFetcher } = require('../services/priceFetch.service');
const { MARKET_DATA_TIMEOUT_MS, withMarketDataTimeout } = require('./timeout');
const { fetchWithRetry } = require('../utils/retry');
const { launchDateFromDay } = require('../utils/launchDate');
const { marketDate } = require('../utils/marketTime');
const { MARKETS } = require('../config/markets');

function tiantianDate(html, symbol) {
  const code = html.match(/<th>基金代码<\/th>\s*<td>\s*(\d{6})(?!\d)/)?.[1];
  const day = html.match(/<label>\s*成立日期[：:]\s*<span>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>/)?.[1];
  return code === symbol && day ? { day, field: '成立日期' } : null;
}

function yahooDate(html, symbol, market) {
  for (const [, attributes, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!attributes.includes('data-sveltekit-fetched') || !content.includes('firstTradeDateMilliseconds')) continue;
    let quotes;
    try {
      quotes = JSON.parse(JSON.parse(content).body).quoteResponse?.result;
    } catch {
      continue;
    }
    // 页面也含市场指数和推荐标的，只接受当前标的单独的报价数据。
    if (!Array.isArray(quotes) || quotes.length !== 1 || quotes[0]?.symbol !== symbol) continue;
    const quote = quotes[0];
    if (quote.quoteType === 'ETF' || quote.quoteType === 'MUTUALFUND') {
      const day = html.match(/<p\b[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/p>\s*<h3\b[^>]*>\s*Inception Date\s*<\/h3>/i)?.[1];
      return day ? { day, field: 'Inception Date' } : null;
    }
    if (quote.quoteType !== 'EQUITY' || !Number.isSafeInteger(quote.firstTradeDateMilliseconds)) return null;
    const firstTrade = new Date(quote.firstTradeDateMilliseconds);
    if (quote.firstTradeDateMilliseconds <= 0 || Number.isNaN(firstTrade.getTime())) return null;
    return { day: marketDate(firstTrade, MARKETS[market].timezone), field: 'firstTradeDateMilliseconds' };
  }
  return null;
}

async function fetchLaunchDate(asset, { http = axios, now = new Date() } = {}) {
  if (!['CN-FUND', 'US', 'CA', 'HK'].includes(asset.market)) return { reason: 'SOURCE_UNSUPPORTED' };
  const { provider, providerSymbol } = resolveFetcher(asset);
  const symbol = encodeURIComponent(providerSymbol);
  const yahooHost = asset.market === 'CA' ? 'ca.finance.yahoo.com' : 'finance.yahoo.com';
  const url = provider === 'TIANTIAN'
    ? `https://fundf10.eastmoney.com/${symbol}.html`
    : `https://${yahooHost}/quote/${symbol}/`;
  const { data } = await fetchWithRetry(() => withMarketDataTimeout(provider, () => http.get(url, {
    timeout: MARKET_DATA_TIMEOUT_MS, responseType: 'text', maxContentLength: 8 * 1024 * 1024
  })));
  if (typeof data !== 'string') return { provider, reason: 'DATE_NOT_FOUND' };
  const found = provider === 'TIANTIAN' ? tiantianDate(data, providerSymbol) : yahooDate(data, providerSymbol, asset.market);
  if (!found) return { provider, reason: 'DATE_NOT_FOUND' };
  const launchDate = launchDateFromDay(found.day, now);
  return launchDate ? { provider, launchDate, field: found.field } : { provider, reason: 'DATE_INVALID' };
}

module.exports = { fetchLaunchDate };
