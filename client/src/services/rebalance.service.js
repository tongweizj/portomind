import { api } from './api';

export const checkRebalance = async (portfolioId) =>
  (await api.post(`/portfolios/${portfolioId}/rebalance/check`)).data;

export const getSuggestions = async (portfolioId, { feeModel = {}, cashBudget = 0 } = {}) =>
  (await api.post(`/portfolios/${portfolioId}/rebalance/suggestions`, { feeModel, cashBudget })).data;

export const executeSuggestions = async (portfolioId, recordId, suggestions, mode = 'MANUAL') =>
  (await api.post(`/portfolios/${portfolioId}/rebalance/execute`, {
    recordId,
    suggestions,
    mode
  })).data;

export async function getHistory(portfolioId, { page = 1, pageSize = 20 } = {}) {
  const response = await api.get(`/portfolios/${portfolioId}/rebalance/history`, {
    params: { page, pageSize }
  });
  return { data: response.data, pagination: response.pagination };
}

export const revoke = async (recordId) =>
  (await api.post(`/rebalance/${recordId}/revoke`)).data;

export const reexecute = async (recordId) =>
  (await api.post(`/rebalance/${recordId}/reexecute`)).data;
