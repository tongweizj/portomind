// client/src/components/CronStatus/DataTaskCard.jsx
//
// TASK-063：完整性 / 提醒 / 汇率 / 再平衡四卡的展示组件。
// 沿用 053 的六区域解剖（card-title / run-state / last-run / data-ratio /
// key-metric / anomaly-entry），额外渲染真实摘要、lastSkip 与 notes。
// 纯展示：不发请求、不读业务数据，所有派生来自 taskDataViews。

import { colors } from '../../constants/design-tokens';
import { getStatusTone } from './statusTone';

const cardStyle = {
  backgroundColor: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 168,
  color: colors.textPrimary,
  fontSize: 12
};

const mutedStyle = { color: colors.textMuted };
const secondaryStyle = { color: colors.textSecondary };

/**
 * @param {{
 *   label?: string,
 *   view?: object,
 * }} props
 */
export default function DataTaskCard({ label = '', view = null } = {}) {
  const safeView = view && typeof view === 'object' ? view : {};
  const level = safeView.level || 'unknown';
  const tone = getStatusTone(level);
  const details = Array.isArray(safeView.details) ? safeView.details : [];
  const notes = Array.isArray(safeView.notes) ? safeView.notes : [];

  return (
    <article
      data-testid="task-card"
      data-state={safeView.empty || level}
      data-level={level}
      aria-label={label}
      style={cardStyle}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 data-testid="card-title" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          {label}
        </h3>
        <span style={{ flex: 1 }} />
        <span
          data-testid="run-state"
          data-state={safeView.stale ? 'stale' : level}
          title="运行状态只来自任务记录，不参与数据态配色"
          style={{
            padding: '2px 9px',
            borderRadius: 999,
            backgroundColor: colors.bgPage,
            border: `1px solid ${colors.border}`,
            color: colors.textSecondary,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
        >
          运行状态：{safeView.runStateText || '未知'}
        </span>
      </header>

      <div data-testid="last-run" style={mutedStyle}>
        上次运行：<span style={secondaryStyle}>{safeView.lastRunText || '—'}</span>
      </div>

      <div data-testid="data-ratio" data-state={safeView.empty || level}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            aria-hidden="true"
            data-testid="task-tone-dot"
            style={{
              width: 10,
              height: 10,
              flex: '0 0 10px',
              borderRadius: '50%',
              backgroundColor: tone.color
            }}
          />
          <span data-testid="task-tone-label" style={{ color: tone.color, fontWeight: 600 }}>
            {tone.icon} {tone.label}
          </span>
          {safeView.statusMessage && (
            <span data-testid="task-status-message" style={secondaryStyle}>
              {safeView.statusMessage}
            </span>
          )}
        </div>
      </div>

      <div data-testid="key-metric" style={mutedStyle}>
        关键数字：<span style={secondaryStyle}>{safeView.keyMetricText || '—'}</span>
      </div>

      {details.length > 0 && (
        <dl
          data-testid="task-details"
          style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}
        >
          {details.map((detail) => (
            <div key={`${detail.label}-${detail.value}`} style={{ display: 'contents' }}>
              <dt data-testid="task-detail-label" style={mutedStyle}>{detail.label}</dt>
              <dd data-testid="task-detail-value" style={{ margin: 0, color: colors.textSecondary }}>
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {safeView.lastSkipText && (
        <div data-testid="last-skip" style={mutedStyle}>
          {safeView.lastSkipText}
        </div>
      )}

      {notes.length > 0 && (
        <div data-testid="task-notes" style={{ ...mutedStyle, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {notes.map((note, index) => (
            <span key={`${note}-${index}`}>{note}</span>
          ))}
        </div>
      )}

      <footer style={{ marginTop: 'auto' }}>
        <button
          type="button"
          data-testid="anomaly-entry"
          disabled
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            fontSize: 12,
            color: colors.textMuted,
            cursor: 'not-allowed'
          }}
        >
          异常：{safeView.anomalyText || '—'}
        </button>
      </footer>
    </article>
  );
}
