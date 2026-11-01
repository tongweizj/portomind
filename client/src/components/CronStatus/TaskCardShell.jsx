// client/src/components/CronStatus/TaskCardShell.jsx
//
// TASK-053（C-01）AC4：单张任务卡的**六个区域位置**。
//
// 六个区域（顺序固定，全部为空态占位，不含任何真实数据）：
//   1. 任务名          2. 上次运行时间      3. 运行态徽章
//   4. 数据态进度条位   5. 关键数字位        6. 异常入口位
//
// 边界（任务卡 §4 Out of Scope）：
//   - 状态色语义与图例 → TASK-056，本文件只用中性色 + `data-state="unknown"`
//   - 进度条真实比例、价格完成度 → TASK-054 / TASK-055
//   - 异常清单展开 → TASK-055
// 本文件只声明插槽（props）与位置，不计算任何东西。
import { formatNumber, formatTimestamp, isUnknown, UNKNOWN_TEXT } from './unknownValue';

const C = {
  card: '#FFFFFF',
  border: '#E3E8EE',
  bg: '#F6F8FA',
  ink: '#0A2540',
  ink2: '#5E6B7E',
  muted: '#8A95A5',
};

/**
 * @param {{
 *   label: string,             // 任务名（固定槽位文案）
 *   lastRunAt?: any,           // 上次运行时间，未知时显示占位
 *   runState?: any,            // 运行态，未知时显示「未知」
 *   dataStateRatio?: any,      // 数据态进度（0–100），未知时不画实心进度
 *   keyMetric?: any,           // 关键数字，未知时显示占位
 *   anomalyCount?: any,        // 异常条数，未知时显示占位
 *   onAnomalyClick?: Function, // 异常入口（骨架阶段不提供动作）
 * }} props
 */
export default function TaskCardShell({
  label,
  lastRunAt,
  runState,
  dataStateRatio,
  keyMetric,
  anomalyCount,
  onAnomalyClick,
} = {}) {
  const ratio = !isUnknown(dataStateRatio) && Number.isFinite(Number(dataStateRatio))
    ? Math.min(100, Math.max(0, Number(dataStateRatio)))
    : null;

  return (
    <article
      data-testid="task-card"
      data-state="unknown"
      aria-label={label}
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 168,
      }}
    >
      {/* 1. 任务名 + 3. 运行态徽章 */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3
          data-testid="card-title"
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}
        >
          {label}
        </h3>
        <span style={{ flex: 1 }} />
        <span
          data-testid="run-state"
          data-state="unknown"
          style={{
            padding: '2px 9px',
            borderRadius: 999,
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            color: C.ink2,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {runState || UNKNOWN_TEXT}
        </span>
      </header>

      {/* 2. 上次运行时间 */}
      <div style={{ fontSize: 12, color: C.muted }}>
        上次运行：
        <span data-testid="last-run" style={{ color: C.ink2 }}>
          {formatTimestamp(lastRunAt)}
        </span>
      </div>

      {/* 4. 数据态进度条位（骨架阶段画空槽，不画实心） */}
      <div data-testid="data-ratio" data-state="unknown">
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
          数据完整度：{ratio === null ? UNKNOWN_TEXT : `${formatNumber(ratio)}%`}
        </div>
        <div
          role="progressbar"
          aria-valuenow={ratio === null ? undefined : ratio}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} 数据完整度`}
          style={{
            height: 6,
            borderRadius: 999,
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: ratio === null ? '0%' : `${ratio}%`,
              height: '100%',
              // 中性灰填充：骨架阶段不暗示「已完成」
              backgroundColor: C.muted,
            }}
          />
        </div>
      </div>

      {/* 5. 关键数字位 */}
      <div data-testid="key-metric" style={{ fontSize: 12, color: C.muted }}>
        关键数字：
        <span style={{ color: C.ink2, fontWeight: 600 }}>
          {isUnknown(keyMetric) ? UNKNOWN_TEXT : formatNumber(keyMetric)}
        </span>
      </div>

      {/* 6. 异常入口位（骨架阶段是纯占位，不提供写操作） */}
      <footer style={{ marginTop: 'auto' }}>
        <button
          type="button"
          data-testid="anomaly-entry"
          disabled={isUnknown(anomalyCount) || !onAnomalyClick}
          onClick={onAnomalyClick}
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            fontSize: 12,
            color: isUnknown(anomalyCount) ? C.muted : C.ink2,
            cursor: 'not-allowed',
          }}
        >
          异常：{isUnknown(anomalyCount) ? UNKNOWN_TEXT : `${formatNumber(anomalyCount)} 条`}
        </button>
      </footer>
    </article>
  );
}
