import { api } from './api';

// ── 规则 CRUD ──
export const getAlertRules = async (params = {}) =>
  (await api.get('/alerts/rules', { params })).data;
export const createAlertRule = async (data) =>
  (await api.post('/alerts/rules', data)).data;
export const getAlertRule = async (id) =>
  (await api.get(`/alerts/rules/${id}`)).data;
export const updateAlertRule = async (id, data) =>
  (await api.put(`/alerts/rules/${id}`, data)).data;
export const deleteAlertRule = async (id) =>
  (await api.delete(`/alerts/rules/${id}`)).data;

// ── 事件 ──
export const getAlertEvents = async (params = {}) =>
  (await api.get('/alerts/events', { params })).data;
export const getUnreadAlertCount = async () =>
  (await api.get('/alerts/events/unread-count')).data;
export const markAlertEventRead = async (id, status = 'read') =>
  (await api.patch(`/alerts/events/${id}/read`, { status })).data;

// ── 手动跑批（调试） ──
export const evaluateAlerts = async () =>
  (await api.post('/alerts/evaluate')).data;
