// client/src/components/AddTransactionForm.jsx

import { useState } from 'react';
import axios from 'axios';

export default function AddTransactionForm({ portfolioId, onTransactionAdded }) {
  const [form, setForm] = useState({
    symbol: '', quantity: 0, price: 0, action: 'buy', assetType: 'stock', notes: ''
  });

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    await axios.post('/api/transactions', { ...form, portfolioId });
    onTransactionAdded(); // 通知刷新列表
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="symbol" placeholder="Symbol (e.g. AAPL)" onChange={handleChange} />
      <input name="quantity" type="number" placeholder="Quantity" onChange={handleChange} />
      <input name="price" type="number" placeholder="Price" onChange={handleChange} />
      <select name="action" onChange={handleChange}>
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
      </select>
      <button type="submit">Add Transaction</button>
    </form>
  );
}
