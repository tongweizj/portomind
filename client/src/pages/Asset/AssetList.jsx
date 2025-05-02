import { useEffect, useState } from 'react';
import { Pencil,Plus } from 'lucide-react';
import { getAssets, deleteAsset } from '../../services/assetService';
import { useNavigate } from 'react-router';

export default function AssetList() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  const loadAssets = async () => {
    setLoading(true);
    setError('');
    try {
      const { total: t, data } = await getAssets({
        page,
        pageSize,
        search: searchTerm || undefined
      });
      setAssets(data);
      setTotal(t);
    } catch (e) {
      console.error(e);
      setError('获取资产列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [page, searchTerm]);

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除此资产吗？')) return;
    try {
      await deleteAsset(id);
      loadAssets();
    } catch (e) {
      console.error(e);
      alert('删除失败，请重试');
    }
  };

  return (
    <div className="space-y-6 relative">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-gray-800">资产列表</h1>
      <button
        onClick={() => navigate('/assets/new')}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
      >
        <Plus className="w-4 h-4" /> 添加资产
      </button>
    </div>

    {assets.length === 0 ? (
      <p className="text-gray-500">暂无资产记录。</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full border bg-white shadow-sm rounded">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="px-4 py-2 text-left">代码</th>
              <th className="px-4 py-2 text-left">名称</th>
              <th className="px-4 py-2 text-left">市场</th>
              <th className="px-4 py-2 text-left">币种</th>
              <th className="px-4 py-2 text-left">启用</th>
              <th className="px-4 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="text-sm text-gray-700 divide-y">
            {assets.map((a) => (
              <tr key={a._id} className="hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap">{a.symbol}</td>
                <td className="px-4 py-2 whitespace-nowrap">{a.name}</td>
                <td className="px-4 py-2 whitespace-nowrap">{a.market}</td>
                <td className="px-4 py-2 whitespace-nowrap">{a.currency}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {a.active ? '✅' : '❌'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button
                    onClick={() => navigate(`/assets/edit/${a._id}`)}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
  );
}