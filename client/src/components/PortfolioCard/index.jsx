import { ChevronRight } from 'lucide-react';
import { PORTFOLIO_ACCOUNT_TYPES } from '../../constants/enums';

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

function MarketValueRow({ stats }) {
  if (!stats) return null;
  const buckets = Object.entries(stats.marketValueByCurrency || {});
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="font-medium text-gray-800">
        市值：{buckets.length === 0 ? '—' : buckets.map(formatBucket).join(' + ')}
      </span>
      <span className="text-gray-500">{stats.positionCount} 个持仓</span>
    </div>
  );
}

function DriftBadge({ drift }) {
  if (drift == null) {
    return <span className="text-xs text-gray-400">漂移：—</span>;
  }
  return drift.needsRebalance
    ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">偏离阈值</span>
    : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">配置正常</span>;
}

/**
 * @param {Object} props
 * @param {Object} props.portfolio      投资组合对象，至少包含 { _id, name, description }；
 *                                      可选 stats: { positionCount, marketValueByCurrency, drift }
 * @param {() => void} props.onClick    点击卡片时调用
 * @param {string} [props.className]    额外的 className，用于样式定制
 */
export function PortfolioCard({ portfolio, onClick, className = '' }) {
  // 存量组合无 accountType 字段时兜底为 other。
  const accountLabel = ACCOUNT_TYPE_LABELS[portfolio.accountType || 'other'] || '其他';
  return (
    <div
      className={`bg-white shadow rounded-xl p-6 relative cursor-pointer hover:bg-gray-50 transition ${className}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <h2 className="text-xl font-semibold text-gray-800">{portfolio.name}</h2>
      <p className="text-gray-600 mt-2">{portfolio.description}</p>

      <MarketValueRow stats={portfolio.stats} />

      <div className="flex items-center justify-between text-sm text-gray-700 mt-3">
        <span>类型：{portfolio.type}</span>
        <span>账户：{accountLabel}</span>
        <span>币种：{portfolio.currency}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
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
