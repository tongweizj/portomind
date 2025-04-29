// ✅ 文件：src/pages/PortfolioDetail.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getPortfolioById, deletePortfolio, getActualRatios } from '../services/portfolioService';
import { getTransactionById } from '../services/transactionService';
import PortfolioRebalance from './PortfolioRebalanceSettings'; // 新增
import PositionOverview from './PositionOverview';          // 新增
import PositionHistory from './PositionHistory';
import RebalanceSuggester from './RebalanceSuggester';
import RebalanceHistory from './RebalanceHistory';
import { Pencil, Trash, Plus } from 'lucide-react';


export default function PortfolioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [actualRatios, setActualRatios] = useState([]);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    // 拉取组合详情
    getPortfolioById(id).then(setPortfolio);
    // 拉取该组合下的交易记录
    getTransactionById(id).then(data => {
      console.log('🧪 getTransactionById:', data);
      setTransactions(data)
    });
    getActualRatios(id).then(data => {
      console.log('🧪 getActualRatios:', data);
      setActualRatios(data)
    });   // 拉取当前持仓比例
  }, [id]);

  if (!portfolio) return <div className="text-gray-500">加载中...</div>;

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

  const tabs = [ // 新增: Tabs 配置
    { key: 'details', label: '详情' },
    { key: 'transactions', label: '交易记录' },
    { key: 'rebalance', label: '阈值设置' },
    { key: 'positions', label: '持仓概览' },
    { key: 'history', label: '持仓趋势' },
    { key: 'rebalance-ui', label: '再平衡' },       // 新增
    { key: 'rebalance-history', label: '再平衡历史' }
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
        /* 现有: 组合基本信息 */
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800">组合：{portfolio.name}</h1>
            <div className="flex space-x-2">
              {/* 新增: 编辑按钮 */}
              <button
                onClick={() => navigate(`/portfolios/edit/${id}`)}
                className="flex items-center px-3 py-1 bg-green-100 hover:bg-green-200 rounded text-green-700"
              >
                <Pencil size={16} className="mr-1" /> 编辑
              </button>
              {/* 新增: 删除按钮 */}
              <button
                onClick={handleDelete}
                className="flex items-center px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-red-700"
              >
                <Trash size={16} className="mr-1" /> 删除
              </button>
              {/* 返回列表按钮 */}
              <button
                onClick={() => navigate('/portfolios')}
                className="flex items-center px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              >
                返回列表
              </button>


            </div>
          </div>
          <div className="bg-white p-4 rounded shadow text-sm text-gray-700">
            <p><strong>类型：</strong> {portfolio.type}</p>
            <p><strong>币种：</strong> {portfolio.currency}</p>
            <p><strong>描述：</strong> {portfolio.description || '暂无描述'}</p>
          </div>


          {/* 新增: 目标资产配置展示 */}
          <div className="bg-white p-4 rounded shadow text-sm text-gray-700">
            <h2 className="text-lg font-semibold mb-2">目标资产配置</h2>
            {portfolio.targets && portfolio.targets.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-2 text-left">Symbol</th>
                      <th className="px-4 py-2 text-right">目标比例 (%)</th>
                      <th className="px-4 py-2 text-right">当前比例 (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.targets.map((t, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{t.symbol}</td>
                        <td className="px-4 py-2 text-right">{t.targetRatio}</td>
                        <td className="px-4 py-2 text-right">{(actualRatios.find(r => r.symbol === t.symbol)?.ratio ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">未设置目标资产配置。</p>
            )}
          </div>
        </div>


      )}

      {activeTab === 'transactions' && (
        /* 现有: 交易记录 */
        <div>
          <h2 className="text-xl font-semibold text-gray-800">交易记录</h2>
          {transactions.length === 0 ? (
            <p className="text-gray-500">暂无交易记录。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border bg-white shadow-sm rounded">
                <thead className="bg-gray-100 text-sm text-gray-600">
                  <tr>
                    <th className="px-4 py-2 text-left">日期</th>
                    <th className="px-4 py-2 text-left">代码</th>
                    <th className="px-4 py-2 text-left">类型</th>
                    <th className="px-4 py-2 text-left">份额</th>
                    <th className="px-4 py-2 text-left">价格</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700 divide-y">
                  {transactions.map(tx => (
                    <tr key={tx._id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap">{tx.date.slice(0, 10)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{tx.symbol}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{tx.action}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{tx.quantity}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{tx.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'rebalance' && (
        /* 新增: 阈值设置 Tab */
        <PortfolioRebalance />
      )}


      {activeTab === 'positions' && <PositionOverview />}

      {activeTab === 'history' && <PositionHistory />}
      {/* —— 新增：再平衡界面 —— */}
      {activeTab === 'rebalance-ui' && (
        <RebalanceSuggester />
      )}

      {/* —— 新增：再平衡历史 —— */}
      {activeTab === 'rebalance-history' && (
        <RebalanceHistory />
      )}
    </div>
  );
}
