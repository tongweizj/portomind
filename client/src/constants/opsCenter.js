// 运维中心资产总表的客户端查询默认值；panel / hook / service 共用，避免三处漂移。
export const OPS_CENTER_DEFAULT_PAGE_SIZE = 50;
export const OPS_CENTER_DEFAULT_SORT_BY = 'priority';
export const OPS_CENTER_DEFAULT_SORT_ORDER = 'asc';

export const OPS_CENTER_DEFAULT_FILTERS = Object.freeze({
  market: '',
  active: 'true',
  missingType: '',
  search: '',
  sortBy: OPS_CENTER_DEFAULT_SORT_BY,
  sortOrder: OPS_CENTER_DEFAULT_SORT_ORDER
});
