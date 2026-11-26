// 流水动作（action）的唯一来源（TASK-097）。
// TRANSACTION_ACTIONS 与 client/src/constants/enums.js 的 TRANSACTION_ACTIONS / TRANSACTION_ACTION_LABELS 必须同步
// （同 ASSET_* 双份规则）。

// 影响持仓数量 / 成本的动作：必须有标的与数量；除 split 外必须有单价。
// split（TASK-098）拆股：quantity 为带符号份额变动，不记单价。
// transfer_out / transfer_in（TASK-099）证券划转两端：只移动份额与成本，不产生买卖盈亏；单价只是成本快照。
const TRANSFER_ACTIONS = Object.freeze(['transfer_out', 'transfer_in']);
const POSITION_ACTIONS = Object.freeze(['buy', 'sell', 'div_reinvest', 'split', ...TRANSFER_ACTIONS]);

// 纯现金流水：不改变持仓与成本，金额记在 cashAmount（带符号）/ cashCurrency（实际现金币种）。
// div_cash 现金分红（有标的，数量 / 单价可空）；tax 税款（如股息预扣税，可带标的）；interest 利息；
// cash_in / cash_out 现金划入 / 划出；fee 独立费用（非成交佣金）。
const CASH_ACTIONS = Object.freeze(['div_cash', 'tax', 'interest', 'cash_in', 'cash_out', 'fee']);

const TRANSACTION_ACTIONS = Object.freeze([...POSITION_ACTIONS, ...CASH_ACTIONS]);

// 手动录入表单开放的动作（其余现金类动作目前仅经导入写入）。
const MANUAL_ACTIONS = Object.freeze(['buy', 'sell', 'div_cash', 'div_reinvest']);

function isCashAction(action) {
  return CASH_ACTIONS.includes(action);
}

module.exports = { POSITION_ACTIONS, TRANSFER_ACTIONS, CASH_ACTIONS, TRANSACTION_ACTIONS, MANUAL_ACTIONS, isCashAction };
