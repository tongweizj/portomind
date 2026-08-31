// server/routes/transaction.js

const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');

// 固定路径先于 /:id
router.post('/import', transactionController.importTransactions);
router.get('/', transactionController.getAllTransactions);
router.post('/', transactionController.createTransaction);
router.get('/:id', transactionController.getTransactionById);
router.put('/:id', transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router;
