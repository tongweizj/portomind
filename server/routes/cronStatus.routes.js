// server/routes/cronStatus.routes.js
//
// TASK-054：只读聚合端点。挂载点 /api/cron → 对外路径 GET /api/cron/status（AC1 / M-1）。
// 不新增第二个端点：详情视图走 ?detail=rebalance（AC8 / FS §10 硬约束）。

const express = require('express');
const router = express.Router();
const cronStatusController = require('../controllers/cronStatus.controller');

router.get('/status', cronStatusController.getStatus);

module.exports = router;
