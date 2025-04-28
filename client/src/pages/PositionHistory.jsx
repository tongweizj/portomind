// client/src/pages/PositionHistory.jsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import {
  getPositionHistory,
  getPositions,
} from '../services/positionService';
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

export default function PositionHistory() {
  const { id: portfolioId } = useParams();
  const [symbolOptions, setSymbolOptions] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('all');
  const [interval, setInterval] = useState('day');
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        const { data } = await getPositionHistory(portfolioId, {
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

      {error && <div className="text-red-500 mb-2">{error}</div>}

      {loading ? (
        <div>加载中...</div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={historyData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="marketValue"
              name="市值"
              stroke="#8884d8"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="costBaseline"
              name="成本基准"
              stroke="#82ca9d"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
