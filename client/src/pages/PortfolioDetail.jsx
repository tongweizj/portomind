import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { getPortfolioById, deletePortfolio } from '../services/portfolioService';
import PortfolioStats from './PortfolioStats';

export default function PortfolioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    getPortfolioById(id).then(res => setPortfolio(res.data));
  }, [id]);

  const handleDelete = async () => {
    if (window.confirm('确定删除该组合？')) {
      await deletePortfolio(id);
      navigate('/portfolios');
    }
  };

  if (!portfolio) return <div>加载中...</div>;

  return (
    <PortfolioStats />
    // <div>
    //   <h2>{portfolio.name}</h2>
    //   <p>类型：{portfolio.type}</p>
    //   <p>币种：{portfolio.currency}</p>
    //   <p>备注：{portfolio.description}</p>
    //   <p>创建时间：{new Date(portfolio.createdAt).toLocaleDateString()}</p>

    //   <Link to={`/portfolios/${id}/edit`}>编辑</Link> |{' '}
    //   <button onClick={handleDelete}>删除</button>
    // </div>
  );
}
