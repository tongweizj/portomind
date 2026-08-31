// cron-worker/src/services/priceFetch.service.js
// 统一行情适配层：根据传入资产的 market 字段（US/CA/HK/CN*，含 CN-SH/CN-SZ/CN-FUND）
// 或 Symbol 特征自动选择 Yahoo / 东方财富 / 天天基金 Fetcher。可传入资产对象或纯 symbol 字符串。
// 路由规则：CN-FUND（场外基金）→ 天天基金净值；CN/CN-SH/CN-SZ（场内证券）→ 东方财富；
// US/CA/HK（含 .HK 后缀港股，Yahoo 原生代码形如 0700.HK）→ Yahoo；
// 无 market 时按 Symbol 特征推断（.CN 为场外基金，.SS/.SZ 与 6 位数字码为场内证券，
// .HK 为港股——注意与场外基金 .CN 后缀互不冲突）。

const tiantianFetcher = require('../fetchers/tiantianFetcher');
const yahooFetcher = require('../fetchers/yahooFetcher');
const eastmoneyFetcher = require('../fetchers/eastmoneyFetcher');
const { MARKET_DATA_ERROR, MarketDataError } = require('../fetchers/errors');
const { fetchWithRetry } = require('../utils/retry');

function toAssetInput(asset) {
  return typeof asset === 'string' ? { symbol: asset, market: '' } : asset || {};
}

function stripCnSuffix(symbol) {
  return symbol.replace(/\.(SS|SZ|CN)$/i, '');
}

function resolveFetcher(asset) {
  const { symbol: rawSymbol, market: rawMarket } = toAssetInput(asset);
  const symbol = String(rawSymbol || '').trim().toUpperCase();
  if (!symbol) throw new TypeError('symbol is required');
  const market = String(rawMarket || '').trim().toUpperCase();

  // 优先按资产的 market 字段路由：CN-FUND（场外基金）→ 天天基金净值；
  // CN / CN-SH / CN-SZ（场内证券）→ 东方财富。
  if (market === 'CN-FUND') {
    return {
      requestedSymbol: symbol,
      providerSymbol: stripCnSuffix(symbol),
      fetcher: tiantianFetcher,
      provider: 'TIANTIAN'
    };
  }
  if (market.startsWith('CN')) {
    return {
      requestedSymbol: symbol,
      providerSymbol: stripCnSuffix(symbol),
      fetcher: eastmoneyFetcher,
      provider: 'EASTMONEY'
    };
  }
  if (market === 'US' || market === 'CA' || market === 'HK') {
    return { requestedSymbol: symbol, providerSymbol: symbol, fetcher: yahooFetcher, provider: 'YAHOO' };
  }

  // 无 market 或未知 market 时按 Symbol 特征推断（与 ../server 约定一致）：
  // .HK 为港股 → Yahoo（Yahoo 原生支持 0700.HK 形式代码，providerSymbol 原样透传）；
  // .CN 为场外基金 → 天天基金；.SS / .SZ 与 6 位数字码为场内证券 → 东方财富。
  if (/\.HK$/i.test(symbol)) {
    return { requestedSymbol: symbol, providerSymbol: symbol, fetcher: yahooFetcher, provider: 'YAHOO' };
  }
  if (/\.TO$/.test(symbol)) {
    return { requestedSymbol: symbol, providerSymbol: symbol, fetcher: yahooFetcher, provider: 'YAHOO' };
  }
  if (/\.CN$/i.test(symbol)) {
    return {
      requestedSymbol: symbol,
      providerSymbol: stripCnSuffix(symbol),
      fetcher: tiantianFetcher,
      provider: 'TIANTIAN'
    };
  }
  if (/\.(SS|SZ)$/i.test(symbol) || /^\d{6}$/.test(symbol)) {
    return {
      requestedSymbol: symbol,
      providerSymbol: stripCnSuffix(symbol),
      fetcher: eastmoneyFetcher,
      provider: 'EASTMONEY'
    };
  }
  return { requestedSymbol: symbol, providerSymbol: symbol, fetcher: yahooFetcher, provider: 'YAHOO' };
}

function validateRecord(record, symbol, provider) {
  if (!record || !Number.isFinite(record.price) || !(record.timestamp instanceof Date) ||
      Number.isNaN(record.timestamp.getTime())) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      provider,
      `${provider} returned invalid price data for ${symbol}`,
      { retryable: false }
    );
  }
  return { ...record, symbol };
}

async function fetchLatest(asset) {
  const resolved = resolveFetcher(asset);
  const record = await fetchWithRetry(() => resolved.fetcher.fetchLatest(resolved.providerSymbol));
  return validateRecord(record, resolved.requestedSymbol, resolved.provider);
}

async function fetchHistory(asset, from, to) {
  const resolved = resolveFetcher(asset);
  const records = await fetchWithRetry(() => resolved.fetcher.fetchHistory(resolved.providerSymbol, from, to));
  if (!Array.isArray(records)) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      resolved.provider,
      `${resolved.provider} returned invalid history for ${resolved.requestedSymbol}`,
      { retryable: false }
    );
  }
  return records.map(record =>
    validateRecord(record, resolved.requestedSymbol, resolved.provider)
  );
}

module.exports = { fetchLatest, fetchHistory, resolveFetcher };
