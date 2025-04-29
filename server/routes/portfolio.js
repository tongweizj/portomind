// server/routes/portfolio.js
const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolio.controller');
const transactionController = require('../controllers/transaction.controller');
const rebalanceController = require('../controllers/rebalance.controller');

// 组合, 增删改查
router.post('/', portfolioController.createPortfolio);
router.get('/', portfolioController.getAllPortfolios);
router.get('/:id', portfolioController.getPortfolioById);
router.put('/:id', portfolioController.updatePortfolio);
router.delete('/:id', portfolioController.deletePortfolio);

// 组合, 统计

router.get('/:id/stats/actual-ratios', portfolioController.getActualRatios); // 实时持仓比例
router.get('/:pid/stats/positions',portfolioController.getPositions); // 持仓概览
router.get('/:id/stats', portfolioController.getPortfolioStats);
router.get(
    '/:pid/positions/history',
    portfolioController.getPositionHistory
); // 持仓历史

router.get('/:id/transactions', transactionController.getTransactionsByPortfolio); // 流水

// 组合,配置和再平衡
router.get('/:pid/rebalance-settings', portfolioController.getRebalanceSettings);//获取阈值
router.put('/:pid/rebalance-settings', portfolioController.updateRebalanceSettings); // 更新阈值

// POST /api/portfolios/:pid/rebalance/check
router.post(
    '/:pid/rebalance/check',
    rebalanceController.check
);
// POST /api/portfolios/:pid/rebalance/suggestions
router.post(
    '/:pid/rebalance/suggestions',
    rebalanceController.suggestions
);
// POST /api/portfolios/:pid/rebalance/execute
router.post(
    '/:pid/rebalance/execute',
    rebalanceController.execute
);
// GET  /api/portfolios/:pid/rebalance/history
router.get(
    '/:pid/rebalance/history',
    rebalanceController.history
);

module.exports = router;
