// client/src/components/OpsCenter/AssetBackfillControl.jsx
//
// TASK-072：资产行内的单资产历史补采。默认当前年份，可改起止日期；
// 同步等待结果，仅显示本行状态，不自动改写历史完整度快照。
import { useState } from 'react';
import { useAssetBackfill } from '../../hooks/useAssetBackfill';
import { getApiErrorMessage } from '../../services/api.client';
import { colors } from '../../constants/design-tokens';

function todayString() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function defaultRange() {
  const today = todayString();
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export default function AssetBackfillControl({ asset }) {
  const today = todayString();
  const currentYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, index) => String(currentYear - index));
  const initial = defaultRange();
  const [year, setYear] = useState(String(currentYear));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const mutation = useAssetBackfill();
  const data = mutation.data;
  const error = mutation.error;
  const suffix = asset.assetId;

  const changeYear = (event) => {
    const value = event.target.value;
    setYear(value);
    if (!value) return;
    setFrom(`${value}-01-01`);
    setTo(Number(value) === currentYear ? today : `${value}-12-31`);
  };

  const changeFrom = (event) => {
    setFrom(event.target.value);
    setYear('');
  };

  const changeTo = (event) => {
    setTo(event.target.value);
    setYear('');
  };

  const submit = (event) => {
    event.preventDefault();
    mutation.mutate({ assetId: asset.assetId, from, to });
  };

  let resultText = null;
  if (data && !mutation.isPending) {
    resultText = data.missingAfterCount === 0
      ? `补采完成：补充 ${data.fetchedCount ?? '—'} 天`
      : `补采完成：仍缺 ${data.missingAfterCount ?? '—'} 天`;
  }
  const failureText = !mutation.isPending && data?.failures?.length ? data.failures[0].message : null;

  return (
    <details data-testid={`ops-backfill-${suffix}`} style={{ marginTop: 4 }}>
      <summary style={{ color: colors.brand, cursor: 'pointer' }}>补历史</summary>
      <form onSubmit={submit} className="mt-2 space-y-1">
        <label className="block text-xs" style={{ color: colors.textMuted }}>
          年份
          <select
            data-testid={`ops-backfill-year-${suffix}`}
            value={year}
            onChange={changeYear}
            className="ml-1 border rounded px-1"
          >
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
            <option value="">自定义区间</option>
          </select>
        </label>
        <label className="block text-xs" style={{ color: colors.textMuted }}>
          起
          <input
            type="date"
            data-testid={`ops-backfill-from-${suffix}`}
            value={from}
            onChange={changeFrom}
            className="ml-1 border rounded px-1"
          />
        </label>
        <label className="block text-xs" style={{ color: colors.textMuted }}>
          止
          <input
            type="date"
            data-testid={`ops-backfill-to-${suffix}`}
            value={to}
            onChange={changeTo}
            className="ml-1 border rounded px-1"
          />
        </label>
        <button
          type="submit"
          data-testid={`ops-backfill-submit-${suffix}`}
          disabled={mutation.isPending}
          className="px-2 py-1 bg-gray-200 rounded text-xs disabled:opacity-50"
        >
          {mutation.isPending ? '补采中…' : '开始补采'}
        </button>
        {resultText && (
          <span
            data-testid={`ops-backfill-result-${suffix}`}
            className="block text-xs"
            style={{ color: data.missingAfterCount === 0 ? colors.statusOk : colors.statusWarn }}
          >
            {resultText}
          </span>
        )}
        {failureText && (
          <span
            data-testid={`ops-backfill-failure-${suffix}`}
            className="block text-xs"
            style={{ color: colors.statusWarn }}
          >
            {failureText}
          </span>
        )}
        {error && (
          <span
            data-testid={`ops-backfill-error-${suffix}`}
            className="block text-xs"
            style={{ color: colors.statusBad }}
          >
            {getApiErrorMessage(error, '补采失败')}
          </span>
        )}
      </form>
    </details>
  );
}
