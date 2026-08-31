// cron-worker/src/fetchers/yahooFetcher.js
// 通过 Yahoo Finance 公开 chart API 抓取美股/加股/港股（如 VOO、XEQT.TO、0700.HK）的最新价格与历史 K 线。
// 使用 axios 直连 REST API（不依赖 yahoo-finance2 SDK），query1 被限流时回退 query2。
// 超时按「单次请求」粒度由 withMarketDataTimeout 施加，host 回退在超时场景下依然生效。

const axios = require('axios');
const { MARKET_DATA_ERROR, MarketDataError } = require('./errors');
const { MARKET_DATA_TIMEOUT_MS, withMarketDataTimeout } = require('./timeout');

const PROVIDER = 'YAHOO';
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

function marketForSymbol(symbol) {
  if (/\.TO$/i.test(symbol)) return 'CA';
  if (/\.HK$/i.test(symbol)) return 'HK';
  return 'US';
}

// 单次 host 请求：每个请求独立受 MARKET_DATA_TIMEOUT_MS 约束，失败抛规范化错误。
// http 可注入（测试用），默认为 axios。
async function fetchChartFromHost(host, symbol, query, http = axios) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const response = await http.get(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      params: { includePrePost: 'false', ...query },
      timeout: MARKET_DATA_TIMEOUT_MS
    });
    if (response.data && response.data.chart) return response.data.chart;
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      PROVIDER,
      `Yahoo returned an invalid chart response for ${symbol}`,
      { retryable: false }
    );
  });
}

// 依次尝试各 host，全部失败时抛出最后一个错误。
async function getChart(symbol, query, http = axios) {
  let lastError;
  for (const host of HOSTS) {
    try {
      return await fetchChartFromHost(host, symbol, query, http);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function fetchLatest(symbol, http = axios) {
  const chart = await getChart(symbol, { range: '1d', interval: '1d' }, http);
  if (chart.error || !chart.result || chart.result.length === 0) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.NOT_FOUND,
      PROVIDER,
      `Yahoo symbol not found: ${symbol}`,
      { retryable: false }
    );
  }
  const meta = chart.result[0].meta || {};
  if (!Number.isFinite(meta.regularMarketPrice)) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      PROVIDER,
      `Yahoo returned an invalid quote for ${symbol}`,
      { retryable: false }
    );
  }
  return {
    symbol: meta.symbol || symbol,
    name: meta.shortName || meta.longName || symbol,
    price: meta.regularMarketPrice,
    currency: meta.currency,
    market: marketForSymbol(symbol),
    timestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date()
  };
}

async function fetchHistory(symbol, from, to, http = axios) {
  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(new Date(to).getTime() / 1000);
  const chart = await getChart(symbol, {
    period1,
    period2,
    interval: '1d',
    events: 'history'
  }, http);
  if (chart.error || !chart.result || chart.result.length === 0) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.NOT_FOUND,
      PROVIDER,
      `Yahoo symbol not found: ${symbol}`,
      { retryable: false }
    );
  }
  const { timestamp: timestamps, indicators } = chart.result[0];
  const closes = indicators && indicators.quote && indicators.quote[0]
    ? indicators.quote[0].close
    : null;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      PROVIDER,
      `Yahoo returned invalid history for ${symbol}`,
      { retryable: false }
    );
  }
  return timestamps
    .map((ts, index) => ({ ts, close: closes[index] }))
    .filter(item => Number.isFinite(item.close) && item.ts)
    .map(item => ({
      symbol,
      price: item.close,
      // 中午 UTC 可保留供应商给出的日历日期，存储层再规范为市场日边界。
      timestamp: new Date(`${new Date(item.ts * 1000).toISOString().slice(0, 10)}T12:00:00.000Z`)
    }));
}

module.exports = { fetchLatest, fetchHistory };
