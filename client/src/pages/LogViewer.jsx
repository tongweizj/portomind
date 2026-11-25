// client/src/pages/LogViewer.jsx
//
// TASK-053（C-01）：/logs 从「单页原始日志」改为「置顶看板 tab 的轻量子应用」。
// TASK-067：频道可见身份改为「运维中心」（页面标题 + tablist aria-label），URL 与 tab key 不变。
//
// 本文件只做 **tab 编排**（计划 §4 / R-4：不再往里塞看板内容）：
//   - TASK-068：四个 tab，看板第一、资产数据第二、服务器第三、任务第四
//   - AC2：tab 落 URL（`?tab=board|assets|server|task`），刷新保持、前进后退正确、无效值回落 board
//   - AC5：两个原始视图由 <RawLogView> 承载，行为与改造前一致
//   - AC7：看板/资产数据与原始日志互不影响（各自独立请求）
//   - NG6：本页与 /logs 子树**不出现任何写操作**（无 mutation、无 api.post/put/patch/delete）
//
// URL 承载实现说明（计划 §4「优先复用既有路由 search 参数方法」）：
//   本项目路由是 `router.jsx` 里的平铺 `<Route path="/logs">`，没有嵌套子路由，
//   因此用 `useSearchParams`（react-router 既有能力）承载 `?tab=`，不引入新状态库、
//   不把 tab 塞进全局 store —— 这样 C-07 将来新增兄弟路由 `/logs/rebalance` 时，
//   「返回看板」直接跳 `/logs?tab=board` 即可，不需要返工。
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import CronBoard from '../components/CronStatus/CronBoard';
import AssetDataTabs from '../components/OpsCenter/AssetDataTabs';
import RawLogView from '../components/RawLog/RawLogView';
import {
  DEFAULT_LOG_TAB,
  ASSET_VIEW_PARAM,
  LOG_TAB_ASSETS,
  LOG_TAB_PARAM,
  LOG_TABS,
  RAW_LOG_TAB_KEYS,
  normalizeLogTab
} from '../constants/logTabs';

const LogsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // URL 上的值不可信（手改 / 旧书签 / 空值）→ 一律经白名单归一化
  const activeTab = normalizeLogTab(searchParams.get(LOG_TAB_PARAM));

  // 筛选条件提升到本页（F-02 修复）：改造前 server/task 共用一组筛选 state，
  // 切换视图时**不重置**。放在子组件内会被 key 重挂清空，属行为回归。
  const [levelFilter, setLevelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(() => new Date().toLocaleDateString('en-CA'));

  const selectTab = useCallback(
    (key) => {
      if (key === activeTab) return;
      const next = new URLSearchParams(searchParams);
      // 默认 tab 也显式写进 URL：这样「刷新保持」「前进后退」行为一致，
      // 且不会因为省略参数而让用户以为切换无效（AC2 允许无参数等价 board，
      // 但从界面点选后应能直接分享/回退到该 tab）。
      next.set(LOG_TAB_PARAM, key);
      // TASK-075：子视图参数只属于资产数据 tab，离开时清掉，避免残留到其他 tab 的 URL。
      if (key !== LOG_TAB_ASSETS) next.delete(ASSET_VIEW_PARAM);
      // replace: false → 每个 tab 切换都进历史栈，满足 AC2「前进后退在 tab 间切换」
      setSearchParams(next);
    },
    [activeTab, searchParams, setSearchParams]
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">运维中心</h1>

      {/* 四个 tab：顺序由 LOG_TABS 决定（看板第一），不在此处手写先后 */}
      <div role="tablist" aria-label="运维中心" className="flex items-center mb-4 space-x-2">
        {LOG_TABS.map((tab) => {
          const selected = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              data-tab={tab.key}
              onClick={() => selectTab(tab.key)}
              className={`px-3 py-1 rounded ${
                selected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/*
        看板：仅在 board tab 挂载。TASK-063 起由 CronBoard 读取一次 /api/cron/status；
        看板自身处理 loading/error，原始日志 tab 仍各自独立请求，互不影响。
      */}
      {activeTab === DEFAULT_LOG_TAB && (
        <section role="tabpanel" aria-label="任务运行看板">
          <CronBoard />
        </section>
      )}

      {/* 资产数据：仅在 assets tab 挂载（TASK-068）；子视图资产总表 / 采集记录（TASK-075）。 */}
      {activeTab === LOG_TAB_ASSETS && (
        <section role="tabpanel" aria-label="资产数据">
          <AssetDataTabs />
        </section>
      )}

      {/*
        原始日志：仅在对应 tab 挂载（AC7「自动请求只由对应 tab 激活」）。
        `key={activeTab}` 让 server ↔ task 切换时组件重挂 → 页码回到第 1 页，
        与改造前 setPage(1) 一致（AC5）。

        ⚠️ 筛选条件（级别 / 日期）由本页持有，不在 RawLogView 内部（F-02 修复）：
        改造前两个视图共用一个组件，切换视图时 levelFilter / dateFilter 是不重置的。
        若把它们留在子组件内、靠 key 重挂，就会被静默清空 —— 那是行为回归。
      */}
      {RAW_LOG_TAB_KEYS.includes(activeTab) && (
        <section role="tabpanel" aria-label={LOG_TABS.find((tab) => tab.key === activeTab)?.label}>
          <RawLogView
            key={activeTab}
            logType={activeTab}
            levelFilter={levelFilter}
            dateFilter={dateFilter}
            onLevelFilterChange={setLevelFilter}
            onDateFilterChange={setDateFilter}
          />
        </section>
      )}
    </div>
  );
};

export default LogsPage;
