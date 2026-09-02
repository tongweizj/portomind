// src/pages/Portfolio/KpiCards.jsx
// 对齐 Ardot 设计稿 KpiRow：4 张 KPI 卡
//   持仓总市值 / 今日盈亏 / 累计盈亏比 / 持有资产
// 数据从 /positions 接口聚合（前端计算，不新增后端接口）。
// 说明：后端暂无「前收价」字段，故「今日盈亏」无法精确计算，展示为「—」。
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getPositions } from '../../services/position.service';
import { colors, radii, fontStack } from '../../constants/design-tokens';

const MONEY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return MONEY_FORMATTER.format(value);
}

export default function KpiCards() {
  const { id: portfolioId } = useParams();
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let active = true;
    getPositions(portfolioId, { page: 1, pageSize: 100 })
      .then(({ data }) => active && setPositions(data))
      .catch(() => active && setPositions([]));
    return () => { active = false; };
  }, [portfolioId]);

  const totalMarketValue = positions.reduce(
    (sum, p) => sum + (Number(p.marketValue) || 0), 0
  );
  const totalUnrealizedPnl = positions.reduce(
    (sum, p) => sum + (Number(p.unrealizedPnl) || 0), 0
  );
  const totalCost = positions.reduce(
    (sum, p) => sum + (Number(p.remainingCost) || 0), 0
  );
  const pnlPct = totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0;
  const assetCount = positions.length;

  const cards = [
    { label: '持仓总市值', value: formatMoney(totalMarketValue), tone: 'neutral' },
    { label: '今日盈亏', value: '—', tone: 'neutral' },
    {
      label: '累计盈亏比',
      value: `${totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}`,
      sub: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
      tone: totalUnrealizedPnl >= 0 ? 'up' : 'down',
    },
    { label: '持有资产', value: `${assetCount} 项`, tone: 'neutral' },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}
    >
      {cards.map((card) => {
        const valueColor = card.tone === 'up'
          ? colors.up
          : card.tone === 'down'
            ? colors.down
            : colors.textPrimary;
        return (
          <div
            key={card.label}
            style={{
              fontFamily: fontStack.sans,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.lg,
              padding: '16px 18px',
              minHeight: 96,
            }}
          >
            <div style={{ fontSize: 12, color: colors.textMuted, fontWeight: 500 }}>
              {card.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: valueColor,
                fontFamily: fontStack.numeric,
                marginTop: 6,
              }}
            >
              {card.value}
            </div>
            {card.sub && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: valueColor,
                  marginTop: 4,
                }}
              >
                {card.sub}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
