// server/routes/opsCenter.routes.js
//
// TASK-068：运维中心路由。挂载在 server/app.js 的全站认证闸门之后，
// 因此本路由不再重复 requireAuth；也不做 admin 校验（UI 约定的只读/动作差异）。
// TASK-068 仅提供资产总表；触发型操作由后续 Ticket 05/06/07 按 Spec 白名单增加。

const router = require('express').Router();
const controller = require('../controllers/opsCenter.controller');

router.get('/assets', controller.getAssets);

module.exports = router;
