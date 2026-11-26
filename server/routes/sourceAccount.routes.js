// server/routes/sourceAccount.routes.js（TASK-094）

const express = require('express');
const router = express.Router();
const importController = require('../controllers/transactionImport.controller');

router.get('/', importController.listSourceAccounts);
router.patch('/:id', importController.renameSourceAccount);

module.exports = router;
