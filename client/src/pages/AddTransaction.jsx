// src/pages/AddTransaction.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { addTransaction } from '../services/transactionService';

export default function AddTransaction() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    portfolioId: '', // 你可以设为默认值或让用户选择
    assetType: 'stock',
    symbol: '',
    action: 'buy',
    quantity: '',
    price: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await addTransaction(form);
    navigate('/');
  };

  return (
    <div>
      <h2>添加交易记录</h2>
      <form onSubmit={handleSubmit}>
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

        <input name="symbol" placeholder="代码 (如 AAPL)" value={form.symbol} onChange={handleChange} /><br/>
        <input name="quantity" type="number" placeholder="份额" value={form.quantity} onChange={handleChange} /><br/>
        <input name="price" type="number" placeholder="买入价" value={form.price} onChange={handleChange} /><br/>
        <input name="date" type="date" value={form.date} onChange={handleChange} /><br/>
        <textarea name="notes" placeholder="备注" value={form.notes} onChange={handleChange}></textarea><br/>

        <button type="submit">提交</button>
      </form>
    </div>
  );
}
