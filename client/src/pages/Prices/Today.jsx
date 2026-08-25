// client/src/pages/Price/Today.jsx
import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getPricesByDate, getTodayPrices } from '../../services/price.service';
import { getApiErrorMessage } from '../../services/api';

export default function Today() {
  const navigate = useNavigate();
  const [date, setDate] = useState('');
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadPrices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = date
        ? await getPricesByDate(date, { page, pageSize })
        : await getTodayPrices({ page, pageSize });
      setData(res.data);
      setTotal(res.pagination.total);
    } catch (e) {
      console.error(e);
      setError(getApiErrorMessage(e, '获取价格失败'));
    } finally {
      setLoading(false);
    }
  }, [date, page, pageSize]);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">
        {date ? `${date} 全部价格` : '当日各资产最新价格'}
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        显示 {data.length} 条，共匹配 {total} 条记录
      </p>

      {/* 顶部筛选 */}
      <div className="flex items-center space-x-4 mb-4">
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); setPage(1); }}
          className="border rounded px-2 py-1"
        />
        <button
          onClick={loadPrices}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >刷新</button>
        {date && (
          <button
            onClick={() => { setDate(''); setPage(1); }}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >显示最近数据</button>
        )}
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
              {data.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                    {date ? '该日期没有价格数据' : '暂无价格数据'}
                  </td>
                </tr>
              )}
              {data.map((row) => (
                <tr key={`${row.symbol}-${row.timestamp}`} className="hover:bg-gray-50">
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
      <div className="flex items-center justify-end gap-3 mt-4">
        <button
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(value - 1, 1))}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((value) => Math.min(value + 1, totalPages))}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >下一页</button>
      </div>
    </div>
  );
}
