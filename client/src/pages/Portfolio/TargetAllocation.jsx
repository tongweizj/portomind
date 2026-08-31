import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';
import { getActualRatios, getPortfolio } from '../../services/portfolio.service';

const ASSET_CLASS_LABELS = {
  equity: '股票类',
  bond: '债券类',
  gold: '黄金类',
  cash: '现金类',
  UNCLASSIFIED: '未分类',
};

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
    // CM-08：先取组合判断目标层级，再按层级请求实际比例（大类级 / 资产级）
    getPortfolio(id)
      .then(portfolioData => {
        if (!active) return;
        setPortfolio(portfolioData);
        const classMode = portfolioData.targets?.some(target => target.level === 'asset_class');
        return getActualRatios(id, { level: classMode ? 'asset_class' : 'asset' });
      })
      .then(ratios => {
        if (!active) return;
        setActualRatios(ratios);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) return <LoadingState />;
  if (error || !portfolio) return <ErrorState />;
  if (!portfolio.targets?.length) return <EmptyState />;

  const classMode = portfolio.targets.some(target => target.level === 'asset_class');
  const total = portfolio.targets.reduce((sum, target) => sum + Number(target.targetRatio), 0);
  const label = target => classMode
    ? (ASSET_CLASS_LABELS[target.symbol] || target.symbol)
    : target.symbol;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {classMode ? '大类目标配置' : '目标配置'}
          {classMode && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">大类层级</span>
          )}
        </h2>
        <span className={Math.abs(total - 100) < 1e-6 ? 'text-green-700' : 'text-red-700'}>
          合计：{total.toFixed(2)}%
        </span>
      </div>
      <div className="overflow-x-auto rounded bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100"><tr>
            <th className="px-4 py-2 text-left">{classMode ? '大类' : 'Symbol'}</th>
            <th className="px-4 py-2 text-right">目标比例</th>
            <th className="px-4 py-2 text-right">当前比例</th>
            <th className="px-4 py-2 text-left">币种</th>
          </tr></thead>
          <tbody>{portfolio.targets.map(target => {
            const actual = actualRatios.find(item => item.symbol === target.symbol);
            return (
              <tr key={target.symbol} className="border-t">
                <td className="px-4 py-2">{label(target)}</td>
                <td className="px-4 py-2 text-right">{Number(target.targetRatio).toFixed(2)}%</td>
                <td className="px-4 py-2 text-right">{actual ? `${actual.ratio.toFixed(2)}%` : '-'}</td>
                <td className="px-4 py-2">{actual?.currency || '-'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {classMode && (
        <p className="text-xs text-gray-500">
          大类目标模式下，再平衡建议按类内持仓市值占比摊分到具体资产（保持大类内部结构）；
          未分类资产显示为「未分类」并计入大类偏离。
        </p>
      )}
    </section>
  );
}
