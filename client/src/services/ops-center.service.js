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
const ASSET_BACKFILL_ENDPOINT = '/ops-center/assets';
const BATCH_BACKFILL_ENDPOINT = '/ops-center/price-backfill';
const TASK_RUNS_ENDPOINT = '/ops-center/task-runs';

/** TASK-070：手动刷新历史完整度（202 + runId）。 */
export async function startIntegrityCheck() {
  return (await api.post(INTEGRITY_CHECK_ENDPOINT, {})).data;
}

/** TASK-071：手动触发今日价格同步（202 + runId）；空 marketGroup = 全部 active。 */
export async function startPriceSync({ marketGroup } = {}) {
  return (await api.post(PRICE_SYNC_ENDPOINT, marketGroup ? { marketGroup } : {})).data;
}

/** TASK-072：同步补采单资产历史价格（200 + 摘要）。 */
export async function backfillAsset(assetId, { from, to, year } = {}) {
  const body = {};
  if (from) body.from = from;
  if (to) body.to = to;
  if (year !== undefined) body.year = year;
  // 单资产补采同步等待，可能超过 API 默认 15 秒。
  return (await api.post(`${ASSET_BACKFILL_ENDPOINT}/${assetId}/price-backfill`, body, { timeout: 120000 })).data;
}

/** TASK-074：按当前服务端筛选结果取全部资产 id（仅用于批量选择）。 */
export async function getAllFilteredAssetIds(filters = {}) {
  const ids = [];
  let page = 1;
  let total = Infinity;
  while (ids.length < total && page <= 100) {
    const result = await getAssetsOverview({ ...filters, page, pageSize: 100 });
    const rows = Array.isArray(result.data) ? result.data : [];
    ids.push(...rows.map((row) => row.assetId).filter(Boolean));
    total = Number(result.pagination?.total) || rows.length;
    if (rows.length === 0) break;
    page += 1;
  }
  return [...new Set(ids)];
}

async function requestBatchBackfill(payload) {
  return (await api.post(BATCH_BACKFILL_ENDPOINT, payload, { timeout: 120000 })).data;
}

/** TASK-074：批量补采预览；不写库、不建 TaskRun。 */
export async function previewBatchBackfill({ assetIds, from, to, year }) {
  return requestBatchBackfill({ assetIds, from, to, year, preview: true });
}

/** TASK-074：启动批量补采；202 + runId。 */
export async function startBatchBackfill({ assetIds, from, to, year }) {
  return requestBatchBackfill({ assetIds, from, to, year, preview: false });
}

/** TASK-070：读取一次任务运行的状态/进度/结果。 */
export async function getTaskRun(runId) {
  return (await api.get(`${TASK_RUNS_ENDPOINT}/${runId}`)).data;
}
