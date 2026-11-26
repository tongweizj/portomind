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
// fx 换汇（TASK-101）：每端一条，各记本币种带符号金额，两端以 pairGroupId 关联并共同入账。
const CASH_ACTIONS = Object.freeze(['div_cash', 'tax', 'interest', 'cash_in', 'cash_out', 'fee', 'fx']);

// 同文件内必须成对入账的动作（TASK-101 换汇，pairing.js）：单端不入账。
// 证券划转（TRANSFER_ACTIONS）也成对入账，但先到的一端可暂存等待另一端（transfers.js），不在此列。
const PAIRED_ACTIONS = Object.freeze(['fx']);

const TRANSACTION_ACTIONS = Object.freeze([...POSITION_ACTIONS, ...CASH_ACTIONS]);

// 手动录入 / 编辑开放的动作（其余动作仅经导入写入，界面不提供编辑，决定 10）。
// 与 client/src/constants/enums.js 的 MANUAL_TRANSACTION_ACTIONS 同步；PAIRED_ACTIONS + TRANSFER_ACTIONS 与其 PAIRED_LEG_ACTIONS 同步。
const MANUAL_ACTIONS = Object.freeze(['buy', 'sell', 'div_cash', 'div_reinvest']);

function isCashAction(action) {
  return CASH_ACTIONS.includes(action);
}

module.exports = { POSITION_ACTIONS, TRANSFER_ACTIONS, CASH_ACTIONS, PAIRED_ACTIONS, TRANSACTION_ACTIONS, MANUAL_ACTIONS, isCashAction };
