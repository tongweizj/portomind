// server/routes/opsTask.routes.js
//
// TASK-070：运维中心手动任务端点。挂载在全站认证闸门之后，
// 不重复 requireAuth，也不做 admin 校验（Spec #66 UI-only 权限约定）。

const router = require('express').Router();
const controller = require('../controllers/opsTask.controller');

router.post('/integrity-check', controller.startIntegrityCheck);
router.post('/price-sync', controller.startPriceSync);
router.get('/task-runs/:id', controller.getTaskRun);

module.exports = router;
