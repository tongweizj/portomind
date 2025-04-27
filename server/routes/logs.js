// server/routes/logs.js

/**
 * 日志查询路由
 *
 * 提供接口 GET /api/logs
 * - 查询参数：
 *     level: 日志级别（如 'error', 'warn', 'info'），默认 'error'
 *     page:  页码（从 1 开始），默认 1
 *     pageSize: 每页条数，默认 20
 * - 读取 ${LOG_DIR}/app-YYYY-MM-DD.log 当天文件及历史文件（按需要可扩展为多天）
//      当前实现只读取当天的日志文件；若需跨天查询，可循环读取多天文件
 * - 返回：
 *     {
 *       page,
 *       pageSize,
 *       total,        // 符合条件的日志总条数
 *       entries: [    // 当前页日志条目
 *         { timestamp, level, traceId, message, ...meta },
 *         …
 *       ]
 *     }
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const router = express.Router();

// 日志目录（与 logger.js 中一致）
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../logs');
// 当天日志文件名，例如 app-2025-04-26.log
const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
const LOG_FILE = path.join(LOG_DIR, `app-${today}.log`);

/**
 * GET /api/logs
 */
router.get('/', async (req, res, next) => {
  try {
    // 1. 解析查询参数
    const level    = (req.query.level || 'error').toLowerCase();
    const page     = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 20, 1);

    // 2. 确保日志文件存在
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ page, pageSize, total: 0, entries: [] });
    }

    // 3. 按行读取日志文件
    const stream = fs.createReadStream(LOG_FILE, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const entries = [];
    let total = 0;

    for await (const line of rl) {
      let log;
      try {
        // 4. JSON 解析每行日志
        log = JSON.parse(line);
      } catch (e) {
        // 跳过无法解析的行
        continue;
      }
      // 5. 过滤指定级别
      if ((log.level || '').toLowerCase() === level) {
        total++;
        const start = (page - 1) * pageSize;
        const end = page * pageSize;
        // 6. 只收集当前页范围内的日志
        if (total > start && total <= end) {
          // 7. 只返回常用字段，可根据需要展开 meta
          entries.push({
            timestamp: log.timestamp,
            level:     log.level,
            traceId:   log.traceId || null,
            message:   log.message,
            ...log.meta   // 若有其他自定义字段
          });
        }
      }
    }

    // 8. 返回分页结果
    res.json({ page, pageSize, total, entries });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
