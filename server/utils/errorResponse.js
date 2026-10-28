// server/utils/errorResponse.js
//
// TASK-058：把 service 层抛出的业务错误（带 status / code）转成统一 failure 响应。
// 非业务错误（无 status）交回全局 errorHandler，保持既有 500 行为。

const { failure } = require('./apiResponse');

function respondServiceError(req, res, next, error) {
  if (!error) return next();
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status < 400 || status >= 600) return next(error);
  if (status === 500) return next(error);
  return failure(
    req,
    res,
    status,
    error.message,
    error.details,
    error.code ? { code: error.code } : undefined
  );
}

module.exports = { respondServiceError };
