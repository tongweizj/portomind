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
const logController = require('../controllers/log.controller');

/**
 * GET /api/logs/tasks
 * 查询任务专用日志（syncPrices-YYYY-MM-DD.log）
 */
router.get('/tasks', logController.getTaskLogs);

/**
 * GET /api/logs
 * 查询通用日志（app-YYYY-MM-DD.log）
 */
router.get('/', logController.getLogs);


module.exports = router;
