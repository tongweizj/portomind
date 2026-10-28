// server/test/helpers/auth.js
//
// TASK-058 测试辅助：
//   1) installAdminSession()/installSessionStub()：只 monkey-patch **会话查询**（ED-5），
//      真实 requireAuth/requireAdmin 闸门照常执行；
//   2) stubAuthModels(world)：User / Session 的内存替身（TASK-058 新增测试用），
//      让 user.service / session.service 的真实逻辑可以在无 Mongo 的情况下跑通。
//
// ⚠️ 禁止在此文件引入"跳过认证"的开关：ED-5 / FS R3 明确禁止以环境变量绕过闸门（等于没测）。

const crypto = require('crypto');
const User = require('@portomind/shared/models/user');
const Session = require('@portomind/shared/models/session');
const sessionService = require('@portomind/shared/services/session.service');

const TEST_SID = 'test-session-sid';

const ADMIN_USER = {
  _id: '64b0000000000000000000aa',
  username: 'admin',
  role: 'admin',
  active: true,
  mustChangePassword: false
};

const MEMBER_USER = {
  _id: '64b0000000000000000000bb',
  username: 'member',
  role: 'member',
  active: true,
  mustChangePassword: false
};

let currentUser = ADMIN_USER;
let installed = false;
const originals = new Map();

function installSessionStub() {
  if (installed) return;
  originals.set('resolve', sessionService.resolve);
  originals.set('touch', sessionService.touch);

  // 只 stub「会话查询」与「lastSeenAt 更新」（ED-5）；
  // destroySession / destroyAllForUser 保持真实实现（走内存 Session 替身），
  // 这样"停用/登出后会话被删除"仍是被真实断言的行为。
  sessionService.resolve = async (sid) => (
    sid && currentUser ? { session: { sid, userId: currentUser._id }, user: currentUser } : null
  );
  sessionService.touch = () => {};
  installed = true;
}

function uninstallSessionStub() {
  if (!installed) return;
  sessionService.resolve = originals.get('resolve');
  sessionService.touch = originals.get('touch');
  installed = false;
}

function setSessionUser(user) {
  currentUser = user;
}

function installAdminSession(user = ADMIN_USER) {
  setSessionUser(user);
  installSessionStub();
  return user;
}

function cookieHeader(sid = TEST_SID) {
  return `pm_sid=${sid}`;
}

function authHeaders(extra = {}) {
  return { cookie: cookieHeader(), ...extra };
}

// ---------------------------------------------------------------------------
// User / Session 内存替身
// ---------------------------------------------------------------------------

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (Array.isArray(expected)) return expected.map(String).includes(String(doc[key]));
    if (expected && typeof expected === 'object') {
      if ('$ne' in expected) return String(doc[key]) !== String(expected.$ne);
      if ('$in' in expected) return expected.$in.map(String).includes(String(doc[key]));
      if ('$gte' in expected) return new Date(doc[key]) >= new Date(expected.$gte);
      return true;
    }
    return String(doc[key]) === String(expected);
  });
}

function applyUpdate(doc, update = {}) {
  if (update.$set) Object.assign(doc, update.$set);
  return doc;
}

function chainable(compute) {
  return {
    select() { return this; },
    sort() { return this; },
    lean: async () => compute()
  };
}

/**
 * 用内存世界替换 User / Session 静态方法；返回 restore()。
 *
 * world = {
 *   users: [{ _id, username, passwordHash, role, active, mustChangePassword, lastLoginAt, createdAt }],
 *   sessions: [{ sid, userId, createdAt, lastSeenAt }]
 * }
 */
function stubAuthModels(world = {}) {
  const users = world.users || [];
  const sessions = world.sessions || [];
  let sequence = 0;
  const nextId = () => {
    sequence += 1;
    return crypto.createHash('sha1').update(`stub-${sequence}`).digest('hex').slice(0, 24);
  };

  const originalsOf = new Map();
  for (const Model of [User, Session]) {
    originalsOf.set(Model, {
      find: Model.find,
      findOne: Model.findOne,
      findById: Model.findById,
      findByIdAndUpdate: Model.findByIdAndUpdate,
      create: Model.create,
      updateOne: Model.updateOne,
      deleteOne: Model.deleteOne,
      deleteMany: Model.deleteMany,
      countDocuments: Model.countDocuments
    });
  }

  const pickUser = (filter) => users.find((doc) => matches(doc, filter)) || null;
  const pickSession = (filter) => sessions.find((doc) => matches(doc, filter)) || null;

  User.findOne = (filter) => chainable(() => pickUser(filter));
  User.find = (filter = {}) => {
    const query = {
      sortSpec: null,
      select() { return this; },
      sort(spec) { this.sortSpec = spec; return this; },
      lean: async () => {
        const list = users.filter((doc) => matches(doc, filter));
        if (query.sortSpec && query.sortSpec.createdAt === -1) {
          list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        return list;
      }
    };
    return query;
  };
  User.findById = (id) => chainable(() => users.find((doc) => String(doc._id) === String(id)) || null);
  User.findByIdAndUpdate = (id, update) => chainable(() => {
    const doc = users.find((item) => String(item._id) === String(id));
    if (!doc) return null;
    applyUpdate(doc, update);
    return doc;
  });
  User.create = async (doc) => {
    const created = { _id: nextId(), active: true, mustChangePassword: false, role: 'member', createdAt: new Date(), ...doc };
    users.push(created);
    return created;
  };
  User.updateOne = async (filter, update) => {
    const doc = pickUser(filter);
    if (doc) applyUpdate(doc, update);
    return { acknowledged: true, modifiedCount: doc ? 1 : 0 };
  };
  User.countDocuments = async (filter = {}) => users.filter((doc) => matches(doc, filter)).length;

  Session.create = async (doc) => {
    const created = { createdAt: new Date(), ...doc };
    sessions.push(created);
    return created;
  };
  Session.findOne = (filter) => chainable(() => pickSession(filter));
  Session.deleteOne = async (filter) => {
    const index = sessions.findIndex((doc) => matches(doc, filter));
    if (index >= 0) sessions.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };
  Session.deleteMany = async (filter = {}) => {
    const keep = sessions.filter((doc) => !matches(doc, filter));
    const deletedCount = sessions.length - keep.length;
    sessions.length = 0;
    sessions.push(...keep);
    return { deletedCount };
  };
  Session.updateOne = async () => ({ acknowledged: true });

  return function restore() {
    for (const [Model, original] of originalsOf) {
      for (const [method, fn] of Object.entries(original)) Model[method] = fn;
    }
  };
}

module.exports = {
  ADMIN_USER,
  MEMBER_USER,
  TEST_SID,
  installSessionStub,
  uninstallSessionStub,
  installAdminSession,
  setSessionUser,
  cookieHeader,
  authHeaders,
  stubAuthModels
};
