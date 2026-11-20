// client/src/components/CronStatus/BoardShell.jsx
//
// 看板外壳负责总览、图例和固定槽位网格，卡片可由调用方提供。
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
      {/* TASK-056：首屏状态色图例 */}
      <StatusLegend />

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
