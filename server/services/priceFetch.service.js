const tiantianFetcher = require('./fetchers/tiantianFetcher');
const yahooFetcher = require('./fetchers/yahooFetcher');
const { MARKET_DATA_ERROR, MarketDataError } = require('./fetchers/errors');

function resolveFetcher(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) throw new TypeError('symbol is required');
  const isFund = normalized.endsWith('.CN');
  return {
    requestedSymbol: normalized,
    providerSymbol: isFund ? normalized.slice(0, -3) : normalized,
    fetcher: isFund ? tiantianFetcher : yahooFetcher,
    provider: isFund ? 'TIANTIAN' : 'YAHOO'
  };
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

async function fetchLatest(symbol) {
  const resolved = resolveFetcher(symbol);
  const record = await resolved.fetcher.fetchLatest(resolved.providerSymbol);
  return validateRecord(record, resolved.requestedSymbol, resolved.provider);
}

async function fetchHistory(symbol, from, to) {
  const resolved = resolveFetcher(symbol);
  const records = await resolved.fetcher.fetchHistory(resolved.providerSymbol, from, to);
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
