// client/src/pages/Price/History.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getPriceHistory } from '../../services/priceService';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function History() {
  const { symbol } = useParams();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(
    String(today.getMonth() + 1).padStart(2, '0')
  );
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch history whenever filters change
  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError('');
      try {
        const res = await getPriceHistory(symbol, {
          year,
          month,
          page,
          pageSize,
        });
        setData(res.data);
        setTotal(res.total);
      } catch (err) {
        console.error(err);
        setError('加载历史价格失败');
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [symbol, year, month, page, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6">
      <h1 className="text-2xl font-bold">价格历史 – {symbol}</h1>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <label className="flex items-center">
          <span className="mr-2">选择年月：</span>
          <input
            type="month"
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-');
              setYear(Number(y));
              setMonth(m);
              setPage(1);
            }}
            className="border rounded px-2 py-1"
          />
        </label>
      </div>

      {/* Loading / Error */}
      {loading && <p className="text-gray-500">加载中…</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && data.length > 0 && (
        <>
          {/* Chart */}
          <div className="w-full h-64 bg-white rounded-lg shadow p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="price"
                  dot={false}
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full table-auto divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">日期</th>
                  <th className="px-4 py-2 text-right">价格</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.timestamp} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{row.timestamp}</td>
                    <td className="px-4 py-2 text-right">{row.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-end space-x-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded disabled:opacity-50"
            >
              上一页
            </button>
            <span>
              第 {page} 页，共 {totalPages} 页
            </span>
            <button
              onClick={() =>
                setPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={page === totalPages}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </>
      )}

      {/* No data */}
      {!loading && !error && data.length === 0 && (
        <p className="text-gray-500">该月暂无价格记录。</p>
      )}
    </div>
  );
}
