// server/test/integration/auth.gate.test.js
//
// TASK-058 U1 验收测试（一）：准入闸门 / 登录 / 强制改密 / 会话 / 限速 / CORS / 启动 fail-fast。
// 测试策略（ED-5）：只 stub「会话查询」（sessionService.resolve 等）与 User/Session 模型，
// **真实 requireAuth / requireAdmin 中间件照常执行**，不允许任何跳过闸门的开关。

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'portomind-auth-gate-logs');

const bcrypt = require('bcryptjs');

const app = require('../../app');
const loginThrottle = require('../../middleware/loginThrottle');
const valuationService = require('@portomind/shared/services/valuation.service');
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

function baseWorld(overrides = {}) {
  const admin = {
    _id: ADMIN_USER._id,
    username: 'admin',
    passwordHash: ADMIN_HASH,
    role: 'admin',
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z')
  };
  const member = {
    _id: MEMBER_USER._id,
    username: 'member',
    passwordHash: MEMBER_HASH,
    role: 'member',
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date('2026-10-02T00:00:00.000Z')
  };
  return { admin, member, world: { users: [admin, member], sessions: [], ...overrides } };
}

let server;
let baseUrl;
let restoreModels = () => {};
const originalGetLatestValuations = valuationService.getLatestValuations;
valuationService.getLatestValuations = async () => [];

function useWorld(world, currentUser) {
  restoreModels();
  restoreModels = stubAuthModels(world);
  installAdminSession(currentUser || world.users[0] || ADMIN_USER);
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  valuationService.getLatestValuations = originalGetLatestValuations;
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
  const setCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return { status: response.status, body, headers: response.headers, setCookie };
}

function cookieFrom(setCookie) {
  const raw = setCookie[0];
  return raw.split(';')[0];
}

// ---------------------------------------------------------------------------
// 闸门
// ---------------------------------------------------------------------------

test('G1 无 cookie 访问业务端点 → 401 UNAUTHENTICATED（不是 200/500）', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const result = await request('/api/portfolios');

  assert.equal(result.status, 401);
  assert.equal(result.body.success, false);
  assert.equal(result.body.code, 'UNAUTHENTICATED');
});

test('G2 admin/admin 登录 → 200 + Set-Cookie；改密前业务端点 403（改密后 200 见 G3）', async () => {
  const { admin, world } = baseWorld();
  admin.mustChangePassword = true; // 首部署 seed 的形态
  useWorld(world);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.success, true);
  assert.equal(login.body.data.user.mustChangePassword, true);
  assert.equal(login.setCookie.length, 1);
  assert.match(login.setCookie[0], /pm_sid=/);
  assert.match(login.setCookie[0], /HttpOnly/i);
  assert.match(login.setCookie[0], /SameSite=Lax/i);
  assert.equal(world.sessions.length, 1);

  const cookie = cookieFrom(login.setCookie);
  setSessionUser({ ...admin, mustChangePassword: true });

  const gated = await request('/api/portfolios', { headers: { cookie } });
  assert.equal(gated.status, 403);
  assert.equal(gated.body.code, 'PASSWORD_CHANGE_REQUIRED');

  const sessionProbe = await request('/api/auth/session', { headers: { cookie } });
  assert.equal(sessionProbe.status, 200);
  assert.equal(sessionProbe.body.data.authenticated, true);
});

test('G3 change-password 校验当前密码、改密后 mustChangePassword=false 且可访问业务端点', async () => {
  const { admin, world } = baseWorld();
  admin.mustChangePassword = true;
  world.sessions = [
    { sid: TEST_SID, userId: admin._id },
    { sid: 'other-device-sid', userId: admin._id }
  ];
  useWorld(world, { ...admin, mustChangePassword: true });
  const cookie = cookieHeader();

  const wrong = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'newpassword1' })
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.code, 'INVALID_CURRENT_PASSWORD');

  const changed = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ currentPassword: 'admin', newPassword: 'newpassword1' })
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.ok, true);
  assert.equal(admin.mustChangePassword, false);
  // 其他会话被删除，但保留当前会话（FS §4.3）
  assert.equal(world.sessions.length, 1);
  assert.equal(world.sessions[0].sid, TEST_SID);

  setSessionUser({ ...admin, mustChangePassword: false });
  const afterChange = await request('/api/valuations', { headers: { cookie } });
  assert.equal(afterChange.status, 200);
});

test('G4 角色判定：member 访问 /api/users → 403 FORBIDDEN；admin → 200', async () => {
  const { admin, member, world } = baseWorld();
  useWorld(world, member);

  const forbidden = await request('/api/users', { headers: { cookie: cookieHeader() } });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.code, 'FORBIDDEN');

  setSessionUser(admin);
  const allowed = await request('/api/users', { headers: { cookie: cookieHeader() } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.data.items.length, 2);
});

test('G5 停用用户的旧 cookie 立即 401，并删除该会话', async () => {
  const { member, world } = baseWorld();
  world.sessions = [{ sid: TEST_SID, userId: member._id }];
  useWorld(world, { ...member, active: false });

  const result = await request('/api/valuations', { headers: { cookie: cookieHeader() } });

  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'ACCOUNT_DISABLED');
  assert.equal(world.sessions.length, 0);
});

test('G6 唯一启用 admin 自我降级 → 409 LAST_ADMIN_PROTECTED，角色不变', async () => {
  const { admin } = baseWorld();
  const world = { users: [admin], sessions: [] };
  useWorld(world, admin);

  const result = await request(`/api/users/${admin._id}`, {
    method: 'PATCH',
    headers: { cookie: cookieHeader() },
    body: JSON.stringify({ role: 'member' })
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'LAST_ADMIN_PROTECTED');
  assert.equal(world.users[0].role, 'admin');
});

test('G6b 管理员停用自己 → 409 CANNOT_DEACTIVATE_SELF，状态不变', async () => {
  const { admin, world } = baseWorld();
  // 另一个管理员在库（保证不是 LAST_ADMIN_PROTECTED 拦截）
  world.users.push({
    _id: '64b0000000000000000000cc',
    username: 'admin2',
    passwordHash: ADMIN_HASH,
    role: 'admin',
    active: true,
    mustChangePassword: false
  });
  useWorld(world, admin);

  const result = await request(`/api/users/${admin._id}`, {
    method: 'PATCH',
    headers: { cookie: cookieHeader() },
    body: JSON.stringify({ active: false })
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'CANNOT_DEACTIVATE_SELF');
  assert.equal(world.users.find((user) => user.username === 'admin').active, true);
});

test('G7 连续 5 次错密后第 6 次即使密码正确 → 429 ACCOUNT_LOCKED', async () => {
  const { world } = baseWorld();
  useWorld(world);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failed = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' })
    });
    assert.equal(failed.status, 401, `第 ${attempt} 次失败应为 401`);
  }

  const locked = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
  assert.ok(locked.body.details.retryAfterSeconds > 0);
});

test('G8 登出删除库中会话（不是仅清前端 cookie）；无会话也返回 200', async () => {
  const { admin, world } = baseWorld();
  world.sessions = [{ sid: TEST_SID, userId: admin._id }];
  useWorld(world, admin);

  const logout = await request('/api/auth/logout', {
    method: 'POST',
    headers: { cookie: cookieHeader() }
  });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.data.ok, true);
  assert.equal(world.sessions.length, 0);

  const idempotent = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(idempotent.status, 200);
});

test('G9 CORS：白名单来源放行、跨源被拒', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const blocked = await request('/api/auth/session', {
    headers: { Origin: 'http://evil.test' }
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.success, false);

  const allowed = await request('/api/auth/session', {
    headers: { Origin: 'http://localhost:5173' }
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
});

test('G10 生产未配置 CORS_ORIGINS → 启动 fail-fast', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOrigins = process.env.CORS_ORIGINS;
  const appPath = require.resolve('../../app');

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;
    delete require.cache[appPath];
    assert.throws(() => require('../../app'), /CORS_ORIGINS is required in production/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousOrigins;
    delete require.cache[appPath];
    require('../../app'); // 恢复开发态 app，避免影响后续测试
  }
});

// ---------------------------------------------------------------------------
// Reviewer 整改回归（MAJOR-1 限速 / MAJOR-2 反代 / U1-R4 cookie / CSRF）
// ---------------------------------------------------------------------------

test('G11 限速窗口与有界清扫：跨窗口失败不累计、Map 不会无限增长（MAJOR-1）', () => {
  loginThrottle.resetAll();
  const key = loginThrottle.keyOf('1.2.3.4', 'somebody');
  const t0 = 1_000_000_000_000;

  // 窗口内 4 次失败 → 不锁定
  for (let index = 0; index < 4; index += 1) loginThrottle.recordFailure(key, t0);
  assert.equal(loginThrottle.lockedUntil(key, t0), 0);

  // 距首次失败超过窗口 → 计数重置，再失败 4 次仍不锁定
  const afterWindow = t0 + loginThrottle.WINDOW_MS + 1;
  for (let index = 0; index < 4; index += 1) loginThrottle.recordFailure(key, afterWindow);
  assert.equal(loginThrottle.lockedUntil(key, afterWindow), 0);

  // 第 5 次 → 锁定，且锁定时长 ≥ 15 分钟
  loginThrottle.recordFailure(key, afterWindow);
  const until = loginThrottle.lockedUntil(key, afterWindow);
  assert.ok(until >= afterWindow + loginThrottle.LOCK_MS - 1);
  assert.equal(loginThrottle.lockedUntil(key, until + 1), 0); // 锁到期后条目被清理

  // Map 有界：注入超过上限的 key 后不会继续增长
  loginThrottle.resetAll();
  for (let index = 0; index < loginThrottle.MAX_ENTRIES + 200; index += 1) {
    loginThrottle.recordFailure(`bulk-${index}`, t0);
  }
  assert.ok(loginThrottle.size() <= loginThrottle.MAX_ENTRIES, `size=${loginThrottle.size()}`);

  // 活跃锁定不得被清扫洪泛驱逐（Reviewer N-1）
  loginThrottle.resetAll();
  for (let index = 0; index < loginThrottle.MAX_ATTEMPTS; index += 1) {
    loginThrottle.recordFailure('victim', t0);
  }
  const victimUntil = loginThrottle.lockedUntil('victim', t0);
  assert.ok(victimUntil > t0, 'victim 应已锁定');
  for (let index = 0; index < loginThrottle.MAX_ENTRIES + 200; index += 1) {
    loginThrottle.recordFailure(`flood-${index}`, t0);
  }
  assert.equal(loginThrottle.lockedUntil('victim', t0), victimUntil, '活跃锁定不得被驱逐');
  loginThrottle.resetAll();
});

test('G12 cookie 属性与 Secure 规则（U1-R4）：生产 Secure、COOKIE_SECURE 可覆盖', () => {
  const sessionService = require('@portomind/shared/services/session.service');
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCookieSecure = process.env.COOKIE_SECURE;

  try {
    delete process.env.NODE_ENV;
    delete process.env.COOKIE_SECURE;

    let options = sessionService.cookieOptions();
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.path, '/');
    assert.equal(options.secure, false);
    assert.equal(options.maxAge, sessionService.SESSION_TTL_SECONDS * 1000);

    process.env.NODE_ENV = 'production';
    options = sessionService.cookieOptions();
    assert.equal(options.secure, true);

    process.env.COOKIE_SECURE = 'false';
    assert.equal(sessionService.cookieOptions().secure, false);

    delete process.env.NODE_ENV;
    process.env.COOKIE_SECURE = 'true';
    assert.equal(sessionService.cookieOptions().secure, true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousCookieSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previousCookieSecure;
  }
});

test('G13 TRUST_PROXY 生效，反代后 req.ip 不再恒为代理地址（MAJOR-2）', () => {
  const previousTrustProxy = process.env.TRUST_PROXY;
  const appPath = require.resolve('../../app');

  try {
    process.env.TRUST_PROXY = '1';
    delete require.cache[appPath];
    const freshApp = require('../../app');
    assert.equal(freshApp.get('trust proxy'), 1);
  } finally {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
    delete require.cache[appPath];
    require('../../app');
  }
});

test('G14 表单编码请求被拒（FS §8：仅接受 application/json，避免表单类 CSRF）', async () => {
  const { world } = baseWorld();
  useWorld(world);

  const result = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'username=admin&password=admin'
  });

  assert.equal(result.status, 415);
  assert.equal(result.body.code, 'UNSUPPORTED_MEDIA_TYPE');
});
