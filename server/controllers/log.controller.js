// server/controllers/logController.js

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 日志目录
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../logs');

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
    if ((log.level || '').toLowerCase() === level) {
      total++;
      if (total >= start && total <= end) {
        entries.push({
          timestamp: log.timestamp,
          level:     log.level,
          traceId:   log.traceId || null,
          message:   log.message,
          ...log.meta
        });
      }
    }
  }
  console.log("entries: ", entries);
  return { total, entries };
}

/**
 * GET /api/logs
 * 读取当天的通用日志文件（app-YYYY-MM-DD.log）
 */
exports.getLogs = async (req, res, next) => {
  try {
    const level    = (req.query.level || 'info').toLowerCase();
    const page     = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 20, 1);
    const today   = new Date().toISOString().slice(0, 10);
    const file    = path.join(__dirname,  `../logs/app-${today}.log`);
    // console.log("file:", file)
    const { total, entries } = await paginateLogFile(file, level, page, pageSize);
    res.json({ page, pageSize, total, entries });
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
    const level    = (req.query.level || 'info').toLowerCase();
    const page     = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 20, 1);
    const today   = new Date().toISOString().slice(0, 10);
    const file    = path.join(__dirname,  `../logs/task-${today}.log`);
    // console.log("file:", file)
    const { total, entries } = await paginateLogFile(file, level, page, pageSize);
    res.json({ page, pageSize, total, entries });
  } catch (err) {
    next(err);
  }
};
