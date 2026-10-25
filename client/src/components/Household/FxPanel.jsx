// 家庭汇率折叠面板（TASK-050 R12 / AC13）—— 唯一自取数据的家庭组件。
// 数据用独立的 `useFxRates`，与 family-summary 无耦合，故失败只影响本面板。
import { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Scale } from 'lucide-react';
import { ErrorState, LoadingState } from '../DataState';
import { useFxRates, useSyncFxRates, useUpsertFxRate } from '../../hooks/useFamily';
import { getApiErrorMessage } from '../../services/api';
import { CURRENCY_LABELS } from '../../constants/enums';

// 手动录入只开放外币（人民币是折算基准，不需要汇率）。
const MANUAL_CURRENCIES = ['USD', 'CAD', 'HKD'];

// 汇率列表/表单只在展开后挂载 —— 这样 `useFxRates` 也不会在默认收起时发请求。
function FxPanelBody() {
  const { data: rates = [], isLoading, isError } = useFxRates();
  const sync = useSyncFxRates();
  const upsert = useUpsertFxRate();
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState('');
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');

  // 两个 mutation 的 onSuccess 已失效 `['fx-rates']` 与 `['family-summary']`（hooks/useFamily.js），
  // 因此这里不需要手动 invalidate / refetch —— AC13 的「两个 query 均刷新」由 hook 保证。
  const handleSync = async () => {
    setSyncError('');
    try {
      await sync.mutateAsync();
    } catch (err) {
      setSyncError(getApiErrorMessage(err, '同步失败'));
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) {
      setError('请输入有效汇率');
      return;
    }
    setError('');
    try {
      await upsert.mutateAsync({ currency, data: { rateToCny: value, note: 'manual entry' } });
      setRate('');
    } catch (err) {
      setError(getApiErrorMessage(err, '保存失败'));
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-gray-500">汇率为「1 外币 = ¥人民币」</span>
        <button
          type="button"
          onClick={handleSync}
          disabled={sync.isPending}
          className="flex items-center gap-1 text-sm text-blue-600 border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${sync.isPending ? 'animate-spin' : ''}`} />
          同步汇率
        </button>
      </div>
      {syncError && <p className="text-sm text-red-700">{syncError}</p>}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState />
      ) : rates.length === 0 ? (
        <p className="text-sm text-gray-500">暂无汇率数据，可手动录入或一键同步</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rates.map(item => (
            <li key={item.currency} className="flex items-center justify-between">
              <span className="text-gray-600">
                {CURRENCY_LABELS[item.currency] || item.currency}（{item.currency}）
              </span>
              <span className="text-gray-800 font-medium">
                {Number(item.rateToCny).toFixed(4)}
                <span className="ml-2 text-xs text-gray-400">
                  {new Date(item.date).toISOString().slice(0, 10)} · {item.source === 'manual' ? '手动' : '自动'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2 border-t pt-4">
        <div>
          <label className="mb-1 block text-xs text-gray-500">币种</label>
          <select
            value={currency}
            onChange={event => setCurrency(event.target.value)}
            className="rounded border px-3 py-2 text-sm bg-white"
          >
            {MANUAL_CURRENCIES.map(code => (
              <option key={code} value={code}>
                {CURRENCY_LABELS[code] || code}（{code}）
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">对人民币汇率</label>
          <input
            type="number"
            step="any"
            min="0"
            value={rate}
            placeholder="如 7.20"
            onChange={event => setRate(event.target.value)}
            className="w-36 rounded border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={upsert.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {upsert.isPending ? '保存中…' : '录入'}
        </button>
        {error && <p className="text-sm text-red-700 w-full">{error}</p>}
      </form>
    </div>
  );
}

export default function FxPanel() {
  // AC13：默认收起；展开态不持久化（FS P1-1 未批准）。
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl bg-white p-6 shadow space-y-4">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between"
      >
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Scale className="w-4 h-4 text-gray-500" />
          家庭汇率（1 外币 = ¥人民币）
        </h2>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {expanded && <FxPanelBody />}
    </div>
  );
}
