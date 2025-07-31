
// src/pages/tabs/PortfolioTargetTab.jsx
import { useEffect, useState } from 'react';
import { getPortfolioById, updatePortfolio } from '../../services/portfolioService';
import { getAssets } from '../../services/assetService';

export default function PortfolioTargetTab({ portfolioId }) {
  const [formTargets, setFormTargets] = useState([]);
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    getAssets().then(data => setAssets(data.data));
    getPortfolioById(portfolioId).then(data => {
      setFormTargets(data.targets?.length > 0 ? data.targets : [{ symbol: '', targetRatio: 0 }]);
    });
  }, [portfolioId]);

  const handleTargetChange = (idx, field, value) => {
    setFormTargets(prev => prev.map((t, i) =>
      i === idx ? { ...t, [field]: field === 'targetRatio' ? parseFloat(value) || 0 : value } : t
    ));
  };

  const addTarget = () => setFormTargets(prev => [...prev, { symbol: '', targetRatio: 0 }]);
  const removeTarget = idx => setFormTargets(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      await updatePortfolio(portfolioId, { targets: formTargets });
      alert('资产配置已保存');
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">资产配置</h3>
        <button onClick={addTarget} className="text-blue-600 hover:underline text-sm">+ 添加资产</button>
      </div>

      {formTargets.map((t, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <select value={t.symbol} onChange={e => handleTargetChange(idx, 'symbol', e.target.value)} className="flex-1 border px-2 py-1 rounded">
            <option value="">请选择资产</option>
            {assets.map(asset => (
              <option key={asset._id} value={asset.symbol}>{asset.symbol} - {asset.name}</option>
            ))}
          </select>
          <input type="number" placeholder="%" value={t.targetRatio} onChange={e => handleTargetChange(idx, 'targetRatio', e.target.value)} className="w-20 border px-2 py-1 rounded" />
          <button onClick={() => removeTarget(idx)} className="text-red-500 text-sm">删除</button>
        </div>
      ))}

      <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded">保存</button>
    </div>
  );
}