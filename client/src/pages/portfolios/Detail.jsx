import React,{useEffect, useState} from 'react';
import { useParams, useNavigate } from 'react-router';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useTransactions } from '../../hooks/useTransactions';
import { TransactionTable } from '../../components/TransactionTable';
import { ButtonGroup } from '../../components/ButtonGroup';
import PortfolioRebalance from './PortfolioRebalanceSettings';
import PositionOverview from './PositionOverview';
import Rebalance from './Rebalance';
import RebalanceSuggester from './RebalanceSuggester';
import RebalanceHistory from './RebalanceHistory';
import { ROUTES } from '../../constants/routes';
import Basic from './Basic';
import { Pencil, Trash, Plus } from 'lucide-react';

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [actualRatios, setActualRatios] = useState([]);
  const { data: pf, isLoading: loadingPF, isError: errorPF } = usePortfolio(id);
  const { data: txs, isLoading: loadingTx, isError: errorTx } = useTransactions(id);
const [activeTab, setActiveTab] = useState('details');
  if (loadingPF || loadingTx) return <p>加载中…</p>;
  if (errorPF || errorTx)     return <p>数据加载出错</p>;

  const buttons = [
    { label: '编辑', onClick: () => navigate(ROUTES.PORTFOLIO_EDIT(id)), type: 'primary' },
    { label: '返回', onClick: () => navigate(ROUTES.PORTFOLIO_LIST) },
    { label: '再平衡', onClick: () => navigate(ROUTES.PORTFOLIO_REBALANCE(id)) },
  ];
  console.log("txs: ",txs.data);
    // 删除组合
    const handleDelete = async () => {
      if (!window.confirm('确认要删除此组合及其所有配置吗？此操作不可撤销。')) return;
      try {
        await deletePortfolio(id);
        navigate('/portfolios');
      } catch (err) {
        alert('删除失败：' + (err.response?.data?.message || err.message));
      }
    };
  // Tab 列表
  const tabs = [
    { key: 'details', label: '详情' },
    { key: 'transactions', label: '交易记录' },
    { key: 'rebalanceSetting',    label: '阈值设置' },
    { key: 'positions',    label: '持仓概览' },
    { key: 'position-history',    label: '持仓历史' },
    { key: 'rebalance', label: '再平衡' }, 
    { key: 'rebalance-history', label: '再平衡历史' }, 
    { key: 'rebalance-suggester', label: '再平衡建议' }, 
  ];
  return (
    <div className="space-y-6">
      {/* 新增: 横向 Tabs 导航 */}
      <div className="flex border-b mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 -mb-px border-b-2 ${activeTab === tab.key
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-gray-600 hover:text-blue-500'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Tab 内容渲染 */}

      {activeTab === 'details' && (
         <Basic pf ={pf} /> )}
      {activeTab === 'transactions' && (
        /* 交易记录 Tab */
        <TransactionTable transactions={txs.data} />)}

      {activeTab === 'rebalanceSetting' && (
        /* 再平衡 Tab */
        <PortfolioRebalance />
      )}

      {activeTab === 'positions' && (
        /* 持仓概览 Tab */
        <PositionOverview />)}

      {activeTab === 'positions-history' && (
        /* 阈值设置 Tab */
        <PositionHistory />)}

      {activeTab === 'rebalance' && (
        /* 再平衡界面 Tab */
        <Rebalance />
      )}

      {activeTab === 'rebalance-history' && (
        /* 再平衡历史 Tab */
        <RebalanceHistory />
      )}
 
  {activeTab === 'rebalance-suggester' && (
        /* 再平衡界面 Tab */
        <RebalanceSuggester />
      )}
 
    </div>
  );
}
