// cron-worker/src/config/logger.js
// Winston 结构化日志：控制台 + 文件（按 error / combined 分类）。
// 导出 logger（应用通用）与 taskLogger（任务专用），任务日志文件带 task- 前缀以隔离。

const path = require('path');
const { createLogger, format, transports } = require('winston');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');

// 控制台：彩色简单格式；文件：结构化 JSON（时间戳 + 级别 + 消息 + 附加字段）
const consoleFormat = format.combine(
  format.colorize(),
  format.simple()
);
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) =>
    JSON.stringify({ timestamp, level, message, ...meta })
  )
);

function buildLogger(label = '') {
  const prefix = label ? `${label}-` : '';
  return createLogger({
    level: LOG_LEVEL,
    format: fileFormat,
    transports: [
      new transports.Console({ level: LOG_LEVEL, format: consoleFormat }),
      new transports.File({ dirname: LOG_DIR, filename: `${prefix}error.log`, level: 'error' }),
      new transports.File({ dirname: LOG_DIR, filename: `${prefix}combined.log` })
    ],
    exitOnError: false
  });
}

const logger = buildLogger();
const taskLogger = buildLogger('task');

module.exports = {
  logger,
  taskLogger,
  LOG_DIR
};
