// shared/models/session.js
//
// TASK-058（账号与访问控制 U1）：服务端会话模型（存 MongoDB）。
// 会话**绝对过期**（ED-3）：TTL 索引落在 createdAt 上，lastSeenAt 仅审计、不续期。
// 这是全仓第一个 TTL 集合（补 `expireAfterSeconds` 缺失的债，ADR-001）。

const mongoose = require('mongoose');

const DEFAULT_SESSION_TTL_DAYS = 7;

function resolveTtlDays() {
  const raw = Number(process.env.SESSION_TTL_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SESSION_TTL_DAYS;
  return Math.min(Math.floor(raw), 365);
}

const SESSION_TTL_DAYS = resolveTtlDays();
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

const SessionSchema = new mongoose.Schema({
  // 32 字节随机数的 base64url 表示（43 字符）
  sid: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // expires = 绝对过期（TTL 索引），不做滑动续期（ED-3 / FS §8）
  createdAt: {
    type: Date,
    default: Date.now,
    expires: SESSION_TTL_SECONDS
  },
  lastSeenAt: { type: Date, default: Date.now },
  ip: { type: String, default: null },
  ua: { type: String, default: null, maxlength: 200 }
}, {
  versionKey: false
});

const Session = mongoose.model('Session', SessionSchema);

module.exports = Session;
module.exports.SESSION_TTL_DAYS = SESSION_TTL_DAYS;
module.exports.SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
