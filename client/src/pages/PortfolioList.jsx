import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getAllPortfolios } from '../services/portfolioService';

export default function PortfolioList() {
  const [portfolios, setPortfolios] = useState([]);

  useEffect(() => {
    getAllPortfolios().then(data => setPortfolios(data));
  }, []);

  return (
    <div>
      <h2>我的投资组合</h2>
      <ul>
        {portfolios.map(p => (
          <li key={p._id}>
            <Link to={`/portfolios/${p._id}`}>{p.name}</Link>（{p.type}，{p.currency}）
          </li>
        ))}
      </ul>
    </div>
  );
}
