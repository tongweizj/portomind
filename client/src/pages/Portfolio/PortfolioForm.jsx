import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/DataState';
import { ROUTES } from '../../constants/routes';
import { getApiErrorMessage } from '../../services/api';
import { getAssets } from '../../services/asset.service';
import { createPortfolio, getPortfolio, updatePortfolio } from '../../services/portfolio.service';
import { validatePortfolioTargets } from '../../utils/portfolioValidation';

const emptyTarget = () => ({ symbol: '', targetRatio: 0 });

export default function PortfolioForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState({
    name: '', description: '', type: '稳健', currency: 'CAD', targets: [emptyTarget()]
  });
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    const requests = [getAssets({ pageSize: 100, active: true })];
    if (isEdit) requests.push(getPortfolio(id));
    Promise.all(requests)
      .then(([assetResult, portfolio]) => {
        if (!active) return;
        setAssets(assetResult.data);
        if (portfolio) {
          setForm({
            name: portfolio.name || '',
            description: portfolio.description || '',
            type: portfolio.type || '稳健',
            currency: portfolio.currency || 'CAD',
            targets: portfolio.targets?.length ? portfolio.targets : []
          });
        }
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, isEdit]);

  const targetTotal = useMemo(
    () => form.targets.reduce((sum, target) => sum + (Number(target.targetRatio) || 0), 0),
    [form.targets]
  );
  const targetError = validatePortfolioTargets(form.targets);

  const handleTargetChange = (index, field, value) => {
    setForm(current => ({
      ...current,
      targets: current.targets.map((target, targetIndex) => targetIndex === index
        ? { ...target, [field]: field === 'targetRatio' ? value : value.toUpperCase() }
        : target)
    }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const validationMessage = validatePortfolioTargets(form.targets);
    if (validationMessage) {
      setSubmitError(validationMessage);
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      const payload = {
        ...form,
        targets: form.targets.map(target => ({
          symbol: target.symbol.trim().toUpperCase(),
          targetRatio: Number(target.targetRatio)
        }))
      };
      const saved = isEdit
        ? await updatePortfolio(id, payload)
        : await createPortfolio(payload);
      navigate(ROUTES.PORTFOLIO_TAB(saved._id || id, 'basic'));
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, isEdit ? '更新组合失败' : '创建组合失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState />;

  return (
    <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow">
      <h1 className="mb-6 text-2xl font-bold">{isEdit ? '编辑组合' : '创建组合'}</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">名称</label>
            <input name="name" value={form.name} required
              onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
              className="w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm">类型</label>
            <select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}
              className="w-full rounded border px-3 py-2">
              {['活钱', '稳健', '长期'].map(value => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">基础币种</label>
            <select value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value }))}
              className="w-full rounded border px-3 py-2">
              {['CNY', 'CAD', 'USD'].map(value => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm">描述</label>
            <textarea value={form.description}
              onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
              className="w-full rounded border px-3 py-2" />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">目标配置</h2>
            <div className="flex items-center gap-4">
              <span className={targetError ? 'text-sm text-red-700' : 'text-sm text-green-700'}>
                合计 {targetTotal.toFixed(2)}%
              </span>
              <button type="button" onClick={() => setForm(current => ({ ...current, targets: [...current.targets, emptyTarget()] }))}
                className="text-sm text-blue-600">+ 添加资产</button>
            </div>
          </div>
          {form.targets.length === 0 && <p className="text-sm text-gray-500">当前未配置目标资产。</p>}
          {form.targets.map((target, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <select value={target.symbol} required onChange={event => handleTargetChange(index, 'symbol', event.target.value)}
                className="min-w-52 flex-1 rounded border px-3 py-2">
                <option value="">请选择资产</option>
                {assets.map(asset => <option key={asset._id} value={asset.symbol}>{asset.symbol} - {asset.name}</option>)}
              </select>
              <input type="number" value={target.targetRatio} min="0" max="100" step="any" required
                onChange={event => handleTargetChange(index, 'targetRatio', event.target.value)}
                className="w-28 rounded border px-3 py-2" aria-label={`${target.symbol || '资产'}目标比例`} />
              <span>%</span>
              <button type="button" onClick={() => setForm(current => ({
                ...current, targets: current.targets.filter((_, targetIndex) => targetIndex !== index)
              }))} className="text-sm text-red-600">删除</button>
            </div>
          ))}
          {targetError && <p className="text-sm text-red-700">{targetError}</p>}
        </section>

        {submitError && <div className="rounded bg-red-50 p-3 text-red-700">{submitError}</div>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving || Boolean(targetError)}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
            {saving ? '保存中…' : isEdit ? '更新组合' : '创建组合'}
          </button>
          <button type="button" onClick={() => navigate(isEdit ? ROUTES.PORTFOLIO_TAB(id, 'basic') : ROUTES.PORTFOLIO_LIST)}
            className="rounded border px-4 py-2">取消</button>
        </div>
      </form>
    </div>
  );
}
