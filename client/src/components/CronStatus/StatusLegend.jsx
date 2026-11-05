// client/src/components/CronStatus/StatusLegend.jsx
//
// TASK-056（C-04）AC4 / AC5：看板状态色图例。
//
// 位置：BoardShell 内、SummaryShell 之后、五卡网格之前（首屏可见，不需要滚动）。
// 语义隔离：本页是「红=坏、绿=好」，与行情页「红涨绿跌」无关，必须在图例文案里写明。
// 非颜色标识：每个状态同时有图标 + 文字，灰度/色盲下仍可区分（AC5）。

import { colors } from '../../constants/design-tokens';
import { STATUS_LEGEND_ITEMS } from './statusTone';

export default function StatusLegend() {
  return (
    <section
      data-testid="status-legend"
      aria-label="看板状态色图例"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 18px',
        padding: '8px 12px',
        marginBottom: 12,
        backgroundColor: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        fontSize: 12,
        color: colors.textSecondary
      }}
    >
      <strong style={{ fontSize: 12, color: colors.textPrimary, whiteSpace: 'nowrap' }}>
        状态图例：
      </strong>
      <span
        data-testid="legend-caveat"
        style={{ color: colors.textMuted, whiteSpace: 'nowrap' }}
      >
        此处红=坏、绿=好，与行情页红涨绿跌无关
      </span>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px 16px',
          margin: 0,
          padding: 0,
          listStyle: 'none'
        }}
      >
        {STATUS_LEGEND_ITEMS.map((item) => (
          <li
            key={item.level}
            data-testid="legend-item"
            data-status={item.level}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <span
              aria-hidden="true"
              data-testid="legend-swatch"
              style={{
                width: 10,
                height: 10,
                flex: '0 0 10px',
                borderRadius: '50%',
                backgroundColor: item.color
              }}
            />
            <span
              aria-hidden="true"
              data-testid="legend-icon"
              style={{ color: item.color, fontWeight: 700, lineHeight: 1 }}
            >
              {item.icon}
            </span>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{item.label}</span>
            <span style={{ color: colors.textMuted }}>（{item.description}）</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
