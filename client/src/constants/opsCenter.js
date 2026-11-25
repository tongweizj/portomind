// 运维中心资产总表的客户端查询默认值；panel / hook / service 共用，避免三处漂移。
export const OPS_CENTER_DEFAULT_PAGE_SIZE = 50;
export const OPS_CENTER_DEFAULT_SORT_BY = 'priority';
export const OPS_CENTER_DEFAULT_SORT_ORDER = 'asc';

// 与服务端 assetIds 上限保持一致；超过时 UI 先截断并提示，不把 400 留给用户。
export const OPS_BATCH_MAX_ASSETS = 500;

export const OPS_CENTER_DEFAULT_FILTERS = Object.freeze({
  market: '',
  active: 'true',
  missingType: '',
  search: '',
  sortBy: OPS_CENTER_DEFAULT_SORT_BY,
  sortOrder: OPS_CENTER_DEFAULT_SORT_ORDER
});

// TASK-075：采集记录。taskName 是服务端稳定契约（唯一来源 shared/config/opsTasks.js 的
// OPS_TASK_CONFIG，服务端白名单为 taskRecords.service 的 RECORD_TASK_NAMES）；client 不能
// require shared，这里只是展示用拷贝，增删任务类型时两处同步。
export const OPS_RECORDS_DEFAULT_PAGE_SIZE = 20;
export const OPS_PRICE_SYNC_TASK_NAME = 'daily-price-sync';

export const OPS_RECORD_TYPES = Object.freeze([
  { value: OPS_PRICE_SYNC_TASK_NAME, label: '今日同步' },
  { value: 'asset-history-backfill', label: '单资产补采' },
  { value: 'asset-history-backfill-batch', label: '批量补缺失' },
  { value: 'price-integrity-check', label: '完整性刷新' }
]);
