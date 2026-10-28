// shared/services/session.service.js
//
// TASK-058（U1）：服务端会话的唯一实现。
// 契约：sid 为 32 字节随机数的 base64url；会话绝对过期（ED-3），TTL 索引在 model 层；
// resolve(sid) 返回 { session, user } | null —— 中间件层负责 active / mustChangePassword 判定。
//
// 测试约定（ED-5）：自动化测试只允许 monkey-patch 本模块的 resolve，
// 闸门本身（401/403/角色）必须由真实中间件产生。

const crypto = require('crypto');
const Session = require('../models/session');
const User = require('../models/user');
const { SESSION_TTL_SECONDS } = require('../models/session');

const SESSION_COOKIE_NAME = 'pm_sid';
const SID_BYTES = 32;

function generateSid() {
  return crypto.randomBytes(SID_BYTES).toString('base64url');
}

function isSecureCookie() {
  if (process.env.COOKIE_SECURE !== undefined) {
    return String(process.env.COOKIE_SECURE).toLowerCase() === 'true';
  }
  return process.env.NODE_ENV === 'production';
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isSecureCookie(),
    maxAge: SESSION_TTL_SECONDS * 1000
  };
}

async function createSession({ userId, ip = null, ua = null }) {
  const sid = generateSid();
  await Session.create({
    sid,
    userId,
    ip: ip ? String(ip).slice(0, 100) : null,
    ua: ua ? String(ua).slice(0, 200) : null,
    lastSeenAt: new Date()
  });
  return sid;
}

async function resolve(sid) {
  if (!sid) return null;
  const session = await Session.findOne({ sid }).lean();
  if (!session) return null;
  const user = await User.findById(session.userId).lean();
  if (!user) return null;
  return { session, user };
}

async function destroySession(sid) {
  if (!sid) return;
  await Session.deleteOne({ sid });
}

/**
 * 删除某用户全部会话（停用 / 重置密码 / 改密踢其他设备）。
 * @param {*} userId
 * @param {{exceptSid?: string|null}} [options] 保留当前会话（本人改密时用）
 */
async function destroyAllForUser(userId, { exceptSid = null } = {}) {
  const filter = { userId };
  if (exceptSid) filter.sid = { $ne: exceptSid };
  await Session.deleteMany(filter);
}

/** 非阻塞更新 lastSeenAt（仅审计，不续期 —— ED-3） */
function touch(sid) {
  if (!sid) return;
  Session.updateOne({ sid }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  generateSid,
  cookieOptions,
  isSecureCookie,
  createSession,
  resolve,
  destroySession,
  destroyAllForUser,
  touch
};
