// 行情适配层以资产 market 为准，兼容旧 CLI 传入的纯 symbol。
const tiantianFetcher = require('../fetchers/tiantianFetcher');
const yahooFetcher = require('../fetchers/yahooFetcher');
const eastmoneyFetcher = require('../fetchers/eastmoneyFetcher');
const { MARKET_DATA_ERROR, MarketDataError } = require('../fetchers/errors');
const { fetchWithRetry } = require('../utils/retry');
const { STORAGE_SUFFIX, normalizeSymbol, marketFromSuffix, toStorageSymbol, toProviderSymbol } = require('../utils/symbol');

function resolveFetcher(asset) {
  const input = typeof asset === 'string' ? { symbol: asset } : asset || {};
  const symbol = normalizeSymbol(input.symbol);
  if (!symbol) throw new TypeError('symbol is required');

  const assetMarket = String(input.market ?? '').trim().toUpperCase();
  const suffixMarket = marketFromSuffix(symbol);
  let market = Object.hasOwn(STORAGE_SUFFIX, assetMarket) ? assetMarket : suffixMarket;
  // 旧调用可传 CN 或裸六位证券码，交易所沿用东财 secid 的同一判定。
  if ((!Object.hasOwn(STORAGE_SUFFIX, assetMarket) && assetMarket.startsWith('CN')) ||
      (!market && /^\d{6}$/.test(symbol))) {
    market = eastmoneyFetcher.marketForCode(toProviderSymbol(symbol, 'CN-SH'));
  }
  market ??= 'US';

  let fetcher = yahooFetcher;
  let provider = 'YAHOO';
  if (market === 'CN-FUND') {
    fetcher = tiantianFetcher;
    provider = 'TIANTIAN';
  } else if (market.startsWith('CN-')) {
    fetcher = eastmoneyFetcher;
    provider = 'EASTMONEY';
  }

  return {
    requestedSymbol: toStorageSymbol(symbol, market),
    providerSymbol: toProviderSymbol(symbol, market),
    market,
    fetcher,
    provider
  };
}

function validateRecord(record, { requestedSymbol, market, provider }) {
  if (!record || !Number.isFinite(record.price) || !(record.timestamp instanceof Date) ||
      Number.isNaN(record.timestamp.getTime())) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.INVALID_RESPONSE,
      provider,
      `${provider} returned invalid price data for ${requestedSymbol}`,
      { retryable: false }
    );
  }
  return { ...record, symbol: requestedSymbol, market };
}

async function fetchLatest(asset) {
  const resolved = resolveFetcher(asset);
  const record = await fetchWithRetry(() => resolved.fetcher.fetchLatest(resolved.providerSymbol));
  return validateRecord(record, resolved);
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
  return records.map(record => validateRecord(record, resolved));
}

module.exports = { fetchLatest, fetchHistory, resolveFetcher };
