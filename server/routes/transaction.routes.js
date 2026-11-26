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
// 旧版逐行 JSON 导入（已由 preview/commit 取代，保留以兼容脚本）
router.post('/import', transactionController.importTransactions);
router.get('/', transactionController.getAllTransactions);
router.post('/', transactionController.createTransaction);
router.get('/:id', transactionController.getTransactionById);
router.put('/:id', transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router;
