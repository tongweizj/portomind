// src/pages/Portfolio/PortfolioHeader.jsx
// 对齐 Ardot 设计稿 PortfolioHeader：
//   - 顶部 BackLink（返回组合列表）
//   - HeaderRow：组合标题 + 操作按钮（编辑/删除占位 → 主要按钮）
//   - ChipRow：类型 · 长期 / 基础币种 · USD / 最近再平衡 · 日期
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { colors, radii, fontStack } from '../../constants/design-tokens';
import { ROUTES } from '../../constants/routes';

const TYPE_LABELS = {
  LongTerm: '长期',
  long_term: '长期',
  Retirement: '退休',
  retirement: '退休',
  Education: '教育',
  education: '教育',
  Custom: '自定义',
  custom: '自定义',
};

function typeLabel(type) {
  return TYPE_LABELS[type] || type || '长期';
}

export default function PortfolioHeader({ id }) {
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolio(id);

  const name = portfolio?.name || '投资组合';
  const type = portfolio?.type;
  const currency = portfolio?.currency || '-';

  // 最近再平衡日期：从后端最近一次已执行记录取（无则显示「暂无」）。
  // 这里不额外请求，避免 Header 引入重数据；由 rebalance Tab 维护时会回填。
  const lastRebalance = portfolio?.lastRebalanceAt
    ? String(portfolio.lastRebalanceAt).slice(0, 10)
    : null;

  return (
    <div
      style={{
        fontFamily: fontStack.sans,
        backgroundColor: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.lg,
        padding: '20px 24px',
        marginBottom: 24,
      }}
    >
      {/* 返回链接 */}
      <button
        type="button"
        onClick={() => navigate(ROUTES.PORTFOLIO_LIST)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: colors.brand,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <ChevronLeft size={14} color={colors.brand} />
        返回组合列表
      </button>

      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          {name}
        </h1>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate(ROUTES.PORTFOLIO_EDIT(id))}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: colors.textPrimary,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              cursor: 'pointer',
            }}
          >
            编辑
          </button>
          <button
            type="button"
            onClick={() => navigate(ROUTES.PORTFOLIO_TAB(id, 'transactions'))}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: colors.textInverse,
              backgroundColor: colors.brand,
              border: 'none',
              borderRadius: radii.md,
              cursor: 'pointer',
            }}
          >
            添加交易
          </button>
        </div>
      </div>

      {/* Chip 行 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <span
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: colors.brand,
            backgroundColor: colors.brandSurface,
            borderRadius: radii.pill,
          }}
        >
          类型 · {typeLabel(type)}
        </span>
        <span
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: colors.textSecondary,
            backgroundColor: '#F1F3F7',
            borderRadius: radii.pill,
          }}
        >
          基础币种 · {currency}
        </span>
        <span
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: colors.textSecondary,
            backgroundColor: '#F1F3F7',
            borderRadius: radii.pill,
          }}
        >
          最近再平衡 · {lastRebalance || '暂无'}
        </span>
      </div>
    </div>
  );
}
