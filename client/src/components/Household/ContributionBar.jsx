// 组合占比堆叠条 + 图例（TASK-050 R9 / AC10 / AC11）—— 纯展示组件。
// 与旧的「贡献列表」相比只保留一条横向堆叠条，避免与下方 PortfolioCard 重复表达同一批组合。
import { useNavigate } from 'react-router';
import { EmptyState } from '../DataState';
import { ROUTES } from '../../constants/routes';
import { formatCny } from '../../utils/priceDisplay';

// OD-4（Human 2026-10-21 裁决）：品牌紫梯度，6 档循环。
const BAR_COLORS = ['#635BFF', '#7C75FF', '#9A94FF', '#B7B3FF', '#D2D0FF', '#E7E5FF'];
// 折算不完整的组合不占条宽，图例里用中性色块表示「未计入」。
const INCOMPLETE_CHIP = '#D7DEE6';

// AC14 / OD-3：口径说明**恒显示**（不随「显示已归档」开关变化）。
const SCOPE_NOTE = '分桶与占比仅含未归档组合；已归档组合需在下方卡片中单独查看。';

export default function ContributionBar({ contributions }) {
  const navigate = useNavigate();
  const list = contributions || [];

  // 先按「是否有 ratio」分配颜色，保证条上每段与图例色块一一对应。
  let colorIndex = 0;
  const items = list.map(contribution => {
    if (contribution.ratio == null) return { contribution, color: null };
    const color = BAR_COLORS[colorIndex % BAR_COLORS.length];
    colorIndex += 1;
    return { contribution, color };
  });

  const segments = items.filter(item => item.color != null);
  // AC10：各段宽度之和 ≤ 100%。ratio 是服务端 toFixed(2) 的百分数，正常合计 ≈100；
  // 超过 100 只可能来自浮点累积，此时按合计归一化，不影响相对比例。
  const ratioSum = segments.reduce((sum, item) => sum + Number(item.contribution.ratio), 0);
  const widthOf = (ratio) => (ratioSum > 100 ? (Number(ratio) / ratioSum) * 100 : Number(ratio));

  // 单出口结构（Reviewer R-1 返修）：标题与口径说明都放在条件分支**之外**，
  // 空态只替换中间那一段内容。原实现 `if (list.length === 0) return <EmptyState />`
  // 属整块早退，会把返回 JSX 里的兄弟节点一并吞掉 —— 包括 AC14/OD-3 要求恒显示的说明。
  // 典型触发场景：全部组合已归档 + 勾选「显示已归档」→ 卡片有内容、占比为空，
  // 恰恰是最需要解释口径的时候（用户会以为数据丢了）。
  // 同页 `RecentTransactions` / `RecentRebalance` 已是这种写法，此处对齐。
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-800">组合占比</h2>

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className="flex h-full">
              {segments.map(({ contribution, color }) => (
                <div
                  key={String(contribution.portfolioId)}
                  style={{ width: `${widthOf(contribution.ratio)}%`, backgroundColor: color }}
                  title={`${contribution.name} ${contribution.ratio}%`}
                />
              ))}
            </div>
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {items.map(({ contribution, color }) => (
              <li key={String(contribution.portfolioId)}>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.PORTFOLIO_TAB(contribution.portfolioId, 'positions'))}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: color || INCOMPLETE_CHIP }}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{contribution.name}</span>
                  <span className="text-gray-400">{formatCny(contribution.cnyValue)}</span>
                  <span className="text-gray-500">
                    {contribution.ratio != null ? `${contribution.ratio}%` : '折算不完整'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-xs text-gray-400">{SCOPE_NOTE}</p>
    </div>
  );
}
