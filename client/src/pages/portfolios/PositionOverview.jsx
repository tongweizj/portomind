// client/src/pages/PositionOverview.jsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { getPositions } from '../../services/positionService';

export default function PositionOverview() {
  const { id: portfolioId } = useParams();
  const [positions, setPositions] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const { total: t, data } = await getPositions(portfolioId, {
        page,
        pageSize,
        symbol: symbolFilter || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortBy ? sortOrder : undefined,
      });
      setPositions(data);
      setTotal(t);
    } catch (e) {
      console.error(e);
      setError('获取持仓数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [portfolioId, page, symbolFilter, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">持仓概览</h1>

      <div className="flex items-center mb-4">
        <input
          type="text"
          placeholder="按 Symbol 搜索"
          value={symbolFilter}
          onChange={(e) => { setSymbolFilter(e.target.value); setPage(1); }}
          className="border rounded px-2 py-1"
        />
      </div>

      {error && <div className="text-red-500 mb-2">{error}</div>}

      {loading ? (
        <div>加载中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-right">份额</th>
                <th className="px-4 py-2 text-right">平均成本</th>
                <th className="px-4 py-2 text-right">总成本</th>
                <th className="px-4 py-2 text-right">最新价格</th>
                <th
                  className="px-4 py-2 text-right cursor-pointer"
                  onClick={() => handleSort('marketValue')}
                >
                  总金额 {sortBy === 'marketValue' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 text-right">盈亏</th>
                <th
                  className="px-4 py-2 text-right cursor-pointer"
                  onClick={() => handleSort('pnlPct')}
                >
                  盈亏比 {sortBy === 'pnlPct' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{pos.symbol}</td>
                  <td className="px-4 py-2 text-right">{pos.quantity}</td>
                  <td className="px-4 py-2 text-right">{pos.avgCost}</td>
                  <td className="px-4 py-2 text-right">{pos.totalCost}</td>
                  <td className="px-4 py-2 text-right">{pos.price != null ? pos.price.toFixed(2) : '-'}</td>
                  <td className="px-4 py-2 text-right">{pos.marketValue != null ? pos.marketValue.toFixed(2) : '-'}</td>
                  <td className="px-4 py-2 text-right">{pos.pnl != null ? pos.pnl.toFixed(2) : '-'}</td>
                  <td className="px-4 py-2 text-right">{pos.pnlPct != null ? pos.pnlPct.toFixed(2) : '-'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center mt-4">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >
          上一页
        </button>
        <span>
          第 {page} / {totalPages} 页
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
