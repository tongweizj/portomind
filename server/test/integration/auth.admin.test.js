// server/test/integration/auth.admin.test.js
//
// TASK-058 U1 验收测试（二）：用户管理端点 + user.service 规则
// （新建/停用/启用/改角色/重置密码/自助改用户名/唯一 admin 不变量/密码与用户名校验/默认 seed）。
// 测试策略同 auth.gate.test.js：真实中间件 + 内存模型替身；只 stub 会话查询（ED-5）。

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'portomind-auth-admin-logs');

const bcrypt = require('bcryptjs');

const app = require('../../app');
const userService = require('@portomind/shared/services/user.service');
const loginThrottle = require('../../middleware/loginThrottle');
const {
  ADMIN_USER,
  MEMBER_USER,
  TEST_SID,
  installAdminSession,
  uninstallSessionStub,
  setSessionUser,
  cookieHeader,
  stubAuthModels
} = require('../helpers/auth');

const ADMIN_HASH = bcrypt.hashSync('admin', 10);
const MEMBER_HASH = bcrypt.hashSync('memberpass', 10);

function baseWorld() {
  const admin = {
    _id: ADMIN_USER._id,
    username: 'admin',
    passwordHash: ADMIN_HASH,
    role: 'admin',
    active: true,
    mustChangePassword: false,
    createdAt: new Date('2026-10-01T00:00:00.000Z')
  };
  const member = {
    _id: MEMBER_USER._id,
    username: 'member',
    passwordHash: MEMBER_HASH,
    role: 'member',
    active: true,
    mustChangePassword: false,
    createdAt: new Date('2026-10-02T00:00:00.000Z')
  };
  return { admin, member, world: { users: [admin, member], sessions: [] } };
}

let server;
let baseUrl;
let restoreModels = () => {};

function useWorld(world, currentUser) {
  restoreModels();
  restoreModels = stubAuthModels(world);
  installAdminSession(currentUser || world.users.find((user) => user.role === 'admin') || ADMIN_USER);
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.afterEach(() => {
  restoreModels();
  restoreModels = () => {};
  uninstallSessionStub();
  setSessionUser(ADMIN_USER);
  loginThrottle.resetAll();
});

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { status: response.status, body };
}

const asAdmin = () => ({ cookie: cookieHeader() });

// ---------------------------------------------------------------------------
// 用户管理端点
// ---------------------------------------------------------------------------

test('A1 admin 新建用户 → 201 + 需改密；新用户首次登录被要求改密', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const created = await request('/api/users', {
    method: 'POST',
    headers: asAdmin(),
    body: JSON.stringify({ username: 'Alice', password: 'initial-pass-1', role: 'member' })
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.user.username, 'alice'); // ED-4：存小写
  assert.equal(created.body.data.user.mustChangePassword, true);
  assert.equal(world.users.length, 3);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'ALICE', password: 'initial-pass-1' }) // 登录也归一化
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.mustChangePassword, true);

  const createdUser = world.users.find((user) => user.username === 'alice');
  setSessionUser(createdUser);
  const gated = await request('/api/valuations', { headers: { cookie: cookieHeader() } });
  assert.equal(gated.status, 403);
  assert.equal(gated.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('A2 新建重名用户 → 409 USERNAME_TAKEN', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const result = await request('/api/users', {
    method: 'POST',
    headers: asAdmin(),
    body: JSON.stringify({ username: 'admin', password: 'initial-pass-1', role: 'member' })
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'USERNAME_TAKEN');
});

test('A3 新建用户密码规则：过短 400 PASSWORD_TOO_SHORT；超 72 字符 400 PASSWORD_TOO_LONG；用户名非法 400', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const short = await request('/api/users', {
    method: 'POST', headers: asAdmin(),
    body: JSON.stringify({ username: 'shortpw', password: '1234567', role: 'member' })
  });
  assert.equal(short.status, 400);
  assert.equal(short.body.code, 'PASSWORD_TOO_SHORT');

  const long = await request('/api/users', {
    method: 'POST', headers: asAdmin(),
    body: JSON.stringify({ username: 'longpw', password: 'x'.repeat(73), role: 'member' })
  });
  assert.equal(long.status, 400);
  assert.equal(long.body.code, 'PASSWORD_TOO_LONG');

  const badName = await request('/api/users', {
    method: 'POST', headers: asAdmin(),
    body: JSON.stringify({ username: 'A bad name!', password: 'initial-pass-1', role: 'member' })
  });
  assert.equal(badName.status, 400);
  assert.equal(badName.body.code, 'INVALID_USERNAME');
});

test('A4 用户列表不返回 passwordHash；按创建时间倒序', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const result = await request('/api/users', { headers: asAdmin() });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.items.length, 2);
  for (const item of result.body.data.items) {
    assert.equal(item.passwordHash, undefined);
    assert.ok('active' in item);
  }
  assert.equal(result.body.data.items[0].username, 'member'); // 10-02 > 10-01
});

test('A5 admin 重置他人密码 → mustChangePassword=true 且该用户会话全删', async () => {
  const { member, world } = baseWorld();
  world.sessions = [{ sid: 'member-device', userId: member._id }];
  useWorld(world);

  const result = await request(`/api/users/${member._id}/password`, {
    method: 'POST',
    headers: asAdmin(),
    body: JSON.stringify({ newPassword: 'reset-pass-123' })
  });

  assert.equal(result.status, 200);
  assert.equal(member.mustChangePassword, true);
  assert.equal(world.sessions.length, 0);
});

test('A6 admin 重置自己密码 → 409 SELF_RESET_FORBIDDEN（D9）', async () => {
  const { admin, world } = baseWorld();
  useWorld(world, admin);

  const result = await request(`/api/users/${admin._id}/password`, {
    method: 'POST',
    headers: asAdmin(),
    body: JSON.stringify({ newPassword: 'reset-pass-123' })
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'SELF_RESET_FORBIDDEN');
});

test('A7 停用/启用用户：active 变化，停用时现存会话立即删除', async () => {
  const { member, world } = baseWorld();
  world.sessions = [{ sid: TEST_SID, userId: member._id }];
  useWorld(world);

  const disabled = await request(`/api/users/${member._id}`, {
    method: 'PATCH',
    headers: asAdmin(),
    body: JSON.stringify({ active: false })
  });
  assert.equal(disabled.status, 200);
  assert.equal(member.active, false);
  assert.equal(world.sessions.length, 0);

  const enabled = await request(`/api/users/${member._id}`, {
    method: 'PATCH',
    headers: asAdmin(),
    body: JSON.stringify({ active: true })
  });
  assert.equal(enabled.status, 200);
  assert.equal(member.active, true);
});

test('A8 改角色：member → admin 生效；唯一 admin 自我降级被拒（G6 已覆盖），两个 admin 时降级他人成功', async () => {
  const { admin, member, world } = baseWorld();
  const admin2 = {
    _id: '64b0000000000000000000cc',
    username: 'admin2',
    passwordHash: ADMIN_HASH,
    role: 'admin',
    active: true,
    mustChangePassword: false,
    createdAt: new Date('2026-10-03T00:00:00.000Z')
  };
  world.users.push(admin2);
  useWorld(world, admin);

  const promoted = await request(`/api/users/${member._id}`, {
    method: 'PATCH', headers: asAdmin(), body: JSON.stringify({ role: 'admin' })
  });
  assert.equal(promoted.status, 200);
  assert.equal(member.role, 'admin');

  const demoted = await request(`/api/users/${admin2._id}`, {
    method: 'PATCH', headers: asAdmin(), body: JSON.stringify({ role: 'member' })
  });
  assert.equal(demoted.status, 200);
  assert.equal(admin2.role, 'member');
});

test('A9 改用户名重复 → 409 USERNAME_TAKEN；合法改用户名 → 200', async () => {
  const { member, world } = baseWorld();
  useWorld(world);

  const taken = await request(`/api/users/${member._id}`, {
    method: 'PATCH', headers: asAdmin(), body: JSON.stringify({ username: 'admin' })
  });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, 'USERNAME_TAKEN');

  const renamed = await request(`/api/users/${member._id}`, {
    method: 'PATCH', headers: asAdmin(), body: JSON.stringify({ username: 'member-renamed' })
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.user.username, 'member-renamed');
});

test('A10 用户 ID 非法 → 400 INVALID_ID（不 500）', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const result = await request('/api/users/not-an-object-id', {
    method: 'PATCH', headers: asAdmin(), body: JSON.stringify({ active: false })
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'INVALID_ID');
});

// ---------------------------------------------------------------------------
// 自助端点
// ---------------------------------------------------------------------------

test('A11 自助改用户名：成功返回新用户名；重名 409', async () => {
  const { admin, member, world } = baseWorld();
  useWorld(world, member);

  const renamed = await request('/api/auth/profile', {
    method: 'PATCH', headers: asAdmin(), body: JSON.stringify({ username: 'member-new' })
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.user.username, 'member-new');

  setSessionUser(admin);
  const taken = await request('/api/auth/profile', {
    method: 'PATCH', headers: asAdmin(), body: JSON.stringify({ username: 'member-new' })
  });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, 'USERNAME_TAKEN');
});

// ---------------------------------------------------------------------------
// service 级规则（不经过 HTTP）
// ---------------------------------------------------------------------------

test('A12 密码/用户名规则边界：8 位通过、7 位拒绝、72 位通过、73 位拒绝、用户名小写归一', () => {
  assert.equal(userService.validatePassword('12345678'), null);
  assert.equal(userService.validatePassword('1234567').code, 'PASSWORD_TOO_SHORT');
  assert.equal(userService.validatePassword('x'.repeat(72)), null);
  assert.equal(userService.validatePassword('x'.repeat(73)).code, 'PASSWORD_TOO_LONG');
  assert.equal(userService.normalizeUsername('  Max.User '), 'max.user');
  assert.equal(userService.validateUsername('max.user'), null);
  assert.equal(userService.validateUsername('Max').code, 'INVALID_USERNAME');
  assert.equal(userService.validateUsername('a').code, 'INVALID_USERNAME');
});

test('A13 ensureDefaultAdmin：空库 seed admin/admin（必须改密）；非空库不重复 seed', async () => {
  const emptyWorld = { users: [], sessions: [] };
  restoreModels();
  restoreModels = stubAuthModels(emptyWorld);

  const seeded = await userService.ensureDefaultAdmin();
  assert.ok(seeded);
  assert.equal(emptyWorld.users.length, 1);
  assert.equal(emptyWorld.users[0].username, 'admin');
  assert.equal(emptyWorld.users[0].role, 'admin');
  assert.equal(emptyWorld.users[0].mustChangePassword, true);
  assert.equal(await userService.verifyPassword('admin', emptyWorld.users[0].passwordHash), true);

  const again = await userService.ensureDefaultAdmin();
  assert.equal(again, null);
  assert.equal(emptyWorld.users.length, 1);
});

// ---------------------------------------------------------------------------
// Reviewer 整改回归
// ---------------------------------------------------------------------------

test('A14 用大写 ObjectId 重置自己密码同样被拒（Reviewer MINOR：Id 语义比较）', async () => {
  const { admin, world } = baseWorld();
  useWorld(world, admin);

  const upperId = admin._id.toUpperCase();
  assert.notEqual(upperId, admin._id); // 确保确实是大小写变体
  const result = await request(`/api/users/${upperId}/password`, {
    method: 'POST',
    headers: asAdmin(),
    body: JSON.stringify({ newPassword: 'reset-pass-123' })
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'SELF_RESET_FORBIDDEN');
});

test('A15 active 必须是布尔值：字符串 "true" → 400 INVALID_INPUT（不静默停用）', async () => {
  const { member, world } = baseWorld();
  useWorld(world);

  const result = await request(`/api/users/${member._id}`, {
    method: 'PATCH',
    headers: asAdmin(),
    body: JSON.stringify({ active: 'true' })
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'INVALID_INPUT');
  assert.equal(member.active, true);
});

test('A16 并发创建同名时 E11000 映射为 409 USERNAME_TAKEN（不泄漏驱动错误）', async () => {
  const User = require('@portomind/shared/models/user');
  const { world } = baseWorld();
  useWorld(world);

  const originalCreate = User.create;
  User.create = async () => {
    const error = new Error('E11000 duplicate key error collection: portomind.users index: username_1');
    error.code = 11000;
    throw error;
  };
  try {
    await assert.rejects(
      () => userService.createUser({ username: 'race-user', password: 'initial-pass-1' }),
      (error) => error.status === 409 && error.code === 'USERNAME_TAKEN'
    );
  } finally {
    User.create = originalCreate;
  }
});
