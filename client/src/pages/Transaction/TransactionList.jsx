// src/pages/TransactionList.jsx
import { useEffect, useState } from 'react';
import { getTransactions, deleteTransaction } from '../../services/transactionService';
import { useNavigate } from 'react-router';
import { getAllPortfolios } from '../../services/portfolioService';

export default function TransactionList() {
  const [transactions, setTransactions] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const navigate = useNavigate();
  const fetchData = async () => {
    const data = await getTransactions();
    console.log('🧪 Fetched data:', data); // ✅ 检查返回是否为数组
    setTransactions(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    async function fetchData() {
      const txData = await getTransactions();
      const pfData = await getAllPortfolios();
      setTransactions(txData);
      setPortfolios(pfData);
    }
    fetchData();
  }, []);

  const findPortfolioName = (id) => {
    const pf = portfolios.find(p => p._id === id);
    return pf ? pf.name : '未知组合';
  };

  const handleDelete = async (txId) => {
    await deleteTransaction(txId);
    const txData = await getTransactions();
    setTransactions(txData);
  };

  return (
    <div className="space-y-6">
    
    <div className="flex items-center justify-between">
  <h2 className="text-xl font-semibold text-gray-800">交易记录</h2>
  <button
    onClick={() => navigate('/transactions/new')}
    className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
  >
    创建交易记录
  </button>
</div>
    {transactions.length === 0 ? (
      <p className="text-gray-500">暂无交易记录。</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full border bg-white shadow-sm rounded">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="px-4 py-2 text-left">日期</th>
              <th className="px-4 py-2 text-left">资产代码</th>
              <th className="px-4 py-2 text-left">类型</th>
              <th className="px-4 py-2 text-left">操作</th>
              <th className="px-4 py-2 text-left">份额</th>
              <th className="px-4 py-2 text-left">价格</th>
              <th className="px-4 py-2 text-left">组合</th>
              <th className="px-4 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="text-sm text-gray-700 divide-y">
            {transactions.map((tx) => (
              <tr key={tx._id} className="hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap">{tx.date?.slice(0, 10)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{tx.symbol}</td>
                <td className="px-4 py-2 whitespace-nowrap">{tx.assetType}</td>
                <td className="px-4 py-2 whitespace-nowrap">{tx.action === 'buy' ? '买入' : '卖出'}</td>
                <td className="px-4 py-2 whitespace-nowrap">{tx.quantity}</td>
                <td className="px-4 py-2 whitespace-nowrap">${tx.price}</td>
                <td className="px-4 py-2 whitespace-nowrap">{tx.portfolioId}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => navigate(`/transactions/edit/${tx._id}`)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    编辑
                  </button>

                    <button
                    onClick={() => handleDelete(tx._id)}
                    className="text-blue-600 hover:underline text-sm  ml-3"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
  );
}
