// client/src/components/OpsCenter/BatchBackfillControl.jsx
//
// TASK-074：批量补缺失。先预览资产数/缺失天数，再异步执行并轮询父 TaskRun。
import { useState } from 'react';
import { useBatchBackfill } from '../../hooks/useBatchBackfill';
import { useBackfillRange } from '../../hooks/useBackfillRange';
import { getApiErrorMessage } from '../../services/api.client';
import { colors } from '../../constants/design-tokens';

const RESULT_VIEW = Object.freeze({
  SUCCEEDED: { label: '批量补采完成', color: colors.statusOk },
  PARTIAL: { label: '批量补采部分完成', color: colors.statusWarn },
  FAILED: { label: '批量补采失败', color: colors.statusBad }
});

export default function BatchBackfillControl({ assetIds }) {
  const range = useBackfillRange();
  const batch = useBatchBackfill();
  const [previewSignature, setPreviewSignature] = useState(null);
  const signature = `${assetIds.join(',')}|${range.from}|${range.to}`;
  const preview = previewSignature === signature ? batch.previewData : null;
  const run = batch.run;
  const resultView = RESULT_VIEW[run?.status] || null;
  const error = batch.previewError || batch.startError || batch.runError;
  const failureText = run?.failures?.length ? run.failures[0].message : null;
  const rangeText = preview?.range?.year
    ? `年份 ${preview.range.year}`
    : (preview?.range?.from ? `${preview.range.from} ~ ${preview.range.to}` : '');
  const errorText = !error
    ? ''
    : (error.code === 'TASK_ALREADY_RUNNING'
      ? '已有批量补采在运行，请稍后重试'
      : getApiErrorMessage(error, '批量补采失败'));
  const canPreview = assetIds.length > 0 && !batch.isPreviewing && !batch.isStarting && !batch.isRunning;
  const canStart = Boolean(preview && preview.missingDateCount > 0)
    && !batch.isPreviewing && !batch.isStarting && !batch.isRunning;

  const previewNow = () => {
    const current = signature;
    batch.preview(
      { assetIds, from: range.from, to: range.to },
      {
        onSuccess: () => setPreviewSignature(current),
        onError: () => setPreviewSignature(null)
      }
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-3 text-sm" data-testid="ops-batch-backfill">
      <strong style={{ color: colors.textSecondary }}>批量补缺失</strong>
      <label style={{ color: colors.textMuted }}>
        年份
        <select
          data-testid="ops-batch-year"
          value={range.year}
          onChange={(event) => range.changeYear(event.target.value)}
          className="ml-1 border rounded px-1 py-1"
        >
          {range.years.map((value) => <option key={value} value={value}>{value}</option>)}
          <option value="">自定义区间</option>
        </select>
      </label>
      <label style={{ color: colors.textMuted }}>
        起
        <input
          type="date"
          data-testid="ops-batch-from"
          value={range.from}
          onChange={(event) => range.changeFrom(event.target.value)}
          className="ml-1 border rounded px-1"
        />
      </label>
      <label style={{ color: colors.textMuted }}>
        止
        <input
          type="date"
          data-testid="ops-batch-to"
          value={range.to}
          onChange={(event) => range.changeTo(event.target.value)}
          className="ml-1 border rounded px-1"
        />
      </label>
      <button
        type="button"
        data-testid="ops-batch-preview"
        disabled={!canPreview}
        onClick={previewNow}
        className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
      >
        {batch.isPreviewing ? '预估中…' : '预览'}
      </button>
      {preview && (
        <span data-testid="ops-batch-preview-summary" style={{ color: colors.textSecondary }}>
          资产 {preview.assetCount} 个 · 可补 {preview.readyCount} 个 · 缺失 {preview.missingDateCount} 天
          {preview.skippedCount > 0 ? ` · 跳过 ${preview.skippedCount} 个` : ''}
          {rangeText ? ` · ${rangeText}` : ''}
        </span>
      )}
      <button
        type="button"
        data-testid="ops-batch-start"
        disabled={!canStart}
        onClick={() => batch.start({ assetIds, from: range.from, to: range.to })}
        className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
      >
        {batch.isStarting || batch.isRunning ? '补采中…' : '确认补采'}
      </button>
      {run?.progress && (
        <span data-testid="ops-batch-progress" style={{ color: colors.textSecondary }}>
          已完成 {run.progress.completed ?? 0} / {run.progress.total ?? '—'}
        </span>
      )}
      {resultView && (
        <span data-testid="ops-batch-result" style={{ color: resultView.color }}>
          {resultView.label}
        </span>
      )}
      {run?.result && (
        <span data-testid="ops-batch-result-detail" style={{ color: colors.textSecondary }}>
          成功 {run.result.successCount ?? '—'} / 共 {run.result.assetCount ?? '—'}
          {' · '}补充 {run.result.fetchedCount ?? '—'} 天
          {' · '}仍缺 {run.result.missingAfterCount ?? '—'} 天
          {' · '}历史完整度请刷新
        </span>
      )}
      {failureText && (
        <span data-testid="ops-batch-failure" style={{ color: colors.statusWarn }}>
          {failureText}
        </span>
      )}
      {error && (
        <span data-testid="ops-batch-error" role="alert" style={{ color: colors.statusBad }}>
          {errorText}
        </span>
      )}
    </div>
  );
}
