import { api } from './api';

// ── 家庭汇总（FAM-01/02/04） ──
export const getFamilySummary = async () =>
  (await api.get('/family/summary')).data;

// ── 汇率管理 ──
export const getFxRates = async () =>
  (await api.get('/family/fx/rates')).data;
export const upsertFxRate = async (currency, data) =>
  (await api.put(`/family/fx/rates/${currency}`, data)).data;
export const syncFxRates = async () =>
  (await api.post('/family/fx/sync')).data;
