// src/pages/CreatePortfolio.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { createPortfolio } from '../services/portfolioService';

export default function CreatePortfolio() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: '稳健',
    currency: 'CAD',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createPortfolio(form);
      navigate('/'); // 创建成功跳转主页或组合列表
    } catch (err) {
      alert("❌ 创建失败：" + (err.response?.data?.message || '未知错误'));
    }
  };

  return (
    <div>
      <h2>创建投资组合</h2>
      <form onSubmit={handleSubmit}>
        <label>组合名称：</label>
        <input name="name" value={form.name} onChange={handleChange} required /><br />

        <label>描述：</label>
        <textarea name="description" value={form.description} onChange={handleChange} /><br />

        <label>类型：</label>
        <select name="type" value={form.type} onChange={handleChange}>
          <option value="活钱">活钱</option>
          <option value="稳健">稳健</option>
          <option value="长期">长期</option>
        </select><br />

        <label>币种：</label>
        <select name="currency" value={form.currency} onChange={handleChange}>
          <option value="RMB">人民币</option>
          <option value="CAD">加币</option>
          <option value="USD">美金</option>
        </select><br />

        <button type="submit">创建</button>
      </form>
    </div>
  );
}
