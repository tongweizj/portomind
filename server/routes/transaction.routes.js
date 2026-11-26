// server/routes/transaction.routes.js

const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const importController = require('../controllers/transactionImport.controller');

// 固定路径先于 /:id
// TASK-094：完整批次预览 + 确认（JSON 上传文件内容；请求体上限见 app.js importJsonParser）
router.get('/import/template', importController.downloadTemplate);
router.get('/import/format', importController.getFormat);
router.post('/import/preview', importController.preview);
router.post('/import/commit', importController.commit);
// TASK-099：暂存待核对的证券划转一端
router.get('/import/transfers', importController.listStagedTransfers);
router.delete('/import/transfers/:id', importController.discardStagedTransfer);
router.get('/', transactionController.getAllTransactions);
router.post('/', transactionController.createTransaction);
router.get('/:id', transactionController.getTransactionById);
router.put('/:id', transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router;
