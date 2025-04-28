import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  getRebalanceSettings, updateRebalanceSettings
} from '../services/portfolioService';
import { ChevronLeft } from 'lucide-react';

export default function PortfolioRebalance() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [absoluteEnabled, setAbsoluteEnabled] = useState(true);
  const [absoluteValue, setAbsoluteValue] = useState(5);
  const [relativeEnabled, setRelativeEnabled] = useState(true);
  const [relativeValue, setRelativeValue] = useState(10);
  const [timeEnabled, setTimeEnabled] = useState(true);
  const [timeValue, setTimeValue] = useState(30);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getRebalanceSettings(id).then(data => {
      // 后端返回的值可能为 null 或不包含某字段
      setAbsoluteValue(data.absoluteDeviation ?? 0);
      setRelativeValue(data.relativeDeviation ?? 0);
      setTimeValue(data.timeInterval ?? 0);
      setAbsoluteEnabled(data.absoluteDeviation != null);
      setRelativeEnabled(data.relativeDeviation != null);
      setTimeEnabled(data.timeInterval != null);
    });
  }, [id]);

  const handleSave = async () => {
    // 校验
    const errs = {};
    if (absoluteEnabled && (absoluteValue < 0 || absoluteValue > 100)) {
      errs.absolute = '绝对偏离需在 0～100 之间';
    }
    if (relativeEnabled && (relativeValue < 0 || relativeValue > 100)) {
      errs.relative = '相对偏离需在 0～100 之间';
    }
    if (timeEnabled && timeValue < 1) {
      errs.time = '时间间隔至少为 1 天';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await updateRebalanceSettings(id, {
        /* 后端只在启用时才收到对应字段 */
        absoluteDeviation: absoluteEnabled ? absoluteValue : undefined,
        relativeDeviation: relativeEnabled ? relativeValue : undefined,
        timeInterval: timeEnabled ? timeValue : undefined
      });
      alert('阈值已更新');
    } catch (e) {
      console.error(e);
      alert('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };
  // // 将两个数组按 symbol 合并
  // const merged = targets.map(t => {
  //   const a = actuals.find(x => x.symbol === t.symbol);
  //   return {
  //     symbol: t.symbol,
  //     target: t.targetRatio,
  //     actual: a ? a.ratio : 0
  //   };
  // });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">阈值设置</h1>

      <div className="space-y-6 bg-white p-6 rounded-lg shadow">
        {/* 绝对偏离 */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              className="mr-2"
              checked={absoluteEnabled}
              onChange={e => setAbsoluteEnabled(e.target.checked)}
            />
            绝对偏离阈值 (%)：
            <input
              type="number"
              className="ml-4 w-24 border rounded px-2 py-1"
              value={absoluteValue}
              disabled={!absoluteEnabled}
              onChange={e => setAbsoluteValue(Number(e.target.value))}
            />
          </label>
          {errors.absolute && <p className="text-red-500 text-sm mt-1">{errors.absolute}</p>}
          <p className="text-gray-500 text-sm mt-1">例如：目标 50%，实际 56%，偏离 6%</p>
        </div>

        {/* 相对偏离 */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              className="mr-2"
              checked={relativeEnabled}
              onChange={e => setRelativeEnabled(e.target.checked)}
            />
            相对偏离阈值 (%)：
            <input
              type="number"
              className="ml-4 w-24 border rounded px-2 py-1"
              value={relativeValue}
              disabled={!relativeEnabled}
              onChange={e => setRelativeValue(Number(e.target.value))}
            />
          </label>
          {errors.relative && <p className="text-red-500 text-sm mt-1">{errors.relative}</p>}
          <p className="text-gray-500 text-sm mt-1">例如：基于历史数据，相对偏离更灵活</p>
        </div>

        {/* 时间间隔 */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              className="mr-2"
              checked={timeEnabled}
              onChange={e => setTimeEnabled(e.target.checked)}
            />
            时间间隔阈值（天）：
            <input
              type="number"
              className="ml-4 w-24 border rounded px-2 py-1"
              value={timeValue}
              disabled={!timeEnabled}
              onChange={e => setTimeValue(Number(e.target.value))}
            />
          </label>
          {errors.time && <p className="text-red-500 text-sm mt-1">{errors.time}</p>}
          <p className="text-gray-500 text-sm mt-1">例如：30 天后强制提醒一次</p>
        </div>

        {/* 保存按钮 */}
        <div className="text-right">
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
