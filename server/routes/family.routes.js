// server/routes/family.routes.js
const express = require('express');
const router = express.Router();
const familyController = require('../controllers/family.controller');

// 固定路径先于 /:id 类路由
router.get('/summary', familyController.getFamilySummary);

// 汇率管理（家庭层前置）
router.get('/fx/rates', familyController.getFxRates);
router.put('/fx/rates/:currency', familyController.upsertFxRate);
router.post('/fx/sync', familyController.syncFxRates);

module.exports = router;
