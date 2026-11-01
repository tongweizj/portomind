// client/src/components/RawLog/RawLogView.jsx
//
// TASK-053（C-01）AC5 / AC7：把原 `LogViewer` 的原始日志视图**原样抽出**。
//
// 抽出原则（AC5「原始视图零回归」）：
//   - 分页、级别筛选、日期筛选的逻辑与抽离前**逐行等价**，不顺手优化、不改默认值、
//     不改请求参数顺序、不改「切换视图时页码重置到 1」的行为；
//   - 只由所在 tab 激活时才挂载（父级按 tab 条件渲染），因此不在看板 tab 上白发请求。
//
// ⚠️ 筛选状态为什么由父级持有（F-02 修复，2026-10-31）：
//   改造前 server / task 是同一个组件的两种 `logType`，`levelFilter` / `dateFilter`
//   是组件 state，切换视图时**不会重置**（只有 `page` 被显式 `setPage(1)`）。
//   若把筛选 state 留在本组件内、再由父级用 `key={activeTab}` 强制重挂，
//   切视图就会把用户的筛选条件悄悄清掉（实测：error + 2026-10-29 → all + 今天）。
//   因此 `levelFilter` / `dateFilter` 提升到父级（跨视图保持），
//   本组件只持有「每次视图切换都应重置」的 `page`。
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLogs, getTaskLogs } from '../../services/log.service';

/**
 * @param {{
 *   logType: 'server' | 'task',
 *   levelFilter: string,          // 父级持有：切视图时保持（与改造前一致）
 *   dateFilter: string,           // 父级持有：切视图时保持（与改造前一致）
 *   onLevelFilterChange: (v: string) => void,
 *   onDateFilterChange: (v: string) => void,
 * }} props
 *   `page` 仍在本组件内，且父级用 `key={logType}` 挂载 →
 *   切视图时本组件重挂、页码回到 1，等价于改造前的 `setPage(1)`。
 */
export default function RawLogView({
  logType,
  levelFilter,
  dateFilter,
  onLevelFilterChange,
  onDateFilterChange,
}) {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const service = logType === 'server' ? getLogs : getTaskLogs;
      const data = await service(page, pageSize, levelFilter, dateFilter);
      setEntries(data.data);
      setTotal(data.pagination.total);
    } catch (error) {
      setError(error.message || '日志加载失败');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, levelFilter, logType, page, pageSize]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      {/* 级别筛选 */}
      <div className="flex items-center mb-4 space-x-4">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => { setPage(1); onDateFilterChange(e.target.value); }}
          className="border rounded px-2 py-1"
          aria-label="日志日期"
        />
        <select
          value={levelFilter}
          onChange={(e) => { setPage(1); onLevelFilterChange(e.target.value); }}
          className="border rounded px-2 py-1"
        >
          <option value="all">全部</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>

      {/* 日志表格 */}
      {error ? (
        <div className="text-red-600">{error}</div>
      ) : loading ? (
        <div>加载中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">时间戳</th>
                <th className="px-4 py-2 text-left">级别</th>
                <th className="px-4 py-2 text-left">Trace ID</th>
                <th className="px-4 py-2 text-left">消息</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">{entry.timestamp}</td>
                  <td className="px-4 py-2 whitespace-nowrap capitalize">{entry.level}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{entry.traceId || '-'}</td>
                  <td className="px-4 py-2">{entry.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页控制 */}
      <div className="flex justify-center items-center mt-4 space-x-2">
        <button
          onClick={() => setPage((p) => p - 1)}
          disabled={page <= 1}
          className="flex items-center bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded disabled:opacity-50"
        >
          <ChevronLeft size={16} className="mr-1" />
          上一页
        </button>
        <span>
          第 {page} / {Math.max(totalPages, 1)} 页
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= totalPages}
          className="flex items-center bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded disabled:opacity-50"
        >
          下一页
          <ChevronRight size={16} className="ml-1" />
        </button>
      </div>
    </div>
  );
}
