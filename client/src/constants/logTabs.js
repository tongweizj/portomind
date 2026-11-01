// client/src/constants/logTabs.js
//
// TASK-053（C-01）：/logs 三个 tab 的**唯一**定义来源。
//
// 为什么单独一个常量文件：
//   - AC2 要求 tab 落 URL（`?tab=board|server|task`），参数名会被后续 C-07（`/logs/rebalance`
//     的「返回看板」）复用 → 参数名与取值必须**冻结在一处**，避免两处各写一份漂移；
//   - AC1 要求顺序固定（看板第一、服务器第二、任务第三）→ 顺序写在数组里，渲染直接遍历，
//     不靠 JSX 里手写三个按钮的先后。
//
// ⚠️ 参数名 `tab` 已冻结（计划 §4 + 任务卡 §7 Coordination Notes）：C-07 直接复用，不要改名。
export const LOG_TAB_PARAM = 'tab';

export const LOG_TABS = Object.freeze([
  { key: 'board', label: '任务运行看板' },
  { key: 'server', label: '服务器日志' },
  { key: 'task', label: '任务日志' },
]);

export const DEFAULT_LOG_TAB = 'board';

/** 合法 tab key 集合。用于把 URL 上的任意输入收敛到白名单。 */
export const LOG_TAB_KEYS = Object.freeze(LOG_TABS.map((t) => t.key));

/**
 * 把不可信的 URL 取值归一化成合法 tab。
 * 无效值（含旧书签、手改参数、`?tab=`）一律回落默认 tab —— 不抛错、不白屏。
 */
export function normalizeLogTab(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return LOG_TAB_KEYS.includes(value) ? value : DEFAULT_LOG_TAB;
}
