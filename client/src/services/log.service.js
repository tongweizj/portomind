import { api } from './api';

async function queryLogs(path, page, pageSize, level, date) {
  const params = { page, pageSize, date };
  if (level && level !== 'all') params.level = level;
  const response = await api.get(path, { params });
  return { data: response.data, pagination: response.pagination };
}

export const getLogs = (page, pageSize, level, date) => queryLogs('/logs', page, pageSize, level, date);
export const getTaskLogs = (page, pageSize, level, date) => queryLogs('/logs/tasks', page, pageSize, level, date);
