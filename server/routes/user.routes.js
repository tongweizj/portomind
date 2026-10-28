// server/routes/user.routes.js
//
// TASK-058（U1-R7）：/api/users/*（全部管理员）。
// 在全局 /api 闸门之前挂载，路由级 requireAuth + requireAdmin 自含（避免重复查会话）。

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const requireJson = require('../middleware/requireJson');

router.use(requireAuth, requireAdmin);

router.get('/', userController.listUsers);
router.post('/', requireJson, userController.createUser);
router.patch('/:id', requireJson, userController.updateUser);
router.post('/:id/password', requireJson, userController.resetPassword);

module.exports = router;
