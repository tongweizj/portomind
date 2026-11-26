// TASK-094：交易可见性的唯一口径。
// 导入整批提交时新行先以 status='pending' 写入，再一次性翻转为 committed；
// pending 行（含故障残留）对持仓、列表、统计、超卖校验全部不可见。
// 旧数据与手动录入没有 status 字段，天然可见。所有读取方都应经由此函数构造查询。

const VISIBLE_FILTER = Object.freeze({ status: { $ne: 'pending' } });

function visibleQuery(query = {}) {
  return { ...query, ...VISIBLE_FILTER };
}

/** 已读出的单条流水是否可见（按 id 读取 / 编辑 / 删除时与 visibleQuery 同一口径）。 */
function isVisible(transaction) {
  return Boolean(transaction) && transaction.status !== 'pending';
}

/** 未完成提交残留的 pending 行（只供核对「流水不完整」等明确需要读取它们的场景）。 */
function pendingQuery(query = {}) {
  return { ...query, status: 'pending' };
}

module.exports = { VISIBLE_FILTER, visibleQuery, isVisible, pendingQuery };
