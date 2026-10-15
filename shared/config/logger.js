// shared/config/logger.js
//
// PortoMind 统一日志实现（server 与 cron-worker 的唯一来源）。
// 说明：
//  - 使用 Winston 记录结构化 JSON 日志，winston-daily-rotate-file 按天切割
//  - 导出 logger（通用，写 app-YYYY-MM-DD.log）与 taskLogger（任务专用，写 task-YYYY-MM-DD.log）
//  - LOG_DIR 由环境变量控制；**默认指向仓库根 logs/**，使 server 与 cron-worker 共用同一目录
//    （server 的 GET /api/logs/tasks 据此读取 worker 产生的定时任务日志）
//  - 两个进程写的是不同文件名（app-* / task-*），共用 LOG_DIR 不会互相覆盖

const path = require('path');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { sanitizeLogValue } = require('../utils/logSanitizer');

// ---------------------------------------------------------------------
// 1. 环境变量及默认值
// ---------------------------------------------------------------------
const LOG_LEVEL     = process.env.LOG_LEVEL     || 'info';          // 日志级别（error, warn, info, verbose, debug, silly）
const LOG_DIR       = process.env.LOG_DIR       || path.resolve(__dirname, '../../logs'); // 默认仓库根 logs/
const LOG_MAX_FILES = process.env.LOG_MAX_FILES || '60d';            // 文件保留时长，支持 '14d', '60d' 等格式

// ---------------------------------------------------------------------
// 2. 日志格式化配置
// ---------------------------------------------------------------------
// JSON 格式 + 时间戳，便于机器解析与搜索；写盘前统一脱敏。
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => JSON.stringify(sanitizeLogValue({
    timestamp,
    level,
    message,
    ...meta
  })))
);

// ---------------------------------------------------------------------
// 3. 创建 Logger 实例
// ---------------------------------------------------------------------
const logger = createLogger({
  level: LOG_LEVEL,
  format: logFormat,
  transports: [
    // 3.1 控制台输出：适合开发环境
    new transports.Console({
      handleExceptions: true,
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),

    // 3.2 文件输出：按日期切割
    new DailyRotateFile({
      dirname:   LOG_DIR,
      filename:  'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxFiles: LOG_MAX_FILES,
      level: LOG_LEVEL,
      handleExceptions: true
    })
  ],

  // 捕获未处理的 Promise 异常
  exceptionHandlers: [
    new transports.Console({ format: format.simple() }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: LOG_MAX_FILES,
      utc: true
    })
  ],

  // 捕获未处理的异常
  rejectionHandlers: [
    new transports.Console({ format: format.simple() }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: LOG_MAX_FILES,
      utc: true
    })
  ],

  exitOnError: false
});

// ─────────────────────────────────────────────────────────────
// 4. taskLogger：任务专用（价格同步 / 完整性检查 / 提醒评估 / 汇率同步 / 再平衡）
// ─────────────────────────────────────────────────────────────
const taskLogger = createLogger({
  level: LOG_LEVEL,
  format: logFormat,
  transports: [
    new DailyRotateFile({
      dirname:   LOG_DIR,
      filename:  'task-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxFiles:  LOG_MAX_FILES,
      level:     'info',
      utc: true
    })
  ],
  exitOnError: false
});

module.exports = {
  logger,
  taskLogger,
  LOG_DIR
};
