// TASK-094：流水导入与来源账户 API。
// 客户端只读取文件文本并转交服务端；解析、列映射应用、匹配与校验全部在服务端（shared）完成。
import { api } from './api.client';

// 完整批次预览 / 500 行确认可能超过默认 15s 超时
const IMPORT_TIMEOUT_MS = 120000;

export async function downloadImportTemplate() {
  const text = await api.get('/transactions/import/template', { responseType: 'text', timeout: IMPORT_TIMEOUT_MS });
  return typeof text === 'string' ? text : String(text ?? '');
}

export const previewImport = async (payload) =>
  (await api.post('/transactions/import/preview', payload, { timeout: IMPORT_TIMEOUT_MS })).data;

export const commitImport = async (payload) =>
  (await api.post('/transactions/import/commit', payload, { timeout: IMPORT_TIMEOUT_MS })).data;

export const getImportFormat = async () => (await api.get('/transactions/import/format')).data;

export const listSourceAccounts = async () => (await api.get('/source-accounts')).data;

export const renameSourceAccount = async (id, alias) =>
  (await api.patch(`/source-accounts/${id}`, { alias })).data;
