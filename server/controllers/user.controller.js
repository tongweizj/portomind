// server/controllers/user.controller.js
//
// TASK-058（U1-R7）：/api/users/* 管理员用户管理。
// 全路由 requireAdmin（见 routes/user.routes.js）；业务规则在 shared/services/user.service.js。

const mongoose = require('mongoose');
const userService = require('@portomind/shared/services/user.service');
const { success, failure } = require('../utils/apiResponse');
const { respondServiceError } = require('../utils/errorResponse');

function invalidId(req, res) {
  return failure(req, res, 400, '用户 ID 无效', undefined, { code: 'INVALID_ID' });
}

/** GET /api/users —— 用户列表（创建时间倒序） */
exports.listUsers = async (req, res, next) => {
  try {
    return success(res, { items: await userService.listUsers() });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};

/** POST /api/users —— 新建用户；初始密码由管理员设定 → 对方首次登录必须改密 */
exports.createUser = async (req, res, next) => {
  try {
    const body = req.body || {};
    const user = await userService.createUser({
      username: body.username,
      password: body.password,
      role: body.role === undefined ? 'member' : body.role,
      actorId: req.user ? req.user.id : null
    });
    return success(res, { user }, { status: 201 });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};

/** PATCH /api/users/:id —— 改用户名 / 角色 / 启用停用（含唯一 admin 与自我停用守护） */
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidId(req, res);
    const body = req.body || {};
    const patch = {};
    if (body.username !== undefined) patch.username = body.username;
    if (body.role !== undefined) patch.role = body.role;
    if (body.active !== undefined) {
      // 严格布尔：'true'/1/null 等一律 400，避免 U3 客户端笔误把用户静默停用
      if (typeof body.active !== 'boolean') {
        return failure(req, res, 400, 'active 必须是布尔值', undefined, { code: 'INVALID_INPUT' });
      }
      patch.active = body.active;
    }
    const user = await userService.updateUser({
      targetUserId: id,
      patch,
      actorId: req.user ? req.user.id : null
    });
    return success(res, { user });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};

/** POST /api/users/:id/password —— 管理员重置他人密码（不可操作自己，D9） */
exports.resetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidId(req, res);
    const newPassword = req.body ? req.body.newPassword : undefined;
    if (typeof newPassword !== 'string') {
      return failure(req, res, 400, 'newPassword 必填', undefined, { code: 'INVALID_INPUT' });
    }
    await userService.resetPassword({
      targetUserId: id,
      newPassword,
      actorId: req.user ? req.user.id : null
    });
    return success(res, { ok: true });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};
