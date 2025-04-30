import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePortfolio } from '../../hooks/usePortfolio';
import { updatePortfolio } from '../../services/portfolioService';
import { createEmptyPortfolio } from '../../models/portfolio';
import { ROUTES } from '../../constants/routes';

export default function Edit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: pf, isLoading, isError } = usePortfolio(id);
  const [form, setForm] = useState(createEmptyPortfolio());

  useEffect(() => {
    if (pf) setForm(pf);
  }, [pf]);

  if (isLoading) return <p>加载中…</p>;
  if (isError)   return <p>加载出错</p>;

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    await updatePortfolio(form);
    navigate(ROUTES.PORTFOLIO_VIEW(id));
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>编辑组合</h1>
      <div>
        <label>名称</label>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <label>描述</label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
        />
      </div>

      {/* 如需更多字段，按需添加 */}
      <div className="mt-4">
        <button type="submit" className="btn btn--primary">保存</button>
        <button
          type="button"
          className="btn"
          onClick={() => navigate(ROUTES.PORTFOLIO_VIEW(id))}
        >
          取消
        </button>
      </div>
    </form>
  );
}
