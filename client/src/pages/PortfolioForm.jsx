// ✅ 文件：src/pages/PortfolioForm.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortfolio, getPortfolioById, updatePortfolio } from '../services/portfolioService';

export default function PortfolioForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: '长期',
    currency: 'CNY',
  });

  useEffect(() => {
    if (isEdit) {
      getPortfolioById(id).then(setForm);
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isEdit) await updatePortfolio(id, form);
    else await createPortfolio(form);
    navigate('/portfolios');
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">{isEdit ? '编辑组合' : '添加组合'}</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow">
        <div>
          <label className="block text-sm text-gray-700 mb-1">名称</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="例如：退休计划、子女教育"
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
            placeholder="此组合的目标、策略说明等"
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
          保存
        </button>
      </form>
    </div>
  );
}
