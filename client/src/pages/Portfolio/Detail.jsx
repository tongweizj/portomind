import { Navigate, NavLink, useParams } from 'react-router';
import { ROUTES } from '../../constants/routes';
import Basic from './Basic';
import TargetAllocation from './TargetAllocation';
import Transactions from './Transactions';
import PositionOverview from './PositionOverview';
import PositionHistory from './PositionHistory';
import PortfolioRebalanceSettings from './PortfolioRebalanceSettings';
import RebalanceSuggester from './RebalanceSuggester';
import RebalanceHistory from './RebalanceHistory';

const TABS = [
  { key: 'basic', label: '基本信息', component: Basic },
  { key: 'targets', label: '目标配置', component: TargetAllocation },
  { key: 'transactions', label: '交易', component: Transactions },
  { key: 'positions', label: '持仓', component: PositionOverview },
  { key: 'position-history', label: '持仓历史', component: PositionHistory },
  { key: 'rebalance-settings', label: '再平衡设置', component: PortfolioRebalanceSettings },
  { key: 'rebalance-suggestions', label: '再平衡建议', component: RebalanceSuggester },
  { key: 'rebalance-history', label: '再平衡历史', component: RebalanceHistory }
];

export default function Detail() {
  const { id, tab } = useParams();
  if (!tab) return <Navigate to={ROUTES.PORTFOLIO_TAB(id, 'basic')} replace />;

  const active = TABS.find(item => item.key === tab);
  if (!active) return <Navigate to={ROUTES.PORTFOLIO_TAB(id, 'basic')} replace />;
  const ActiveTab = active.component;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">组合详情</h1>
        <NavLink to={ROUTES.PORTFOLIO_LIST} className="text-sm text-blue-600 hover:underline">
          返回组合列表
        </NavLink>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="组合详情导航">
        {TABS.map(item => (
          <NavLink
            key={item.key}
            to={ROUTES.PORTFOLIO_TAB(id, item.key)}
            className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              isActive
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-blue-600'
            }`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <ActiveTab />
    </div>
  );
}
