import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';
import { getActualRatios, getPortfolio } from '../../services/portfolio.service';

export default function TargetAllocation() {
  const { id } = useParams();
  const [portfolio, setPortfolio] = useState(null);
  const [actualRatios, setActualRatios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([getPortfolio(id), getActualRatios(id)])
      .then(([portfolioData, ratios]) => {
        if (!active) return;
        setPortfolio(portfolioData);
        setActualRatios(ratios);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) return <LoadingState />;
  if (error || !portfolio) return <ErrorState />;
  if (!portfolio.targets?.length) return <EmptyState />;

  const total = portfolio.targets.reduce((sum, target) => sum + Number(target.targetRatio), 0);
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">目标配置</h2>
        <span className={Math.abs(total - 100) < 1e-6 ? 'text-green-700' : 'text-red-700'}>
          合计：{total.toFixed(2)}%
        </span>
      </div>
      <div className="overflow-x-auto rounded bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100"><tr>
            <th className="px-4 py-2 text-left">Symbol</th>
            <th className="px-4 py-2 text-right">目标比例</th>
            <th className="px-4 py-2 text-right">当前比例</th>
            <th className="px-4 py-2 text-left">币种</th>
          </tr></thead>
          <tbody>{portfolio.targets.map(target => {
            const actual = actualRatios.find(item => item.symbol === target.symbol);
            return (
              <tr key={target.symbol} className="border-t">
                <td className="px-4 py-2">{target.symbol}</td>
                <td className="px-4 py-2 text-right">{Number(target.targetRatio).toFixed(2)}%</td>
                <td className="px-4 py-2 text-right">{actual ? `${actual.ratio.toFixed(2)}%` : '-'}</td>
                <td className="px-4 py-2">{actual?.currency || '-'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}
