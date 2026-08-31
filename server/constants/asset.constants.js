const ASSET_TYPES = Object.freeze(['stock', 'etf', 'fund', 'bond', 'cash']);
// 大类（AS-09）：equity/bond/gold/cash。与 ASSET_TYPES（证券类型）正交——如黄金 ETF 的
// type 是 etf、assetClass 是 gold；用于大类目标配置层（CM-08）与家庭视图大类分组的铺垫。
// 存量资产 assetClass 为 null（未分类），需通过资产表单/编辑逐条补齐。
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
