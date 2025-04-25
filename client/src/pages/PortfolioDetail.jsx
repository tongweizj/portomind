// ✅ 文件：src/pages/PortfolioDetail.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getPortfolioById } from '../services/portfolioService';
import { getTransactionById } from '../services/transactionService';
import { Pencil, Plus } from 'lucide-react';
import PortfolioStats from './PortfolioStats';

export default function PortfolioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState(null);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    // 拉取组合详情
    getPortfolioById(id).then(setPortfolio);
    // 拉取该组合下的交易记录
    getTransactionById(id).then(data => {
      console.log('🧪 getTransactionById:', data);
      setTransactions(data)
    });
  }, [id]);

  if (!portfolio) return <div className="text-gray-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">组合：{portfolio.name}</h1>
        <button
          onClick={() => navigate(`/portfolios/edit/${id}`)}
          className="text-blue-600 hover:underline text-sm"
        >
          编辑组合
        </button>
        <button
          onClick={() => navigate('/portfolios')}
          className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded border"
        >
          返回列表
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow text-sm text-gray-700">
        <p><strong>类型：</strong> {portfolio.type}</p>
        <p><strong>币种：</strong> {portfolio.currency}</p>
        <p><strong>描述：</strong> {portfolio.description || '暂无描述'}</p>
      </div>
      {/* 资产统计板块 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">资产统计</h2>
        {/* 将 PortfolioStats 嵌入此处 */}
        <PortfolioStats />
      </div>
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
  );
}
