import React from 'react';
import { useNavigate } from 'react-router';
import { usePortfolios } from '../../hooks/usePortfolios';
import { PortfolioCard } from '../../components/PortfolioCard';
import { ROUTES } from '../../constants/routes';
import { ButtonGroup } from '../../components/ButtonGroup';
export default function List() {
  const navigate = useNavigate();
  const { data: portfolios, isLoading, isError } = usePortfolios();

  if (isLoading) return <p>加载组合中…</p>;
  if (isError) return <p>加载组合失败，请重试</p>;
  const buttons = [
    { label: '新建', onClick: () => navigate('/portfolios/newold'), type: 'primary' },
  ];
  return (
    <div>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">投资组合</h1>
        <ButtonGroup buttons={buttons} className="my-4" />
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
    </div>
  );
}
