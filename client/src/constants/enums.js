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
  { value: 'HK', label: '港股' },
]);

export const ASSET_CURRENCIES = Object.freeze([
  { value: 'USD', label: '美元' },
  { value: 'CAD', label: '加元' },
  { value: 'CNY', label: '人民币' },
  { value: 'HKD', label: '港币' },
]);

/**
 * 组合账户类型（账户载体）。与组合类型（风险定位：活钱/稳健/长期）正交。
 * 后端枚举见 server/models/portfolio.js 的 accountType。
 */
export const PORTFOLIO_ACCOUNT_TYPES = Object.freeze([
  { value: 'tiantian', label: '天天基金' },
  { value: 'xueqiu', label: '雪球' },
  { value: 'tfsa', label: 'TFSA' },
  { value: 'rrsp', label: 'RRSP' },
  { value: 'resp', label: 'RESP' },
  { value: 'taxable', label: '应税账户' },
  { value: 'other', label: '其他' },
]);
