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
      navigate('/portfolios'); // 创建成功跳转主页或组合列表
    } catch (err) {
      alert("❌ 创建失败：" + (err.response?.data?.message || '未知错误'));
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
    <h1 className="text-2xl font-bold text-gray-800">添加投资组合</h1>

    <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow">
      <div>
        <label className="block text-sm text-gray-700 mb-1">名称</label>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="如 退休组合、教育基金"
          required
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-700 mb-1">描述</label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="可选，说明组合用途"
          className="w-full border px-3 py-2 rounded"
        ></textarea>
      </div>

      <div>
        <label className="block text-sm text-gray-700 mb-1">类型</label>
        <select
          name="type"
          value={form.type}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded"
        >
          <option value="活钱">活钱</option>
          <option value="稳健">稳健</option>
          <option value="长期">长期</option>
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
          <option value="CNY">人民币</option>
          <option value="CAD">加元</option>
          <option value="USD">美元</option>
        </select>
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        保存组合
      </button>
    </form>
  </div>
  );
}
