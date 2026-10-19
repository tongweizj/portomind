// 标的列表（原「资产管理」，FS-asset-price-consolidation R2）
// 从「今日行情」屏底「查看所有标的 →」进入，不占顶层导航。
// 变更：新增全选/多选（为 P2 批量分类预留）、单一「状态」列、移除原「价格」动作。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { deleteAsset, getAssets } from '../../services/asset.service';
import { getApiErrorMessage } from '../../services/api';
import { ASSET_TYPES, ASSET_CLASSES } from '../../constants/enums';
import { colors } from '../../constants/design-tokens';

const typeLabels = Object.fromEntries(ASSET_TYPES.map(option => [option.value, option.label]));
const assetClassLabels = Object.fromEntries(ASSET_CLASSES.map(option => [option.value, option.label]));

function StatusBadge({ asset }) {
  const status = !asset.active
    ? { label: '已停用', color: '#C9CDDA' }
    : asset.watchlist
      ? { label: '关注', color: '#F0A500' }
      : { label: '启用', color: colors.down };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: colors.textSecondary }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: status.color }} />
      {status.label}
    </span>
  );
}

function AssetClassChip({ value }) {
  if (!value) return <span className="text-gray-400">未分类</span>;
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 9px',
        borderRadius: 20,
        background: colors.bgPage,
        color: colors.textSecondary,
        border: `1px solid ${colors.border}`,
      }}
    >
      {assetClassLabels[value] || value}
    </span>
  );
}

export default function AssetList() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('symbol');
  const [sortOrder, setSortOrder] = useState('asc');
  const [assetClassFilter, setAssetClassFilter] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [total, pageSize]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAssets({
        page, pageSize, search, sortBy, sortOrder,
        assetClass: assetClassFilter || undefined
      });
      setAssets(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(getApiErrorMessage(err, '获取标的列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortOrder, assetClassFilter]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const allSelected = assets.length > 0 && assets.every(asset => selected.has(asset._id));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) assets.forEach(asset => next.delete(asset._id));
      else assets.forEach(asset => next.add(asset._id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (asset) => {
    if (!window.confirm(`确定要删除标的 ${asset.symbol} 吗？`)) return;
    try {
      await deleteAsset(asset._id);
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(asset._id);
        return next;
      });
      if (assets.length === 1 && page > 1) setPage(value => value - 1);
      else await loadAssets();
    } catch (err) {
      setError(getApiErrorMessage(err, '删除标的失败'));
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>标的列表</h1>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            全部投资标的的主数据，共 {total} 个标的。支持增删改与多选（为批量分类预留）。
          </p>
        </div>
        <button
          onClick={() => navigate('/instruments/new')}
          className="flex items-center gap-2 px-4 py-2 rounded text-white shadow"
          style={{ backgroundColor: colors.brand }}
        >
          <Plus className="w-4 h-4" /> 添加标的
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded bg-white p-4 shadow-sm">
        <form onSubmit={submitSearch} className="flex items-end gap-2">
          <label className="text-sm">
            <span className="block mb-1" style={{ color: colors.textSecondary }}>搜索代码、名称或标签</span>
            <input
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              className="border rounded px-3 py-2"
              placeholder="例如 VTI 或 基金"
              maxLength={100}
            />
          </label>
          <button className="px-3 py-2 rounded text-white" style={{ backgroundColor: colors.brand }} type="submit">搜索</button>
          {search && <button className="px-3 py-2 bg-gray-200 rounded" type="button" onClick={clearSearch}>清除</button>}
        </form>

        <label className="text-sm">
          <span className="block mb-1" style={{ color: colors.textSecondary }}>大类</span>
          <select
            value={assetClassFilter}
            onChange={event => { setAssetClassFilter(event.target.value); setPage(1); }}
            className="border rounded px-3 py-2"
          >
            <option value="">全部</option>
            {ASSET_CLASSES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
            <option value="unclassified">未分类</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1" style={{ color: colors.textSecondary }}>排序字段</span>
          <select
            value={sortBy}
            onChange={event => { setSortBy(event.target.value); setPage(1); }}
            className="border rounded px-3 py-2"
          >
            <option value="symbol">代码</option>
            <option value="name">名称</option>
            <option value="market">市场</option>
            <option value="type">类型</option>
            <option value="assetClass">大类</option>
            <option value="active">启用状态</option>
            <option value="watchlist">关注状态</option>
            <option value="createdAt">创建时间</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1" style={{ color: colors.textSecondary }}>顺序</span>
          <select
            value={sortOrder}
            onChange={event => { setSortOrder(event.target.value); setPage(1); }}
            className="border rounded px-3 py-2"
          >
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
        </label>
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
      {selected.size > 0 && (
        <div className="text-sm" style={{ color: colors.textSecondary }}>
          已选择 {selected.size} 个标的 · 批量分类将于 P2 提供
        </div>
      )}
      {loading ? (
        <p style={{ color: colors.textSecondary }}>加载中…</p>
      ) : assets.length === 0 ? (
        <p style={{ color: colors.textSecondary }}>没有匹配的标的记录。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border bg-white shadow-sm rounded">
            <thead className="text-sm" style={{ backgroundColor: '#FBFBFD', color: colors.textMuted }}>
              <tr>
                <th className="px-4 py-2" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    title="全选本页"
                    style={{ accentColor: colors.brand }}
                  />
                </th>
                <th className="px-4 py-2 text-left">代码</th>
                <th className="px-4 py-2 text-left">名称</th>
                <th className="px-4 py-2 text-left">市场</th>
                <th className="px-4 py-2 text-left">币种</th>
                <th className="px-4 py-2 text-left">类型</th>
                <th className="px-4 py-2 text-left">大类</th>
                <th className="px-4 py-2 text-left">标签</th>
                <th className="px-4 py-2 text-left">状态</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y" style={{ color: colors.textPrimary }}>
              {assets.map(asset => (
                <tr key={asset._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(asset._id)}
                      onChange={() => toggleOne(asset._id)}
                      style={{ accentColor: colors.brand }}
                    />
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-semibold">
                    <Link to={`/instruments/${asset._id}`} style={{ color: colors.brand }} className="hover:underline">
                      {asset.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{asset.name}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{asset.market}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{asset.currency}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{typeLabels[asset.type] || asset.type}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <AssetClassChip value={asset.assetClass} />
                  </td>
                  <td className="px-4 py-2">{asset.tags?.join('、') || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><StatusBadge asset={asset} /></td>
                  <td className="px-4 py-2 whitespace-nowrap space-x-3">
                    <Link to={`/instruments/edit/${asset._id}`} style={{ color: colors.brand }} className="hover:underline">编辑</Link>
                    <button onClick={() => handleDelete(asset)} className="inline-flex items-center gap-1 text-red-600 hover:underline">
                      <Trash2 className="w-4 h-4" /> 删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm" style={{ color: colors.textSecondary }}>
          每页
          <select
            value={pageSize}
            onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}
            className="mx-2 border rounded px-2 py-1"
          >
            {[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          条
        </label>
        <div className="flex items-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">下一页</button>
        </div>
      </div>
    </div>
  );
}
