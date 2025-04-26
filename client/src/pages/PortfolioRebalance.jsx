import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  getPortfolioById,
  getActualRatios
} from '../services/portfolioService';
import { ChevronLeft } from 'lucide-react';

export default function PortfolioRebalance() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [targets, setTargets] = useState([]);
  const [actuals, setActuals] = useState([]);

  useEffect(() => {
    // 拉取目标配置
    getPortfolioById(id).then(pf => {
      setTargets(pf.targets || []);
    });
    // 拉取实时比例
    getActualRatios(id).then(setActuals);
  }, [id]);

  // 将两个数组按 symbol 合并
  const merged = targets.map(t => {
    const a = actuals.find(x => x.symbol === t.symbol);
    return {
      symbol: t.symbol,
      target: t.targetRatio,
      actual: a ? a.ratio : 0
    };
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className="mr-4 text-gray-600 hover:text-gray-800"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">再平衡对比</h1>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm text-gray-700">
          <thead className="bg-gray-100 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3 text-left">资产</th>
              <th className="px-6 py-3 text-right">目标比例 (%)</th>
              <th className="px-6 py-3 text-right">实际比例 (%)</th>
              <th className="px-6 py-3 text-right">偏差 (%)</th>
            </tr>
          </thead>
          <tbody>
            {merged.map(({ symbol, target, actual }) => {
              const diff = (actual - target).toFixed(1);
              const diffClass =
                Math.abs(diff) > 5 ? 'text-red-600' : 'text-gray-700';
              return (
                <tr key={symbol} className="border-t hover:bg-gray-50">
                  <td className="px-6 py-3 whitespace-nowrap">{symbol}</td>
                  <td className="px-6 py-3 text-right">{target.toFixed(1)}</td>
                  <td className="px-6 py-3 text-right">{actual.toFixed(1)}</td>
                  <td className={`px-6 py-3 text-right font-medium ${diffClass}`}>
                    {diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
