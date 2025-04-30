import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getPortfolioById, updatePortfolio } from '../services/portfolioService';

export default function EditPortfolio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);

  useEffect(() => {
    getPortfolioById(id).then(res => setForm(res.data));
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await updatePortfolio(id, form);
    navigate(`/portfolios/${id}`);
  };

  if (!form) return <div>加载中...</div>;

  return (
    <div>
      <h2>编辑投资组合</h2>
      <form onSubmit={handleSubmit}>
        <input name="name" value={form.name} onChange={handleChange} required /><br/>
        <textarea name="description" value={form.description} onChange={handleChange} /><br/>
        <select name="type" value={form.type} onChange={handleChange}>
          <option value="活钱">活钱</option>
          <option value="稳健">稳健</option>
          <option value="长期">长期</option>
        </select><br/>
        <select name="currency" value={form.currency} onChange={handleChange}>
          <option value="人民币">人民币</option>
          <option value="加币">加币</option>
          <option value="美金">美金</option>
        </select><br/>
        <button type="submit">保存</button>
      </form>
    </div>
  );
}
