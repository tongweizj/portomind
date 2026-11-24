// client/src/components/OpsCenter/AssetDataPanel.jsx
//
// TASK-068：运维中心「资产数据」tab 的第一版总表。
// - 数据全部来自 GET /api/ops-center/assets（服务端聚合 + 分页）；
// - 本票只渲染默认页，不提供筛选/排序/翻页控件（Ticket 03）；
// - admin 可见资产编辑链接，member 只读；服务端仍只要求登录（UI 约定，不是安全边界）；
// - 缺失/未知值显示「—」或「无法判断」，绝不补 0、不伪造完整数据。

import { Link } from 'react-router';
import { useAuth } from '../auth/authContext';
import { EmptyState, ErrorState, LoadingState } from '../DataState';
import { colors } from '../../constants/design-tokens';
import { useOpsCenterAssets } from '../../hooks/useOpsCenterAssets';
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

const UNKNOWN_TEXT = '—';

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

function historyCell(history) {
  if (!history || history.status === 'unavailable') {
    return <span data-testid="ops-history" style={{ color: colors.textMuted }}>尚未检查</span>;
  }
  return <span data-testid="ops-history">{UNKNOWN_TEXT}</span>;
}

export default function AssetDataPanel() {
  const { isAdmin } = useAuth();
  const { assets, pagination, isLoading, isError, error, refetch } = useOpsCenterAssets();

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

  if (assets.length === 0) {
    return (
      <div data-testid="ops-assets-empty">
        <EmptyState>暂无 active 资产</EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        共 {pagination?.total ?? assets.length} 只 active 资产
      </p>
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
                  <div className="font-semibold" data-testid="ops-asset-symbol">{asset.symbol || UNKNOWN_TEXT}</div>
                  <div style={{ color: colors.textSecondary }}>{asset.name || UNKNOWN_TEXT}</div>
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>
                    {asset.market || UNKNOWN_TEXT} · {asset.currency || UNKNOWN_TEXT}
                  </div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{todayPriceCell(asset.todayPrice)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{historyCell(asset.history)}</td>
                <td className="px-4 py-2">{basicInfoCell(asset.basicInfo)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{validityCell(asset.validity)}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {isAdmin ? (
                    <Link
                      data-testid="ops-asset-edit"
                      to={`/instruments/edit/${asset.assetId}`}
                      style={{ color: colors.brand }}
                      className="hover:underline"
                    >
                      编辑
                    </Link>
                  ) : (
                    <span style={{ color: colors.textMuted }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
