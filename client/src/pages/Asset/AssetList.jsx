import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { deleteAsset, getAssets } from '../../services/asset.service';
import { getApiErrorMessage } from '../../services/api';
import { ASSET_TYPES } from '../../constants/enums';

const typeLabels = Object.fromEntries(ASSET_TYPES.map(option => [option.value, option.label]));

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

  const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [total, pageSize]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAssets({ page, pageSize, search, sortBy, sortOrder });
      setAssets(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(getApiErrorMessage(err, '获取资产列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortOrder]);

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

  const handleDelete = async (asset) => {
    if (!window.confirm(`确定要删除资产 ${asset.symbol} 吗？`)) return;
    try {
      await deleteAsset(asset._id);
      if (assets.length === 1 && page > 1) setPage(value => value - 1);
      else await loadAssets();
    } catch (err) {
      setError(getApiErrorMessage(err, '删除资产失败'));
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">资产列表</h1>
          <p className="text-sm text-gray-500">共 {total} 个资产</p>
        </div>
        <button
          onClick={() => navigate('/assets/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> 添加资产
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded bg-white p-4 shadow-sm">
        <form onSubmit={submitSearch} className="flex items-end gap-2">
          <label className="text-sm">
            <span className="block mb-1 text-gray-600">搜索代码、名称或标签</span>
            <input
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              className="border rounded px-3 py-2"
              placeholder="例如 VTI 或 基金"
              maxLength={100}
            />
          </label>
          <button className="px-3 py-2 bg-blue-600 text-white rounded" type="submit">搜索</button>
          {search && <button className="px-3 py-2 bg-gray-200 rounded" type="button" onClick={clearSearch}>清除</button>}
        </form>

        <label className="text-sm">
          <span className="block mb-1 text-gray-600">排序字段</span>
          <select
            value={sortBy}
            onChange={event => { setSortBy(event.target.value); setPage(1); }}
            className="border rounded px-3 py-2"
          >
            <option value="symbol">代码</option>
            <option value="name">名称</option>
            <option value="market">市场</option>
            <option value="type">类型</option>
            <option value="active">启用状态</option>
            <option value="watchlist">关注状态</option>
            <option value="createdAt">创建时间</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-gray-600">顺序</span>
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
      {loading ? (
        <p className="text-gray-500">加载中…</p>
      ) : assets.length === 0 ? (
        <p className="text-gray-500">没有匹配的资产记录。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border bg-white shadow-sm rounded">
            <thead className="bg-gray-100 text-sm text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">代码</th>
                <th className="px-4 py-2 text-left">名称</th>
                <th className="px-4 py-2 text-left">市场</th>
                <th className="px-4 py-2 text-left">币种</th>
                <th className="px-4 py-2 text-left">类型</th>
                <th className="px-4 py-2 text-left">标签</th>
                <th className="px-4 py-2 text-center">启用</th>
                <th className="px-4 py-2 text-center">关注</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700 divide-y">
              {assets.map(asset => (
                <tr key={asset._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Link to={`/prices/${asset.symbol}/history`} className="text-blue-600 hover:underline">
                      {asset.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{asset.name}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{asset.market}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{asset.currency}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{typeLabels[asset.type] || asset.type}</td>
                  <td className="px-4 py-2">{asset.tags?.join(', ') || '—'}</td>
                  <td className="px-4 py-2 text-center">{asset.active ? '是' : '否'}</td>
                  <td className="px-4 py-2 text-center">{asset.watchlist ? '是' : '否'}</td>
                  <td className="px-4 py-2 whitespace-nowrap space-x-3">
                    <Link to={`/assets/edit/${asset._id}`} className="text-blue-600 hover:underline">编辑</Link>
                    <Link to={`/prices/${asset.symbol}/history`} className="text-blue-600 hover:underline">价格</Link>
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
        <label className="text-sm text-gray-600">
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
