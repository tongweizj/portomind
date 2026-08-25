// server/controllers/logController.js

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { success, pagination, parsePagination } = require('../utils/apiResponse');
const { LOG_DIR } = require('../config/logger');
const { sanitizeLogValue } = require('../utils/logSanitizer');

const LOG_LEVELS = new Set(['all', 'error', 'warn', 'info', 'verbose', 'debug', 'silly']);

function currentMarketDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function parseLogQuery(query) {
  const level = (query.level || 'all').toLowerCase();
  if (!LOG_LEVELS.has(level)) {
    const error = new Error('level must be one of all, error, warn, info, verbose, debug, silly');
    error.status = 400;
    throw error;
  }

  const date = query.date || currentMarketDate();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    const error = new Error('date must use YYYY-MM-DD format');
    error.status = 400;
    throw error;
  }
  return { level, date };
}

/**
 * 通用：读取单个日志文件并按条件分页
 * @param {string} filePath - 日志文件绝对路径
 * @param {string} level - 要过滤的日志级别
 * @param {number} page 
 * @param {number} pageSize 
 */
async function paginateLogFile(filePath, level, page, pageSize) {

  if (!fs.existsSync(filePath)) {
    return { total: 0, entries: [] };
  }

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });


  const entries = [];
  let total = 0;
  const start = (page - 1) * pageSize + 1;
  const end   = page * pageSize;

  for await (const line of rl) {
    let log;
    try {
      log = JSON.parse(line);
    } catch {
      continue;
    }
    if (level === 'all' || (log.level || '').toLowerCase() === level) {
      total++;
      if (total >= start && total <= end) {
        entries.push(sanitizeLogValue({ ...log, traceId: log.traceId || null }));
      }
    }
  }
  return { total, entries };
}

/**
 * GET /api/logs
 * 读取当天的通用日志文件（app-YYYY-MM-DD.log）
 */
exports.getLogs = async (req, res, next) => {
  try {
    const { level, date } = parseLogQuery(req.query);
    const { page, pageSize } = parsePagination(req.query);
    const file = path.join(LOG_DIR, `app-${date}.log`);
    const { total, entries } = await paginateLogFile(file, level, page, pageSize);
    return success(res, entries, { pagination: pagination(page, pageSize, total) });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/logs/tasks
 * 读取当天的任务专用日志文件（syncPrices-YYYY-MM-DD.log）
 */
exports.getTaskLogs = async (req, res, next) => {
  try {
    const { level, date } = parseLogQuery(req.query);
    const { page, pageSize } = parsePagination(req.query);
    const file = path.join(LOG_DIR, `task-${date}.log`);
    const { total, entries } = await paginateLogFile(file, level, page, pageSize);
    return success(res, entries, { pagination: pagination(page, pageSize, total) });
  } catch (err) {
    next(err);
  }
};

exports.paginateLogFile = paginateLogFile;
exports.parseLogQuery = parseLogQuery;
