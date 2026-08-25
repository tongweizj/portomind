import { api } from './api';

export async function getAssets({ page = 1, pageSize = 20, search, sortBy, sortOrder, active, watchlist } = {}) {
  const params = { page, pageSize, search, sortBy, sortOrder, active, watchlist };
  const response = await api.get('/assets', { params });
  return { data: response.data, pagination: response.pagination };
}

export async function getAssetById(id) {
  return (await api.get(`/assets/${id}`)).data;
}

export async function createAsset(data) {
  return (await api.post('/assets', data)).data;
}

export async function updateAsset(id, data) {
  return (await api.put(`/assets/${id}`, data)).data;
}

export async function deleteAsset(id) {
  return (await api.delete(`/assets/${id}`)).data;
}
