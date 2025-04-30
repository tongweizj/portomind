// src/services/transaction.js
import axios from 'axios';
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * 获取指定组合的所有交易流水
 * @param {string} portfolioId
 * @returns {Promise<Transaction[]>}
 */
export function fetchTransactions(portfolioId) {
  return axios
    .get(`${API_BASE}/portfolios/${portfolioId}/transactions`)
    .then(res => res.data);
}

/**
 * 为指定组合创建一笔交易
 * @param {string} portfolioId
 * @param {Object} payload
 * @returns {Promise<Transaction>}
 */
export function createTransaction(portfolioId, payload) {
  return axios
    .post(`${API_BASE}/portfolios/${portfolioId}/transactions`, payload)
    .then(res => res.data);
}

/**
 * 更新指定组合下的某笔交易
 * @param {string} portfolioId
 * @param {string} txId
 * @param {Object} payload
 * @returns {Promise<Transaction>}
 */
export function updateTransaction(portfolioId, txId, payload) {
  return axios
    .put(`${API_BASE}/portfolios/${portfolioId}/transactions/${txId}`, payload)
    .then(res => res.data);
}

/**
 * 删除指定组合下的某笔交易
 * @param {string} portfolioId
 * @param {string} txId
 * @returns {Promise<void>}
 */
export function deleteTransaction(portfolioId, txId) {
  return axios
    .delete(`${API_BASE}/portfolios/${portfolioId}/transactions/${txId}`)
    .then(res => res.data);
}
