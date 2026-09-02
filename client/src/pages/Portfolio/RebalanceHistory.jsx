// client/src/pages/RebalanceHistory.jsx
import { useCallback, useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { getHistory, revoke, reexecute } from '../../services/rebalance.service';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';
import { RebalanceTabContext } from './rebalanceTabContext';

export default function RebalanceHistory() {
  const { id: portfolioId } = useParams();
  const { switchSubTab } = useContext(RebalanceTabContext);
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getHistory(portfolioId, { page, pageSize });
      setRecords(res.data);
      setTotal(res.pagination.total);
    } catch (e) {
      console.error(e);
      setError('获取历史记录失败');
    } finally {
      setLoading(false);
    }
  }, [portfolioId, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRevoke = async (recordId) => {
    if (!window.confirm('确定要撤销此操作吗？')) return;
    setLoading(true);
    try {
      await revoke(recordId);
      fetchData();
    } catch (e) {
      console.error(e);
      setError('撤销失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReexecute = async (recordId) => {
    setLoading(true);
    try {
      await reexecute(recordId);
      switchSubTab('suggestions');
    } catch (e) {
      console.error(e);
      setError('重做失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">再平衡历史</h1>

      {error ? <ErrorState /> : loading ? <LoadingState /> : records.length === 0 ? <EmptyState /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Record ID</th>
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2 text-left">Mode</th>
                <th className="px-4 py-2 text-right">#Suggestions</th>
                <th className="px-4 py-2 text-right">执行交易</th>
                <th className="px-4 py-2 text-right">反向交易</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">{rec._id}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{rec.timestamp}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{rec.mode}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">{rec.suggestions.length}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">{rec.executedTransactionIds?.length || 0}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">{rec.reversalTransactionIds?.length || 0}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{rec.status}</td>
                  <td className="px-4 py-2 whitespace-nowrap space-x-2">
                    <button
                      onClick={() => handleRevoke(rec._id)}
                      disabled={rec.status !== 'EXECUTED'}
                      className="px-2 py-1 bg-yellow-100 hover:bg-yellow-200 rounded text-yellow-700 disabled:opacity-40"
                    >撤销</button>
                    <button
                      onClick={() => handleReexecute(rec._id)}
                      disabled={rec.status !== 'REVOKED'}
                      className="px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-green-700 disabled:opacity-40"
                    >重新生成待确认</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && <div className="flex justify-between items-center mt-4">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >下一页</button>
      </div>}
    </div>
  );
}
