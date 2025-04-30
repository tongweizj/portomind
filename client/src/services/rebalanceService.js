// client/src/services/rebalanceService.js

import axios from 'axios';

// API base URLs
const PORTFOLIO_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/portfolios`
  : 'http://localhost:8080/api/portfolios';
const REBALANCE_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/rebalance`
  : 'http://localhost:8080/api/rebalance';

/**
 * 手动或定时检查是否需要再平衡
 * POST /api/portfolios/:portfolioId/rebalance/check
 * @param {string} portfolioId
 * @returns {Promise<{ needsRebalance: boolean, triggeredThresholds: string[] }>}
 */
export async function checkRebalance(portfolioId) {
  const url = `${PORTFOLIO_BASE}/${portfolioId}/rebalance/check`;
  const response = await axios.post(url);
  return response.data;
}

/**
 * 生成再平衡交易建议
 * POST /api/portfolios/:portfolioId/rebalance/suggestions
 * @param {string} portfolioId
 * @returns {Promise<Array<Object>>} 建议列表
 */
export async function getSuggestions(portfolioId) {
  console.log("portfolioId: ",portfolioId)
  const url = `${PORTFOLIO_BASE}/${portfolioId}/rebalance/suggestions`;
  const response = await axios.post(url);
  return response.data;
}

/**
 * 执行再平衡建议
 * POST /api/portfolios/:portfolioId/rebalance/execute
 * @param {string} portfolioId
 * @param {Array<Object>} suggestions 建议列表
 * @returns {Promise<{ recordId: string, status: string }>}
 */
export async function executeSuggestions(portfolioId, suggestions) {
  const url = `${PORTFOLIO_BASE}/${portfolioId}/rebalance/execute`;
  const response = await axios.post(url, suggestions);
  return response.data;
}

/**
 * 获取再平衡历史记录
 * GET /api/portfolios/:portfolioId/rebalance/history?page=&pageSize=
 * @param {string} portfolioId
 * @param {object} options
 * @param {number} options.page 当前页，默认 1
 * @param {number} options.pageSize 每页条数，默认 20
 * @returns {Promise<{ total: number, data: Array<Object> }>}
 */
export async function getHistory(portfolioId, { page = 1, pageSize = 20 } = {}) {
  const url = `${PORTFOLIO_BASE}/${portfolioId}/rebalance/history`;
  const params = { page, pageSize };
  const response = await axios.get(url, { params });
  return response.data;
}

/**
 * 撤销指定再平衡操作记录
 * POST /api/rebalance/:recordId/revoke
 * @param {string} recordId
 * @returns {Promise<{ recordId: string, status: string }>}
 */
export async function revoke(recordId) {
  const url = `${REBALANCE_BASE}/${recordId}/revoke`;
  const response = await axios.post(url);
  return response.data;
}

/**
 * 重做指定再平衡操作记录
 * POST /api/rebalance/:recordId/reexecute
 * @param {string} recordId
 * @returns {Promise<{ recordId: string, status: string }>}
 */
export async function reexecute(recordId) {
  const url = `${REBALANCE_BASE}/${recordId}/reexecute`;
  const response = await axios.post(url);
  return response.data;
}
