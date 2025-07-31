import { useState, useEffect } from 'react';
import { getPortfolioById, updatePortfolio, createPortfolio } from '../../services/portfolioService';
import { useNavigate } from 'react-router';

export default function PortfolioBasicTab({ portfolioId }) {
  const isEdit = Boolean(portfolioId);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: '稳健',
    currency: 'CAD'
  });

  useEffect(() => {
    if (!isEdit) return;
    getPortfolioById(portfolioId).then(data => {
      setForm({
        name: data.name || '',
        description: data.description || '',
        type: data.type,
        currency: data.currency
      });
    });
  }, [portfolioId, isEdit]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      if (isEdit) await updatePortfolio(portfolioId, form);
      else await createPortfolio(form);
      alert('保存成功');
      navigate('/portfolios');
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div>
        <label className="block text-gray-700">组合名称</label>
        <input name="name" value={form.name} onChange={handleChange} required className="w-full border px-3 py-2 rounded" />
      </div>

      <div>
        <label className="block text-gray-700">描述</label>
        <textarea name="description" value={form.description} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
      </div>

      <div>
        <label className="block text-gray-700">类型</label>
        <div className="flex space-x-4">
          {['活钱', '稳健', '长期'].map(opt => (
            <label key={opt} className="flex items-center">
              <input type="radio" name="type" value={opt} checked={form.type === opt} onChange={handleChange} />
              <span className="ml-2">{opt}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-gray-700">币种</label>
        <select name="currency" value={form.currency} onChange={handleChange} className="w-full border px-3 py-2 rounded">
          <option value="CNY">人民币</option>
          <option value="CAD">加元</option>
          <option value="USD">美元</option>
        </select>
      </div>

      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">保存</button>
    </form>
  );
} 
