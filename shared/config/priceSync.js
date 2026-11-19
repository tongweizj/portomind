const PRICE_SYNC_GROUPS = Object.freeze({
  CN: { markets: ['CN-SH', 'CN-SZ', 'CN-FUND', 'HK'], hour: 12, minute: 0 },
  US_CA: { markets: ['US', 'CA'], hour: 3, minute: 0 }
});

function priceSyncGroupOf(market) {
  const normalized = String(market || '').trim().toUpperCase();
  return Object.keys(PRICE_SYNC_GROUPS).find(group => PRICE_SYNC_GROUPS[group].markets.includes(normalized));
}

module.exports = { PRICE_SYNC_GROUPS, priceSyncGroupOf };
