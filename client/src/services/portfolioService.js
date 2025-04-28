// src/services/portfolioService.js
import axios from 'axios';
// API 实例，基于环境变量或本地地址
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + `/portfolios` || `http://localhost:8080/api/portfolios`
});

/** 创建新的组合 */
export const createPortfolio = async (data) => {
  return await api.post('/', data);
};

/** 获取所有组合 */
export const getAllPortfolios = async () => {
  const res = await api.get('/');

  // console.log("📦 返回的组合数据", res.data);
  return res.data; // ✅ 确保是返回 .data，而不是整个 res
};

/** 根据 ID 获取单个组合 */
export const getPortfolioById = async (id) => {
  return await api.get(`/${id}`).then(res => res.data);
};

/** 更新组合信息 */
export const updatePortfolio = async (id, data) => {
  return await api.put(`/${id}`, data);
};

/** 删除组合 */
export const deletePortfolio = async (id) => {
  return await api.delete(`/${id}`);
};

// 获取实时持仓比例
export function getActualRatios(id) {
  return api
    .get(`/${id}/actual-ratios`)
    .then(res => res.data);
}

/** 获取再平衡阈值设置 */
export const getRebalanceSettings = async (id) => {
  const res = await api.get(`/${id}/rebalance-settings`);
  return res.data;
};

/** 更新再平衡阈值设置 */
export const updateRebalanceSettings = async (id, settings) => {
  const res = await api.put(`/${id}/rebalance-settings`, settings);
  return res.data;
};