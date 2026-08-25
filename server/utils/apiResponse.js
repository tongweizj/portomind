function success(res, data, options = {}) {
  const body = { success: true, data };
  if (options.pagination) body.pagination = options.pagination;
  return res.status(options.status || 200).json(body);
}

function failure(req, res, status, message, details) {
  const body = {
    success: false,
    message,
    traceId: req.traceId || 'no-trace-id'
  };
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

module.exports = { success, failure, pagination, parsePagination };
