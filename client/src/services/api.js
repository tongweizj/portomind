import axios from 'axios';

const configuredBaseUrl = (import.meta.env.VITE_API_URL || '').trim();

// 空环境变量使用同源 /api，既适合 Vite proxy，也不会生成 "undefined/assets"。
export const API_BASE_URL = (configuredBaseUrl || '/api').replace(/\/+$/, '');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const body = error.response?.data;
    error.apiMessage = body?.message || error.message || 'Request failed';
    error.traceId = body?.traceId || error.response?.headers?.['x-trace-id'];
    error.status = error.response?.status;
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error, fallback = 'Request failed') {
  const message = error.apiMessage || error.response?.data?.message || fallback;
  return error.traceId ? `${message} (traceId: ${error.traceId})` : message;
}
