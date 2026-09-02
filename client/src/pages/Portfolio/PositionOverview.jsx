// src/pages/Portfolio/PositionOverview.jsx
// 对齐 Ardot 设计稿 TableCard + Toolbar + Pagination：
//   9 列：资产 / 代码 / 类型 / 数量 / 平均成本 / 现价 / 市值 / 日收益 / 持有收益
//   Toolbar：搜索 + 排序下拉 + 刷新按钮
//   分页：「显示 X-Y / 共 N 项」+ 页码按钮
import { useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { Search, ChevronDown, RefreshCw } from 'lucide-react';
import { getPositions } from '../../services/position.service';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';
import { colors, radii, fontStack } from '../../constants/design-tokens';
import KpiCards from './KpiCards';

const TYPE_COLORS = {
  ETF: colors.brand,
  etf: colors.brand,
  股票: colors.stock,
  stock: colors.stock,
  'ETF-场内': colors.etfOnshore,
  etf_onshore: colors.etfOnshore,
};

function typeColor(assetType) {
  return TYPE_COLORS[assetType] || colors.textSecondary;
}

function formatNum(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(digits);
}

function signedPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const n = Number(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function PositionOverview() {
  const { id: portfolioId } = useParams();
  const [positions, setPositions] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { pagination, data } = await getPositions(portfolioId, {
        page,
        pageSize,
        symbol: symbolFilter || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortBy ? sortOrder : undefined,
      });
      setPositions(data);
      setTotal(pagination.total);
    } catch (e) {
      console.error(e);
      setError('获取持仓数据失败');
    } finally {
      setLoading(false);
    }
  }, [portfolioId, page, pageSize, symbolFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div style={{ fontFamily: fontStack.sans, color: colors.textPrimary }}>
      {/* KPI 卡 */}
      <KpiCards />

      {/* 工具栏：搜索 + 排序 + 刷新 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }}
          />
          <input
            type="text"
            value={symbolFilter}
            onChange={(e) => { setSymbolFilter(e.target.value); setPage(1); }}
            placeholder="搜索资产代码或名称…"
            style={{
              width: '100%',
              padding: '9px 14px 9px 40px',
              fontSize: 13,
              color: colors.textPrimary,
              backgroundColor: colors.bgPage,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ position: 'relative' }}>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            style={{
              appearance: 'none',
              padding: '9px 36px 9px 12px',
              fontSize: 13,
              fontWeight: 500,
              color: colors.textPrimary,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">按市值排序</option>
            <option value="marketValue">按市值排序</option>
            <option value="pnlPct">按持有收益排序</option>
            <option value="symbol">按代码排序</option>
            <option value="avgCost">按平均成本排序</option>
          </select>
          <ChevronDown
            size={14}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted, pointerEvents: 'none' }}
          />
        </div>

        <button
          type="button"
          onClick={fetchData}
          title="刷新"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: radii.md,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} color={colors.textSecondary} />
        </button>
      </div>

      {/* 表格卡片 */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.lg,
          overflow: 'hidden',
        }}
      >
        {error ? <ErrorState /> : loading ? <LoadingState /> : positions.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: colors.bgPage }}>
                  {['资产', '代码', '类型', '数量', '平均成本', '现价', '市值', '日收益', '持有收益'].map((h, i) => (
                    <th
                      key={h}
                      onClick={
                        ['marketValue', 'pnlPct'].includes(h)
                          ? undefined
                          : (i === 6 ? () => handleSort('marketValue') : i === 8 ? () => handleSort('pnlPct') : undefined)
                      }
                      style={{
                        padding: '14px 16px',
                        fontSize: 12,
                        fontWeight: 500,
                        color: colors.textSecondary,
                        textAlign: i === 0 || i === 1 || i === 2 ? 'left' : 'right',
                        whiteSpace: 'nowrap',
                        cursor: i === 6 || i === 8 ? 'pointer' : 'default',
                      }}
                    >
                      {h}
                      {i === 6 && sortBy === 'marketValue' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                      {i === 8 && sortBy === 'pnlPct' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, idx) => (
                  <tr
                    key={`${pos.symbol}-${idx}`}
                    style={{ borderTop: `1px solid ${colors.border}` }}
                  >
                    {/* 资产 */}
                    <td style={{ padding: '14px 16px', textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: colors.textPrimary }}>{pos.symbol}</div>
                      <div style={{ fontSize: 11, color: colors.textMuted }}>
                        {pos.market ? `${pos.market} · ` : ''}{pos.assetType || ''}
                      </div>
                    </td>
                    {/* 代码 */}
                    <td style={{ padding: '14px 16px', textAlign: 'left', color: colors.brand, fontWeight: 600 }}>
                      {pos.symbol}
                    </td>
                    {/* 类型 */}
                    <td style={{ padding: '14px 16px', textAlign: 'left', color: typeColor(pos.assetType), fontWeight: 600 }}>
                      {pos.assetType || '-'}
                    </td>
                    {/* 数量 */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: colors.textPrimary }}>
                      {formatNum(pos.quantity, 0)}
                    </td>
                    {/* 平均成本 */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: colors.textPrimary }}>
                      {pos.avgCost != null ? pos.avgCost.toFixed(2) : '-'}
                    </td>
                    {/* 现价 */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: colors.textPrimary }}>
                      {formatNum(pos.latestPrice, 2)}
                    </td>
                    {/* 市值 */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: colors.textPrimary }}>
                      {formatNum(pos.marketValue, 2)}
                    </td>
                    {/* 日收益 */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: colors.textMuted }}>
                      -
                    </td>
                    {/* 持有收益 */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: pos.pnlPct >= 0 ? colors.up : colors.down }}>
                      {signedPct(pos.pnlPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      {!loading && !error && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <span style={{ fontSize: 13, color: colors.textSecondary }}>
            显示 {startItem}-{endItem} / 共 {total} 项
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              style={{
                width: 36, height: 36,
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.md,
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.4 : 1,
                color: colors.textSecondary,
              }}
            >
              ‹
            </button>
            <button
              style={{
                width: 36, height: 36,
                backgroundColor: colors.brand,
                border: 'none',
                borderRadius: radii.md,
                color: colors.textInverse,
                cursor: 'default',
                fontWeight: 600,
              }}
            >
              {page}
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{
                width: 36, height: 36,
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.md,
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.4 : 1,
                color: colors.textSecondary,
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
