// client/src/services/ops-center.service.js
//
// TASK-068：运维中心资产总表读取。
// TASK-069：筛选/搜索/排序/分页全部作为服务端 query params 发送；客户端不拉全量切片。
// TASK-070：白名单 POST /integrity-check 与 task-run 详情读取。
// TASK-071：白名单 POST /price-sync。
import { api } from './api.client';
import {
  OPS_CENTER_DEFAULT_PAGE_SIZE,
  OPS_CENTER_DEFAULT_SORT_BY,
  OPS_CENTER_DEFAULT_SORT_ORDER
} from '../constants/opsCenter';

const OPS_CENTER_ASSETS_ENDPOINT = '/ops-center/assets';

export async function getAssetsOverview({
  page = 1,
  pageSize = OPS_CENTER_DEFAULT_PAGE_SIZE,
  market,
  active,
  missingType,
  search,
  sortBy = OPS_CENTER_DEFAULT_SORT_BY,
  sortOrder = OPS_CENTER_DEFAULT_SORT_ORDER
} = {}) {
  const params = { page, pageSize, sortBy, sortOrder };
  if (market) params.market = market;
  if (active !== undefined && active !== null && active !== '') params.active = active;
  if (missingType) params.missingType = missingType;
  if (search) params.search = search;

  const response = await api.get(OPS_CENTER_ASSETS_ENDPOINT, { params });
  return { data: response.data, pagination: response.pagination };
}

const INTEGRITY_CHECK_ENDPOINT = '/ops-center/integrity-check';
const PRICE_SYNC_ENDPOINT = '/ops-center/price-sync';
const TASK_RUNS_ENDPOINT = '/ops-center/task-runs';

/** TASK-070：手动刷新历史完整度（202 + runId）。 */
export async function startIntegrityCheck() {
  return (await api.post(INTEGRITY_CHECK_ENDPOINT, {})).data;
}

/** TASK-071：手动触发今日价格同步（202 + runId）；空 marketGroup = 全部 active。 */
export async function startPriceSync({ marketGroup } = {}) {
  return (await api.post(PRICE_SYNC_ENDPOINT, marketGroup ? { marketGroup } : {})).data;
}

/** TASK-070：读取一次任务运行的状态/进度/结果。 */
export async function getTaskRun(runId) {
  return (await api.get(`${TASK_RUNS_ENDPOINT}/${runId}`)).data;
}
