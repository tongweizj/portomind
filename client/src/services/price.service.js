import { api } from './api';

function listResult(response) {
  return { data: response.data, pagination: response.pagination };
}

export async function getTodayPrices({ page = 1, pageSize = 20 } = {}) {
  return listResult(await api.get('/prices/today', { params: { page, pageSize } }));
}

export async function getPricesByDate(date, { page = 1, pageSize = 20 } = {}) {
  return listResult(await api.get(`/prices/date/${date}`, { params: { page, pageSize } }));
}

export async function getPriceHistory(
  symbol,
  { year, month, from, to, page = 1, pageSize = 20 } = {}
) {
  const response = await api.get(`/prices/symbol/${encodeURIComponent(symbol)}/history`, {
    params: { year, month, from, to, page, pageSize }
  });
  return listResult(response);
}
