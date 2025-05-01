// server/routes/transaction.js

const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');

// 获取所有交易记录
router.get('/', transactionController.getAllTransactions);
router.get('/:id', transactionController.getTransactionById);
// router.get('/:portfolioId', transactionController.getByPortfolio); // 获取某个投资组合的所有交易


// 添加交易
router.post('/', transactionController.createTransaction);
router.put('/:id', transactionController.updateTransaction);

// 删除交易
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router;
