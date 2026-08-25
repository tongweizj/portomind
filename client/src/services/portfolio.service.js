import { api } from './api';

export const createPortfolio = async (data) => (await api.post('/portfolios', data)).data;
export const getPortfolios = async ({ page = 1, pageSize = 100 } = {}) =>
  (await api.get('/portfolios', { params: { page, pageSize } })).data;
export const getPortfolio = async (id) => (await api.get(`/portfolios/${id}`)).data;
export const updatePortfolio = async (id, data) => (await api.put(`/portfolios/${id}`, data)).data;
export const deletePortfolio = async (id) => (await api.delete(`/portfolios/${id}`)).data;
export const getActualRatios = async (id) =>
  (await api.get(`/portfolios/${id}/stats/actual-ratios`)).data;
export const getRebalanceSettings = async (id) =>
  (await api.get(`/portfolios/${id}/rebalance-settings`)).data;
export const updateRebalanceSettings = async (id, settings) =>
  (await api.put(`/portfolios/${id}/rebalance-settings`, settings)).data;
