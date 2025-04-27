// server/middleware/requestLogger.js

/**
 * HTTP 请求日志中间件
 *
 * 作用：
 *   - 在每次请求完成后，记录请求方法、URL、状态码、耗时、用户 ID 以及 traceId
 *   - 帮助监控接口性能、请求量和排查异常
 *
 * 依赖：
 *   - on-finished：监听响应何时真正完成
 *   - ../config/logger：Winston 日志实例
 */

const onFinished = require('on-finished');
const {logger} = require('../config/logger');

module.exports = function requestLogger(req, res, next) {
  // 1. 记录请求到达的时间戳
  const startTime = Date.now();

  // 2. 当响应结束（无论成功还是错误）时触发回调
  onFinished(res, (err, response) => {
    // 3. 计算处理时长
    const durationMs = Date.now() - startTime;

    // 4. 构建要写入日志的字段
    const logMeta = {
      traceId: req.traceId,               // 从 traceId 中间件注入
      method: req.method,                 // HTTP 方法（GET/POST/...）
      url: req.originalUrl,               // 完整请求路径（含查询串）
      status: response.statusCode,        // 响应状态码
      durationMs,                         // 耗时（毫秒）
      userId: req.user?.id || null        // 若已鉴权，则由鉴权中间件注入
      // 你也可以根据需求添加：req.ip, req.headers['user-agent'] 等
    };

    // 5. 记录 info 级别访问日志
    logger.info('HTTP_ACCESS', logMeta);
  });

  // 6. 将控制权交给下一个中间件/路由处理
  next();
};
