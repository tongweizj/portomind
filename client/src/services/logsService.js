import axios from 'axios';


const API_BASE = import.meta.env.VITE_API_URL + `/logs` || 'http://localhost:8080/api/logs';
/**
 * 获取日志列表
 * @param {number} page 当前页码
 * @param {number} pageSize 每页条数
 * @param {string} level 日志级别过滤 ('all'|'info'|'warn'|'error')
 * @returns {Promise<{entries: Array, total: number}>}
 */
export async function getLogs(page, pageSize, level) {
  const params = { page, pageSize };
  if (level && level !== 'all') {
    params.level = level;
  }
  const response = await axios.get(API_BASE, { params });
  return {
    entries: response.data.entries,
    total: response.data.total,
  };
}

export async function getTaskLogs(page, pageSize, level) {
    const params = { page, pageSize };
    if (level && level !== 'all') {
      params.level = level;
    }
    const response = await axios.get(API_BASE+"/tasks", { params });
    return {
      entries: response.data.entries,
      total: response.data.total,
    };
  }