// client/src/pages/PositionHistory.jsx
import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router';
import {
  getPositionHistory,
  getPositions,
} from '../../services/position.service';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';

export default function PositionHistory() {
  const { id: portfolioId } = useParams();
  const [symbolOptions, setSymbolOptions] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('all');
  const [interval, setInterval] = useState('day');
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currencies = useMemo(
    () => Array.from(new Set(historyData.map(item => item.currency))),
    [historyData]
  );
  const chartData = useMemo(() => {
    const byDate = new Map();
    historyData.forEach(item => {
      const point = byDate.get(item.date) || { date: item.date };
      point[`marketValue_${item.currency}`] = item.marketValue;
      point[`costBaseline_${item.currency}`] = item.costBaseline;
      byDate.set(item.date, point);
    });
    return [...byDate.values()];
  }, [historyData]);

  // 获取 symbol 列表
  useEffect(() => {
    async function fetchSymbols() {
      try {
        const { data } = await getPositions(portfolioId, { page: 1, pageSize: 100 });
        const symbols = data.map((pos) => pos.symbol);
        setSymbolOptions(['all', ...Array.from(new Set(symbols))]);
      } catch (e) {
        console.error(e);
      }
    }
    fetchSymbols();
  }, [portfolioId]);

  // 获取历史数据
  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError('');
      try {
        const data = await getPositionHistory(portfolioId, {
          symbol: selectedSymbol,
          interval,
        });
        setHistoryData(data);
      } catch (e) {
        console.error(e);
        setError('获取历史数据失败');
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [portfolioId, selectedSymbol, interval]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">持仓趋势</h1>
      <p className="mb-4 text-sm text-gray-500">金额按资产原币种分别展示，当前未进行汇率换算。</p>

      <div className="flex items-center mb-4 space-x-4">
        <div>
          <label className="mr-2">资产:</label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="border rounded px-2 py-1"
          >
            {symbolOptions.map((sym) => (
              <option key={sym} value={sym}>
                {sym === 'all' ? '所有持仓' : sym}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mr-2">时间粒度:</label>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="day">日</option>
            <option value="week">周</option>
            <option value="month">月</option>
          </select>
        </div>
      </div>

      {error ? <ErrorState /> : loading ? <LoadingState /> : historyData.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            {currencies.map((currency, index) => (
              <Line key={`value-${currency}`} type="monotone" dataKey={`marketValue_${currency}`}
                name={`市值 (${currency})`} stroke={['#4f46e5', '#dc2626', '#0891b2'][index % 3]} dot={false} />
            ))}
            {currencies.map((currency, index) => (
              <Line key={`cost-${currency}`} type="monotone" dataKey={`costBaseline_${currency}`}
                name={`剩余成本 (${currency})`} stroke={['#16a34a', '#ca8a04', '#9333ea'][index % 3]}
                strokeDasharray="5 5" dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {!loading && historyData.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="bg-gray-100">
              <th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-left">币种</th>
              <th className="px-3 py-2 text-right">数量</th><th className="px-3 py-2 text-right">剩余成本</th>
              <th className="px-3 py-2 text-right">市值</th><th className="px-3 py-2 text-right">未实现盈亏</th>
            </tr></thead>
            <tbody>{historyData.map(item => (
              <tr key={`${item.date}-${item.currency}`} className="border-b">
                <td className="px-3 py-2">{item.date}</td><td className="px-3 py-2">{item.currency}</td>
                <td className="px-3 py-2 text-right">{item.quantity ?? '-'}</td>
                <td className="px-3 py-2 text-right">{item.remainingCost.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{item.marketValue == null ? '-' : item.marketValue.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{item.unrealizedPnl == null ? '-' : item.unrealizedPnl.toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
