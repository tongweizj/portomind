// server/routes/auth.routes.js
//
// TASK-058（U1-R6）：/api/auth/*。
// login / logout / session 公开（logout 幂等、session 未登录返回 200）；
// change-password / profile 需要登录（强制改密期间 change-password 仍放行）。
// 写操作仅接受 application/json（FS §8 CSRF 约束）。

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const requireJson = require('../middleware/requireJson');

router.post('/login', requireJson, authController.login);
router.post('/logout', authController.logout);
router.get('/session', authController.getSession);
router.post('/change-password', requireAuth, requireJson, authController.changePassword);
router.patch('/profile', requireAuth, requireJson, authController.updateProfile);

module.exports = router;
