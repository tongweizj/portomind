// client/src/services/cronStatus.service.js
//
// TASK-063：读取 GET /api/cron/status 的单次快照。
// 统一走 api.js（会话 cookie、错误归一、401 处理都在那里），不新建 axios。
// 只读：本文件只有 GET；不得出现 post/put/patch/delete。

import { api } from './api';

export const CRON_STATUS_ENDPOINT = '/cron/status';

/** @returns {Promise<object>} 后端 data 信封 */
export async function getCronStatus() {
  const response = await api.get(CRON_STATUS_ENDPOINT);
  return response.data;
}
