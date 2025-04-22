import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { createAsset, getAssetById, updateAsset } from '../services/assetService';

export default function AssetForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [form, setForm] = useState({
    symbol: '',
    name: '',
    market: 'US',
    currency: 'USD',
    type: 'stock',
    tags: '',
    active: true
  });

  useEffect(() => {
    if (isEdit) {
      getAssetById(id).then(asset => {
        setForm({
          ...asset,
          tags: asset.tags?.join(', ') || '' // 转为逗号分隔的文本
        });
      });
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setForm({ ...form, [name]: val });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const submitData = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim())
    };
    if (isEdit) await updateAsset(id, submitData);
    else await createAsset(submitData);
    navigate('/assets');
  };

  return (
    <div>
      <h2>{isEdit ? '编辑' : '添加'}资产</h2>
      <form onSubmit={handleSubmit}>
        <input name="symbol" value={form.symbol} onChange={handleChange} placeholder="代码（如 AAPL, 600519.SS）" required /><br/>
        <input name="name" value={form.name} onChange={handleChange} placeholder="名称（如 苹果公司）" /><br/>

        <label>市场：</label>
        <select name="market" value={form.market} onChange={handleChange}>
          <option value="US">美股</option>
          <option value="CA">加股</option>
          <option value="CN-SH">上海</option>
          <option value="CN-SZ">深圳</option>
          <option value="CN-FUND">中国基金</option>
        </select><br/>

        <label>币种：</label>
        <select name="currency" value={form.currency} onChange={handleChange}>
          <option value="USD">美元</option>
          <option value="CAD">加元</option>
          <option value="CNY">人民币</option>
        </select><br/>

        <label>类型：</label>
        <select name="type" value={form.type} onChange={handleChange}>
          <option value="stock">股票</option>
          <option value="etf">ETF</option>
          <option value="fund">基金</option>
          <option value="cash">现金</option>
          <option value="crypto">加密货币</option>
          <option value="bond">债券</option>
        </select><br/>

        <input name="tags" value={form.tags} onChange={handleChange} placeholder="标签（多个用英文逗号）" /><br/>

        <label>
          <input type="checkbox" name="active" checked={form.active} onChange={handleChange} /> 是否启用
        </label><br/>

        <button type="submit">保存</button>
      </form>
    </div>
  );
}
