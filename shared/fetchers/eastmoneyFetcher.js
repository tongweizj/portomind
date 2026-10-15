// cron-worker/src/fetchers/eastmoneyFetcher.js
// 通过东方财富公开行情 API 抓取 A 股 ETF（如 510300、159915）的最新实时价格与历史 K 线。
// 实时报价：push2 主用、push2delay 回退；价格按 f59（小数位数）缩放，规避不同市场精度差异。
// 超时按「单次请求」粒度由 withMarketDataTimeout 施加，host 回退在超时场景下依然生效。

const axios = require('axios');
const dayjs = require('dayjs');
const { MARKET_DATA_ERROR, MarketDataError } = require('./errors');
const { MARKET_DATA_TIMEOUT_MS, withMarketDataTimeout } = require('./timeout');

const PROVIDER = 'EASTMONEY';
const UT = 'fa5fd1943c7b386f172d6893dbfba10b';
const QUOTE_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com'];
const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const HEADERS = {
  'User-Agent': 'Portomind/1.0',
  Referer: 'https://quote.eastmoney.com/'
};

// 东方财富 secid：5/6/9 开头为上海（1.x），其余为深圳（0.x）。
function secidForCode(code) {
  return `${/^[569]/.test(code) ? '1' : '0'}.${code}`;
}

function marketForSecid(market) {
  return market === 1 ? 'CN-SH' : 'CN-SZ';
}

// 单次 host 请求：每个请求独立受 MARKET_DATA_TIMEOUT_MS 约束，失败抛规范化错误。
// data 为 null 表示无此证券；http 可注入（测试用），默认为 axios。
async function fetchQuoteFromHost(host, symbol, http = axios) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const response = await http.get(`${host}/api/qt/stock/get`, {
      params: {
        secid: secidForCode(symbol),
        ut: UT,
        fields: 'f43,f57,f58,f59,f60,f86,f107'
      },
      headers: HEADERS,
      timeout: MARKET_DATA_TIMEOUT_MS
    });
    const data = response.data && response.data.data;
    if (data !== undefined && data !== null) return data;
    if (data === null) return null;
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      PROVIDER,
      `Eastmoney returned an invalid quote for ${symbol}`,
      { retryable: false }
    );
  });
}

// 依次尝试各报价 host，全部失败时抛出最后一个错误。
async function getQuote(symbol, http = axios) {
  let lastError;
  for (const host of QUOTE_HOSTS) {
    try {
      return await fetchQuoteFromHost(host, symbol, http);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function fetchLatest(symbol, http = axios) {
  const quote = await getQuote(symbol, http);
  if (!quote) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.NOT_FOUND,
      PROVIDER,
      `Eastmoney symbol not found: ${symbol}`,
      { retryable: false }
    );
  }
  const price = Number(quote.f43);
  const decimals = Number(quote.f59);
  if (!Number.isFinite(price) || !Number.isFinite(decimals)) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      PROVIDER,
      `Eastmoney returned an invalid quote for ${symbol}`,
      { retryable: false }
    );
  }
  return {
    symbol: quote.f57 || symbol,
    name: quote.f58,
    price: price / (10 ** decimals),
    currency: 'CNY',
    market: marketForSecid(Number(quote.f107)),
    timestamp: quote.f86 ? new Date(quote.f86 * 1000) : new Date()
  };
}

async function fetchHistory(symbol, from, to, http = axios) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const response = await http.get(KLINE_URL, {
      params: {
        secid: secidForCode(symbol),
        ut: UT,
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57',
        klt: 101,
        fqt: 1,
        beg: dayjs(from).format('YYYYMMDD'),
        end: dayjs(to).format('YYYYMMDD')
      },
      headers: HEADERS,
      timeout: MARKET_DATA_TIMEOUT_MS
    });
    const data = response.data && response.data.data;
    const klines = data && data.klines;
    if (!Array.isArray(klines)) {
      throw new MarketDataError(
        MARKET_DATA_ERROR.INVALID_RESPONSE,
        PROVIDER,
        `Eastmoney returned invalid history for ${symbol}`,
        { retryable: false }
      );
    }
    return klines
      .map(line => {
        const parts = String(line).split(',');
        const date = parts[0];
        const close = Number(parts[2]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close)) return null;
        return { symbol, price: close, timestamp: new Date(`${date}T12:00:00.000Z`) };
      })
      .filter(Boolean);
  });
}

module.exports = { fetchLatest, fetchHistory };
