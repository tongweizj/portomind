// 最近交易预览（TASK-050 R10 / AC12）—— 纯展示组件，本页只做 5 条预览，全量在「全部交易」页。
import { Link } from 'react-router';
import { EmptyState } from '../DataState';
import { ROUTES } from '../../constants/routes';
import { TRANSACTION_ACTION_LABELS } from '../../constants/enums';
import { colors } from '../../constants/design-tokens';

// 接口 `GET /api/family/summary` 的 RECENT_LIMIT = 10（交易与再平衡同限），本页截到 5 条。
const PREVIEW_LIMIT = 5;

// 买/卖沿用既有配色语义（买入红、卖出绿）；标签文字走 enums 的唯一派生（AC16）。
const ACTION_BADGE_CLASSES = {
  buy: 'bg-red-50 text-red-700',
  sell: 'bg-emerald-50 text-emerald-700',
};
// 分红是收益事件、没有涨跌方向：取设计系统 tag 色（浅紫底 + 品牌紫字）。
const DIVIDEND_BADGE_STYLE = { backgroundColor: colors.brandSurface, color: colors.brand };
const isDividendAction = (action) => action === 'div_cash' || action === 'div_reinvest';

export default function RecentTransactions({ transactions }) {
  const list = (transactions || []).slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">最近交易</h2>
        <Link to={ROUTES.PORTFOLIO_TX_ALL} className="text-sm text-blue-600 hover:underline">
          查看全部 →
        </Link>
      </div>

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-xl bg-white p-4 shadow space-y-2">
          {list.map(tx => (
            <div key={tx._id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
              <div>
                <span className="font-medium text-gray-800">{tx.portfolioName}</span>
                <span className="ml-2 text-gray-600">{tx.symbol}</span>
                <span
                  className={`ml-2 text-xs px-1.5 py-0.5 rounded ${ACTION_BADGE_CLASSES[tx.action] || 'bg-gray-100 text-gray-500'}`}
                  style={isDividendAction(tx.action) ? DIVIDEND_BADGE_STYLE : undefined}>
                  {TRANSACTION_ACTION_LABELS[tx.action] || tx.action || '—'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-gray-800">
                  {tx.quantity} × {tx.price}
                </span>
                <span className="ml-2 text-xs text-gray-400">{new Date(tx.date).toISOString().slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
