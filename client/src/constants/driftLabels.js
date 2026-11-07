// client/src/constants/driftLabels.js
//
// US-004 共享文案常量 —— **由 TASK-066（Implementer B）拥有**，TASK-067 消费。
// 裁决依据：D-02（2026-11-06 Human）；D-01 解 B 要求「待办 / 上次再平衡」在
// 健康表（066）与组合卡（067）之间**逐字一致**。
//
// ⚠️ 本文件是**纯常量文件**，刻意不做三件事：
//   1. 不做任何计算（天数、标的数、格式化都由消费方算好再传进来）；
//   2. 不 import 任何模块（067 直接引用即可，不会牵入本卡其它文件）；
//   3. 不新增依赖。
// 一旦这里开始出现逻辑，两卡就会各自演化成两套口径，正是本常量要防的问题。
//
// 单位词是硬要求（FS §6.2 B8）：两个 N 量纲不同 —— 「N 项超阈」的 N 是**标的数**，
// 「已到期（N 天）」的 N 是**天数**。文案必须带「项」/「天」，否则读者会把两者混为一谈。

/**
 * 健康表「偏离」列的四态文案（TASK-066 使用）。
 * 取值优先级见 FS §6.2 B8：needsRebalance → dueByTime → 无目标 → 正常。
 */
export const DRIFT_STATE_LABELS = Object.freeze({
  // ① 仅超阈：N = drift.overThresholdCount（**标的数**，不是 triggeredThresholds.length）
  overThreshold: (count) => `${count} 项超阈`,
  // ② 仅到期：N = 距上次再平衡天数
  dueByTime: (days) => `已到期（${days} 天）`,
  // ②的边界：从未执行过再平衡（lastExecutedAt === null）
  dueByTimeNever: '从未执行过再平衡',
  // ③ 皆无
  normal: '正常',
  // ④ 无目标配置
  noTarget: '未设目标',
  // 数据不可读（drift === null 且非「无目标」时；FS B4）
  unknown: '—',
});

/** 「待办」列文案（TASK-066 健康表 + TASK-067 组合卡，**逐字一致**，D-01 解 B）。 */
export const PENDING_LABELS = Object.freeze({
  // N 条待确认再平衡建议（点击 → /portfolios/view/:id/rebalance?sub=suggestions）
  pendingRebalance: (count) => `${count} 条待确认`,
  // N 条未读提醒（点击 → / 并设组合筛选）
  unreadAlert: (count) => `${count} 条未读`,
  // 两者皆 0
  none: '—',
});

/** 「上次再平衡」列文案（TASK-066 健康表 + TASK-067 组合卡，**逐字一致**，D-01 解 B）。 */
export const LAST_REBALANCE_LABELS = Object.freeze({
  // lastExecutedAt 为 null（或缺失）
  never: '从未',
  // 缺失/不可读（例如 065 字段尚未落地）
  unknown: '—',
});

/** 健康表 5 列的表头（顺序即渲染顺序，TASK-066 使用）。 */
export const HEALTH_TABLE_COLUMNS = Object.freeze([
  '组合',
  '市值',
  '偏离',
  '待办',
  '上次再平衡',
]);
