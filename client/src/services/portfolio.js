// src/services/portfolio.js
import axios from 'axios';

// 如果你在 .env 文件里定义了 REACT_APP_API_BASE_URL，就会优先使用它；否则默认 '/api'
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * 获取所有投资组合
 * @returns {Promise<Portfolio[]>}
 */
export function fetchPortfolios() {
  return axios
    .get(`${API_BASE}/portfolios`)
    .then(res => res.data);
}

/**
 * 获取单个投资组合详情
 * @param {string} id
 * @returns {Promise<Portfolio>}
 */
export function fetchPortfolio(id) {
  return axios
    .get(`${API_BASE}/portfolios/${id}`)
    .then(res => res.data);
}

/**
 * 创建新的投资组合
 * @param {Object} payload
 * @returns {Promise<Portfolio>}
 */
export function createPortfolio(payload) {
  return axios
    .post(`${API_BASE}/portfolios`, payload)
    .then(res => res.data);
}

/**
 * 更新已有的投资组合
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Portfolio>}
 */
export function updatePortfolio(id, payload) {
  return axios
    .put(`${API_BASE}/portfolios/${id}`, payload)
    .then(res => res.data);
}

/**
 * 删除投资组合
 * @param {string} id
 * @returns {Promise<void>}
 */
export function deletePortfolio(id) {
  return axios
    .delete(`${API_BASE}/portfolios/${id}`)
    .then(res => res.data);
}
