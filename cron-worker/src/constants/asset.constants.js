const ASSET_TYPES = Object.freeze(['stock', 'etf', 'fund', 'bond', 'cash']);
// 大类（AS-09）：equity/bond/gold/cash，与 ASSET_TYPES 正交（黄金 ETF type=etf、assetClass=gold）。
// 与 ../server/constants/asset.constants.js 保持一致（改动需双向同步）。
const ASSET_CLASSES = Object.freeze(['equity', 'bond', 'gold', 'cash']);
// 港股（AS-08）：market=HK，交易货币 HKD，行情走 Yahoo（XXXX.HK 代码）。
const ASSET_MARKETS = Object.freeze(['US', 'CA', 'CN-SH', 'CN-SZ', 'CN-FUND', 'HK']);
const ASSET_CURRENCIES = Object.freeze(['USD', 'CAD', 'CNY', 'HKD']);
const ASSET_SORT_FIELDS = Object.freeze([
  'symbol',
  'name',
  'market',
  'currency',
  'type',
  'assetClass',
  'active',
  'watchlist',
  'createdAt'
]);

module.exports = { ASSET_TYPES, ASSET_CLASSES, ASSET_MARKETS, ASSET_CURRENCIES, ASSET_SORT_FIELDS };
