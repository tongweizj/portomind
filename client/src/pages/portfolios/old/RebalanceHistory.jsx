// client/src/pages/RebalanceHistory.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { getHistory, revoke, reexecute } from '../../../services/rebalanceService';

export default function RebalanceHistory() {
  const { id: portfolioId } = useParams();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getHistory(portfolioId, { page, pageSize });
      setRecords(res.data);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      setError('获取历史记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [portfolioId, page]);

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
      fetchData();
    } catch (e) {
      console.error(e);
      setError('重做失败');
    } finally {
      setLoading(false);
    }
  };

  const handleView = (recordId) => {
    navigate(`/portfolios/${portfolioId}/rebalance`);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">再平衡历史</h1>

      {error && <div className="text-red-500 mb-2">{error}</div>}
      {loading ? (
        <div>加载中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Record ID</th>
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2 text-left">Mode</th>
                <th className="px-4 py-2 text-right">#Suggestions</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.recordId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">{rec.recordId}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{rec.timestamp}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{rec.mode}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">{rec.suggestions.length}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{rec.status}</td>
                  <td className="px-4 py-2 whitespace-nowrap space-x-2">
                    <button
                      onClick={() => handleView(rec.recordId)}
                      className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700"
                    >查看</button>
                    <button
                      onClick={() => handleRevoke(rec.recordId)}
                      className="px-2 py-1 bg-yellow-100 hover:bg-yellow-200 rounded text-yellow-700"
                    >撤销</button>
                    <button
                      onClick={() => handleReexecute(rec.recordId)}
                      className="px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-green-700"
                    >重做</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
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
      </div>
    </div>
  );
}
