// src/pages/PortfolioEditor.jsx
import { useState } from 'react';
import { useParams } from 'react-router';

import PortfolioBasicTab from './BasicTab';
import PortfolioTargetTab from './AssetsTab';
import PortfolioRebalanceTab from './RebalanceTab';

export default function PortfolioEditor() {
  const [activeTab, setActiveTab] = useState('basic');
  const { id } = useParams(); // 编辑组合时有 id

  const tabs = [
    { key: 'basic', label: '基本信息' },
    { key: 'targets', label: '资产配置' },
    { key: 'rebalance', label: '再平衡条件' }
  ];

  return (
    <div className="p-6 bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-6">{id ? '编辑组合' : '创建组合'}</h1>

      <div className="flex space-x-6 border-b mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`pb-2 px-3 text-sm font-semibold ${
              activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'basic' && <PortfolioBasicTab portfolioId={id} />}
        {activeTab === 'targets' && <PortfolioTargetTab portfolioId={id} />}
        {activeTab === 'rebalance' && <PortfolioRebalanceTab portfolioId={id} />}
      </div>
    </div>
  );
}
