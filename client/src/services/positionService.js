// client/src/services/positionService.js

import axios from 'axios';

// 与 portfolioService 相同，基础路径指向 /api/portfolios
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/portfolios`
    : 'http://localhost:8080/api/portfolios'
});

/**
 * 获取持仓概览
 * GET /api/portfolios/:portfolioId/positions
 * @param {string} portfolioId
 * @param {object} options
 * @param {number} options.page 当前页码，默认 1
 * @param {number} options.pageSize 每页条数，默认 20
 * @param {string} options.symbol Symbol 模糊过滤
 * @param {string} options.sortBy 排序字段，如 'marketValue' 或 'pnlPct'
 * @param {string} options.sortOrder 排序顺序，'asc' 或 'desc'
 * @returns {Promise<{ total: number, data: Array<Object> }>}
 */
export async function getPositions(
  portfolioId,
  { page = 1, pageSize = 20, symbol, sortBy, sortOrder } = {}
) {
  const params = { page, pageSize };
  if (symbol) params.symbol = symbol;
  if (sortBy) params.sortBy = sortBy;
  if (sortOrder) params.sortOrder = sortOrder;

  const response = await api.get(`/${portfolioId}/positions`, { params });
  // 后端返回 { total, data: [...] }
  return response.data;
}

/**
 * 获取持仓历史趋势
 * GET /api/portfolios/:portfolioId/positions/history
 * @param {string} portfolioId
 * @param {object} options
 * @param {string} options.symbol 单个 Symbol 或 'all'
 * @param {'day'|'week'|'month'} options.interval 时间粒度
 * @returns {Promise<{ data: Array<Object> }>}
 */
export async function getPositionHistory(
  portfolioId,
  { symbol, interval = 'day' } = {}
) {
  const params = {};
  if (symbol && symbol !== 'all') params.symbol = symbol;
  if (interval) params.interval = interval;

  const response = await api.get(`/${portfolioId}/positions/history`, { params });
  // 后端返回 { data: [...] }
  return response.data;
}
