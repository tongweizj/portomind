import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLogs, getTaskLogs } from '../services/logsService';

const LogsPage = () => {
  const [logType, setLogType] = useState('server'); // 'server' or 'task'
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [page, levelFilter, logType]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const service = logType === 'server' ? getLogs : getTaskLogs;
      const data = await service(page, pageSize, levelFilter);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">日志查看</h1>

      {/* 切换日志类型 */}
      <div className="flex items-center mb-4 space-x-2">
        <button
          onClick={() => { setLogType('server'); setPage(1); }}
          className={`px-3 py-1 rounded ${logType === 'server' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Server Log
        </button>
        <button
          onClick={() => { setLogType('task'); setPage(1); }}
          className={`px-3 py-1 rounded ${logType === 'task' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Task Log
        </button>
      </div>

      {/* 级别筛选 */}
      <div className="flex items-center mb-4 space-x-4">
        <select
          value={levelFilter}
          onChange={(e) => { setPage(1); setLevelFilter(e.target.value); }}
          className="border rounded px-2 py-1"
        >
          <option value="all">全部</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>

      {/* 日志表格 */}
      {loading ? (
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
          第 {page} / {totalPages} 页
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
};

export default LogsPage;
