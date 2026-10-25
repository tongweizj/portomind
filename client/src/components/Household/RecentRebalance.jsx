// 最近再平衡记录（TASK-050 R11）—— 纯展示组件。接口已限 10 条，无需再截。
import { EmptyState } from '../DataState';
import { REBALANCE_STATUS_LABELS } from '../../constants/enums';

// 配色沿用搬移前的既有语义：已执行绿 / 已撤销灰 / 其余（待确认）琥珀。
const STATUS_BADGE_CLASSES = {
  EXECUTED: 'bg-emerald-50 text-emerald-700',
  REVOKED: 'bg-gray-100 text-gray-500',
};
const DEFAULT_STATUS_BADGE_CLASS = 'bg-amber-50 text-amber-700';

export default function RecentRebalance({ records }) {
  const list = records || [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">最近再平衡</h2>

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-xl bg-white p-4 shadow space-y-2">
          {list.map(record => (
            <div key={record._id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
              <div>
                <span className="font-medium text-gray-800">{record.portfolioName}</span>
                <span className="ml-2 text-xs text-gray-400">{record.mode === 'AUTO' ? '自动' : '手动'}</span>
              </div>
              <div className="text-right">
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE_CLASSES[record.status] || DEFAULT_STATUS_BADGE_CLASS}`}>
                  {REBALANCE_STATUS_LABELS[record.status] || record.status}
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  {new Date(record.timestamp).toISOString().slice(0, 10)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
