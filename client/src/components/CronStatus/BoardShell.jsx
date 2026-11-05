// client/src/components/CronStatus/BoardShell.jsx
//
// TASK-053（C-01）：看板外壳 = 总览条 + 5 卡网格。
//
// 本卡只交付**骨架**：不请求 /api/cron/status，不计算任何数据态。
//   - AC3：总览条恰好 5 灯 + 1 徽章 + 1 快照位，全部「未知」态
//   - AC4：5 卡网格，每卡六区域空态，不出现 undefined / NaN / Invalid Date
//   - AC7：看板任何异常都只影响本区域，不整页白屏、不影响两个原始日志 tab
//          （因此这里自包含渲染，不向父级抛错；父级也不会因看板而中断）
//
// 后续接入：TASK-063 填真实数据与手动刷新，TASK-056 定义状态色与图例，
// TASK-055 填价格完成度。它们只填 BoardShell 已声明的插槽，不改结构。
import { BOARD_SLOTS } from './unknownValue';
import SummaryShell from './SummaryShell';
import StatusLegend from './StatusLegend';
import TaskCardShell from './TaskCardShell';

/**
 * @param {{
 *   summary?: { snapshotAt?: any, overallState?: any },
 *   cards?: Record<string, object>,   // key = BOARD_SLOTS[].key，缺省即「全部未知」
 * }} props
 *   `cards` 的每一项对应 TaskCardShell 的 props；骨架阶段不传 → 5 张卡全为空态。
 */
export default function BoardShell({ summary, cards } = {}) {
  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  const safeCards = cards && typeof cards === 'object' ? cards : {};

  return (
    <div data-testid="board-shell">
      <SummaryShell
        snapshotAt={safeSummary.snapshotAt}
        overallState={safeSummary.overallState}
      />
      {/* TASK-056：状态色图例（首屏可见；只新增这一行，不改 053 的 props / 五卡结构） */}
      <StatusLegend />

      {/* 5 卡网格：槽位数来自 BOARD_SLOTS（恰好 5），顺序固定 */}
      <div
        data-testid="task-card-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {BOARD_SLOTS.map((slot) => {
          const data = safeCards[slot.key] || {};
          return <TaskCardShell key={slot.key} label={slot.label} {...data} />;
        })}
      </div>
    </div>
  );
}
