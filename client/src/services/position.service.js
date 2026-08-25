import { api } from './api';

export async function getPositions(
  portfolioId,
  { page = 1, pageSize = 20, symbol, sortBy, sortOrder } = {}
) {
  const response = await api.get(`/portfolios/${portfolioId}/stats/positions`, {
    params: { page, pageSize, symbol, sortBy, sortOrder }
  });
  return { data: response.data, pagination: response.pagination };
}

export async function getPositionHistory(portfolioId, { symbol, interval = 'day' } = {}) {
  const response = await api.get(`/portfolios/${portfolioId}/positions/history`, {
    params: { symbol: symbol === 'all' ? undefined : symbol, interval }
  });
  return response.data;
}
