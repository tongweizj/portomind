// client/src/services/ops-center.service.js
//
// TASK-068：运维中心资产总表读取。只读 GET，不在此文件新增任何写入口；
// 筛选/排序/翻页控件由 Ticket 03 扩展，客户端不得拉全量后自行切片。
import { api } from './api.client';

const OPS_CENTER_ASSETS_ENDPOINT = '/ops-center/assets';

export async function getAssetsOverview({ page = 1, pageSize = 50 } = {}) {
  const response = await api.get(OPS_CENTER_ASSETS_ENDPOINT, { params: { page, pageSize } });
  return { data: response.data, pagination: response.pagination };
}
