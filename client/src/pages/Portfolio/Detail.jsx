// src/pages/Portfolio/Detail.jsx
// 与 Ardot 设计稿 Screen/PortfolioDetail 对齐：
//   - Header：返回链接 + 组合标题 + Chip 行（类型/币种/最近再平衡）
//   - 4 个主 Tab：持仓概览 / 持仓历史 / 再平衡 / 交易记录
//   - 激活 Tab 用品牌紫文字 + 底部 3px 下划线
import { Navigate, NavLink, useParams } from 'react-router';
import { ROUTES } from '../../constants/routes';
import { colors, fontStack } from '../../constants/design-tokens';
import PortfolioHeader from './PortfolioHeader';
import PositionOverview from './PositionOverview';
import PositionHistory from './PositionHistory';
import Rebalance from './Rebalance';
import Transactions from './Transactions';

const TABS = [
  { key: 'positions', label: '持仓概览', component: PositionOverview },
  { key: 'position-history', label: '持仓历史', component: PositionHistory },
  { key: 'rebalance', label: '再平衡', component: Rebalance },
  { key: 'transactions', label: '交易记录', component: Transactions },
];

const DEFAULT_TAB = 'positions';

export default function Detail() {
  const { id, tab } = useParams();
  if (!tab) return <Navigate to={ROUTES.PORTFOLIO_TAB(id, DEFAULT_TAB)} replace />;

  const active = TABS.find(item => item.key === tab);
  if (!active) return <Navigate to={ROUTES.PORTFOLIO_TAB(id, DEFAULT_TAB)} replace />;
  const ActiveTab = active.component;

  return (
    <div style={{ fontFamily: fontStack.sans, color: colors.textPrimary }}>
      {/* 头部：返回链接 + 标题 + Chip 行 */}
      <PortfolioHeader id={id} />

      {/* Tab 导航 */}
      <nav
        aria-label="组合详情导航"
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${colors.border}`,
          marginBottom: 0,
        }}
      >
        {TABS.map(item => (
          <NavLink
            key={item.key}
            to={ROUTES.PORTFOLIO_TAB(id, item.key)}
            style={({ isActive }) => ({
              padding: '10px 16px 12px 16px',
              fontSize: 13,
              color: isActive ? colors.brand : colors.textSecondary,
              fontWeight: isActive ? 600 : 500,
              position: 'relative',
              whiteSpace: 'nowrap',
              borderBottom: isActive ? `3px solid ${colors.brand}` : '3px solid transparent',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Tab 内容 */}
      <div style={{ paddingTop: 24 }}>
        <ActiveTab />
      </div>
    </div>
  );
}
