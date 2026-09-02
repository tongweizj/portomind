// src/pages/Portfolio/Rebalance.jsx
// 「再平衡」主 Tab：合并原「再平衡设置 / 再平衡建议 / 再平衡历史」三个子模块，
// 用内部子导航切换，避免丢失现有功能。
import { useState } from 'react';
import PortfolioRebalanceSettings from './PortfolioRebalanceSettings';
import RebalanceSuggester from './RebalanceSuggester';
import RebalanceHistory from './RebalanceHistory';
import { RebalanceTabContext } from './rebalanceTabContext';
import { colors, radii, fontStack } from '../../constants/design-tokens';

const SUB_TABS = [
  { key: 'suggestions', label: '再平衡建议', component: RebalanceSuggester },
  { key: 'settings', label: '阈值设置', component: PortfolioRebalanceSettings },
  { key: 'history', label: '再平衡历史', component: RebalanceHistory },
];

export default function Rebalance() {
  const [activeKey, setActiveKey] = useState('suggestions');
  const Active = SUB_TABS.find(item => item.key === activeKey)?.component || RebalanceSuggester;

  return (
    <RebalanceTabContext.Provider value={{ switchSubTab: setActiveKey }}>
      <div style={{ fontFamily: fontStack.sans, color: colors.textPrimary }}>
        {/* 子导航 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {SUB_TABS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveKey(item.key)}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: activeKey === item.key ? 600 : 500,
                color: activeKey === item.key ? colors.textInverse : colors.textSecondary,
                backgroundColor: activeKey === item.key ? colors.brand : colors.bgCard,
                border: activeKey === item.key ? 'none' : `1px solid ${colors.border}`,
                borderRadius: radii.md,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Active />
      </div>
    </RebalanceTabContext.Provider>
  );
}
