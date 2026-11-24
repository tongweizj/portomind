// shared/services/assetMetadata.service.js
//
// TASK-068：资产基础信息（symbol/name/market/currency/launchDate）校验。
// TASK-068 从已退休的 assetIntegrity.service 抽出；运维中心资产总表使用这一份
// 基础信息判定，禁止另写一份。

const { ASSET_MARKETS, ASSET_CURRENCIES } = require('../constants/asset.constants');
const { marketDate, MARKET_TIMEZONE } = require('../utils/marketTime');
const { toStorageSymbol } = require('../utils/symbol');
const { marketTimezone } = require('./marketDay.service');

const EXPECTED_CURRENCY = { US: 'USD', CA: 'CAD', HK: 'HKD', 'CN-SH': 'CNY', 'CN-SZ': 'CNY', 'CN-FUND': 'CNY' };

const FIELD_BY_REASON = {
  SYMBOL_FORMAT: 'symbol',
  SYMBOL_SUFFIX: 'symbol',
  NAME_EMPTY: 'name',
  NAME_TOO_LONG: 'name',
  MARKET_INVALID: 'market',
  CURRENCY_INVALID: 'currency',
  CURRENCY_MISMATCH: 'currency',
  LAUNCH_DATE_MISSING: 'launchDate',
  LAUNCH_DATE_INVALID: 'launchDate',
  LAUNCH_DATE_FUTURE: 'launchDate'
};
const FIELD_ORDER = ['symbol', 'name', 'market', 'currency', 'launchDate'];

function launchDateReason(asset, now) {
  const { launchDate, market } = asset;
  if (launchDate == null) return 'LAUNCH_DATE_MISSING';
  if (!(launchDate instanceof Date) || !Number.isFinite(launchDate.getTime())) return 'LAUNCH_DATE_INVALID';
  const tz = ASSET_MARKETS.includes(market) ? marketTimezone(market) : MARKET_TIMEZONE;
  return marketDate(launchDate, tz) > marketDate(now, tz) ? 'LAUNCH_DATE_FUTURE' : null;
}

function metadataReasons(asset, now) {
  const { symbol, market, currency } = asset;
  const name = typeof asset.name === 'string' ? asset.name.trim() : '';
  const validMarket = ASSET_MARKETS.includes(market);
  const reasons = [];
  if (typeof symbol !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(symbol)) reasons.push('SYMBOL_FORMAT');
  else if (validMarket && symbol !== toStorageSymbol(symbol, market)) reasons.push('SYMBOL_SUFFIX');
  if (!name) reasons.push('NAME_EMPTY');
  else if (name.length > 120) reasons.push('NAME_TOO_LONG');
  if (!validMarket) reasons.push('MARKET_INVALID');
  if (!ASSET_CURRENCIES.includes(currency)) reasons.push('CURRENCY_INVALID');
  else if (validMarket && EXPECTED_CURRENCY[market] !== currency) reasons.push('CURRENCY_MISMATCH');
  const dateReason = launchDateReason(asset, now);
  if (dateReason) reasons.push(dateReason);
  return reasons;
}

// 把 reason 折算成 5 个基础信息字段；未知 reason 不影响字段列表。
function missingFieldsOf(reasons) {
  const fields = new Set(reasons.map((reason) => FIELD_BY_REASON[reason]).filter(Boolean));
  return FIELD_ORDER.filter((field) => fields.has(field));
}

module.exports = { metadataReasons, missingFieldsOf };
