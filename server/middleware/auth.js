// server/middleware/auth.js
//
// TASK-058（U1-R5）：全站准入闸门。
// 必须在 app.js 的 9 个业务路由之前挂载；只在这里做判定，不在路由里重复实现。
//
// 顺序（ExecPlan §4.4）：
//   1) 取 cookie pm_sid → 缺失 401 UNAUTHENTICATED
//   2) sessionService.resolve(sid) → 会话不存在 → 401，并清掉失效会话
//   3) 用户 active=false → 401 ACCOUNT_DISABLED（并删会话）
//   4) mustChangePassword=true 且路径不在白名单 → 403 PASSWORD_CHANGE_REQUIRED
//   5) req.user / req.session 注入；非阻塞更新 lastSeenAt
//
// ⚠️ 测试策略（ED-5）：只允许 stub `session.service.resolve`，本文件的判定逻辑必须真实执行。

const sessionService = require('@portomind/shared/services/session.service');
const { failure } = require('../utils/apiResponse');
const { logger } = require('@portomind/shared/config/logger');

// 强制改密期间仍可访问的端点（改密 / 登出 / 查询当前会话）
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/session'
]);

function requestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function unauthenticated(req, res, code = 'UNAUTHENTICATED', message = '未登录或会话已失效') {
  return failure(req, res, 401, message, undefined, { code });
}

async function requireAuth(req, res, next) {
  try {
    const sid = req.cookies ? req.cookies[sessionService.SESSION_COOKIE_NAME] : null;
    if (!sid) return unauthenticated(req, res);

    const resolved = await sessionService.resolve(sid);
    if (!resolved || !resolved.user) {
      if (sid) await sessionService.destroySession(sid).catch(() => {});
      return unauthenticated(req, res);
    }

    const user = resolved.user;
    if (user.active === false) {
      await sessionService.destroySession(sid).catch(() => {});
      logger.warn('AUTH_GATE_REJECTED', { reason: 'ACCOUNT_DISABLED', userId: String(user._id || '') });
      return unauthenticated(req, res, 'ACCOUNT_DISABLED', '该账号已停用，请联系管理员');
    }

    req.user = {
      id: String(user._id ?? user.id ?? ''),
      username: user.username,
      role: user.role
    };
    req.session = { sid };

    // 非阻塞：lastSeenAt 仅审计，绝不用于续期（ED-3）
    sessionService.touch(sid);

    if (user.mustChangePassword === true && !PASSWORD_CHANGE_ALLOWED_PATHS.has(requestPath(req))) {
      return failure(req, res, 403, '请先修改初始密码', undefined, { code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return unauthenticated(req, res);
  if (req.user.role !== 'admin') {
    return failure(req, res, 403, '需要管理员权限', undefined, { code: 'FORBIDDEN' });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, PASSWORD_CHANGE_ALLOWED_PATHS };
