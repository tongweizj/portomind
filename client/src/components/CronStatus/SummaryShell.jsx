// client/src/components/CronStatus/SummaryShell.jsx
//
// TASK-053（C-01）AC3：顶部总览条的 **DOM 结构**就位。
//
// 交付的是「位置」，不是「数据」：
//   - 恰好 5 个健康灯位（一一对应 BOARD_SLOTS 的五个任务）
//   - 恰好 1 个整体健康徽章
//   - 恰好 1 行数据快照时间文案
//
// 骨架阶段全部是「未知」态（中性灰）。**不得**默认渲染成绿色 —— 那会让用户以为
// 「五个任务都正常」，是本任务 R-1 明确要避免的误读。真实数据由 TASK-063 填入。
import { BOARD_SLOTS, UNKNOWN_TEXT } from './unknownValue';

const NEUTRAL = {
  bg: '#F6F8FA',
  border: '#E3E8EE',
  ink: '#0A2540',
  ink2: '#5E6B7E',
  muted: '#8A95A5',
};

/**
 * 健康灯：骨架阶段恒为「未知」。
 * 用 `data-state="unknown"` 把语义写进 DOM，便于 TASK-056 接入状态色、
 * 也便于测试断言「没有一个是 success/绿」。
 */
function HealthDot({ label }) {
  return (
    <li
      data-testid="health-dot"
      data-state="unknown"
      title={`${label}：${UNKNOWN_TEXT}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, listStyle: 'none' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          // 中性灰，不是绿色：骨架阶段不得给出成功语义
          backgroundColor: NEUTRAL.muted,
          flex: '0 0 8px',
        }}
      />
      <span style={{ fontSize: 12, color: NEUTRAL.ink2, whiteSpace: 'nowrap' }}>{label}</span>
    </li>
  );
}

/**
 * @param {{ snapshotAt?: any, overallState?: string }} props
 *   snapshotAt / overallState 由 TASK-063 传入；骨架阶段一律缺省 → 显示「未知」。
 */
export default function SummaryShell({ snapshotAt, overallState } = {}) {
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
        {BOARD_SLOTS.map((slot) => (
          <HealthDot key={slot.key} label={slot.label} />
        ))}
      </ul>

      <span style={{ flex: 1 }} />

      {/* 1 个整体健康徽章 */}
      <span
        data-testid="overall-badge"
        data-state="unknown"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          backgroundColor: NEUTRAL.bg,
          border: `1px solid ${NEUTRAL.border}`,
          color: NEUTRAL.ink2,
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
