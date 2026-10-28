// shared/models/user.js
//
// TASK-058（账号与访问控制 U1）：用户模型。
// 单租户多账号：所有账号共享同一份家庭数据，本模型只承载「谁在用系统」。
// 业务模型零改动（不加 ownerId / tenantId —— FS NG2）。

const mongoose = require('mongoose');

const USER_ROLES = Object.freeze(['admin', 'member']);
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,31}$/;

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [3, 'username must be at least 3 characters'],
    maxlength: [32, 'username cannot exceed 32 characters'],
    match: [USERNAME_PATTERN, 'username must match ^[a-z0-9][a-z0-9_.-]{2,31}$']
  },
  // 默认不查出：只有登录校验 / 改密 / 重置需要显式 select('+passwordHash')
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: USER_ROLES,
    default: 'member'
  },
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: { type: Date, default: null }
}, {
  versionKey: false,
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
module.exports.USER_ROLES = USER_ROLES;
module.exports.USERNAME_PATTERN = USERNAME_PATTERN;
