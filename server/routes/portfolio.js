// server/routes/portfolio.js
const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolio.controller');
const transactionController = require('../controllers/transaction.controller');

// ✅ 创建组合
router.post('/', portfolioController.createPortfolio);
router.get('/', portfolioController.getAllPortfolios);
router.get('/:id', portfolioController.getPortfolioById);
router.put('/:id', portfolioController.updatePortfolio);
router.delete('/:id', portfolioController.deletePortfolio);
router.get('/:id/stats', portfolioController.getPortfolioStats);
router.get('/:id/transactions', transactionController.getTransactionsByPortfolio);
router.get('/:id/actual-ratios', portfolioController.getActualRatios); // 实时持仓比例

module.exports = router;
