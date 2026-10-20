// src/pages/Transaction/AddTransaction.jsx
// TASK-044 R4 / OQ2：写操作迁入组合上下文 —— 路由 /portfolios/:id/transactions/new。
// portfolioId 取自路径并锁定（不再有「所属组合」下拉），保存后回到本组合的交易记录 Tab。
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { ROUTES } from '../../constants/routes';
import { colors, radii } from '../../constants/design-tokens';
import { createTransaction } from '../../services/transaction.service';
import { getAssets } from '../../services/asset.service';
import { getApiErrorMessage } from '../../services/api';

export default function AddTransaction() {
  const { id: portfolioId } = useParams();
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolio(portfolioId);

  const [form, setForm] = useState({
    // 组合由路由锁定：不存在「未指定组合」的写入路径
    portfolioId,
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

  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getAssets({ pageSize: 100, active: true }).then(data => {
      setAssets(data.data);
    });
  }, []);

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
    // TR-08：A股整手警告（不阻断）——CN 市场 buy 非 100 股整数倍时提示
    const cnLots = ['CN-SH', 'CN-SZ'];
    const isCnBuy = form.action === 'buy' && cnLots.includes(form.market);
    if (isCnBuy && Number(form.quantity) % 100 !== 0) {
      const ok = window.confirm(
        `A股买入通常以 100 股（一手）的整数倍进行，当前数量 ${form.quantity} 不是整手。是否仍要提交？（仅提示，不阻止）`
      );
      if (!ok) return;
    }
    try {
      // 写路径经服务端校验（超卖 / fee / 分红语义），前端不复制业务规则（AC10）
      await createTransaction({ ...form, portfolioId });
      navigate(ROUTES.PORTFOLIO_TX_TAB(portfolioId));
    } catch (err) {
      setError(getApiErrorMessage(err, '创建交易失败'));
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link
        to={ROUTES.PORTFOLIO_TX_TAB(portfolioId)}
        className="flex items-center gap-1 text-sm"
        style={{ color: colors.brand, textDecoration: 'none' }}
      >
        <ChevronLeft size={14} color={colors.brand} /> 返回交易记录
      </Link>

      <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>添加交易记录</h1>

      <form onSubmit={handleSubmit} className="space-y-4 p-6" style={{ backgroundColor: colors.bgCard, borderRadius: radii.lg }}>
        <div>
          <label className="block text-sm mb-1">所属组合</label>
          {/* 组合锁定：静态展示，不可手选（AC2） */}
          <div
            className="px-3 py-2 text-sm"
            style={{ border: `1px solid ${colors.border}`, borderRadius: radii.sm, color: colors.textPrimary, backgroundColor: colors.bgPage }}
          >
            {portfolio?.name || '加载中…'}
          </div>
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
        {form.action === 'buy' && ['CN-SH', 'CN-SZ'].includes(form.market) && (
          <p className="text-xs text-gray-500">A股买入建议以 100 股（一手）整数倍进行。</p>
        )}

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
