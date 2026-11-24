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
