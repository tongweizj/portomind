import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePortfolios } from '../../hooks/usePortfolios';
import { PortfolioCard } from '../../components/PortfolioCard';
import { ROUTES } from '../../constants/routes';
import { ButtonGroup } from '../../components/ButtonGroup';
export default function List() {
  const navigate = useNavigate();
  // CM-20：默认只显示未归档组合，开关打开后包含已归档组合
  const [showArchived, setShowArchived] = useState(false);
  const { data: portfolios, isLoading, isError } = usePortfolios({ includeArchived: showArchived });

  if (isLoading) return <p>加载组合中…</p>;
  if (isError) return <p>加载组合失败，请重试</p>;
  const buttons = [
    { label: '新建', onClick: () => navigate('/portfolios/new'), type: 'primary' },
  ];
  const archivedCount = portfolios.filter(pf => pf.archived).length;
  return (
    <div>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">投资组合</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={event => setShowArchived(event.target.checked)}
              className="rounded border-gray-300"
            />
            显示已归档{showArchived && archivedCount > 0 ? `（${archivedCount}）` : ''}
          </label>
          <ButtonGroup buttons={buttons} className="my-4" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {portfolios.map(pf => (
          <PortfolioCard
            key={pf._id}
            portfolio={pf}
            onClick={() => navigate(ROUTES.PORTFOLIO_VIEW(pf._id))}
          />
        ))}
      </div>

      {portfolios.length === 0 && (
        <p className="text-gray-500">
          {showArchived ? '暂无组合' : '暂无进行中的组合；已归档组合可打开「显示已归档」查看'}
        </p>
      )}
    </div>
  );
}
