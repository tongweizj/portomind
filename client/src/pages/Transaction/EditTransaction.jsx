// ✅ 文件：src/pages/EditTransaction.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getTransaction, updateTransaction } from '../../services/transaction.service';
import { getPortfolios } from '../../services/portfolio.service';
import { getAssets } from '../../services/asset.service';
import { getApiErrorMessage } from '../../services/api';

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
    fee: '0',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [portfolios, setPortfolios] = useState([]);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getPortfolios().then(data =>{
      setPortfolios(data)
    });
    getAssets({ pageSize: 100, active: true }).then(data =>{
      setAssets(data.data)
    });
    getTransaction(id).then(tx => {
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
    setError('');
    // TR-08：A股整手警告（不阻断）
    const cnLots = ['CN-SH', 'CN-SZ'];
    if (form.action === 'buy' && cnLots.includes(form.market) && Number(form.quantity) % 100 !== 0) {
      const ok = window.confirm(
        `A股买入通常以 100 股（一手）的整数倍进行，当前数量 ${form.quantity} 不是整手。是否仍要提交？（仅提示，不阻止）`
      );
      if (!ok) return;
    }
    try {
      await updateTransaction(id, form);
      navigate('/transactions');
    } catch (err) {
      setError(getApiErrorMessage(err, '更新交易失败'));
    }
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
              <option value="div_cash">现金分红</option>
              <option value="div_reinvest">分红再投</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">交易日期</label>
            <input type="date" name="date" value={form.date} onChange={handleChange} required className="w-full border px-3 py-2 rounded" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">交易份额</label>
            <input type="number" name="quantity" value={form.quantity} onChange={handleChange} min="0.00000001" step="any" required className="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label className="block text-sm mb-1">{form.action === 'div_cash' ? '每股分红' : '交易价格'}</label>
            <input type="number" name="price" value={form.price} onChange={handleChange} min="0.00000001" step="any" required className="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label className="block text-sm mb-1">费用</label>
            <input type="number" name="fee" value={form.fee} onChange={handleChange} min="0" step="any" className="w-full border px-3 py-2 rounded" />
          </div>
        </div>
        {form.action === 'div_cash' && (
          <p className="text-xs text-gray-500">现金分红：分红金额 = 份额 × 每股分红，计入现金、不进持仓。</p>
        )}
        {form.action === 'div_reinvest' && (
          <p className="text-xs text-gray-500">分红再投：按当日价格转增持仓（等价买入），份额填新增股数。</p>
        )}

        <div>
          <label className="block text-sm mb-1">备注</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
        </div>

        {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          更新交易
        </button>
      </form>
    </div>
  );
}
