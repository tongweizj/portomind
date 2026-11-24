// server/controllers/opsCenter.controller.js
//
// TASK-068：运维中心只读聚合端点。
// 本票只开放资产总表默认页；筛选/排序/翻页控件由 Ticket 03 增加。
// 协议层只做分页校验与响应包装，业务聚合在 shared/services/opsCenter.service.js。

const opsCenterService = require('@portomind/shared/services/opsCenter.service');
const {
  success,
  failure,
  pagination,
  parsePagination,
  validatePaginationQuery
} = require('../utils/apiResponse');

exports.getAssets = async (req, res, next) => {
  const queryError = validatePaginationQuery(req.query, 100);
  if (queryError) return failure(req, res, 400, queryError);
  try {
    const { page, pageSize } = parsePagination(req.query, { pageSize: opsCenterService.DEFAULT_PAGE_SIZE });
    const result = await opsCenterService.getAssetsOverview({ page, pageSize });
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (err) {
    return next(err);
  }
};
