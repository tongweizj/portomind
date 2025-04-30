import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getAllPortfolios } from '../services/portfolioService';
import { Pencil, ChevronRight } from 'lucide-react';

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
          <div
                     key={pf._id}
                     onClick={() => navigate(`/portfolios/view/${pf._id}`)}
                     className="bg-white shadow rounded-xl p-6 relative cursor-pointer hover:bg-gray-50 transition"
                    >
            <h2 className="text-xl font-semibold text-gray-800">{pf.name}</h2>
            <p className="text-gray-600 mt-2">{pf.description}</p>
            <div className="flex items-center justify-between text-sm text-gray-700 mt-4">
               <span>类型：{pf.type}</span>
               <span>币种：{pf.currency}</span>
             </div>
            
            <div
              className="absolute top-4 right-4 text-gray-400"
              /* 点击箭头也触发卡片 onClick */
            >
              <ChevronRight size={24} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
