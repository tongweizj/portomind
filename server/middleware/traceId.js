// server/middleware/traceId.js

/**
 * Trace ID 中间件
 *
 * 每次请求进来时都会生成一个唯一的 traceId（Correlation ID），
 * 并将其挂载到 req.traceId 上，方便后续日志统一打点时串联同一次请求的所有日志。
 *
 * 使用场景：
 *   - 在 requestLogger 中读取 req.traceId，输出到每条 HTTP 访问日志中
 *   - 在 errorHandler 中读取 req.traceId，输出到错误日志中
 *   - 在任何业务代码里通过 req.traceId 或手动生成的 traceId 标记任务日志
 */

const { v4: uuidv4 } = require('uuid');

module.exports = function traceId(req, res, next) {
  // 1. 生成一个 UUID 作为本次请求的 traceId
  const id = uuidv4();

  // 2. 将 traceId 挂载到请求对象上，后续中间件和路由都可以访问
  req.traceId = id;

  // 3. 同时将它写入响应头，便于客户端／后端日志关联（可选）
  res.setHeader('X-Trace-Id', id);

  // 4. 继续后续中间件执行
  next();
};
