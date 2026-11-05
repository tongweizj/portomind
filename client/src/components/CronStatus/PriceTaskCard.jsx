// client/src/components/CronStatus/PriceTaskCard.jsx
//
// TASK-055（FS C-03）：价格同步卡的「数据态」展示。
//
// 定位：纯展示组件，由 TASK-063 的共享请求层把 GET /api/cron/status 的单次快照
// 通过 props 传入（本组件**不发请求**、不自行取市场日、不重算业务口径）。
// 不修改 TASK-053 的 TaskCardShell / TASK-056 的 statusTone 与 StatusLegend 契约。
//
// 关键约束：
//   - 配色只来自 dataStateLevel → TASK-056 的 statusTone 映射，不硬编码状态色；
//   - 运行状态只渲染为徽章，不参与数据态配色（AC7）；
//   - expected / fetched 原样展示；唯一换算在 priceDataState.computePercentage；
//   - expected === 0 → 百分比 "—"、宽度 0，不出现 0% / NaN / Infinity（AC4）。

import { colors } from '../../constants/design-tokens';
import { formatTimestamp, UNKNOWN_TEXT } from './unknownValue';
import { getPriceView } from './priceDataState';

const cardStyle = {
  backgroundColor: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minHeight: 168,
  color: colors.textPrimary,
  fontSize: 12
};

const mutedStyle = { color: colors.textMuted };
const secondaryStyle = { color: colors.textSecondary };

/**
 * @param {{
 *   label?: string,
 *   dataState?: object|null,
 *   dataStateLevel?: 'ok'|'warn'|'bad'|'unknown'|null,
 *   lastRunAt?: any,
 *   runState?: any,
 *   requestError?: any,
 *   snapshotAt?: any,
 *   onRetry?: Function,
 * }} props
 */
export default function PriceTaskCard({
  label = '价格同步',
  dataState = null,
  dataStateLevel = null,
  lastRunAt = null,
  runState = null,
  requestError = null,
  snapshotAt = null,
  onRetry
} = {}) {
  const view = getPriceView({ dataState, dataStateLevel, requestError });
  const hasDataRows = view.mode !== 'request-error' && view.mode !== 'invalid';

  return (
    <article
      data-testid="price-card"
      data-state={view.mode}
      data-level={view.level}
      aria-label={label}
      style={cardStyle}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 data-testid="price-title" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          {label}
        </h3>
        <span style={{ flex: 1 }} />
        <span
          data-testid="price-run-state"
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
          运行状态：{runState || UNKNOWN_TEXT}
        </span>
      </header>

      <div data-testid="price-last-run" style={mutedStyle}>
        上次运行：<span style={secondaryStyle}>{formatTimestamp(lastRunAt)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden="true"
          data-testid="price-tone-dot"
          style={{
            width: 10,
            height: 10,
            flex: '0 0 10px',
            borderRadius: '50%',
            backgroundColor: view.tone.color
          }}
        />
        <span
          data-testid="price-tone-label"
          style={{ color: view.tone.color, fontWeight: 600 }}
        >
          {view.tone.icon} {view.tone.label}
        </span>
        {hasDataRows && (
          <span data-testid="price-status-message" style={secondaryStyle}>
            {view.statusMessage}
          </span>
        )}
      </div>

      {hasDataRows && (
        <>
          <div data-testid="price-target-date" style={secondaryStyle}>
            目标市场日（上一开市日）：{view.targetText}
          </div>
          <div data-testid="price-counts" style={secondaryStyle}>
            应采 / 已采：{view.countsText}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={mutedStyle}>完成度：</span>
            <strong data-testid="price-percent">{view.percentText}</strong>
          </div>
          <div
            data-testid="price-progress"
            role="progressbar"
            aria-label="价格同步数据完成度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.percent === null ? undefined : Math.round(view.percent)}
            aria-valuetext={view.percentText}
            style={{
              height: 6,
              borderRadius: 999,
              backgroundColor: colors.bgPage,
              border: `1px solid ${colors.border}`,
              overflow: 'hidden'
            }}
          >
            <div
              data-testid="price-progress-fill"
              style={{
                width: `${view.width}%`,
                height: '100%',
                backgroundColor: view.tone.color
              }}
            />
          </div>
        </>
      )}

      {view.mode === 'request-error' && (
        <div
          data-testid="price-error"
          style={{ color: view.tone.color, fontWeight: 600 }}
        >
          快照获取失败
        </div>
      )}

      {view.mode === 'request-error' && snapshotAt && (
        <div data-testid="price-stale-note" style={mutedStyle}>
          数据为 {formatTimestamp(snapshotAt)} 时快照，刷新失败
        </div>
      )}

      {view.mode === 'request-error' && onRetry && (
        <button
          type="button"
          data-testid="price-retry"
          onClick={onRetry}
          style={{
            alignSelf: 'flex-start',
            border: `1px solid ${colors.border}`,
            background: colors.bgCard,
            color: colors.textSecondary,
            borderRadius: 6,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          重试
        </button>
      )}

      {view.mode === 'invalid' && (
        <div
          data-testid="price-invalid"
          style={{ color: view.tone.color, fontWeight: 600 }}
        >
          价格数据异常
        </div>
      )}

      {view.showMissingList && (
        <details data-testid="price-missing" style={{ marginTop: 2 }}>
          <summary
            data-testid="price-missing-summary"
            style={{ cursor: 'pointer', color: colors.textSecondary }}
          >
            缺 {view.missingCount} 支
          </summary>
          <ul
            style={{
              margin: '6px 0 0',
              padding: '0 0 0 16px',
              maxHeight: 140,
              overflowY: 'auto'
            }}
          >
            {view.missing.map((item, index) => (
              <li
                key={`${item && item.symbol}-${index}`}
                data-testid="price-missing-item"
                style={{ marginBottom: 4 }}
              >
                <code style={{ color: colors.textPrimary }}>{item && item.symbol ? item.symbol : '—'}</code>
                <span style={secondaryStyle}> {item && item.name ? item.name : '—'}</span>
                <span style={mutedStyle}> · {item && item.market ? item.market : '—'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
