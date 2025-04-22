// src/pages/EditTransaction.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getTransactionById, updateTransaction } from '../services/transactionService';
import { getAllPortfolios } from '../services/portfolioService';

export default function EditTransaction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [portfolios, setPortfolios] = useState([]);

  useEffect(() => {
    async function fetchData() {
      const txData = await getTransactionById(id);
      const pfData = await getAllPortfolios();
      txData.date = txData.date?.slice(0, 10);
      // 👇 如果交易中 portfolioId 缺失，设置为第一个组合的 ID
      if (!txData.portfolioId && pfData.length > 0) {
        txData.portfolioId = pfData[0]._id;
      }
      setForm(txData);
      setPortfolios(pfData);
    }
    fetchData();
  }, [id]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const submitData = { ...form, portfolioId: String(form.portfolioId) };
    await updateTransaction(id, form);
    navigate('/');
  };

  if (!form) return <div>加载中...</div>;

  return (
    <div>
      <h2>编辑交易记录</h2>
      <form onSubmit={handleSubmit}>
        <label>投资组合：</label>
        <select name="portfolioId" value={form.portfolioId} onChange={handleChange}>
          {portfolios.map(p => (
            <option key={p._id} value={p._id}>
              {p.name}（{p.type} / {p.currency}）
            </option>
          ))}
        </select><br/>

        <label>资产类型：</label>
        <select name="assetType" value={form.assetType} onChange={handleChange}>
          <option value="stock">股票</option>
          <option value="etf">ETF</option>
          <option value="crypto">加密货币</option>
          <option value="cash">现金</option>
          <option value="bond">债券</option>
        </select><br/>

        <label>交易类型：</label>
        <select name="action" value={form.action} onChange={handleChange}>
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
        </select><br/>

        <input name="symbol" value={form.symbol || ''} onChange={handleChange} /><br/>
        <input name="quantity" type="number" value={form.quantity || ''} onChange={handleChange} /><br/>
        <input name="price" type="number" value={form.price || ''} onChange={handleChange} /><br/>
        <input name="date" type="date" value={form.date || ''} onChange={handleChange} /><br/>
        <textarea name="notes" value={form.notes || ''} onChange={handleChange}></textarea><br/>

        <button type="submit">保存</button>
      </form>
    </div>
  );
}
