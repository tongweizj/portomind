// client/src/components/CronStatus/SummaryShell.jsx
//
// TASK-053（C-01）AC3：顶部总览条的 DOM 结构。
// TASK-063：新增可选 levels / overallLevel，用真实 dataStateLevel 驱动五灯与徽章；
// 不传时仍为全部 unknown（053 骨架行为不变）。
import { BOARD_SLOTS, UNKNOWN_TEXT } from './unknownValue';
import { getStatusTone } from './statusTone';

const NEUTRAL = {
  bg: '#F6F8FA',
  border: '#E3E8EE',
  ink: '#0A2540',
  ink2: '#5E6B7E',
  muted: '#8A95A5',
};

function HealthDot({ label, level = 'unknown' }) {
  const tone = getStatusTone(level);
  return (
    <li
      data-testid="health-dot"
      data-state={level}
      title={`${label}：${tone.label}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, listStyle: 'none' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: tone.color,
          flex: '0 0 8px',
        }}
      />
      <span style={{ fontSize: 12, color: NEUTRAL.ink2, whiteSpace: 'nowrap' }}>{label}</span>
    </li>
  );
}

/**
 * @param {{
 *   snapshotAt?: any,
 *   overallState?: string,
 *   overallLevel?: 'ok'|'warn'|'bad'|'unknown',
 *   levels?: string[],
 * }} props
 */
export default function SummaryShell({ snapshotAt, overallState, overallLevel = 'unknown', levels = [] } = {}) {
  const safeLevels = Array.isArray(levels) ? levels : [];
  const badgeTone = getStatusTone(overallLevel);

  return (
    <section
      data-testid="board-summary"
      aria-label="任务运行总览"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
        padding: '12px 16px',
        marginBottom: 16,
        backgroundColor: '#FFFFFF',
        border: `1px solid ${NEUTRAL.border}`,
        borderRadius: 10,
      }}
    >
      {/* 5 个健康灯位：数量写死为 BOARD_SLOTS 的长度（恰好 5） */}
      <ul
        data-testid="health-dots"
        style={{ display: 'flex', alignItems: 'center', gap: 14, margin: 0, padding: 0 }}
      >
        {BOARD_SLOTS.map((slot, index) => (
          <HealthDot
            key={slot.key}
            label={slot.label}
            level={safeLevels[index] || 'unknown'}
          />
        ))}
      </ul>

      <span style={{ flex: 1 }} />

      {/* 1 个整体健康徽章 */}
      <span
        data-testid="overall-badge"
        data-state={overallLevel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          backgroundColor: NEUTRAL.bg,
          border: `1px solid ${NEUTRAL.border}`,
          color: badgeTone.color,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        整体健康：{overallState || UNKNOWN_TEXT}
      </span>

      {/* 1 行数据快照时间文案 */}
      <span
        data-testid="snapshot-at"
        style={{ fontSize: 12, color: NEUTRAL.muted, whiteSpace: 'nowrap' }}
      >
        数据快照：{snapshotAt || UNKNOWN_TEXT}
      </span>
    </section>
  );
}
