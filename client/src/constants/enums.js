/**
 * 枚举值集中管理
 */
export const ACTION_TYPE = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL',
});

/**
 * 交易类型（TASK-044 R8）。
 * 取值来自 shared/models/transaction.js 的 action 枚举，两处使用点（组合内交易 Tab、
 * 「全部交易」聚合页）共用本表，杜绝再次出现「分红显示为卖出」的二元判断。
 */
export const TRANSACTION_ACTIONS = Object.freeze([
  { value: 'buy', label: '买入' },
  { value: 'sell', label: '卖出' },
  { value: 'div_cash', label: '现金分红' },
  { value: 'div_reinvest', label: '分红再投' },
]);

/**
 * 交易类型 → 中文标签的唯一派生（TASK-048 AC4）。
 *
 * 唯一权威来源是上面的 TRANSACTION_ACTIONS。任何展示点都必须引用本导出，
 * **不得**在各自模块内重新用 `Object.fromEntries` 就地派生此表 ——
 * TASK-044 的 Bug-1 / M-3 正是因为同一口径被多处就地派生，导致分红被二元映射误显。
 */
export const TRANSACTION_ACTION_LABELS = Object.freeze(
  Object.fromEntries(TRANSACTION_ACTIONS.map(({ value, label }) => [value, label]))
);

export const ASSET_TYPES = Object.freeze([
  { value: 'stock', label: '股票' },
  { value: 'etf', label: 'ETF' },
  { value: 'fund', label: '基金' },
  { value: 'bond', label: '债券' },
  { value: 'cash', label: '现金' },
]);

// 大类（AS-09）：与证券类型正交（黄金 ETF type=etf、assetClass=gold）。
// 资产可留空 = 未分类（null），需逐条补齐以支撑大类目标配置层（CM-08）。
export const ASSET_CLASSES = Object.freeze([
  { value: 'equity', label: '股票类' },
  { value: 'bond', label: '债券类' },
  { value: 'gold', label: '黄金类' },
  { value: 'cash', label: '现金类' },
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
 * 后端枚举见 shared/models/portfolio.js 的 accountType。
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
