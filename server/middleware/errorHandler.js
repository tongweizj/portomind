// server/middleware/errorHandler.js

/**
 * 全局错误处理与日志中间件
 *
 * 作用：
 *   - 捕获路由或其它中间件抛出的未处理异常
 *   - 使用 Winston 将错误以 error 级别记录到日志（包含 traceId、请求上下文、stack trace 等）
 *   - 向客户端返回统一的 500 响应，并带上 traceId 以便关联日志
 *
 * 使用方式：
 *   // 在所有路由后、其他中间件前注册：
 *   app.use(errorHandler);
 */

const {logger} = require('../config/logger');
const { failure } = require('../utils/apiResponse');
const { sanitizeUrl } = require('../utils/logSanitizer');

module.exports = function errorHandler(err, req, res, next) {
  // 1. 从请求中取出 traceId，如果中间件未注入也不会报错
  const traceId = req.traceId || 'no-trace-id';

  // 2. 组织要记录的错误详情
  const errorMeta = {
    traceId,                              // 本次请求的唯一标识
    method: req.method,                   // HTTP 方法
    url: sanitizeUrl(req.originalUrl),    // 请求路径（敏感查询参数已脱敏）
    errorMessage: err.message,            // 错误消息
    stack: err.stack                       // 堆栈信息
  };

  // 3. 将错误写入 error 级别日志
  logger.error('UNHANDLED_ERROR', errorMeta);

  // 4. 如果响应头尚未发送，则返回统一的错误响应
  if (!res.headersSent) {
    let status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
    if (err.name === 'ValidationError' || err.name === 'CastError' || err.type === 'entity.parse.failed') {
      status = 400;
    } else if (err.code === 11000) {
      status = 409;
    }
    const message = status === 500 ? 'Internal Server Error' : err.message;
    failure(req, res, status, message);
  } else {
    // 如果已发送响应，则交给默认错误处理
    next(err);
  }
};
