import { ChevronRight } from 'lucide-react';
import { PORTFOLIO_ACCOUNT_TYPES } from '../../constants/enums';

// ⚠️ 待 B(TASK-066) 的 driftLabels.js 合入 main 后，切换为 import 共享常量；
// 当前 main 无该文件（D-02：由 Implementer B 拥有），本卡临时内联文案，绝不新建同名文件。

const ACCOUNT_TYPE_LABELS = Object.fromEntries(
  PORTFOLIO_ACCOUNT_TYPES.map(({ value, label }) => [value, label])
);

// 市值按币种分桶展示（PRD CM-12）：不同币种不直接合计。
const CURRENCY_SYMBOLS = { CNY: '¥', CAD: 'CA$', USD: 'US$' };

function formatBucket([currency, value]) {
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  return value == null
    ? `${currency} —`
    : `${symbol}${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

// 上次再平衡日期 → YYYY-MM-DD；无值返回 null（调用方显示「从未」）。
// summary 序列化后 lastExecutedAt 已是 ISO 字符串；此处兼容 Date 对象兜底。
function formatDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function DriftBadge({ drift }) {
  if (drift == null) {
    return <span className="text-xs text-gray-400">漂移：—</span>;
  }
  return drift.needsRebalance
    ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">偏离阈值</span>
    : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">配置正常</span>;
}

// 四格：总市值 / 持仓资产 / 待办 / 上次再平衡（B15）。
// 数据全部取自 usePortfolios() 的 stats，零新增请求、零服务端改动。
// 降级口径：字段缺失显示「—」/「从未」，不崩、不显示 0。
function StatCells({ stats }) {
  // ① 总市值：分币种并列，不跨币种合计；空桶显示「—」。
  const buckets = Object.entries(stats?.marketValueByCurrency || {});
  const marketValue = buckets.length === 0 ? '—' : buckets.map(formatBucket).join(' + ');

  // ② 持仓资产：positionCount（已有字段）。
  const positionCount = stats?.positionCount;

  // ③ 待办：pendingRebalanceCount（065 新增）+ unreadAlertCount（已有）。
  // 字段缺失时按「不显示 0」降级（undefined 不算 >0）；两者皆无 → 「—」。
  const pending = stats?.pendingRebalanceCount;
  const unread = stats?.unreadAlertCount;
  const hasPending = typeof pending === 'number' && pending > 0;
  const hasUnread = typeof unread === 'number' && unread > 0;

  // ④ 上次再平衡：lastExecutedAt（065 新增）→ YYYY-MM-DD，null → 「从未」。
  const lastExecuted = formatDate(stats?.lastExecutedAt);

  return (
    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg bg-gray-50 p-3">
        <p className="text-xs text-gray-500">总市值</p>
        <p className="mt-1 font-medium text-gray-800 break-words">{marketValue}</p>
      </div>
      <div className="rounded-lg bg-gray-50 p-3">
        <p className="text-xs text-gray-500">持仓资产</p>
        <p className="mt-1 font-medium text-gray-800">
          {positionCount == null ? '—' : `${positionCount} 个`}
        </p>
      </div>
      <div className="rounded-lg bg-gray-50 p-3">
        <p className="text-xs text-gray-500">待办</p>
        <p className="mt-1 font-medium text-gray-800">
          {hasPending || hasUnread ? (
            <>
              {hasPending && <span>{pending} 条待确认</span>}
              {hasPending && hasUnread && <span className="text-gray-400"> · </span>}
              {hasUnread && <span>{unread} 条未读</span>}
            </>
          ) : (
            '—'
          )}
        </p>
      </div>
      <div className="rounded-lg bg-gray-50 p-3">
        <p className="text-xs text-gray-500">上次再平衡</p>
        <p className="mt-1 font-medium text-gray-800">{lastExecuted || '从未'}</p>
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.portfolio      投资组合对象，至少包含 { _id, name, description }；
 *                                      可选 stats: { positionCount, marketValueByCurrency, drift,
 *                                      pendingRebalanceCount, unreadAlertCount, lastExecutedAt }、
 *                                      archived: true（已归档，CM-20）
 * @param {() => void} props.onClick    点击卡片时调用
 * @param {string} [props.className]    额外的 className，用于样式定制
 */
export function PortfolioCard({ portfolio, onClick, className = '' }) {
  // 存量组合无 accountType 字段时兜底为 other。
  const accountLabel = ACCOUNT_TYPE_LABELS[portfolio.accountType || 'other'] || '其他';
  const archived = portfolio.archived === true;
  return (
    <div
      className={`bg-white shadow rounded-xl p-6 relative cursor-pointer hover:bg-gray-50 transition ${className} ${archived ? 'opacity-60' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-gray-800">{portfolio.name}</h2>
        {archived && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 border border-gray-200">
            已归档
          </span>
        )}
      </div>
      <p className="text-gray-600 mt-2">{portfolio.description}</p>

      <StatCells stats={portfolio.stats} />

      <div className="flex items-center justify-between text-sm text-gray-700 mt-3">
        <span>类型：{portfolio.type}</span>
        <span>账户：{accountLabel}</span>
        <span>币种：{portfolio.currency}</span>
      </div>

      <div className="mt-3 flex items-center">
        <DriftBadge drift={portfolio.stats?.drift} />
      </div>

      <div
        className="absolute top-4 right-4 text-gray-400"
      /* 点击箭头也触发卡片 onClick */
      >
        <ChevronRight size={24} />
      </div>
    </div>
  );
}
