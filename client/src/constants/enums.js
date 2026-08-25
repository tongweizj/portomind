/**
 * 枚举值集中管理
 */
export const ACTION_TYPE = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL',
});

export const ASSET_TYPES = Object.freeze([
  { value: 'stock', label: '股票' },
  { value: 'etf', label: 'ETF' },
  { value: 'fund', label: '基金' },
  { value: 'bond', label: '债券' },
  { value: 'cash', label: '现金' },
]);

export const ASSET_MARKETS = Object.freeze([
  { value: 'US', label: '美股' },
  { value: 'CA', label: '加股' },
  { value: 'CN-SH', label: '上海' },
  { value: 'CN-SZ', label: '深圳' },
  { value: 'CN-FUND', label: '中国基金' },
]);

export const ASSET_CURRENCIES = Object.freeze([
  { value: 'USD', label: '美元' },
  { value: 'CAD', label: '加元' },
  { value: 'CNY', label: '人民币' },
]);
