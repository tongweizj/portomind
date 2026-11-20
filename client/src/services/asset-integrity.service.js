import { api } from './api.client';

export async function runAssetIntegrityCheck() {
  const response = await api.post('/asset-integrity/check', {});
  return response.data;
}
