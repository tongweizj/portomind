// server/scripts/e2e-auth-058.cjs
//
// TASK-058 U1 交付门槛（ED-5）：真实 Mongo + 真实 HTTP 的端到端验证。
// 覆盖自动化测试里被 stub 掉的「会话/用户真实查库」那一段：
//   无 cookie 401 → admin/admin 登录 → 强制改密 403 → 改密 200 → 业务端点 200
//   → session authenticated=true → 登出 → 旧 cookie 401 → 直接查库校验
//
// 用法：npm run e2e:auth --workspace server
// 说明：使用独立临时库 portomind_auth_e2e（脚本结束时 drop），不污染开发库。

const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const SERVER_DIR = path.join(__dirname, '..');
dotenv.config({ path: path.join(SERVER_DIR, '.env') });

const BASE_URI = process.env.MONGO_URI;
if (!BASE_URI) throw new Error('server/.env 缺少 MONGO_URI');

const DB_NAME = 'portomind_auth_e2e';
const URI = BASE_URI.replace(/^(mongodb(?:\+srv)?:\/\/[^/]+\/)[^?]*/, `$1${DB_NAME}`);
// 安全护栏：只有当连接串确实指向临时库时才允许 dropDatabase（避免 MONGO_URI 无库名时落到默认 test 库）
const uriDatabaseName = (URI.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/) || [])[1];
if (uriDatabaseName !== DB_NAME) {
  throw new Error(`E2E_REFUSED: 无法把 MONGO_URI 改写到临时库 ${DB_NAME}（实际解析为 ${uriDatabaseName || '空'}），拒绝执行`);
}
const PORT = Number(process.env.E2E_PORT || 0) || 0;
let BASE = '';

/** 选一个空闲端口，避免与其它进程/并发 E2E 抢端口（曾导致连到别人的 server） */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`E2E_FAILED: ${message}`);
}

async function readBody(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch (_) { return text; }
}

async function dropDatabase() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 });
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return;
    } catch (_) { /* not ready */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('E2E_FAILED: server did not start in time');
}

async function main() {
  const port = PORT || await findFreePort();
  BASE = `http://127.0.0.1:${port}`;
  await dropDatabase();

  const child = spawn(process.execPath, ['server.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      MONGO_URI: URI,
      PORT: String(port),
      NODE_ENV: 'development',
      LOG_DIR: path.join(os.tmpdir(), 'portomind-auth-e2e-logs')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  const passed = [];
  const ok = (name) => { passed.push(name); console.log(`  ✔ ${name}`); };

  try {
    await waitForServer();

    const unauth = await fetch(`${BASE}/api/portfolios`);
    assert(unauth.status === 401, `无 cookie 应 401，实际 ${unauth.status}`);
    ok('无 cookie 访问业务端点 → 401');

    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    });
    const loginBody = await readBody(login);
    assert(login.status === 200, `登录应 200，实际 ${login.status}（${JSON.stringify(loginBody)}）`);
    assert(loginBody.data.user.mustChangePassword === true, '首次登录 mustChangePassword 应为 true');
    const setCookie = login.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('pm_sid='), '应下发 pm_sid cookie');
    const cookie = setCookie.split(';')[0];
    ok('真实库 seed + admin/admin 登录 → 200 + Set-Cookie');

    const gated = await fetch(`${BASE}/api/portfolios`, { headers: { cookie } });
    const gatedBody = await readBody(gated);
    assert(gated.status === 403, `改密前应 403，实际 ${gated.status}`);
    assert(gatedBody.code === 'PASSWORD_CHANGE_REQUIRED', `错误码应为 PASSWORD_CHANGE_REQUIRED，实际 ${gatedBody.code}`);
    ok('改密前业务端点 → 403 PASSWORD_CHANGE_REQUIRED');

    const changed = await fetch(`${BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ currentPassword: 'admin', newPassword: 'e2e-admin-pass' })
    });
    const changedBody = await readBody(changed);
    assert(changed.status === 200, `改密应 200，实际 ${changed.status}（${JSON.stringify(changedBody)}）`);
    ok('改密 → 200');

    const allowed = await fetch(`${BASE}/api/portfolios`, { headers: { cookie } });
    if (allowed.status !== 200) {
      const allowedBody = await readBody(allowed);
      await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 });
      const debugSessions = await mongoose.connection.db.collection('sessions').find({}).toArray();
      await mongoose.disconnect();
      throw new Error(`改密后应 200，实际 ${allowed.status}（body=${JSON.stringify(allowedBody)}；cookieSid=${cookie.slice(0, 20)}…；sessions=${JSON.stringify(debugSessions.map((s) => ({ sid: String(s.sid).slice(0, 20), userId: String(s.userId) })))}；changedBody=${JSON.stringify(changedBody)}）`);
    }
    ok('改密后同一 cookie 访问业务端点 → 200');

    const sessionProbe = await fetch(`${BASE}/api/auth/session`, { headers: { cookie } });
    const sessionBody = await readBody(sessionProbe);
    assert(sessionBody.data.authenticated === true, 'session 应为 authenticated=true');
    ok('GET /api/auth/session → authenticated=true（真实会话查库）');

    const logout = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    assert(logout.status === 200, `登出应 200，实际 ${logout.status}`);
    ok('登出 → 200');

    const afterLogout = await fetch(`${BASE}/api/auth/session`, { headers: { cookie } });
    const afterLogoutBody = await readBody(afterLogout);
    assert(afterLogoutBody.data.authenticated === false, '登出后 session 应为 authenticated=false');
    const oldCookie = await fetch(`${BASE}/api/portfolios`, { headers: { cookie } });
    assert(oldCookie.status === 401, `登出后旧 cookie 应 401，实际 ${oldCookie.status}`);
    ok('登出后旧 cookie → 会话失效（401 / authenticated=false）');

    // ---- 追加：真实会话/用户路径上的停用吊销与唯一 admin 不变量（Reviewer MINOR-7） ----
    const relogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'e2e-admin-pass' })
    });
    const reloginBody = await readBody(relogin);
    if (relogin.status !== 200) {
      await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 });
      const debugUser = await mongoose.connection.db.collection('users').findOne({ username: 'admin' });
      await mongoose.disconnect();
      throw new Error(`改密后重新登录应 200，实际 ${relogin.status}（body=${JSON.stringify(reloginBody)}；db.mustChangePassword=${debugUser && debugUser.mustChangePassword}；hashPrefix=${debugUser && String(debugUser.passwordHash).slice(0, 7)}）`);
    }
    const adminId = reloginBody.data.user.id;
    const adminCookie = relogin.headers.get('set-cookie').split(';')[0];
    ok('改密后新密码可登录（新哈希真实生效）');

    const created = await fetch(`${BASE}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ username: 'e2e-member', password: 'member-pass-1', role: 'member' })
    });
    const createdBody = await readBody(created);
    assert(created.status === 201, `创建用户应 201，实际 ${created.status}（${JSON.stringify(createdBody)}）`);
    const memberId = createdBody.data.user.id;
    assert(createdBody.data.user.mustChangePassword === true, '新用户应 mustChangePassword=true');
    ok('管理员建号 → 201（新用户需改密）');

    const memberLogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'e2e-member', password: 'member-pass-1' })
    });
    assert(memberLogin.status === 200, `member 登录应 200，实际 ${memberLogin.status}`);
    const memberCookie = memberLogin.headers.get('set-cookie').split(';')[0];
    ok('member 可登录');

    const forbidden = await fetch(`${BASE}/api/users`, { headers: { cookie: memberCookie } });
    assert(forbidden.status === 403, `member 访问 /api/users 应 403，实际 ${forbidden.status}`);
    ok('member 访问 /api/users → 403 FORBIDDEN');

    const deactivated = await fetch(`${BASE}/api/users/${memberId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ active: false })
    });
    assert(deactivated.status === 200, `停用用户应 200，实际 ${deactivated.status}`);
    const memberAfter = await fetch(`${BASE}/api/portfolios`, { headers: { cookie: memberCookie } });
    assert(memberAfter.status === 401, `停用后 member 旧 cookie 应 401，实际 ${memberAfter.status}`);
    ok('停用用户 → 其旧 cookie 立即 401（真实 Session 删除）');

    const selfDemote = await fetch(`${BASE}/api/users/${adminId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ role: 'member' })
    });
    const selfDemoteBody = await readBody(selfDemote);
    assert(selfDemote.status === 409, `唯一 admin 自我降级应 409，实际 ${selfDemote.status}`);
    assert(selfDemoteBody.code === 'LAST_ADMIN_PROTECTED', `错误码应为 LAST_ADMIN_PROTECTED，实际 ${selfDemoteBody.code}`);
    ok('唯一 admin 自我降级 → 409 LAST_ADMIN_PROTECTED');

    await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    const sessionCount = await db.collection('sessions').countDocuments({});
    const memberSessions = await db.collection('sessions').countDocuments({ userId: new mongoose.Types.ObjectId(memberId) });
    const admin = await db.collection('users').findOne({ username: 'admin' });
    const member = await db.collection('users').findOne({ username: 'e2e-member' });
    await mongoose.disconnect();
    assert(sessionCount === 1, `登出/停用后应只剩 admin 会话，实际 ${sessionCount}`);
    assert(memberSessions === 0, `停用后 member 会话应为 0，实际 ${memberSessions}`);
    assert(admin && admin.mustChangePassword === false && admin.role === 'admin', 'admin 状态/角色应保持');
    assert(member && member.active === false, 'member 应为停用状态');
    assert(typeof admin.passwordHash === 'string' && admin.passwordHash.startsWith('$2'), '密码必须以 bcrypt 哈希存储');
    assert(admin.passwordHash !== 'e2e-admin-pass', '明文密码不得入库');
    ok('直接查库：停用会话=0、admin 角色/改密态正确、密码为 bcrypt');

    console.log(`\nE2E_PASS ${passed.length}/${passed.length}`);
  } catch (error) {
    console.error('\nE2E server output tail:\n' + serverOutput.split('\n').slice(-25).join('\n'));
    throw error;
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { await dropDatabase(); } catch (_) { /* ignore cleanup failure */ }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
