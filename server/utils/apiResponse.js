function success(res, data, options = {}) {
  const body = { success: true, data };
  if (options.pagination) body.pagination = options.pagination;
  return res.status(options.status || 200).json(body);
}

function failure(req, res, status, message, details, options = {}) {
  const body = {
    success: false,
    message,
    traceId: req.traceId || 'no-trace-id'
  };
  // TASK-058：认证错误需要稳定的机器可读错误码（前端据此写文案，不匹配 message）
  if (options && options.code) body.code = options.code;
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

function pagination(page, pageSize, total) {
  return { page, pageSize, total };
}

function parsePagination(query, defaults = {}) {
  const defaultPageSize = defaults.pageSize || 20;
  const maxPageSize = defaults.maxPageSize || 100;
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(Number.parseInt(query.pageSize, 10) || defaultPageSize, 1),
    maxPageSize
  );
  return { page, pageSize };
}

/**
 * 严格校验 page/pageSize（parsePagination 只做收敛）。
 * 返回错误文案供调用方 failure(res, 400, message)；合法时返回 null。
 */
function validatePaginationQuery(query, maxPageSize = 100) {
  for (const field of ['page', 'pageSize']) {
    if (query[field] !== undefined && !/^[1-9]\d*$/.test(query[field])) {
      return `${field} must be a positive integer`;
    }
  }
  if (maxPageSize != null && Number(query.pageSize) > maxPageSize) {
    return `pageSize cannot exceed ${maxPageSize}`;
  }
  return null;
}

module.exports = { success, failure, pagination, parsePagination, validatePaginationQuery };
