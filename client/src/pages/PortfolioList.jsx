import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getAllPortfolios } from '../services/portfolioService';
import { Pencil, Plus } from 'lucide-react';
export default function PortfolioList() {
  const [portfolios, setPortfolios] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    getAllPortfolios().then(data => setPortfolios(data));
  }, []);

  return (
    <div className="space-y-6 relative">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-gray-800">投资组合</h1>
      <button
        onClick={() => navigate('/portfolios/new')}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
      >
        <Plus className="w-4 h-4" /> 添加组合
      </button>
    </div>

    {portfolios.length === 0 ? (
      <p className="text-gray-500">暂无组合。</p>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {portfolios.map((p) => (
          <div
            key={p._id}
            className="bg-white p-4 rounded shadow hover:shadow-md cursor-pointer border border-gray-100"
            onClick={() => navigate(`/portfolios/view/${p._id}`)}
          >
            <h2 className="text-lg font-semibold text-gray-800">{p.name}</h2>
            <p className="text-sm text-gray-500 mb-1">{p.description}</p>
            <div className="text-xs text-gray-400 flex gap-4">
              <span>类型: {p.type}</span>
              <span>币种: {p.currency}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
  );
}
