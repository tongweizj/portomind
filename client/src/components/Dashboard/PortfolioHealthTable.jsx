// client/src/components/Dashboard/PortfolioHealthTable.jsx
// TASK-066（US-004 B7~B13）：Dashboard 组合健康表。
//
// ⚠️ 零新增请求：本组件**不自己调接口**，数据由父级 Dashboard 通过 `usePortfolios()` 传入
// （同一 `queryKey:['portfolios-summary']`，与组合列表页共享缓存，AC-01）。
//
// 四态偏离取值优先级（FS §6.2 B8，OQ-01 已裁「有事的在上」）：
//   ① drift.needsRebalance === true  → 「N 项超阈」（N = drift.overThresholdCount，**标的数**）
//   ② drift.dueByTime === true      → 「已到期（N 天）」（N = lastExecutedAt 距今天数）
//     lastExecutedAt === null → 「从未执行过再平衡」
//   ③ targets 为空                  → 「未设目标」
//   ④ 其余                           → 「正常」
//
// ①的 N **必须取 overThresholdCount**（标的数），**不得**用 `triggeredThresholds.length`
// （阈值类型数，最多 2）。AC-02 负向对照专门验证这一点：2 个阈值覆盖 1 个标的 → 显示「1 项超阈」。
//
// 排序全序（AC-04）：`待办数>0` → `needsRebalance`（超阈）→ `dueByTime`（已到期）→ `createdAt` 倒序。
// 比较函数必须是全序（同分稳定），否则刷新后顺序抖动。
//
// 局部错误隔离（AC-06）：`summary` 失败时本组件显示 ErrorState，不向上抛。
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { LoadingState, ErrorState } from '../DataState';
import {
  DRIFT_STATE_LABELS,
  PENDING_LABELS,
  LAST_REBALANCE_LABELS,
  HEALTH_TABLE_COLUMNS
} from '../../constants/driftLabels';
import { formatMoney, householdCurrencySymbol, daysSince } from '../../utils/priceDisplay';

/** 币种展示顺序：CNY → USD → CAD → HKD，其余字母序（与 AC-07 一致）。 */
const CURRENCY_ORDER = ['CNY', 'USD', 'CAD', 'HKD'];

function sortCurrencyKeys(keys) {
  return [...keys].sort((a, b) => {
    const ai = CURRENCY_ORDER.indexOf(a);
    const bi = CURRENCY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

/** 分币种并列展示，不跨币种合计（AC-01 市值列）。null 桶显示「—」+ 行尾 ⓘ。 */
function formatMarketValue(marketValueByCurrency) {
  if (!marketValueByCurrency || Object.keys(marketValueByCurrency).length === 0) return '—';
  const keys = sortCurrencyKeys(Object.keys(marketValueByCurrency));
  const hasMissing = keys.some(k => marketValueByCurrency[k] == null);
  const parts = keys.map(k => {
    const val = marketValueByCurrency[k];
    if (val == null) return `${householdCurrencySymbol(k)}—`;
    return formatMoney(val, k);
  });
  return parts.join(' · ') + (hasMissing ? ' ⓘ' : '');
}

/** 「偏离」四态派生。 */
function getDriftDisplay(portfolio) {
  const stats = portfolio.stats || {};
  const drift = stats.drift;
  const targets = Array.isArray(portfolio.targets) ? portfolio.targets : [];

  if (drift?.needsRebalance === true) {
    return { text: DRIFT_STATE_LABELS.overThreshold(drift.overThresholdCount ?? 0), cls: 'text-red-600' };
  }
  if (drift?.dueByTime === true) {
    const lastExec = stats.lastExecutedAt;
    if (lastExec == null) return { text: DRIFT_STATE_LABELS.dueByTimeNever, cls: 'text-amber-600' };
    const days = daysSince(lastExec);
    return { text: DRIFT_STATE_LABELS.dueByTime(days ?? 0), cls: 'text-amber-600' };
  }
  if (targets.length === 0) return { text: DRIFT_STATE_LABELS.noTarget, cls: 'text-gray-400' };
  if (drift == null) return { text: DRIFT_STATE_LABELS.unknown, cls: 'text-gray-400' };
  return { text: DRIFT_STATE_LABELS.normal, cls: 'text-gray-700' };
}

/** 「上次再平衡」：`YYYY-MM-DD（N 天前）`；`null` → 「从未」。 */
function formatLastRebalance(stats) {
  const lastExec = stats?.lastExecutedAt;
  if (lastExec == null) return LAST_REBALANCE_LABELS.never;
  const d = new Date(lastExec);
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = daysSince(lastExec);
  return days != null ? `${ds}（${days} 天前）` : ds;
}

/** 全序排序：待办>0 → 超阈 → 到期 → createdAt 倒序（AC-04）。 */
function comparePortfolios(a, b) {
  const todoA = (a.stats?.pendingRebalanceCount ?? 0) + (a.stats?.unreadAlertCount ?? 0);
  const todoB = (b.stats?.pendingRebalanceCount ?? 0) + (b.stats?.unreadAlertCount ?? 0);
  const hasTodoA = todoA > 0 ? 1 : 0;
  const hasTodoB = todoB > 0 ? 1 : 0;
  if (hasTodoA !== hasTodoB) return hasTodoB - hasTodoA;

  const nrA = a.stats?.drift?.needsRebalance ? 1 : 0;
  const nrB = b.stats?.drift?.needsRebalance ? 1 : 0;
  if (nrA !== nrB) return nrB - nrA;

  const dueA = a.stats?.drift?.dueByTime ? 1 : 0;
  const dueB = b.stats?.drift?.dueByTime ? 1 : 0;
  if (dueA !== dueB) return dueB - dueA;

  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

/**
 * @param {{ portfolios: Array, isLoading: boolean, isError: boolean,
 *           onPortfolioFilter: (id: string) => void }} props
 */
export default function PortfolioHealthTable({ portfolios = [], isLoading, isError, onPortfolioFilter }) {
  const navigate = useNavigate();
  const sorted = useMemo(() => [...portfolios].sort(comparePortfolios), [portfolios]);

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      {/* 标题栏 + 「组合管理 →」链接（FS §4.3 线框） */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-lg font-semibold text-gray-800">组合健康</h2>
        <button
          type="button"
          onClick={() => navigate('/portfolios')}
          className="text-sm text-blue-600 hover:underline"
        >
          组合管理 →
        </button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState />
        ) : sorted.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-3">暂无组合，先创建一个</p>
            <button
              type="button"
              onClick={() => navigate('/portfolios/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              新建组合
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  {HEALTH_TABLE_COLUMNS.map(col => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(portfolio => {
                  const drift = getDriftDisplay(portfolio);
                  const stats = portfolio.stats || {};
                  const pending = stats.pendingRebalanceCount ?? 0;
                  const unread = stats.unreadAlertCount ?? 0;
                  return (
                    <tr
                      key={portfolio._id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/portfolios/view/${portfolio._id}/overview`)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') navigate(`/portfolios/view/${portfolio._id}/overview`);
                      }}
                      tabIndex={0}
                    >
                      <td className="px-3 py-2 font-medium text-gray-800">{portfolio.name}</td>
                      <td className="px-3 py-2 text-sm">{formatMarketValue(stats.marketValueByCurrency)}</td>
                      <td className={`px-3 py-2 text-sm font-medium ${drift.cls}`}>{drift.text}</td>
                      <td className="px-3 py-2">
                        {pending > 0 && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              navigate(`/portfolios/view/${portfolio._id}/rebalance?sub=suggestions`);
                            }}
                            className="mr-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100"
                          >
                            {PENDING_LABELS.pendingRebalance(pending)}
                          </button>
                        )}
                        {unread > 0 && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onPortfolioFilter?.(portfolio._id);
                            }}
                            className="px-2 py-0.5 text-xs bg-red-50 text-red-700 rounded-full hover:bg-red-100"
                          >
                            {PENDING_LABELS.unreadAlert(unread)}
                          </button>
                        )}
                        {pending === 0 && unread === 0 && (
                          <span className="text-gray-400">{PENDING_LABELS.none}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">{formatLastRebalance(stats)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
