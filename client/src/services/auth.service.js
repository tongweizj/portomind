// src/services/auth.service.js
// TASK-058 U2/U3：认证与账号管理的全部 HTTP 调用（唯一入口，页面/组件不得自行拼 URL）。
// 契约见 docs/dev/API_CONTRACT.md「认证与错误码」。
// 约定与既有 service 一致：api.js 拦截器解包 axios response 后拿到的是服务端响应体
// `{ success, data }`，故这里统一取内层 `.data`（返回业务数据本身）。
import { api } from './api';

export const login = async ({ username, password }) =>
  (await api.post('/auth/login', { username, password })).data;

export const logout = async () =>
  (await api.post('/auth/logout')).data;

export const getSession = async () =>
  (await api.get('/auth/session')).data;

export const changePassword = async ({ currentPassword, newPassword }) =>
  (await api.post('/auth/change-password', { currentPassword, newPassword })).data;

export const updateProfile = async ({ username }) =>
  (await api.patch('/auth/profile', { username })).data;

export const listUsers = async () =>
  (await api.get('/users')).data;

export const createUser = async ({ username, password, role }) =>
  (await api.post('/users', { username, password, role })).data;

export const updateUser = async (id, patch) =>
  (await api.patch(`/users/${id}`, patch)).data;

export const resetUserPassword = async (id, newPassword) =>
  (await api.post(`/users/${id}/password`, { newPassword })).data;
