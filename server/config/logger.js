// server/config/logger.js

/**
 * 日志配置模块
 * 说明：
 *  - 使用 Winston 进行日志记录
 *  - 使用 winston-daily-rotate-file 实现按天切割日志文件
 *  - 支持控制台输出和文件输出
 *  - 通过环境变量灵活控制日志级别、存储路径和保留时长
 */

const path = require('path');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// ---------------------------------------------------------------------
// 1. 环境变量及默认值
// ---------------------------------------------------------------------
const LOG_LEVEL     = process.env.LOG_LEVEL     || 'info';          // 日志级别（error, warn, info, verbose, debug, silly）
const LOG_DIR       = process.env.LOG_DIR       || path.join(__dirname, '../logs');  
const LOG_MAX_FILES = process.env.LOG_MAX_FILES || '60d';            // 文件保留时长，支持 '14d', '60d' 等格式

// ---------------------------------------------------------------------
// 2. 日志格式化配置
// ---------------------------------------------------------------------
// 我们使用 JSON 格式，并在每条日志中加入时间戳，便于机器解析与搜索
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),  // 时间格式
  format.printf(({ timestamp, level, message, ...meta }) => {
    // 自定义输出：时间 + 级别 + 消息 + 额外字段
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta
    });
  })
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
        format.colorize(),                   // 彩色输出
        format.simple()                      // 简单格式：`${level}: ${message}`
      )
    }),

    // 3.2 文件输出：按日期切割
    new DailyRotateFile({
      dirname:   LOG_DIR,                    // 日志存储目录
      filename:  'app-%DATE%.log',           // 文件名模板，%DATE% 会被替换为 YYYY-MM-DD
      datePattern: 'YYYY-MM-DD',             // 日期格式
      zippedArchive: false,                  // 是否压缩旧文件
      maxFiles: LOG_MAX_FILES,               // 文件最大保留周期
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
      utc:true,
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
      utc:true,
    })
  ],

  exitOnError: false  // 当发生错误时，不退出应用
});

// ─────────────────────────────────────────────────────────────
// 4. priceSyncLogger：专用于 syncPrices 任务
// ─────────────────────────────────────────────────────────────
const taskLogger = createLogger({
  level: LOG_LEVEL,
  format: logFormat,
  transports: [
    new DailyRotateFile({
      dirname:   LOG_DIR,
      filename:  'task-%DATE%.log',
      datePattern:'YYYY-MM-DD',
      zippedArchive: false,
      maxFiles:  LOG_MAX_FILES,
      level:     'info',
      utc:true,
    })
  ],
  exitOnError: false
});


module.exports = {
  logger: logger,
  taskLogger: taskLogger
};