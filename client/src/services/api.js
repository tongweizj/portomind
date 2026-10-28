import axios from 'axios';
import { notifyUnauthorized, notifyPasswordChangeRequired } from './authSession';

const configuredBaseUrl = (import.meta.env.VITE_API_URL || '').trim();

// 空环境变量使用同源 /api，既适合 Vite proxy，也不会生成 "undefined/assets"。
export const API_BASE_URL = (configuredBaseUrl || '/api').replace(/\/+$/, '');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  // 会话 cookie（pm_sid）必须随请求发送：同源 /api（Vite proxy）下无副作用；
  // 若 VITE_API_URL 配成绝对地址（跨源开发），没有它浏览器不会带上 Set-Cookie 的会话。
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

// 这些端点的 401 属于业务结果（密码错误 / 未登录查询会话），不能按「会话失效」重定向，
// 否则登录失败会被踢回登录页并可能形成循环（TASK-058 U2 D-4）。
const AUTH_ENDPOINTS_SKIPPING_REDIRECT = ['/auth/login', '/auth/session', '/auth/logout'];

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const body = error.response?.data;
    error.apiMessage = body?.message || error.message || 'Request failed';
    error.traceId = body?.traceId || error.response?.headers?.['x-trace-id'];
    error.status = error.response?.status;
    // 认证错误带稳定机器码（INVALID_CREDENTIALS / ACCOUNT_DISABLED / PASSWORD_CHANGE_REQUIRED …）
    error.code = body?.code;

    const requestUrl = error.config?.url || '';
    const isAuthEndpoint = AUTH_ENDPOINTS_SKIPPING_REDIRECT.some((path) => requestUrl.includes(path));

    if (error.status === 401 && !isAuthEndpoint) {
      notifyUnauthorized();
    }
    if (error.status === 403 && error.code === 'PASSWORD_CHANGE_REQUIRED') {
      notifyPasswordChangeRequired();
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error, fallback = 'Request failed') {
  const message = error.apiMessage || error.response?.data?.message || fallback;
  return error.traceId ? `${message} (traceId: ${error.traceId})` : message;
}
