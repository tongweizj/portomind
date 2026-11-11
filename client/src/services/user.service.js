// src/services/user.service.js
// TASK-071 M5：用户管理（管理员）的 HTTP 调用，从 auth.service.js 迁出，函数体与 URL 原样保留。
// 认证本身（login/logout/session/change-password/profile）仍归 auth.service.js。
// 契约见 docs/handbook/technical/API_CONTRACT.md「认证与错误码」（/api/users/* 全部要求 admin）。
import { api } from './api.client';

export const listUsers = async () =>
  (await api.get('/users')).data;

export const createUser = async ({ username, password, role }) =>
  (await api.post('/users', { username, password, role })).data;

export const updateUser = async (id, patch) =>
  (await api.patch(`/users/${id}`, patch)).data;

export const resetUserPassword = async (id, newPassword) =>
  (await api.post(`/users/${id}/password`, { newPassword })).data;
