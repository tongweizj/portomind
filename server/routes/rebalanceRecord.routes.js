// server/routes/rebalance.routes.js

const express = require('express');
const router  = express.Router();
const rebalanceController = require('../controllers/rebalance.controller');

/**
 * 再平衡路由
 * 路径挂载示例：app.use('/api/portfolios', rebalanceRoutes);
 */


// 撤销再平衡操作
// POST /api/rebalance/:recordId/revoke
router.post('/:recordId/revoke', rebalanceController.revoke);

// 重做再平衡操作
// POST /api/rebalance/:recordId/reexecute
router.post('/:recordId/reexecute', rebalanceController.reexecute);

module.exports = router;