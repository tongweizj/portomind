// client/src/pages/RebalanceSuggester.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  checkRebalance,
  getSuggestions,
  executeSuggestions,
  getHistory
} from '../../../services/rebalanceService';
import { getActualRatios } from '../../../services/portfolioService';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Legend,
  Cell
} from 'recharts';

export default function RebalanceSuggester() {
  const { id: portfolioId } = useParams();
  const navigate = useNavigate();

  const [lastRunTime, setLastRunTime] = useState('—');
  const [mode, setMode] = useState('MANUAL'); // 手动或 AUTO
  const [needsRebalance, setNeedsRebalance] = useState(false);
  const [triggeredThresholds, setTriggeredThresholds] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [actualRatios, setActualRatios] = useState([]);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [loadingExec, setLoadingExec] = useState(false);
  const [error, setError] = useState('');

  // 初始：获取最近执行时间和当前持仓比例
  useEffect(() => {
    async function init() {
      try {
        const pid = portfolioId.id;
        console.log("pid: ", pid);
        const history = await getHistory(portfolioId, { page: 1, pageSize: 1 });
        if (history.data && history.data.length) {
          setLastRunTime(history.data[0].timestamp);
          setMode(history.data[0].mode);
        }
      } catch {}
      try {
        const ratios = await getActualRatios(portfolioId);
        setActualRatios(ratios);
      } catch {}
    }
    init();
  }, [portfolioId]);

  // 点击：检查阈值
  const handleCheck = async () => {
    setError('');
    setLoadingCheck(true);
    try {
      const res = await checkRebalance(portfolioId);
      setNeedsRebalance(res.needsRebalance);
      setTriggeredThresholds(res.triggeredThresholds || []);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      setLastRunTime(now);
    } catch (e) {
      setError('检查失败，请重试');
    } finally {
      setLoadingCheck(false);
    }
  };

  // 点击：生成建议
  const handleSuggest = async () => {
    setError('');
    setLoadingSuggest(true);
    try {
      const list = await getSuggestions(portfolioId);
      setSuggestions(list);
    } catch (e) {
      setError('获取建议失败');
    } finally {
      setLoadingSuggest(false);
    }
  };

  // 点击：执行建议
  const handleExecute = async () => {
    if (!suggestions.length) return;
    setError('');
    setLoadingExec(true);
    try {
      const res = await executeSuggestions(portfolioId, suggestions);
      navigate(`/portfolios/${portfolioId}/rebalance/history`);
    } catch (e) {
      setError('执行失败');
    } finally {
      setLoadingExec(false);
    }
  };

  // 准备图表数据：当前 vs 调整后
  const chartCurrent = actualRatios.map(r => ({ name: r.symbol, value: r.ratio }));
  const chartPost    = suggestions.map(s => ({ name: s.symbol, value: s.postRebalanceRatio }));

  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">再平衡建议</h1>

      {/* 顶部操作区 */}
      <div className="flex items-center space-x-4 mb-6">
        <span>最后执行：{lastRunTime} ({mode})</span>
        <button
          onClick={handleCheck}
          disabled={loadingCheck}
          className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {loadingCheck ? '检查中…' : '检查再平衡'}
        </button>
        <button
          onClick={handleSuggest}
          disabled={loadingSuggest}
          className="px-3 py-1 bg-green-500 text-white rounded disabled:opacity-50"
        >
          {loadingSuggest ? '生成中…' : '生成建议'}
        </button>
        <button
          onClick={handleExecute}
          disabled={loadingExec || !suggestions.length}
          className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
        >
          {loadingExec ? '执行中…' : '执行建议'}
        </button>
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6">
        {/* 建议列表 */}
        <div className="flex-1 bg-white rounded shadow p-4 overflow-x-auto">
          <table className="min-w-full table-auto divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Est.Cost</th>
                <th className="px-4 py-2 text-right">PostRatio(%)</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{s.symbol}</td>
                  <td className="px-4 py-2">{s.action}</td>
                  <td className="px-4 py-2 text-right">{s.quantity}</td>
                  <td className="px-4 py-2 text-right">{s.estimatedCost.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{s.postRebalanceRatio.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 对比饼图 */}
        <div className="w-full lg:w-1/3 bg-white rounded shadow p-4">
          <h2 className="font-semibold mb-2">当前 vs 调整后 配比</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartCurrent}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                label={false}
              >
                {chartCurrent.map((entry, idx) => (
                  <Cell key={idx} />
                ))}
              </Pie>
              <Pie
                data={chartPost}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={90}
                label={false}
              >
                {chartPost.map((entry, idx) => (
                  <Cell key={idx} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
