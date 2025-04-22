// src/pages/EditTransaction.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getTransactionById, updateTransaction } from '../services/transactionService';

export default function EditTransaction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);

  useEffect(() => {
    getTransactionById(id).then((data) => {
      console.log("🚀 加载到的交易数据：", data);  // ✅ 请打开浏览器控制台检查
      data.date = data.date?.slice(0, 10); // 日期格式化为 yyyy-mm-dd
      setForm(data);
    });
  }, [id]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    await updateTransaction(id, form);
    navigate('/');
  };

  if (!form) return <div>加载中...</div>;

  return (
    <div>
      <h2>编辑交易记录</h2>
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

        <label>代码：</label>
        <input name="symbol" value={form.symbol || ''} onChange={handleChange} /><br/>

        <label>净值：</label>
        <input name="quantity" type="number" value={form.quantity || ''} onChange={handleChange} /><br/>

        <label>买入价：</label>
        <input name="price" type="number" value={form.price || ''} onChange={handleChange} /><br/>

        <label>日期：</label>
        <input name="date" type="date" value={form.date || ''} onChange={handleChange} /><br/>

        <label>备注：</label>
        <textarea name="notes" value={form.notes || ''} onChange={handleChange}></textarea><br/>


        <button type="submit">保存</button>
      </form>
    </div>
  );
}
