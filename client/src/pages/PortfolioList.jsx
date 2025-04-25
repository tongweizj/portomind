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
   <div className="p-6 md:p-10 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">投资组合</h1>
        <button
          onClick={() => navigate('/portfolios/new')}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
        >
          新建组合
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {portfolios.map(pf => (
          <div key={pf._id} className="bg-white shadow rounded-xl p-6 relative">
            <h2 className="text-xl font-semibold text-gray-800">{pf.name}</h2>
            <p className="text-gray-600 mt-2">{pf.description}</p>
            {/* 编辑按钮 */}
            <button
              onClick={() => navigate(`/portfolios/edit/${pf._id}`)}
              className="absolute top-4 right-4 text-gray-500 hover:text-blue-600"
            >
              <Pencil size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
