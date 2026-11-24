// server/controllers/opsCenter.controller.js
//
// TASK-068：运维中心只读聚合端点。
// 本票只开放资产总表默认页；筛选/排序/翻页控件由 Ticket 03 增加。
// 协议层只做分页校验与响应包装，业务聚合在 shared/services/opsCenter.service.js。

const opsCenterService = require('@portomind/shared/services/opsCenter.service');
const { success, failure, pagination, parsePagination } = require('../utils/apiResponse');

function validatePagination(req, res) {
  for (const field of ['page', 'pageSize']) {
    if (req.query[field] !== undefined && !/^[1-9]\d*$/.test(req.query[field])) {
      failure(req, res, 400, `${field} must be a positive integer`);
      return false;
    }
  }
  if (Number(req.query.pageSize) > 100) {
    failure(req, res, 400, 'pageSize cannot exceed 100');
    return false;
  }
  return true;
}

exports.getAssets = async (req, res, next) => {
  if (!validatePagination(req, res)) return;
  try {
    const { page, pageSize } = parsePagination(req.query, { pageSize: opsCenterService.DEFAULT_PAGE_SIZE });
    const result = await opsCenterService.getAssetsOverview({ page, pageSize });
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (err) {
    return next(err);
  }
};
