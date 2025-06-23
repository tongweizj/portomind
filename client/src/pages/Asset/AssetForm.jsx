// ✅ 文件：src/pages/AssetForm.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { createAsset, getAssetById, updateAsset } from '../../services/assetService';

export default function AssetForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [form, setForm] = useState({
    symbol: '',
    name: '',
    market: 'US',
    currency: 'USD',
    type: 'stock',
    tags: '',
    active: true
  });

  useEffect(() => {
    if (isEdit) {
      getAssetById(id).then(asset => {
        const assetData = asset?.data || asset;
        setForm({
          ...assetData,
          tags: assetData.tags?.join(', ') || ''
        });
      });
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setForm({ ...form, [name]: val });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const submitData = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim())
    };
    if (isEdit) await updateAsset(id, submitData);
    else await createAsset(submitData);
    navigate('/assets');
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">{isEdit ? '编辑资产' : '添加资产'}</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow">
        <div>
          <label className="block text-sm text-gray-700 mb-1">代码</label>
          <input
            name="symbol"
            value={form.symbol}
            onChange={handleChange}
            placeholder="如 AAPL, 600519.SS"
            required
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">名称</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="如 苹果公司"
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">市场</label>
          <select
            name="market"
            value={form.market}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="US">美股</option>
            <option value="CA">加股</option>
            <option value="CN-SH">上海</option>
            <option value="CN-SZ">深圳</option>
            <option value="CN-FUND">中国基金</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">币种</label>
          <select
            name="currency"
            value={form.currency}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="USD">美元</option>
            <option value="CAD">加元</option>
            <option value="CNY">人民币</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">类型</label>
          <select
            name="type"
            value={form.type}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="stock">股票</option>
            <option value="etf">ETF</option>
            <option value="cash">现金</option>
            <option value="bond">债券</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">标签（多个用英文逗号分隔）</label>
          <input
            name="tags"
            value={form.tags}
            onChange={handleChange}
            placeholder="如 growth, tech"
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            name="active"
            checked={form.active}
            onChange={handleChange}
            className="mr-2"
          />
          <label className="text-sm text-gray-700">启用</label>
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          保存
        </button>
      </form>
    </div>
  );
}
