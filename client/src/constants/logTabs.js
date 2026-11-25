// client/src/constants/logTabs.js
//
// TASK-053（C-01）：/logs 子应用的 **唯一** tab 定义来源。
// TASK-067：频道可见身份改为「运维中心」，URL 与 tab key 不变。
// TASK-068：新增「资产数据」tab（`?tab=assets`），顺序固定在任务运行看板之后。
// TASK-075：资产数据 tab 内的子视图 `?tab=assets&view=table|records`。
//
// 为什么单独一个常量文件：
//   - AC2 要求 tab 落 URL（`?tab=board|assets|server|task`），参数名会被后续
//     子路由复用 → 参数名与取值必须**冻结在一处**，避免两处各写一份漂移；
//   - tab 顺序写在数组里，渲染直接遍历，不靠 JSX 里手写按钮先后。
//
// ⚠️ 参数名 `tab` 已冻结（计划 §4 + 任务卡 §7 Coordination Notes）：不要改名。
export const LOG_TAB_PARAM = 'tab';

export const LOG_TAB_ASSETS = 'assets';

export const LOG_TABS = Object.freeze([
  { key: 'board', label: '任务运行看板' },
  { key: LOG_TAB_ASSETS, label: '资产数据' },
  { key: 'server', label: '服务器日志', rawLog: true },
  { key: 'task', label: '任务日志', rawLog: true },
]);

export const DEFAULT_LOG_TAB = 'board';

/** 仍由 <RawLogView> 承载的 tab；从 LOG_TABS 派生，避免 key 两份清单漂移。 */
export const RAW_LOG_TAB_KEYS = Object.freeze(
  LOG_TABS.filter((tab) => tab.rawLog).map((tab) => tab.key)
);

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

// ── TASK-075：资产数据 tab 的子视图（`?tab=assets&view=...`） ──
export const ASSET_VIEW_PARAM = 'view';
export const ASSET_VIEW_RECORDS = 'records';

export const ASSET_VIEWS = Object.freeze([
  { key: 'table', label: '资产总表' },
  { key: ASSET_VIEW_RECORDS, label: '采集记录' },
]);

export const DEFAULT_ASSET_VIEW = 'table';

/** 子视图同样走白名单；无效值回落资产总表。 */
export function normalizeAssetView(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return ASSET_VIEWS.some((view) => view.key === value) ? value : DEFAULT_ASSET_VIEW;
}
