const STORAGE_SUFFIX = Object.freeze({
  US: '.US', CA: '.TO', HK: '.HK', 'CN-FUND': '.CN', 'CN-SH': '.SS', 'CN-SZ': '.SZ'
});

const PROVIDER_SUFFIX = Object.freeze({
  US: '', CA: '.TO', HK: '.HK', 'CN-FUND': '', 'CN-SH': '', 'CN-SZ': ''
});

const marketBySuffix = new Map(Object.entries(STORAGE_SUFFIX).map(([market, suffix]) => [suffix, market]));

function normalizeSymbol(symbol) {
  return String(symbol ?? '').trim().toUpperCase();
}

function marketFromSuffix(symbol) {
  const normalized = normalizeSymbol(symbol);
  return marketBySuffix.get(normalized.slice(normalized.lastIndexOf('.')));
}

function withMarketSuffix(symbol, market, suffixes) {
  const normalized = normalizeSymbol(symbol);
  if (!Object.hasOwn(suffixes, market)) return normalized;

  const dot = normalized.lastIndexOf('.');
  const base = marketBySuffix.has(normalized.slice(dot)) ? normalized.slice(0, dot) : normalized;
  return base ? base + suffixes[market] : '';
}

function toStorageSymbol(symbol, market) {
  return withMarketSuffix(symbol, market, STORAGE_SUFFIX);
}

function toProviderSymbol(symbol, market) {
  return withMarketSuffix(symbol, market, PROVIDER_SUFFIX);
}

module.exports = { STORAGE_SUFFIX, normalizeSymbol, marketFromSuffix, toStorageSymbol, toProviderSymbol };
