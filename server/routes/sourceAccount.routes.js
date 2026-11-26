// server/routes/sourceAccount.routes.js（TASK-094）

const express = require('express');
const router = express.Router();
const importController = require('../controllers/transactionImport.controller');

router.get('/', importController.listSourceAccounts);
router.patch('/:id', importController.renameSourceAccount);
// TASK-103：POST 仅因请求体携带用户提供的期初 / 期末余额；不写库
router.post('/:id/cash-reconciliation', importController.reconcileCash);

module.exports = router;
