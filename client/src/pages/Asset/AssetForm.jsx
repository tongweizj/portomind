// ✅ 文件：src/pages/AssetForm.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { createAsset, getAssetById, updateAsset } from '../../services/asset.service';
import { getApiErrorMessage } from '../../services/api';
import { ASSET_TYPES, ASSET_MARKETS, ASSET_CURRENCIES } from '../../constants/enums';

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
    active: true,
    watchlist: false
  });
  const [error, setError] = useState(null);
  useEffect(() => {
    if (isEdit) {
      getAssetById(id).then(asset => {
        setForm({
          ...asset,
          tags: asset.tags?.join(', ') || ''
        });
      }).catch(err => setError(getApiErrorMessage(err, '加载资产失败')));
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setForm({ ...form, [name]: val });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const submitData = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean)
    };
    try {
      if (isEdit) await updateAsset(id, submitData);
      else await createAsset(submitData);
      navigate('/assets');
    } catch (err) {
      console.error('Error saving asset:', err);
      setError(getApiErrorMessage(err, '保存资产失败'));
    }
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
            required
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
            {ASSET_MARKETS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
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
            {ASSET_CURRENCIES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
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
            {ASSET_TYPES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
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

        <div className="space-y-3 rounded border p-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={handleChange}
              className="mt-1"
            />
            <span className="text-sm text-gray-700">
              <strong>启用</strong>：允许该资产用于交易选择、行情同步等业务流程。
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="watchlist"
              checked={form.watchlist}
              onChange={handleChange}
              className="mt-1"
            />
            <span className="text-sm text-gray-700">
              <strong>关注</strong>：仅表示用户希望重点查看，与是否启用相互独立。
            </span>
          </label>
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          保存
        </button>
        {error && <div style={{ color: 'red' }}>{error}</div>}
      </form>
    </div>
  );
}
