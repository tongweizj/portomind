// client/src/components/OpsCenter/CollectionRecordsPanel.jsx
//
// TASK-075：资产数据 tab 的「采集记录」子视图。
// - 记录来自 TaskRun / TaskSkip（GET /api/ops-center/task-runs），不读取服务器原始日志；
// - 筛选（操作类型/资产/时间）与分页全部交给服务端，客户端不拉全量切片；
// - run 详情的逐资产明细由服务端归一（assetResults），这里只做展示；
// - admin 与 member 看到同样的只读记录；缺失值显示「—」，不补 0。

import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../DataState';
import { colors } from '../../constants/design-tokens';
import {
  OPS_PRICE_SYNC_TASK_NAME,
  OPS_RECORD_TYPES,
  OPS_RECORDS_DEFAULT_PAGE_SIZE
} from '../../constants/opsCenter';
import { useTaskRecords } from '../../hooks/useTaskRecords';
import { useOpsTaskRun } from '../../hooks/useOpsTaskRun';
import { useOpsCenterAssets } from '../../hooks/useOpsCenterAssets';
import { getApiErrorMessage } from '../../services/api.client';

const UNKNOWN_TEXT = '—';

const RUN_STATUS_VIEW = Object.freeze({
  SUCCEEDED: { label: '成功', color: colors.statusOk },
  PARTIAL: { label: '部分失败', color: colors.statusWarn },
  FAILED: { label: '失败', color: colors.statusBad },
  RUNNING: { label: '运行中', color: colors.statusIdle },
  SKIPPED: { label: '已跳过', color: colors.statusIdle }
});

const ASSET_STATUS_VIEW = Object.freeze({
  succeeded: { label: '成功', color: colors.statusOk },
  partial: { label: '部分完成', color: colors.statusWarn },
  failed: { label: '失败', color: colors.statusBad },
  skipped: { label: '跳过', color: colors.statusIdle },
  unknown: { label: '无法判断', color: colors.statusIdle }
});

const REASON_LABELS = Object.freeze({
  ALREADY_RUNNING: '已有同类任务在运行',
  DUPLICATE_RUN_KEY: '重复触发',
  MARKET_CLOSED: '休市',
  GAP: '存在缺失交易日',
  ERROR: '检查出错',
  INSUFFICIENT_SAMPLE: '样本不足，未检查',
  SKIPPED_NO_LAUNCH_DATE: '缺少上市日期，未检查'
});

const MARKET_GROUP_LABELS = Object.freeze({ CN: 'CN-HK', US_CA: 'US-CA' });

const TYPE_LABELS = Object.freeze(Object.fromEntries(OPS_RECORD_TYPES.map((type) => [type.value, type.label])));

const EMPTY_FILTERS = Object.freeze({ taskName: '', assetId: '', from: '', to: '' });

function formatTime(value) {
  if (!value) return UNKNOWN_TEXT;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? UNKNOWN_TEXT : date.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return UNKNOWN_TEXT;
  if (ms < 1000) return `${ms} 毫秒`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function rangeText(from, to) {
  if (!from && !to) return null;
  if (!to || from === to) return from || to;
  return `${from || UNKNOWN_TEXT} ~ ${to}`;
}

function reasonText(reason) {
  return reason ? (REASON_LABELS[reason] || reason) : null;
}

function scopeText(record) {
  if (record.kind === 'skip') {
    return `跳过：${reasonText(record.reason) || UNKNOWN_TEXT}`;
  }
  const scope = record.scope || {};
  const parts = [];
  if (record.taskName === OPS_PRICE_SYNC_TASK_NAME) {
    parts.push(scope.marketGroup ? (MARKET_GROUP_LABELS[scope.marketGroup] || scope.marketGroup) : '全部 active');
  }
  if (scope.symbol) parts.push(scope.symbol);
  else if (Number.isFinite(scope.assetCount)) parts.push(`${scope.assetCount} 只资产`);
  const range = rangeText(scope.from, scope.to);
  if (range) parts.push(range);
  return parts.length > 0 ? parts.join(' · ') : UNKNOWN_TEXT;
}

function countText(record, field) {
  const value = record.counts?.[field];
  return Number.isFinite(value) ? value : UNKNOWN_TEXT;
}

function StatusBadge({ view, testid, status }) {
  const resolved = view || { label: status || UNKNOWN_TEXT, color: colors.statusIdle };
  return (
    <span data-testid={testid} data-status={status || 'unknown'} style={{ color: resolved.color }}>
      {resolved.label}
    </span>
  );
}

function missingRangesText(row) {
  if (!Array.isArray(row.missingRanges) || row.missingRanges.length === 0) return null;
  const text = row.missingRanges.map((range) => rangeText(range.from, range.to)).join('、');
  return row.missingRangesTruncated ? `${text} 等（已截断）` : text;
}

function RecordDetail({ runId }) {
  const { run, isLoading, error } = useOpsTaskRun(runId);
  // 批量补缺失的父任务不带缺失区间，逐资产区间在子任务详情里展开查看。
  const [openChildId, setOpenChildId] = useState(null);
  if (isLoading) return <LoadingState>明细加载中…</LoadingState>;
  if (error) {
    return <ErrorState>{getApiErrorMessage(error, '运行明细加载失败')}</ErrorState>;
  }
  if (!run) return null;
  const rows = run.assetResults;
  const runFailures = Array.isArray(run.failures) ? run.failures : [];

  return (
    <div data-testid="ops-record-detail" className="space-y-2 text-sm">
      {!Array.isArray(rows) ? (
        <div data-testid="ops-record-detail-empty" style={{ color: colors.textMuted }}>
          {run.status === 'RUNNING' ? '任务运行中，结束后显示逐资产明细' : '本次运行没有逐资产明细'}
        </div>
      ) : rows.length === 0 ? (
        <div data-testid="ops-record-detail-empty" style={{ color: colors.textMuted }}>本次运行未涉及资产</div>
      ) : (
        <table data-testid="ops-record-asset-table" className="min-w-full border bg-white rounded">
          <thead style={{ backgroundColor: '#FBFBFD', color: colors.textMuted }}>
            <tr>
              <th className="px-3 py-1 text-left">资产</th>
              <th className="px-3 py-1 text-left">结果</th>
              <th className="px-3 py-1 text-left">原因</th>
              <th className="px-3 py-1 text-left">区间 / 价格日</th>
              <th className="px-3 py-1 text-left">剩余缺失</th>
              <th className="px-3 py-1 text-left">缺失区间</th>
              <th className="px-3 py-1 text-left">子任务</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ color: colors.textPrimary }}>
            {rows.map((row, index) => {
              const reason = [reasonText(row.reason), row.message].filter(Boolean).join('：');
              const childOpen = row.childRunId && row.childRunId === openChildId;
              return [
                <tr key={`${row.assetId || 'asset'}-${index}`} data-testid="ops-record-asset-row">
                  <td className="px-3 py-1 whitespace-nowrap">
                    <span className="font-semibold">{row.symbol || row.assetId || UNKNOWN_TEXT}</span>
                    {row.market && <span style={{ color: colors.textMuted }}> · {row.market}</span>}
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    <StatusBadge view={ASSET_STATUS_VIEW[row.status]} status={row.status} testid="ops-record-asset-status" />
                  </td>
                  <td className="px-3 py-1" data-testid="ops-record-asset-reason">{reason || UNKNOWN_TEXT}</td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    {rangeText(row.from, row.to) || row.priceDate || UNKNOWN_TEXT}
                  </td>
                  <td className="px-3 py-1">{Number.isFinite(row.missingCount) ? `${row.missingCount} 天` : UNKNOWN_TEXT}</td>
                  <td className="px-3 py-1" data-testid="ops-record-asset-missing-ranges">
                    {missingRangesText(row) || UNKNOWN_TEXT}
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    {row.childRunId ? (
                      <button
                        type="button"
                        data-testid="ops-record-child-toggle"
                        onClick={() => setOpenChildId(childOpen ? null : row.childRunId)}
                        style={{ color: colors.brand }}
                        className="hover:underline"
                      >
                        {childOpen ? '收起' : '缺失区间'}
                      </button>
                    ) : UNKNOWN_TEXT}
                  </td>
                </tr>,
                childOpen && (
                  <tr key={`${row.childRunId}-child`}>
                    <td colSpan={7} className="px-3 py-1" data-testid="ops-record-child-detail">
                      <RecordDetail runId={row.childRunId} />
                    </td>
                  </tr>
                )
              ];
            })}
          </tbody>
        </table>
      )}
      {runFailures.length > 0 && !Array.isArray(rows) && (
        <div data-testid="ops-record-run-failures" role="alert" style={{ color: colors.statusBad }}>
          {runFailures.map((failure) => failure.message || failure.category).filter(Boolean).join('；')}
        </div>
      )}
    </div>
  );
}

export default function CollectionRecordsPanel() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [openRunId, setOpenRunId] = useState(null);
  const pageSize = OPS_RECORDS_DEFAULT_PAGE_SIZE;

  const { records, pagination, isLoading, isFetching, error } = useTaskRecords({ ...filters, page, pageSize });
  // 资产下拉：取全部资产（含停用）的第一页，按代码排序；只用于筛选选项。
  const assetOptions = useOpsCenterAssets({ active: 'all', pageSize: 100, sortBy: 'symbol', sortOrder: 'asc' });

  const updateFilter = (patch) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    setOpenRunId(null);
  };

  const total = Number(pagination?.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-3" data-testid="ops-records-panel">
      <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: colors.textSecondary }}>
        <label>
          操作类型
          <select
            data-testid="ops-records-type"
            value={filters.taskName}
            onChange={(event) => updateFilter({ taskName: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          >
            <option value="">全部</option>
            {OPS_RECORD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label>
          资产
          <select
            data-testid="ops-records-asset"
            value={filters.assetId}
            onChange={(event) => updateFilter({ assetId: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          >
            <option value="">全部资产</option>
            {assetOptions.assets.map((asset) => (
              <option key={asset.assetId} value={asset.assetId}>{asset.symbol || asset.assetId}</option>
            ))}
          </select>
        </label>
        <label>
          从
          <input
            type="date"
            data-testid="ops-records-from"
            value={filters.from}
            onChange={(event) => updateFilter({ from: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          />
        </label>
        <label>
          到
          <input
            type="date"
            data-testid="ops-records-to"
            value={filters.to}
            onChange={(event) => updateFilter({ to: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            data-testid="ops-records-reset"
            onClick={() => updateFilter(EMPTY_FILTERS)}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            清除筛选
          </button>
        )}
      </div>

      <div className="text-sm" style={{ color: colors.textMuted }}>
        记录来自任务运行档案（TaskRun / 跳过事件），不是服务器原始日志。
        {filters.assetId && (
          <span data-testid="ops-records-asset-hint">按资产筛选时不含跳过事件（跳过事件不关联具体资产）。</span>
        )}
      </div>

      {isLoading ? (
        <div data-testid="ops-records-loading"><LoadingState>采集记录加载中…</LoadingState></div>
      ) : error ? (
        <div data-testid="ops-records-error">
          <ErrorState>{getApiErrorMessage(error, '采集记录加载失败')}</ErrorState>
        </div>
      ) : records.length === 0 ? (
        <div data-testid="ops-records-empty">
          <EmptyState>{hasFilters ? '没有匹配的采集记录' : '暂无采集记录'}</EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="ops-records-table" className="min-w-full border bg-white shadow-sm rounded text-sm">
            <thead style={{ backgroundColor: '#FBFBFD', color: colors.textMuted }}>
              <tr>
                <th className="px-4 py-2 text-left">时间</th>
                <th className="px-4 py-2 text-left">操作类型</th>
                <th className="px-4 py-2 text-left">范围</th>
                <th className="px-4 py-2 text-left">状态</th>
                <th className="px-4 py-2 text-right">总数</th>
                <th className="px-4 py-2 text-right">成功</th>
                <th className="px-4 py-2 text-right">失败</th>
                <th className="px-4 py-2 text-left">耗时</th>
                <th className="px-4 py-2 text-left">明细</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ color: colors.textPrimary }}>
              {records.map((record) => {
                const key = record.runId || record.skipId;
                const open = record.runId && record.runId === openRunId;
                return [
                  <tr key={key} data-testid="ops-record-row" data-kind={record.kind} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap">{formatTime(record.startedAt)}</td>
                    <td className="px-4 py-2 whitespace-nowrap" data-testid="ops-record-type">
                      {TYPE_LABELS[record.taskName] || record.taskName || UNKNOWN_TEXT}
                      {record.trigger === 'SCHEDULED' && (
                        <span style={{ color: colors.textMuted, fontSize: 11 }}> · 定时</span>
                      )}
                    </td>
                    <td className="px-4 py-2" data-testid="ops-record-scope">{scopeText(record)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <StatusBadge view={RUN_STATUS_VIEW[record.status]} status={record.status} testid="ops-record-status" />
                    </td>
                    <td className="px-4 py-2 text-right" data-testid="ops-record-total">{countText(record, 'totalCount')}</td>
                    <td className="px-4 py-2 text-right" data-testid="ops-record-success">{countText(record, 'successCount')}</td>
                    <td className="px-4 py-2 text-right" data-testid="ops-record-failure">{countText(record, 'failureCount')}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDuration(record.durationMs)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {record.runId ? (
                        <button
                          type="button"
                          data-testid="ops-record-detail-toggle"
                          onClick={() => setOpenRunId(open ? null : record.runId)}
                          style={{ color: colors.brand }}
                          className="hover:underline"
                        >
                          {open ? '收起' : '查看'}
                        </button>
                      ) : UNKNOWN_TEXT}
                    </td>
                  </tr>,
                  open && (
                    <tr key={`${key}-detail`}>
                      <td colSpan={9} className="px-4 py-2" style={{ backgroundColor: '#FBFBFD' }}>
                        <RecordDetail runId={record.runId} />
                      </td>
                    </tr>
                  )
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm" style={{ color: colors.textSecondary }}>
        <span data-testid="ops-records-total">共 {total} 条记录{isFetching && !isLoading ? ' · 更新中…' : ''}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="ops-records-prev"
            disabled={page <= 1}
            onClick={() => { setPage((value) => Math.max(1, value - 1)); setOpenRunId(null); }}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            上一页
          </button>
          <span data-testid="ops-records-page">第 {page} / {totalPages} 页</span>
          <button
            type="button"
            data-testid="ops-records-next"
            disabled={page >= totalPages}
            onClick={() => { setPage((value) => Math.min(totalPages, value + 1)); setOpenRunId(null); }}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
