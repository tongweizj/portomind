import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';
import { usePortfolios } from '../../hooks/usePortfolios';
import {
  useAlertRules,
  useCreateAlertRule,
  useUpdateAlertRule,
  useDeleteAlertRule,
  useAlertEvents
} from '../../hooks/useAlerts';
import { getApiErrorMessage } from '../../services/api';

const RULE_TYPE_OPTIONS = [
  { value: 'price_above', label: '价格高于' },
  { value: 'price_below', label: '价格低于' },
  { value: 'gain_loss_pct', label: '盈亏比例' },
  { value: 'drift_exceed', label: '组合偏离' },
  { value: 'signal', label: '人工信号' },
  { value: 'high_52w', label: '52 周新高' },
  { value: 'low_52w', label: '52 周新低' },
  { value: 'valuation_percentile', label: '估值分位' },
];

const VALUATION_DIRECTION_OPTIONS = [
  { value: 'below', label: '低于（低估）' },
  { value: 'above', label: '高于（高估）' },
];

const METRIC_OPTIONS = [
  { value: 'pe', label: '市盈率 PE' },
  { value: 'pb', label: '市净率 PB' },
];

const DIRECTION_OPTIONS = [
  { value: 'buy', label: '买入' },
  { value: 'sell', label: '卖出' },
  { value: 'hold', label: '持有' },
];

const SCOPE_OPTIONS = [
  { value: 'asset', label: '资产级' },
  { value: 'portfolio', label: '组合级' },
];

const emptyForm = () => ({
  name: '', scope: 'asset', portfolioId: '', symbol: '', ruleType: 'price_above',
  threshold: '', pct: '', drift: '', direction: 'hold', reason: '', validUntil: '',
  lookbackDays: 365, indexCode: '', metric: 'pe', valuationThreshold: '', valuationDirection: 'below',
  cooldownDays: 7, active: true
});

function paramLabel(ruleType) {
  if (ruleType === 'price_above' || ruleType === 'price_below') return '价格阈值';
  if (ruleType === 'gain_loss_pct') return '盈亏百分比（负=浮亏）';
  if (ruleType === 'drift_exceed') return '偏离阈值 %';
  return null;
}

function paramValue(form, ruleType) {
  if (ruleType === 'price_above' || ruleType === 'price_below') return form.threshold;
  if (ruleType === 'gain_loss_pct') return form.pct;
  if (ruleType === 'drift_exceed') return form.drift;
  return '';
}

export default function AlertRules() {
  const { data: rules = [], isLoading, isError } = useAlertRules();
  const { data: portfolios = [] } = usePortfolios();
  const createRule = useCreateAlertRule();
  const updateRule = useUpdateAlertRule();
  const deleteRule = useDeleteAlertRule();
  const [editing, setEditing] = useState(null);   // null=关闭, {} = 新建, 规则对象 = 编辑
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [historyRuleId, setHistoryRuleId] = useState('');
  const historyEvents = useAlertEvents(historyRuleId ? { ruleId: historyRuleId, pageSize: 20 } : { enabled: false });
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setForm(emptyForm()); setEditing({}); setFormError(''); };
  const openEdit = (rule) => {
    setForm({
      name: rule.name || '', scope: rule.scope || 'asset', portfolioId: rule.portfolioId || '',
      symbol: rule.symbol || '', ruleType: rule.ruleType || 'price_above',
      threshold: rule.params?.threshold ?? '', pct: rule.params?.pct ?? '', drift: rule.params?.drift ?? '',
      direction: rule.direction || 'hold', reason: rule.reason || '', validUntil: rule.validUntil?.slice(0, 10) || '',
      lookbackDays: rule.params?.lookbackDays ?? 365,
      indexCode: rule.params?.indexCode || '', metric: rule.params?.metric || 'pe',
      valuationThreshold: rule.params?.threshold ?? '', valuationDirection: rule.params?.direction || 'below',
      cooldownDays: rule.cooldownDays ?? 7, active: rule.active !== false
    });
    setEditing(rule); setFormError('');
  };
  const closeForm = () => { setEditing(null); setFormError(''); };

  const buildPayload = () => {
    const params = {};
    if (form.ruleType === 'price_above' || form.ruleType === 'price_below') params.threshold = Number(form.threshold);
    if (form.ruleType === 'gain_loss_pct') params.pct = Number(form.pct);
    if (form.ruleType === 'drift_exceed') params.drift = Number(form.drift);
    if (form.ruleType === 'high_52w' || form.ruleType === 'low_52w') params.lookbackDays = Number(form.lookbackDays) || 365;
    if (form.ruleType === 'valuation_percentile') {
      params.indexCode = form.indexCode.trim().toUpperCase();
      params.metric = form.metric;
      params.threshold = Number(form.valuationThreshold);
      params.direction = form.valuationDirection;
    }
    return {
      name: form.name, scope: form.scope,
      portfolioId: form.portfolioId || null,
      symbol: form.symbol.trim().toUpperCase(),
      ruleType: form.ruleType, params,
      direction: form.ruleType === 'signal' ? form.direction : undefined,
      reason: form.reason, validUntil: form.validUntil ? `${form.validUntil}T00:00:00.000Z` : null,
      cooldownDays: Number(form.cooldownDays), active: form.active
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('请输入规则名称'); return; }
    if (form.scope === 'asset' && !form.symbol.trim()) { setFormError('资产级规则需填写资产代码'); return; }
    if (form.scope === 'portfolio' && !form.portfolioId) { setFormError('组合级规则需选择组合'); return; }
    if (form.ruleType === 'signal' && !form.direction) { setFormError('信号规则需选择方向'); return; }
    if (form.ruleType === 'valuation_percentile' && !form.indexCode.trim()) { setFormError('估值分位规则需填写指数代码'); return; }
    if (form.ruleType === 'valuation_percentile' && (form.valuationThreshold === '' || Number(form.valuationThreshold) < 0 || Number(form.valuationThreshold) > 100)) {
      setFormError('估值分位阈值需为 0-100 数值');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing._id) await updateRule.mutateAsync({ id: editing._id, data: payload });
      else await createRule.mutateAsync(payload);
      closeForm();
    } catch (error) {
      setFormError(getApiErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (rule) => {
    updateRule.mutate({ id: rule._id, data: { ...rule, active: !rule.active } });
  };

  const paramText = (rule) => {
    if (rule.ruleType === 'signal') return `${rule.direction || ''}${rule.validUntil ? ` · 至 ${rule.validUntil.slice(0, 10)}` : ''}`;
    if (rule.ruleType === 'high_52w' || rule.ruleType === 'low_52w') return `${rule.params?.lookbackDays || 365} 日`;
    if (rule.ruleType === 'valuation_percentile') {
      return `${rule.params?.indexCode} ${rule.params?.metric?.toUpperCase()} ${rule.params?.threshold ?? '—'}%（${rule.params?.direction === 'above' ? '高估' : '低估'}）`;
    }
    const value = rule.params?.threshold ?? rule.params?.pct ?? rule.params?.drift;
    return value != null ? String(value) : '—';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">提醒规则</h1>
        <button type="button" onClick={openCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
          新建规则
        </button>
      </div>

      {editing !== null && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow space-y-4">
          <h2 className="font-semibold text-gray-800">{editing._id ? '编辑规则' : '新建规则'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">名称</label>
              <input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                className="w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm">作用域</label>
              <select value={form.scope} onChange={event => setForm(current => ({ ...current, scope: event.target.value }))}
                className="w-full rounded border px-3 py-2">
                {SCOPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            {form.scope === 'asset' && (
              <div>
                <label className="mb-1 block text-sm">资产代码（如 0700.HK）</label>
                <input value={form.symbol} onChange={event => setForm(current => ({ ...current, symbol: event.target.value }))}
                  className="w-full rounded border px-3 py-2" />
              </div>
            )}
            {form.scope === 'portfolio' && (
              <div>
                <label className="mb-1 block text-sm">组合</label>
                <select value={form.portfolioId} onChange={event => setForm(current => ({ ...current, portfolioId: event.target.value }))}
                  className="w-full rounded border px-3 py-2">
                  <option value="">请选择组合</option>
                  {portfolios.map(pf => <option key={pf._id} value={pf._id}>{pf.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm">规则类型</label>
              <select value={form.ruleType} onChange={event => setForm(current => ({ ...current, ruleType: event.target.value }))}
                className="w-full rounded border px-3 py-2">
                {RULE_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            {form.ruleType !== 'signal' && paramLabel(form.ruleType) && (
              <div>
                <label className="mb-1 block text-sm">{paramLabel(form.ruleType)}</label>
                <input type="number" step="any" value={paramValue(form, form.ruleType)}
                  onChange={event => setForm(current => ({
                    ...current,
                    threshold: event.target.value, pct: event.target.value, drift: event.target.value
                  }))}
                  className="w-full rounded border px-3 py-2" />
              </div>
            )}
            {(form.ruleType === 'high_52w' || form.ruleType === 'low_52w') && (
              <div>
                <label className="mb-1 block text-sm">回看天数（默认 365 = 52 周）</label>
                <input type="number" min="1" max="3650" value={form.lookbackDays}
                  onChange={event => setForm(current => ({ ...current, lookbackDays: event.target.value }))}
                  className="w-full rounded border px-3 py-2" />
              </div>
            )}
            {form.ruleType === 'valuation_percentile' && (
              <>
                <div>
                  <label className="mb-1 block text-sm">指数代码（如 000300=沪深300 / 000016=上证50 / 000905=中证500）</label>
                  <input value={form.indexCode}
                    onChange={event => setForm(current => ({ ...current, indexCode: event.target.value }))}
                    className="w-full rounded border px-3 py-2" />
                </div>
                <div>
                  <label className="mb-1 block text-sm">指标</label>
                  <select value={form.metric}
                    onChange={event => setForm(current => ({ ...current, metric: event.target.value }))}
                    className="w-full rounded border px-3 py-2">
                    {METRIC_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm">分位阈值（0-100）</label>
                  <input type="number" min="0" max="100" value={form.valuationThreshold}
                    onChange={event => setForm(current => ({ ...current, valuationThreshold: event.target.value }))}
                    className="w-full rounded border px-3 py-2" />
                </div>
                <div>
                  <label className="mb-1 block text-sm">触发方向</label>
                  <select value={form.valuationDirection}
                    onChange={event => setForm(current => ({ ...current, valuationDirection: event.target.value }))}
                    className="w-full rounded border px-3 py-2">
                    {VALUATION_DIRECTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </>
            )}
            {form.ruleType === 'signal' && (
              <>
                <div>
                  <label className="mb-1 block text-sm">方向</label>
                  <select value={form.direction} onChange={event => setForm(current => ({ ...current, direction: event.target.value }))}
                    className="w-full rounded border px-3 py-2">
                    {DIRECTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm">有效期（可选）</label>
                  <input type="date" value={form.validUntil}
                    onChange={event => setForm(current => ({ ...current, validUntil: event.target.value }))}
                    className="w-full rounded border px-3 py-2" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm">建议理由（E大/有知有行原文摘录）</label>
                  <textarea value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}
                    className="w-full rounded border px-3 py-2" />
                </div>
              </>
            )}
            <div>
              <label className="mb-1 block text-sm">静默天数（cooldown）</label>
              <input type="number" min="0" max="365" value={form.cooldownDays}
                onChange={event => setForm(current => ({ ...current, cooldownDays: event.target.value }))}
                className="w-full rounded border px-3 py-2" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.active}
                  onChange={event => setForm(current => ({ ...current, active: event.target.checked }))}
                  className="rounded border-gray-300" />
                启用
              </label>
            </div>
          </div>
          {formError && <p className="text-sm text-red-700">{formError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {saving ? '保存中…' : '保存'}
            </button>
            <button type="button" onClick={closeForm} className="rounded border px-4 py-2 text-sm">取消</button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingState />
        : isError ? <ErrorState />
          : rules.length === 0 ? <EmptyState />
            : (
              <div className="overflow-x-auto rounded-xl bg-white shadow">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="px-4 py-3">名称</th>
                      <th className="px-4 py-3">类型</th>
                      <th className="px-4 py-3">参数</th>
                      <th className="px-4 py-3">作用域</th>
                      <th className="px-4 py-3">状态</th>
                      <th className="px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => (
                      <tr key={rule._id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{rule.name}</td>
                        <td className="px-4 py-3">{RULE_TYPE_OPTIONS.find(option => option.value === rule.ruleType)?.label || rule.ruleType}</td>
                        <td className="px-4 py-3 text-gray-600">{paramText(rule)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {rule.scope === 'asset' ? rule.symbol || '资产级' : '组合级'}
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => toggleActive(rule)}
                            className={`rounded-full px-2 py-0.5 text-xs ${rule.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {rule.active ? '启用' : '停用'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button type="button" onClick={() => setHistoryRuleId(historyRuleId === rule._id ? '' : rule._id)}
                            className="text-blue-600 hover:underline">
                            {historyRuleId === rule._id ? '收起历史' : '触发历史'}
                          </button>
                          <button type="button" onClick={() => openEdit(rule)} className="text-blue-600 hover:underline">编辑</button>
                          <button type="button" onClick={() => { if (window.confirm(`删除规则「${rule.name}」？（事件保留）`)) deleteRule.mutate(rule._id); }}
                            className="text-red-600 hover:underline">删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

      {historyRuleId && (
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-3 font-semibold text-gray-800">触发历史</h2>
          {historyEvents.isLoading ? <LoadingState />
            : historyEvents.data.length === 0 ? <p className="text-sm text-gray-500">该规则暂无触发事件</p>
              : (
                <ul className="space-y-2">
                  {historyEvents.data.map(event => (
                    <li key={event._id} className="text-sm text-gray-600 border-b pb-2 last:border-0">
                      <span className="font-medium text-gray-800">{event.title}</span>
                      <span className="ml-2 text-gray-400">{new Date(event.triggeredAt).toLocaleString('zh-CN')}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${event.status === 'unread' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {event.status === 'unread' ? '未读' : event.status === 'read' ? '已读' : '忽略'}
                      </span>
                      <p className="text-gray-500 mt-0.5">{event.content}</p>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      )}
    </div>
  );
}
