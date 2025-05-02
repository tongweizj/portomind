// client/src/pages/Price/Today.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getTodayPrices } from '../../services/priceService';

export default function Today() {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  const loadPrices = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getTodayPrices({ date, page, pageSize });
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      setError('获取价格失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();
  }, [date, page]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{date} 价格列表</h1>

      {/* 顶部筛选 */}
      <div className="flex items-center space-x-4 mb-4">
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); setPage(1); }}
          className="border rounded px-2 py-1"
        />
        <button
          onClick={() => { setPage(1); loadPrices(); }}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >刷新</button>
      </div>

      {error && <div className="text-red-500 mb-2">{error}</div>}
      {loading ? (
        <div>加载中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-left">Timestamp</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{row.symbol}</td>
                  <td className="px-4 py-2 text-right">{row.price.toFixed(2)}</td>
                  <td className="px-4 py-2">{row.timestamp}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => navigate(`/prices/${row.symbol}/history`)}
                      className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700"
                    >查看历史</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      <div className="flex justify-between items-center mt-4">
        <button
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(p => p + 1)}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >下一页</button>
      </div>
    </div>
  );
}
