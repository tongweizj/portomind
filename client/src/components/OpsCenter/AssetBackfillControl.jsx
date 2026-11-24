// client/src/components/OpsCenter/AssetBackfillControl.jsx
//
// TASK-072：资产行内的单资产历史补采。默认当前年份，可改起止日期；
// 同步等待结果，仅显示本行状态，不自动改写历史完整度快照。
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { backfillAsset } from '../../services/ops-center.service';
import { getApiErrorMessage } from '../../services/api.client';
import { colors } from '../../constants/design-tokens';

function defaultRange() {
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export default function AssetBackfillControl({ asset }) {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const mutation = useMutation({
    mutationFn: ({ start, end }) => backfillAsset(asset.assetId, { from: start, to: end })
  });
  const data = mutation.data;
  const error = mutation.error;
  const suffix = asset.assetId;

  const submit = (event) => {
    event.preventDefault();
    mutation.mutate({ start: from, end: to });
  };

  let resultText = null;
  if (data && !mutation.isPending) {
    resultText = data.missingAfterCount === 0
      ? `补采完成：补充 ${data.fetchedCount ?? 0} 天`
      : `补采完成：仍缺 ${data.missingAfterCount ?? '—'} 天`;
  }
  const failureText = !mutation.isPending && data?.failures?.length ? data.failures[0].message : null;

  return (
    <details data-testid={`ops-backfill-${suffix}`} style={{ marginTop: 4 }}>
      <summary style={{ color: colors.brand, cursor: 'pointer' }}>补历史</summary>
      <form onSubmit={submit} className="mt-2 space-y-1">
        <label className="block text-xs" style={{ color: colors.textMuted }}>
          起
          <input
            type="date"
            data-testid={`ops-backfill-from-${suffix}`}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="ml-1 border rounded px-1"
          />
        </label>
        <label className="block text-xs" style={{ color: colors.textMuted }}>
          止
          <input
            type="date"
            data-testid={`ops-backfill-to-${suffix}`}
            value={to}
            onChange={(event) => setTo(event.target.value)}
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
