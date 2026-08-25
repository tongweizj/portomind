// ✅ 文件：src/pages/AddTransaction.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { createTransaction } from '../../services/transaction.service';
import { getPortfolios } from '../../services/portfolio.service';
import { getAssets } from '../../services/asset.service';
import { getApiErrorMessage } from '../../services/api';

export default function AddTransaction() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetPortfolioId = searchParams.get('portfolioId');

  const [form, setForm] = useState({
    portfolioId: '',
    assetType: 'stock',
    symbol: '',
    market: '',
    currency: '',
    action: 'buy',
    quantity: '',
    price: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [portfolios, setPortfolios] = useState([]);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getPortfolios().then(data => {
      
      setPortfolios(data);
      if (presetPortfolioId) {
        setForm(prev => ({ ...prev, portfolioId: presetPortfolioId }));
      } else if (data.length > 0) {
        setForm(prev => ({ ...prev, portfolioId: data[0]._id }));
      }
    });
    getAssets({ pageSize: 100, active: true }).then(data =>{
      setAssets(data.data)
    });
  }, [presetPortfolioId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...form, [name]: value };

    if (name === 'symbol') {
      const asset = assets.find(a => a.symbol === value);
      if (asset) {
        updated.assetType = asset.type;
        updated.market = asset.market;
        updated.currency = asset.currency;
      }
    }

    setForm(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createTransaction(form);
      navigate('/transactions');
    } catch (err) {
      setError(getApiErrorMessage(err, '创建交易失败'));
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">添加交易记录</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow">
        <div>
          <label className="block text-sm mb-1">所属组合</label>
          <select
            name="portfolioId"
            value={form.portfolioId}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          >
            {portfolios.map(p => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">资产代码</label>
          <select
            name="symbol"
            value={form.symbol}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">请选择资产</option>
            {assets.map(a => (
              <option key={a._id} value={a.symbol}>{a.symbol} - {a.name}</option>
            ))}
          </select>
          {form.market && (
            <div className="text-xs text-gray-500 mt-1">
              市场：{form.market} ｜ 币种：{form.currency} ｜ 类型：{form.assetType}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">交易类型</label>
            <select name="action" value={form.action} onChange={handleChange} className="w-full border px-3 py-2 rounded">
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">交易日期</label>
            <input type="date" name="date" value={form.date} onChange={handleChange} required className="w-full border px-3 py-2 rounded" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">交易份额</label>
            <input type="number" name="quantity" value={form.quantity} onChange={handleChange} min="0.00000001" step="any" required className="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label className="block text-sm mb-1">交易价格</label>
            <input type="number" name="price" value={form.price} onChange={handleChange} min="0.00000001" step="any" required className="w-full border px-3 py-2 rounded" />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">备注</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
        </div>

        {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          提交交易
        </button>
      </form>
    </div>
  );
}
