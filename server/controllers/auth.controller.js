// server/controllers/auth.controller.js
//
// TASK-058（U1-R6）：/api/auth/* 端点。
// 全部走 server/utils/apiResponse.js 的 success/failure；错误码放 body.code。

const userService = require('@portomind/shared/services/user.service');
const sessionService = require('@portomind/shared/services/session.service');
const loginThrottle = require('../middleware/loginThrottle');
const { success, failure } = require('../utils/apiResponse');
const { respondServiceError } = require('../utils/errorResponse');
const { logger } = require('@portomind/shared/config/logger');

function sessionCookieName() {
  return sessionService.SESSION_COOKIE_NAME;
}

function readSid(req) {
  return req.cookies ? req.cookies[sessionCookieName()] : null;
}

/** POST /api/auth/login —— 公开。失败文案不泄露账号是否存在（D8：停用账号是唯一例外）。 */
exports.login = async (req, res, next) => {
  try {
    const rawUsername = req.body ? req.body.username : undefined;
    const password = req.body ? req.body.password : undefined;
    if (typeof rawUsername !== 'string' || typeof password !== 'string' || !rawUsername.trim() || !password) {
      return failure(req, res, 400, 'username 与 password 必填', undefined, { code: 'INVALID_INPUT' });
    }

    const username = userService.normalizeUsername(rawUsername);
    const throttleKey = loginThrottle.keyOf(req.ip, username);
    const lockedUntil = loginThrottle.lockedUntil(throttleKey);
    if (lockedUntil) {
      logger.warn('AUTH_LOGIN_LOCKED', { username, ip: req.ip });
      return failure(req, res, 429, '连续登录失败次数过多，请稍后再试', {
        retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000))
      }, { code: 'ACCOUNT_LOCKED' });
    }

    const user = await userService.findForLogin(username);
    // 账号不存在时也执行一次 bcrypt 比对，避免用响应时间枚举账号
    const passwordValid = user
      ? await userService.verifyPassword(password, user.passwordHash)
      : await userService.verifyPassword(password, userService.DUMMY_PASSWORD_HASH);

    if (!user || !passwordValid) {
      loginThrottle.recordFailure(throttleKey);
      logger.warn('AUTH_LOGIN_FAILED', { username, ip: req.ip, reason: user ? 'INVALID_PASSWORD' : 'USER_NOT_FOUND' });
      return failure(req, res, 401, '用户名或密码错误', undefined, { code: 'INVALID_CREDENTIALS' });
    }

    if (user.active === false) {
      logger.warn('AUTH_LOGIN_FAILED', { username, ip: req.ip, reason: 'ACCOUNT_DISABLED' });
      return failure(req, res, 401, '该账号已停用，请联系管理员', undefined, { code: 'ACCOUNT_DISABLED' });
    }

    loginThrottle.reset(throttleKey);
    await userService.markLogin(user._id);
    const sid = await sessionService.createSession({
      userId: user._id,
      ip: req.ip,
      ua: req.headers['user-agent']
    });
    res.cookie(sessionCookieName(), sid, sessionService.cookieOptions());
    logger.info('AUTH_LOGIN_SUCCESS', { userId: String(user._id), username, ip: req.ip });
    // TASK-058 U2（D-2）：账户页「上次登录」需要该字段；markLogin 刚写入当前时间
    return success(res, {
      user: { ...userService.toPublicUser(user), lastLoginAt: new Date() }
    });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};

/** POST /api/auth/logout —— 无需登录也返回 200（幂等）；库中会话立即删除。 */
exports.logout = async (req, res, next) => {
  try {
    const sid = readSid(req);
    if (sid) {
      const resolved = await sessionService.resolve(sid).catch(() => null);
      await sessionService.destroySession(sid);
      res.clearCookie(sessionCookieName(), { path: '/' });
      if (resolved && resolved.user) {
        logger.info('AUTH_LOGOUT', { userId: String(resolved.user._id || '') });
      }
    }
    return success(res, { ok: true });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};

/** GET /api/auth/session —— 公开：未登录返回 200 + authenticated:false（不返回 401）。 */
exports.getSession = async (req, res, next) => {
  try {
    const sid = readSid(req);
    if (!sid) return success(res, { authenticated: false });
    const resolved = await sessionService.resolve(sid);
    if (!resolved || !resolved.user || resolved.user.active === false) {
      return success(res, { authenticated: false });
    }
    return success(res, {
      authenticated: true,
      // TASK-058 U2（D-2）：账户页身份区「上次登录」的唯一数据源（追加字段，不破坏既有消费者）
      user: { ...userService.toPublicUser(resolved.user), lastLoginAt: resolved.user.lastLoginAt || null }
    });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};

/** POST /api/auth/change-password —— 登录（强制改密期间唯一放行的写操作）。 */
exports.changePassword = async (req, res, next) => {
  try {
    const currentPassword = req.body ? req.body.currentPassword : undefined;
    const newPassword = req.body ? req.body.newPassword : undefined;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return failure(req, res, 400, 'currentPassword 与 newPassword 必填', undefined, { code: 'INVALID_INPUT' });
    }
    await userService.changeOwnPassword({
      userId: req.user.id,
      currentPassword,
      newPassword,
      currentSid: req.session ? req.session.sid : null
    });
    return success(res, { ok: true });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};

/** PATCH /api/auth/profile —— 登录：自助改用户名（唯一性校验，当前会话保持有效）。 */
exports.updateProfile = async (req, res, next) => {
  try {
    const username = req.body ? req.body.username : undefined;
    if (typeof username !== 'string' || !username.trim()) {
      return failure(req, res, 400, 'username 必填', undefined, { code: 'INVALID_INPUT' });
    }
    const user = await userService.changeOwnUsername({ userId: req.user.id, username });
    return success(res, { user });
  } catch (error) {
    return respondServiceError(req, res, next, error);
  }
};
