// client/src/services/ops-center.service.js
//
// TASK-068：运维中心资产总表读取。只读 GET，不在此文件新增任何写入口。
// TASK-069：筛选/搜索/排序/分页全部作为服务端 query params 发送；客户端不拉全量切片。
import { api } from './api.client';

const OPS_CENTER_ASSETS_ENDPOINT = '/ops-center/assets';

export async function getAssetsOverview({
  page = 1,
  pageSize = 50,
  market,
  active,
  missingType,
  search,
  sortBy = 'priority',
  sortOrder = 'asc'
} = {}) {
  const params = { page, pageSize, sortBy, sortOrder };
  if (market) params.market = market;
  if (active) params.active = active;
  if (missingType) params.missingType = missingType;
  if (search) params.search = search;

  const response = await api.get(OPS_CENTER_ASSETS_ENDPOINT, { params });
  return { data: response.data, pagination: response.pagination };
}
