// src/pages/CreatePortfolio.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  createPortfolio,
  getPortfolioById,
  updatePortfolio
} from '../../services/portfolioService';
import { getAllAssets } from '../../services/assetService';
export default function CreatePortfolio() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: '稳健',
    currency: 'CAD',
    targets: Array.from({ length: 4 }, () => ({ symbol: '', targetRatio: 0 }))
  });
  // 资产列表，用于下拉
  const [assets, setAssets] = useState([]);
  // ▶️ 编辑模式：页面加载后拉取原组合数据并预填表单
  useEffect(() => {
    getAllAssets().then(data => setAssets(data));
    if (!isEdit) return;

    getPortfolioById(id)
      .then(data => {
        console.log("data:", data)
        setForm({
          name: data.name || '',
          description: data.description || '',
          type: data.type,
          currency: data.currency,
          // 如果已有 targets，则用它，否则保持初始的 4 行
          targets: (data.targets && data.targets.length > 0)
            ? data.targets
            : Array.from({ length: 4 }, () => ({ symbol: '', targetRatio: 0 }))
        });
      })
      .catch(err => {
        alert('❌ 无法加载组合数据：' + err.message);
      });
  }, [id, isEdit]);

  // 通用字段变更
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // 目标配置行变更
  const handleTargetChange = (idx, field, value) => {
    setForm(prev => {
      const newTargets = prev.targets.map((t, i) =>
        i === idx
          ? {
              ...t,
              [field]:
                field === 'targetRatio' ? parseFloat(value) || 0 : value
            }
          : t
      );
      return { ...prev, targets: newTargets };
    });
  };

  // 新增一行目标配置
  const addTarget = () => {
    setForm(prev => ({
      ...prev,
      targets: [...prev.targets, { symbol: '', targetRatio: 0 }]
    }));
  };

  // 删除一行目标配置
  const removeTarget = (idx) => {
    setForm(prev => ({
      ...prev,
      targets: prev.targets.filter((_, i) => i !== idx)
    }));
  };

  // 提交：根据模式调用不同服务
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await updatePortfolio(id, form);
      } else {
        await createPortfolio(form);
      }
      navigate('/portfolios');
    } catch (err) {
      alert(
        `❌ ${isEdit ? '更新' : '创建'}失败：` +
          (err.response?.data?.message || err.message)
      );
    }
  };

  return (
    <div className="p-10 mx-auto bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4">
        {isEdit ? '编辑组合' : '创建组合'}
      </h2>

      <h3 className="font-bold text-lg my-5">基本信息</h3> 
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 组合名称 */}
        <div class="max-w-lg justify-start">
          <label className="block text-gray-700 mb-1">名称</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
            required
          />
        </div>

        {/* 描述 */}
        <div class="max-w-lg justify-start">
          <label className="block text-gray-700 mb-1">描述</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
          />
        </div>

        {/* 类型 */}
        <div class="max-w-lg justify-start">
          <label className="block text-gray-700 mb-1">类型</label>
          <div className="flex space-x-4">
            {['活钱', '稳健', '长期'].map(opt => (
              <label key={opt} className="flex items-center">
                <input
                  type="radio"
                  name="type"
                  value={opt}
                  checked={form.type === opt}
                  onChange={handleChange}
                />
                <span className="ml-2">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 币种 */}
        <div class="max-w-lg justify-start">
          <label className="block text-gray-700 mb-1">币种</label>
          <select
            name="currency"
            value={form.currency}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
          >
            <option value="CNY">人民币</option>
            <option value="CAD">加元</option>
            <option value="USD">美元</option>
          </select>
        </div>

        {/* 目标资产配置 */}
        <div class="max-w-lg justify-start">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg my-5">资产配置</h3> 
            {/* // <label className="block text-gray-700"></label> */}
            <button
              type="button"
              onClick={addTarget}
              className="text-blue-600 hover:underline text-sm"
            >
              + 添加资产
            </button>
          </div>

          {form.targets.map((t, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <select
                value={t.symbol}
                onChange={e => handleTargetChange(idx, 'symbol', e.target.value)}
                className="max-w-sm flex-1 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring focus:ring-blue-200"
                required
              >
                <option value="">请选择资产</option>
                {assets.map(asset => (
                  <option key={asset._id} value={asset.symbol}>
                    {asset.symbol} {asset.name ? `- ${asset.name}` : ''}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="%"
                value={t.targetRatio}
                onChange={e =>
                  handleTargetChange(idx, 'targetRatio', e.target.value)
                }
                className="w-20 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring focus:ring-blue-200"
                min="0"
                max="100"
                required
              />
              <button
                type="button"
                onClick={() => removeTarget(idx)}
                className="w-20 text-red-500 hover:underline text-sm"
              >
                删除
              </button>
            </div>
          ))}
        </div>

        {/* 提交 */}
        <button
          type="submit"
          className="w-30 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          {isEdit ? '更新组合' : '保存组合'}
        </button>
      </form>
    </div>
  );
}
