// shared/services/user.service.js
//
// TASK-058（U1）：用户内核（哈希 / 校验 / CRUD / 改密 / 唯一 admin 守护 / 默认 admin seed）。
// 关键约束：
//   - 密码 bcryptjs cost 10；8–72 字符，超长显式拒绝（ED-2），禁止静默截断
//   - 用户名统一小写（ED-4），登录时同样归一化
//   - 系统任意时刻至少一个 active && role=admin（FS §4.4 核心不变量）
//   - 不记录密码到日志（FS §8）

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/user');
const sessionService = require('./session.service');
const { logger } = require('../config/logger');
const { USER_ROLES } = require('../models/user');

const BCRYPT_COST = 10;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';
// 账号不存在时也跑一次 bcrypt 比对，避免用响应时间枚举账号（密码无意义，仅作等时）
const DUMMY_PASSWORD_HASH = '$2b$10$yDraIzhGQ6.NBslJj3W7suzLQD6FGxgaZhbzJJuyK5g/Limz99o5W';

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Id 语义比较（Reviewer MINOR）：URL 里的 ObjectId 大小写不同但指向同一用户，
 * 直接字符串比较会被绕过（例如管理员用大写 id 重置自己密码）。统一走 ObjectId.equals。
 */
function areSameId(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  try {
    return new mongoose.Types.ObjectId(String(a)).equals(new mongoose.Types.ObjectId(String(b)));
  } catch (_) {
    return String(a) === String(b);
  }
}

function isDuplicateKeyError(error) {
  return Boolean(error && error.code === 11000);
}

function normalizeUsername(value) {
  return String(value === undefined || value === null ? '' : value).trim().toLowerCase();
}

function validateUsername(username) {
  if (!USERNAME_PATTERN_TEST(String(username || ''))) {
    return serviceError(400, 'INVALID_USERNAME', '用户名需为 3–32 位小写字母/数字/下划线/点/连字符，且以字母或数字开头');
  }
  return null;
}

function USERNAME_PATTERN_TEST(value) {
  return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(value);
}

function validateRole(role) {
  if (!USER_ROLES.includes(role)) {
    return serviceError(400, 'INVALID_ROLE', `role 必须是 ${USER_ROLES.join(' / ')}`);
  }
  return null;
}

/** 密码强度：仅长度 8–72（UTF-8 ≤72 字节，防止 bcrypt 静默截断）—— ED-2 */
function validatePassword(password) {
  if (typeof password !== 'string') {
    return serviceError(400, 'PASSWORD_TOO_SHORT', '密码必须为字符串');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return serviceError(400, 'PASSWORD_TOO_SHORT', `密码至少 ${PASSWORD_MIN_LENGTH} 个字符`);
  }
  if (password.length > PASSWORD_MAX_LENGTH || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) {
    return serviceError(400, 'PASSWORD_TOO_LONG', `密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符（UTF-8 不超过 72 字节）`);
  }
  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function verifyPassword(password, passwordHash) {
  if (!password || !passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

function toPublicUser(user, { forAdmin = false } = {}) {
  const base = {
    id: String(user._id ?? user.id ?? ''),
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword === true
  };
  if (!forAdmin) return base;
  return {
    ...base,
    active: user.active !== false,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt || null
  };
}

async function findForLogin(username) {
  return User.findOne({ username: normalizeUsername(username) })
    .select('+passwordHash')
    .lean();
}

async function markLogin(userId) {
  await User.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } });
}

async function listUsers() {
  const users = await User.find({}).sort({ createdAt: -1 }).lean();
  return users.map((user) => toPublicUser(user, { forAdmin: true }));
}

async function assertAdminWillRemain(targetUser) {
  // 只有「当前是启用 admin」且将被停用/降级时才需要检查
  if (targetUser.role !== 'admin' || targetUser.active === false) return;
  const activeAdminCount = await User.countDocuments({ role: 'admin', active: true });
  if (activeAdminCount <= 1) {
    throw serviceError(409, 'LAST_ADMIN_PROTECTED', '系统必须至少保留一个启用的管理员，操作被拒绝');
  }
}

async function createUser({ username, password, role = 'member', actorId = null }) {
  const normalized = normalizeUsername(username);
  const usernameError = validateUsername(normalized);
  if (usernameError) throw usernameError;
  const roleError = validateRole(role);
  if (roleError) throw roleError;
  const passwordError = validatePassword(password);
  if (passwordError) throw passwordError;

  const existing = await User.findOne({ username: normalized }).lean();
  if (existing) throw serviceError(409, 'USERNAME_TAKEN', '用户名已存在');

  const passwordHash = await hashPassword(password);
  let created;
  try {
    created = await User.create({
      username: normalized,
      passwordHash,
      role,
      active: true,
      mustChangePassword: true
    });
  } catch (error) {
    // 并发创建同名时由唯一索引兜底；对外统一 USERNAME_TAKEN（不泄漏 E11000 细节）
    if (isDuplicateKeyError(error)) throw serviceError(409, 'USERNAME_TAKEN', '用户名已存在');
    throw error;
  }
  logger.info('AUTH_USER_CREATED', {
    userId: String(created._id),
    username: created.username,
    role: created.role,
    actorId
  });
  return toPublicUser(created, { forAdmin: true });
}

async function updateUser({ targetUserId, patch = {}, actorId = null }) {
  const target = await User.findById(targetUserId).lean();
  if (!target) throw serviceError(404, 'USER_NOT_FOUND', '用户不存在');

  const updates = {};

  if (patch.username !== undefined) {
    const normalized = normalizeUsername(patch.username);
    const usernameError = validateUsername(normalized);
    if (usernameError) throw usernameError;
    if (normalized !== target.username) {
      const existing = await User.findOne({ username: normalized }).lean();
      if (existing && !areSameId(existing._id, target._id)) {
        throw serviceError(409, 'USERNAME_TAKEN', '用户名已存在');
      }
      updates.username = normalized;
    }
  }

  if (patch.role !== undefined) {
    const roleError = validateRole(patch.role);
    if (roleError) throw roleError;
    if (patch.role !== target.role) {
      if (patch.role !== 'admin') await assertAdminWillRemain(target);
      updates.role = patch.role;
    }
  }

  if (patch.active !== undefined) {
    const nextActive = patch.active === true;
    if (nextActive === false && areSameId(target._id, actorId)) {
      throw serviceError(409, 'CANNOT_DEACTIVATE_SELF', '不能停用自己的账号');
    }
    if (nextActive === false && target.active !== false) {
      await assertAdminWillRemain(target);
      updates.active = false;
    } else if (nextActive === true && target.active === false) {
      updates.active = true;
    }
  }

  if (Object.keys(updates).length === 0) {
    return toPublicUser(target, { forAdmin: true });
  }

  let updated;
  try {
    updated = await User.findByIdAndUpdate(target._id, { $set: updates }, { new: true }).lean();
  } catch (error) {
    if (isDuplicateKeyError(error)) throw serviceError(409, 'USERNAME_TAKEN', '用户名已存在');
    throw error;
  }
  if (updates.active === false) {
    await sessionService.destroyAllForUser(target._id);
  }
  logger.info('AUTH_USER_UPDATED', {
    userId: String(target._id),
    changes: Object.keys(updates),
    actorId
  });
  return toPublicUser(updated, { forAdmin: true });
}

async function changeOwnPassword({ userId, currentPassword, newPassword, currentSid = null }) {
  const passwordError = validatePassword(newPassword);
  if (passwordError) throw passwordError;

  const user = await User.findOne({ _id: userId }).select('+passwordHash').lean();
  if (!user) throw serviceError(404, 'USER_NOT_FOUND', '用户不存在');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw serviceError(400, 'INVALID_CURRENT_PASSWORD', '当前密码不正确');

  const passwordHash = await hashPassword(newPassword);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash, mustChangePassword: false } });
  // 改密后该账号其他会话全部失效，保留当前会话（FS §4.3）
  await sessionService.destroyAllForUser(user._id, { exceptSid: currentSid });
  logger.info('AUTH_PASSWORD_CHANGED', { userId: String(user._id) });
  return true;
}

async function resetPassword({ targetUserId, newPassword, actorId = null }) {
  if (areSameId(targetUserId, actorId)) {
    throw serviceError(409, 'SELF_RESET_FORBIDDEN', '不能重置自己的密码，请走「账户设置」自行修改');
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) throw passwordError;

  const target = await User.findById(targetUserId).lean();
  if (!target) throw serviceError(404, 'USER_NOT_FOUND', '用户不存在');

  const passwordHash = await hashPassword(newPassword);
  await User.updateOne(
    { _id: target._id },
    { $set: { passwordHash, mustChangePassword: true } }
  );
  await sessionService.destroyAllForUser(target._id);
  logger.info('AUTH_PASSWORD_RESET', { userId: String(target._id), actorId });
  return true;
}

async function changeOwnUsername({ userId, username }) {
  const normalized = normalizeUsername(username);
  const usernameError = validateUsername(normalized);
  if (usernameError) throw usernameError;

  const existing = await User.findOne({ username: normalized }).lean();
  if (existing && !areSameId(existing._id, userId)) {
    throw serviceError(409, 'USERNAME_TAKEN', '用户名已存在');
  }
  let updated;
  try {
    updated = await User.findByIdAndUpdate(
      userId,
      { $set: { username: normalized } },
      { new: true }
    ).lean();
  } catch (error) {
    if (isDuplicateKeyError(error)) throw serviceError(409, 'USERNAME_TAKEN', '用户名已存在');
    throw error;
  }
  if (!updated) throw serviceError(404, 'USER_NOT_FOUND', '用户不存在');
  logger.info('AUTH_PROFILE_UPDATED', { userId: String(updated._id) });
  return toPublicUser(updated);
}

/**
 * 首次部署 seed（FS §4.1）：users 为空时创建 admin/admin，必须改密；已有用户则跳过。
 * 日志只记用户名，不打印密码。
 */
async function ensureDefaultAdmin() {
  const count = await User.countDocuments({});
  if (count > 0) return null;

  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  let created;
  try {
    created = await User.create({
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash,
      role: 'admin',
      active: true,
      mustChangePassword: true
    });
  } catch (error) {
    // 并发启动时另一个进程已 seed：忽略唯一键冲突
    if (error && error.code === 11000) return null;
    throw error;
  }
  logger.info('AUTH_SEEDED_DEFAULT_ADMIN', { username: DEFAULT_ADMIN_USERNAME });
  return toPublicUser(created, { forAdmin: true });
}

module.exports = {
  BCRYPT_COST,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  DEFAULT_ADMIN_USERNAME,
  DEFAULT_ADMIN_PASSWORD,
  DUMMY_PASSWORD_HASH,
  normalizeUsername,
  validateUsername,
  validateRole,
  validatePassword,
  hashPassword,
  verifyPassword,
  toPublicUser,
  findForLogin,
  markLogin,
  listUsers,
  createUser,
  updateUser,
  changeOwnPassword,
  resetPassword,
  changeOwnUsername,
  ensureDefaultAdmin
};
