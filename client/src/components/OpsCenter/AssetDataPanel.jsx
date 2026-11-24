// client/src/components/OpsCenter/AssetDataPanel.jsx
//
// TASK-068：运维中心「资产数据」tab 的第一版总表。
// TASK-069：服务端筛选、搜索、问题优先排序与分页；客户端只发送 query params，
// 不在浏览器里拉全量或自行排序/切片。
// TASK-071：admin 可触发今日价格同步；member 只读。
// - admin 可见资产编辑链接，member 只读；服务端仍只要求登录（UI 约定，不是安全边界）。
// - 缺失/未知值显示「—」或「无法判断」，绝不补 0、不伪造完整数据。

import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/authContext';
import { EmptyState, ErrorState, LoadingState } from '../DataState';
import { ASSET_MARKETS } from '../../constants/enums';
import { OPS_CENTER_DEFAULT_FILTERS, OPS_CENTER_DEFAULT_PAGE_SIZE } from '../../constants/opsCenter';
import { colors } from '../../constants/design-tokens';
import { useOpsCenterAssets } from '../../hooks/useOpsCenterAssets';
import { useIntegrityRefresh } from '../../hooks/useIntegrityRefresh';
import { usePriceSync } from '../../hooks/usePriceSync';
import { getAllFilteredAssetIds } from '../../services/ops-center.service';
import AssetBackfillControl from './AssetBackfillControl';
import BatchBackfillControl from './BatchBackfillControl';
import { getApiErrorMessage } from '../../services/api.client';

const TODAY_PRICE_VIEW = Object.freeze({
  priced: { label: '有价', color: colors.statusOk },
  missing: { label: '缺价', color: colors.statusBad },
  market_closed: { label: '休市', color: colors.statusIdle },
  not_due: { label: '未到点', color: colors.statusIdle },
  not_listed: { label: '未上市', color: colors.statusIdle },
  unknown: { label: '无法判断', color: colors.statusIdle }
});

const VALIDITY_VIEW = Object.freeze({
  normal: { label: '正常', color: colors.statusOk },
  needs_review: { label: '待核查', color: colors.statusWarn },
  unknown: { label: '无法判断', color: colors.statusIdle }
});

const FIELD_LABELS = Object.freeze({
  symbol: '代码',
  name: '名称',
  market: '市场',
  currency: '币种',
  launchDate: '上市/成立日期'
});

const ACTIVE_OPTIONS = Object.freeze([
  { value: 'true', label: '启用' },
  { value: 'all', label: '全部' },
  { value: 'false', label: '停用' }
]);

const MISSING_TYPE_OPTIONS = Object.freeze([
  { value: '', label: '全部缺失类型' },
  { value: 'validity', label: '有效性待核查/无法判断' },
  { value: 'today_price', label: '今日价缺失' },
  { value: 'basic_info', label: '基础信息缺失' },
  { value: 'history_gap', label: '历史缺口' }
]);

const SORT_OPTIONS = Object.freeze([
  { value: 'priority', label: '问题优先' },
  { value: 'symbol', label: '代码' },
  { value: 'name', label: '名称' },
  { value: 'market', label: '市场' },
  { value: 'currency', label: '币种' }
]);

const UNKNOWN_TEXT = '—';

const PRICE_SYNC_GROUP_OPTIONS = Object.freeze([
  { value: '', label: '全部 active' },
  { value: 'CN', label: 'CN-HK' },
  { value: 'US_CA', label: 'US-CA' }
]);

const PRICE_SYNC_RESULT_VIEW = Object.freeze({
  SUCCEEDED: { label: '同步完成', color: colors.statusOk },
  PARTIAL: { label: '同步完成（部分资产失败）', color: colors.statusWarn },
  FAILED: { label: '同步失败', color: colors.statusBad }
});

const REFRESH_RESULT_VIEW = Object.freeze({
  SUCCEEDED: { label: '检查完成', color: colors.statusOk },
  PARTIAL: { label: '检查完成（存在缺口或异常）', color: colors.statusWarn },
  FAILED: { label: '检查失败', color: colors.statusBad }
});

function todayPriceCell(todayPrice) {
  const status = todayPrice?.status;
  const marketDay = todayPrice?.marketDay;
  const priceDate = todayPrice?.priceDate;
  const view = TODAY_PRICE_VIEW[status] || TODAY_PRICE_VIEW.unknown;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span data-testid="ops-today-market-day">{marketDay || UNKNOWN_TEXT}</span>
      <span
        data-testid="ops-today-status"
        data-status={status || 'unknown'}
        style={{ color: view.color, fontSize: 12 }}
      >
        {view.label}
      </span>
      {priceDate && (
        <span data-testid="ops-today-price-date" style={{ color: colors.textMuted, fontSize: 11 }}>
          价格日 {priceDate}
        </span>
      )}
    </div>
  );
}

function basicInfoCell(basicInfo) {
  if (!basicInfo) return UNKNOWN_TEXT;
  if (basicInfo.complete) {
    return <span style={{ color: colors.statusOk }}>完整</span>;
  }
  const labels = (basicInfo.missingFields || []).map((field) => FIELD_LABELS[field] || field);
  return (
    <span data-testid="ops-basic-info-missing" style={{ color: colors.statusWarn }}>
      {labels.length > 0 ? `缺失/无效：${labels.join('、')}` : '缺失/无效'}
    </span>
  );
}

function validityCell(validity) {
  const status = validity?.status;
  const view = VALIDITY_VIEW[status] || VALIDITY_VIEW.unknown;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span data-testid="ops-validity" data-status={status || 'unknown'} style={{ color: view.color }}>
        {view.label}
      </span>
      {status === 'needs_review' && (
        <span style={{ color: colors.textMuted, fontSize: 11 }}>资料可能有问题</span>
      )}
    </div>
  );
}

function taskErrorText(error, conflictText, fallback) {
  if (!error) return '';
  return error.code === 'TASK_ALREADY_RUNNING' ? conflictText : getApiErrorMessage(error, fallback);
}

function formatCheckedAt(value) {
  if (!value) return UNKNOWN_TEXT;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return UNKNOWN_TEXT;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function historyCell(history) {
  if (!history || history.status === 'unavailable') {
    return <span data-testid="ops-history" data-status="unavailable" style={{ color: colors.textMuted }}>尚未检查</span>;
  }
  if (history.status === 'unknown') {
    return (
      <div data-testid="ops-history" data-status="unknown" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: colors.statusIdle }}>无法判断</span>
        {history.checkedAt && (
          <span data-testid="ops-history-checked-at" style={{ color: colors.textMuted, fontSize: 11 }}>
            上次检查 {formatCheckedAt(history.checkedAt)}
          </span>
        )}
      </div>
    );
  }
  const ratioText = typeof history.ratio === 'number' && Number.isFinite(history.ratio)
    ? `${(history.ratio * 100).toFixed(1)}%`
    : UNKNOWN_TEXT;
  return (
    <div data-testid="ops-history" data-status="checked" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span>
        已采 <span data-testid="ops-history-actual">{history.actual ?? UNKNOWN_TEXT}</span>
        {' / '}应有 <span data-testid="ops-history-expected">{history.expected ?? UNKNOWN_TEXT}</span>
      </span>
      <span style={{ color: history.missing > 0 ? colors.statusWarn : colors.statusOk }}>
        缺失 <span data-testid="ops-history-missing">{history.missing ?? UNKNOWN_TEXT}</span>
        {' · '}完整率 <span data-testid="ops-history-ratio">{ratioText}</span>
      </span>
      <span data-testid="ops-history-checked-at" style={{ color: colors.textMuted, fontSize: 11 }}>
        上次检查 {formatCheckedAt(history.checkedAt)}
      </span>
    </div>
  );
}

export default function AssetDataPanel() {
  const { isAdmin } = useAuth();
  const refresh = useIntegrityRefresh();
  const priceSync = usePriceSync();
  const [syncGroup, setSyncGroup] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(OPS_CENTER_DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState({ ...OPS_CENTER_DEFAULT_FILTERS });
  const [searchDraft, setSearchDraft] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectionError, setSelectionError] = useState('');

  const queryFilters = {
    market: filters.market || undefined,
    active: filters.active,
    missingType: filters.missingType || undefined,
    search: filters.search || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder
  };
  const { assets, pagination, isLoading, isFetching, isError, error, refetch } = useOpsCenterAssets({
    page,
    pageSize,
    ...queryFilters
  });

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
    setSelectionError('');
  };

  const updateFilter = (patch) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    clearSelection();
  };

  const toggleSelected = (assetId, checked) => {
    setSelectAllFiltered(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
  };

  const toggleAllFiltered = async (checked) => {
    if (!checked) {
      clearSelection();
      return;
    }
    setSelectingAll(true);
    setSelectionError('');
    try {
      const ids = await getAllFilteredAssetIds(queryFilters);
      setSelectedIds(new Set(ids));
      setSelectAllFiltered(true);
    } catch (error) {
      setSelectionError(getApiErrorMessage(error, '加载筛选资产失败'));
      setSelectedIds(new Set());
      setSelectAllFiltered(false);
    } finally {
      setSelectingAll(false);
    }
  };

  const submitSearch = (event) => {
    event.preventDefault();
    updateFilter({ search: searchDraft.trim() });
  };

  if (isLoading) {
    return (
      <div data-testid="ops-assets-loading">
        <LoadingState />
      </div>
    );
  }

  if (isError) {
    return (
      <div data-testid="ops-assets-error" role="alert">
        <ErrorState>
          资产数据加载失败：{getApiErrorMessage(error, '请稍后重试')}
        </ErrorState>
        <button type="button" className="mt-2 underline" onClick={() => refetch()}>
          重试
        </button>
      </div>
    );
  }

  const total = pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(filters.market || filters.missingType || filters.search || filters.active !== 'true');
  const refreshError = refresh.startError || refresh.runError;
  const refreshErrorText = taskErrorText(refreshError, '已有检查在运行，请稍后重试', '检查刷新失败');
  const refreshResult = REFRESH_RESULT_VIEW[refresh.run?.status] || null;
  const priceSyncError = priceSync.startError || priceSync.runError;
  const priceSyncErrorText = taskErrorText(priceSyncError, '已有价格同步在运行，请稍后重试', '价格同步失败');
  const priceSyncResult = PRICE_SYNC_RESULT_VIEW[priceSync.run?.status] || null;

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-3 rounded border bg-white p-3"
        onSubmit={submitSearch}
      >
        <label className="text-sm" style={{ color: colors.textSecondary }}>
          市场
          <select
            data-testid="ops-filter-market"
            value={filters.market}
            onChange={(event) => updateFilter({ market: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          >
            <option value="">全部市场</option>
            {ASSET_MARKETS.map((market) => (
              <option key={market.value} value={market.value}>{market.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm" style={{ color: colors.textSecondary }}>
          启用状态
          <select
            data-testid="ops-filter-active"
            value={filters.active}
            onChange={(event) => updateFilter({ active: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          >
            {ACTIVE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm" style={{ color: colors.textSecondary }}>
          缺失类型
          <select
            data-testid="ops-filter-missing-type"
            value={filters.missingType}
            onChange={(event) => updateFilter({ missingType: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          >
            {MISSING_TYPE_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm" style={{ color: colors.textSecondary }}>
          搜索
          <input
            data-testid="ops-search-input"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="代码或名称"
            maxLength={100}
            className="ml-2 border rounded px-2 py-1"
          />
        </label>
        <button type="submit" data-testid="ops-search-submit" className="px-3 py-1 bg-gray-200 rounded">
          搜索
        </button>

        <label className="text-sm" style={{ color: colors.textSecondary }}>
          排序
          <select
            data-testid="ops-sort-by"
            value={filters.sortBy}
            onChange={(event) => updateFilter({ sortBy: event.target.value })}
            className="ml-2 border rounded px-2 py-1"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <select
          data-testid="ops-sort-order"
          aria-label="排序方向"
          value={filters.sortOrder}
          onChange={(event) => updateFilter({ sortOrder: event.target.value })}
          className="border rounded px-2 py-1"
        >
          <option value="asc">升序</option>
          <option value="desc">降序</option>
        </select>
      </form>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="ops-price-sync-control">
          <label style={{ color: colors.textSecondary }}>
            今日价格同步
            <select
              data-testid="ops-price-sync-group"
              value={syncGroup}
              onChange={(event) => setSyncGroup(event.target.value)}
              className="ml-2 border rounded px-2 py-1"
            >
              {PRICE_SYNC_GROUP_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="ops-price-sync"
            onClick={() => priceSync.start({ marketGroup: syncGroup || undefined })}
            disabled={priceSync.isStarting || priceSync.isRunning || priceSync.isLoadingRun}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            {priceSync.isStarting || priceSync.isRunning ? '同步中…' : '同步今日价格'}
          </button>
          {priceSync.run?.progress && (
            <span data-testid="ops-price-sync-progress" style={{ color: colors.textSecondary }}>
              已完成 {priceSync.run.progress.completed ?? 0} / {priceSync.run.progress.total ?? UNKNOWN_TEXT}
            </span>
          )}
          {priceSyncResult && (
            <span data-testid="ops-price-sync-result" style={{ color: priceSyncResult.color }}>
              {priceSyncResult.label}
            </span>
          )}
          {priceSyncError && (
            <span data-testid="ops-price-sync-error" role="alert" style={{ color: colors.statusBad }}>
              {priceSyncErrorText}
            </span>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="ops-integrity-refresh-control">
          <button
            type="button"
            data-testid="ops-integrity-refresh"
            onClick={() => refresh.start()}
            disabled={refresh.isStarting || refresh.isRunning || refresh.isLoadingRun}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            {refresh.isStarting || refresh.isRunning ? '检查中…' : '刷新历史完整度'}
          </button>
          {refresh.run?.progress && (
            <span data-testid="ops-integrity-progress" style={{ color: colors.textSecondary }}>
              已完成 {refresh.run.progress.completed ?? 0} / {refresh.run.progress.total ?? UNKNOWN_TEXT}
            </span>
          )}
          {refreshResult && (
            <span data-testid="ops-integrity-result" style={{ color: refreshResult.color }}>
              {refreshResult.label}
            </span>
          )}
          {refreshError && (
            <span data-testid="ops-integrity-error" role="alert" style={{ color: colors.statusBad }}>
              {refreshErrorText}
            </span>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="space-y-2" data-testid="ops-batch-selection-control">
          <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: colors.textSecondary }}>
            <label>
              <input
                type="checkbox"
                data-testid="ops-batch-select-all"
                checked={selectAllFiltered}
                disabled={selectingAll}
                onChange={(event) => toggleAllFiltered(event.target.checked)}
                className="mr-1"
              />
              全选当前筛选结果
            </label>
            <span>已选 {selectedIds.size} 只</span>
            {selectingAll && <span>加载中…</span>}
            {selectionError && <span role="alert" style={{ color: colors.statusBad }}>{selectionError}</span>}
          </div>
          <BatchBackfillControl assetIds={[...selectedIds]} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm" style={{ color: colors.textSecondary }}>
        <span>
          共 {total} 只资产{isFetching ? ' · 更新中…' : ''}
        </span>
        <label>
          每页
          <select
            data-testid="ops-page-size"
            value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
            className="mx-2 border rounded px-2 py-1"
          >
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          条
        </label>
      </div>

      {assets.length === 0 ? (
        <div data-testid="ops-assets-empty">
          <EmptyState>{hasFilters ? '没有匹配的资产' : '暂无 active 资产'}</EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            data-testid="ops-asset-table"
            className="min-w-full border bg-white shadow-sm rounded text-sm"
          >
            <thead style={{ backgroundColor: '#FBFBFD', color: colors.textMuted }}>
              <tr>
                <th className="px-4 py-2 text-left">资产</th>
                <th className="px-4 py-2 text-left">今日价格</th>
                <th className="px-4 py-2 text-left">历史完整度</th>
                <th className="px-4 py-2 text-left">基础信息</th>
                <th className="px-4 py-2 text-left">有效性</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ color: colors.textPrimary }}>
              {assets.map((asset) => (
                <tr key={asset.assetId} data-testid="ops-asset-row" className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex items-start gap-2">
                      {isAdmin && (
                        <input
                          type="checkbox"
                          data-testid={`ops-select-${asset.assetId}`}
                          checked={selectAllFiltered || selectedIds.has(asset.assetId)}
                          disabled={selectAllFiltered}
                          onChange={(event) => toggleSelected(asset.assetId, event.target.checked)}
                          className="mt-1"
                        />
                      )}
                      <div>
                        <div className="font-semibold" data-testid="ops-asset-symbol">{asset.symbol || UNKNOWN_TEXT}</div>
                        <div style={{ color: colors.textSecondary }}>{asset.name || UNKNOWN_TEXT}</div>
                        <div style={{ color: colors.textMuted, fontSize: 11 }}>
                          {asset.market || UNKNOWN_TEXT} · {asset.currency || UNKNOWN_TEXT}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{todayPriceCell(asset.todayPrice)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{historyCell(asset.history)}</td>
                  <td className="px-4 py-2">{basicInfoCell(asset.basicInfo)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{validityCell(asset.validity)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {isAdmin ? (
                      <div className="flex flex-col gap-1">
                        <Link
                          data-testid="ops-asset-edit"
                          to={`/instruments/edit/${asset.assetId}`}
                          style={{ color: colors.brand }}
                          className="hover:underline"
                        >
                          编辑
                        </Link>
                        <AssetBackfillControl asset={asset} />
                      </div>
                    ) : (
                      <span style={{ color: colors.textMuted }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 text-sm" style={{ color: colors.textSecondary }}>
        <button
          type="button"
          data-testid="ops-pagination-prev"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          上一页
        </button>
        <span data-testid="ops-pagination-info">第 {page} / {totalPages} 页</span>
        <button
          type="button"
          data-testid="ops-pagination-next"
          disabled={page >= totalPages}
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
