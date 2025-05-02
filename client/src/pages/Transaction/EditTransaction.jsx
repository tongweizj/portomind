// ✅ 文件：src/pages/EditTransaction.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getTransactionById, updateTransaction } from '../../services/transactionService';
import { getAllPortfolios } from '../../services/portfolioService';
import { getAssets } from '../../services/assetService';

export default function EditTransaction() {
  const { id } = useParams();
  const navigate = useNavigate();

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

  useEffect(() => {
    getAllPortfolios().then(setPortfolios);
    getAssets().then(setAssets);
    getTransactionById(id).then(tx => {
      setForm({
        ...tx,
        date: tx.date.slice(0, 10),
      });
    });
  }, [id]);

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
    await updateTransaction(id, form);
    navigate('/transactions');
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">编辑交易记录</h1>

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
            <input type="date" name="date" value={form.date} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">交易份额</label>
            <input type="number" name="quantity" value={form.quantity} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label className="block text-sm mb-1">交易价格</label>
            <input type="number" name="price" value={form.price} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">备注</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
        </div>

        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          更新交易
        </button>
      </form>
    </div>
  );
}
