// client/src/components/CronStatus/BoardShell.jsx
//
// TASK-053（C-01）：看板外壳 = 总览条 + 5 卡网格。
// TASK-063：新增可选的 cardComponents 槽位映射（缺省仍为 TaskCardShell，
// 保证 053 骨架与旧调用不受影响）；summary 增加 levels/overallLevel 供 SummaryShell
// 显示真实五灯与总览徽章。结构、五卡数量与 StatusLegend 位置均未改。
import { BOARD_SLOTS } from './unknownValue';
import SummaryShell from './SummaryShell';
import StatusLegend from './StatusLegend';
import TaskCardShell from './TaskCardShell';

/**
 * @param {{
 *   summary?: { snapshotAt?: any, overallState?: any, overallLevel?: string, levels?: string[] },
 *   cards?: Record<string, object>,   // key = BOARD_SLOTS[].key，缺省即「全部未知」
 *   cardComponents?: Record<string, Function>, // 可选：槽位 → 卡组件；缺省 TaskCardShell
 * }} props
 */
export default function BoardShell({ summary, cards, cardComponents } = {}) {
  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  const safeCards = cards && typeof cards === 'object' ? cards : {};
  const safeComponents = cardComponents && typeof cardComponents === 'object' ? cardComponents : {};

  return (
    <div data-testid="board-shell">
      <SummaryShell
        snapshotAt={safeSummary.snapshotAt}
        overallState={safeSummary.overallState}
        overallLevel={safeSummary.overallLevel}
        levels={safeSummary.levels}
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
          const Card = safeComponents[slot.key] || TaskCardShell;
          return <Card key={slot.key} label={slot.label} {...data} />;
        })}
      </div>
    </div>
  );
}
