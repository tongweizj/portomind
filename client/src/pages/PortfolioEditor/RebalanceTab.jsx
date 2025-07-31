
// src/pages/tabs/PortfolioRebalanceTab.jsx
import { useEffect, useState } from 'react';
import { getRebalanceSettings, updateRebalanceSettings } from '../../services/portfolioService';

export default function PortfolioRebalanceTab({ portfolioId }) {
  const [absoluteEnabled, setAbsoluteEnabled] = useState(true);
  const [absoluteValue, setAbsoluteValue] = useState(5);
  const [relativeEnabled, setRelativeEnabled] = useState(true);
  const [relativeValue, setRelativeValue] = useState(10);
  const [timeEnabled, setTimeEnabled] = useState(true);
  const [timeValue, setTimeValue] = useState(30);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getRebalanceSettings(portfolioId).then(data => {
      setAbsoluteValue(data.absoluteDeviation ?? 0);
      setRelativeValue(data.relativeDeviation ?? 0);
      setTimeValue(data.timeInterval ?? 0);
      setAbsoluteEnabled(data.absoluteDeviation != null);
      setRelativeEnabled(data.relativeDeviation != null);
      setTimeEnabled(data.timeInterval != null);
    });
  }, [portfolioId]);

  const handleSave = async () => {
    const errs = {};
    if (absoluteEnabled && (absoluteValue < 0 || absoluteValue > 100)) errs.absolute = '绝对偏离需在 0～100 之间';
    if (relativeEnabled && (relativeValue < 0 || relativeValue > 100)) errs.relative = '相对偏离需在 0～100 之间';
    if (timeEnabled && timeValue < 1) errs.time = '时间间隔至少为 1 天';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await updateRebalanceSettings(portfolioId, {
        absoluteDeviation: absoluteEnabled ? absoluteValue : undefined,
        relativeDeviation: relativeEnabled ? relativeValue : undefined,
        timeInterval: timeEnabled ? timeValue : undefined
      });
      alert('阈值已更新');
    } catch (e) {
      alert('保存失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h3 className="font-bold text-lg">再平衡条件</h3>

      <label className="flex items-center">
        <input type="checkbox" className="mr-2" checked={absoluteEnabled} onChange={e => setAbsoluteEnabled(e.target.checked)} />
        绝对偏离 (%)：
        <input type="number" className="ml-4 w-24 border px-2 py-1 rounded" value={absoluteValue} disabled={!absoluteEnabled} onChange={e => setAbsoluteValue(Number(e.target.value))} />
      </label>
      {errors.absolute && <p className="text-red-500 text-sm">{errors.absolute}</p>}

      <label className="flex items-center">
        <input type="checkbox" className="mr-2" checked={relativeEnabled} onChange={e => setRelativeEnabled(e.target.checked)} />
        相对偏离 (%)：
        <input type="number" className="ml-4 w-24 border px-2 py-1 rounded" value={relativeValue} disabled={!relativeEnabled} onChange={e => setRelativeValue(Number(e.target.value))} />
      </label>
      {errors.relative && <p className="text-red-500 text-sm">{errors.relative}</p>}

      <label className="flex items-center">
        <input type="checkbox" className="mr-2" checked={timeEnabled} onChange={e => setTimeEnabled(e.target.checked)} />
        时间间隔（天）：
        <input type="number" className="ml-4 w-24 border px-2 py-1 rounded" value={timeValue} disabled={!timeEnabled} onChange={e => setTimeValue(Number(e.target.value))} />
      </label>
      {errors.time && <p className="text-red-500 text-sm">{errors.time}</p>}

      <button onClick={handleSave} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
        {loading ? '保存中…' : '保存'}
      </button>
    </div>
  );
}
