// server/controllers/opsCenter.controller.js
//
// TASK-068：运维中心只读聚合端点。
// TASK-069：资产总表的服务端筛选、搜索、排序与分页参数。
// 协议层只做参数校验与响应包装，业务聚合在 shared/services/opsCenter.service.js。

const opsCenterService = require('@portomind/shared/services/opsCenter.service');
const { ASSET_MARKETS } = require('@portomind/shared/constants/asset.constants');
const {
  success,
  failure,
  pagination,
  parsePagination,
  validatePaginationQuery
} = require('../utils/apiResponse');

const ACTIVE_FILTERS = ['true', 'false', 'all'];
const SORT_ORDERS = ['asc', 'desc'];

function validateListQuery(req, res) {
  const paginationError = validatePaginationQuery(req.query, 100);
  if (paginationError) return paginationError;

  if (req.query.market !== undefined && !ASSET_MARKETS.includes(req.query.market)) {
    return `market must be one of: ${ASSET_MARKETS.join(', ')}`;
  }
  if (req.query.active !== undefined && !ACTIVE_FILTERS.includes(req.query.active)) {
    return 'active must be true, false or all';
  }
  if (req.query.missingType !== undefined && !opsCenterService.MISSING_TYPES.includes(req.query.missingType)) {
    return `missingType must be one of: ${opsCenterService.MISSING_TYPES.join(', ')}`;
  }
  if (req.query.search !== undefined && (typeof req.query.search !== 'string' || req.query.search.length > 100)) {
    return 'search cannot exceed 100 characters';
  }
  if (req.query.sortBy !== undefined && !opsCenterService.SORT_FIELDS.includes(req.query.sortBy)) {
    return `sortBy must be one of: ${opsCenterService.SORT_FIELDS.join(', ')}`;
  }
  if (req.query.sortOrder !== undefined && !SORT_ORDERS.includes(req.query.sortOrder)) {
    return 'sortOrder must be asc or desc';
  }
  return null;
}

function parseActive(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'all') return null;
  return undefined;
}

exports.getAssets = async (req, res, next) => {
  const queryError = validateListQuery(req, res);
  if (queryError) return failure(req, res, 400, queryError);
  try {
    const { page, pageSize } = parsePagination(req.query, { pageSize: opsCenterService.DEFAULT_PAGE_SIZE });
    const options = { page, pageSize };
    if (req.query.market !== undefined) options.market = req.query.market;
    if (req.query.active !== undefined) options.active = parseActive(req.query.active);
    if (req.query.missingType !== undefined) options.missingType = req.query.missingType;
    if (req.query.search !== undefined) options.search = req.query.search;
    if (req.query.sortBy !== undefined) options.sortBy = req.query.sortBy;
    if (req.query.sortOrder !== undefined) options.sortOrder = req.query.sortOrder;

    const result = await opsCenterService.getAssetsOverview(options);
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (err) {
    return next(err);
  }
};
