// src/pages/TransactionList.jsx
import { useEffect, useState } from 'react';
import { getTransactions, deleteTransaction } from '../../services/transaction.service';
import { useNavigate } from 'react-router';
import { getPortfolios } from '../../services/portfolio.service';
import { getApiErrorMessage } from '../../services/api';

export default function TransactionList() {
  const [transactions, setTransactions] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setError('');
        const [txResult, pfData] = await Promise.all([
          getTransactions({ page, pageSize: 20 }),
          getPortfolios()
        ]);
        setTransactions(txResult.data);
        setPagination(txResult.pagination);
        setPortfolios(pfData);
      } catch (err) {
        setError(getApiErrorMessage(err, '加载交易失败'));
      }
    }
    fetchData();
  }, [page]);

  const findPortfolioName = (id) => {
    const pf = portfolios.find(p => p._id === id);
    return pf ? pf.name : '未知组合';
  };

  const handleDelete = async (txId) => {
    try {
      setError('');
      await deleteTransaction(txId);
      const result = await getTransactions({ page, pageSize: 20 });
      if (result.data.length === 0 && page > 1) {
        setPage(page - 1);
      } else {
        setTransactions(result.data);
        setPagination(result.pagination);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, '删除交易失败'));
    }
  };

  return (
    <div className="space-y-6">
    
    <div className="flex items-center justify-between">
  <h2 className="text-xl font-semibold text-gray-800">交易记录</h2>
  <div className="flex items-center gap-2">
    <button
      onClick={() => navigate('/transactions/import')}
      className="text-sm px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded hover:bg-gray-100"
    >
      导入 CSV
    </button>
    <button
      onClick={() => navigate('/transactions/new')}
      className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      创建交易记录
    </button>
  </div>
</div>
    {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
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
                <td className="px-4 py-2 whitespace-nowrap">{findPortfolioName(tx.portfolioId)}</td>
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
    {pagination.total > pagination.pageSize && (
      <div className="flex items-center justify-end gap-3 text-sm">
        <button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="disabled:opacity-40">上一页</button>
        <span>第 {page} 页，共 {Math.ceil(pagination.total / pagination.pageSize)} 页</span>
        <button disabled={page * pagination.pageSize >= pagination.total} onClick={() => setPage(value => value + 1)} className="disabled:opacity-40">下一页</button>
      </div>
    )}
  </div>
  );
}
