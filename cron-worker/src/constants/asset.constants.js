const ASSET_TYPES = Object.freeze(['stock', 'etf', 'fund', 'bond', 'cash']);
const ASSET_MARKETS = Object.freeze(['US', 'CA', 'CN-SH', 'CN-SZ', 'CN-FUND']);
const ASSET_CURRENCIES = Object.freeze(['USD', 'CAD', 'CNY']);
const ASSET_SORT_FIELDS = Object.freeze([
  'symbol',
  'name',
  'market',
  'currency',
  'type',
  'active',
  'watchlist',
  'createdAt'
]);

module.exports = { ASSET_TYPES, ASSET_MARKETS, ASSET_CURRENCIES, ASSET_SORT_FIELDS };
