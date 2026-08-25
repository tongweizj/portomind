import { api } from './api';

function listResult(response) {
  return { data: response.data, pagination: response.pagination };
}

export async function getTransactions({ page = 1, pageSize = 20, portfolioId, symbol } = {}) {
  return listResult(await api.get('/transactions', {
    params: { page, pageSize, portfolioId, symbol }
  }));
}
export async function getPortfolioTransactions(portfolioId, { page = 1, pageSize = 50, symbol } = {}) {
  const response = await api.get(`/portfolios/${portfolioId}/transactions`, {
    params: { page, pageSize, symbol }
  });
  return listResult(response);
}
export const getTransaction = async (id) => (await api.get(`/transactions/${id}`)).data;
export const createTransaction = async (tx) => (await api.post('/transactions', tx)).data;
export const updateTransaction = async (id, tx) => (await api.put(`/transactions/${id}`, tx)).data;
export const deleteTransaction = async (id) => (await api.delete(`/transactions/${id}`)).data;
