// server/test/integration/opsTask.api.test.js
//
// TASK-070：POST /api/ops-center/integrity-check 与 GET /api/ops-center/task-runs/:id。
// 起真实 Express + 认证闸门；模型静态方法用替身，不连接 MongoDB。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-ops-task-api-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const TaskRun = require('@portomind/shared/models/taskRun');
const TaskSkip = require('@portomind/shared/models/taskSkip');
const Asset = require('@portomind/shared/models/asset');
const {
  installAdminSession,
  uninstallSessionStub,
  setSessionUser,
  authHeaders,
  ADMIN_USER,
  MEMBER_USER
} = require('../helpers/auth');

const RUN_ID = '64b000000000000000000070';
let server;
let baseUrl;

test.before(async () => {
  installAdminSession();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  uninstallSessionStub();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.afterEach(() => setSessionUser(ADMIN_USER));

async function request(pathname, options = {}, { authenticated = true } = {}) {
  const headers = { ...(options.headers || {}) };
  if (authenticated) headers.cookie = authHeaders().cookie;
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function chainable(rows) {
  const chain = {
    sort() { return chain; },
    lean: async () => rows
  };
  return chain;
}

function stubEmptyAssets(t) {
  t.mock.method(Asset, 'find', () => chainable([]));
}

function stubStartSuccess(t, over = {}) {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: RUN_ID, ...over }));
  t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));
  stubEmptyAssets(t);
}

test('未登录触发/读取均返回 401', async () => {
  const start = await request('/api/ops-center/integrity-check', { method: 'POST', body: '{}' }, { authenticated: false });
  assert.equal(start.status, 401);
  const detail = await request(`/api/ops-center/task-runs/${RUN_ID}`, {}, { authenticated: false });
  assert.equal(detail.status, 401);
});

test('手动触发返回 202 + runId，不等待任务结束', async (t) => {
  stubStartSuccess(t);
  const started = await request('/api/ops-center/integrity-check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });

  assert.equal(started.status, 202);
  assert.equal(started.body.success, true);
  assert.equal(started.body.data.runId, RUN_ID);
  assert.equal(started.body.data.taskName, 'price-integrity-check');
  assert.equal(started.body.data.status, 'RUNNING');
  assert.ok(Number.isFinite(Date.parse(started.body.data.startedAt)));
});

test('已有活跃运行返回 409 + activeRun；请求体非空 400', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => {
    throw Object.assign(new Error('duplicate lock'), { code: 11000 });
  });
  const active = {
    _id: 'active-1', taskName: 'price-integrity-check', runKey: 'manual:old',
    status: 'RUNNING', startedAt: new Date(), progress: { completed: 1, total: 3, updatedAt: new Date() }
  };
  t.mock.method(TaskRun, 'findOne', () => chainable(active));
  t.mock.method(TaskSkip, 'create', async () => ({ _id: 'skip-1' }));

  const conflict = await request('/api/ops-center/integrity-check', { method: 'POST', body: '{}' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.success, false);
  assert.equal(conflict.body.code, 'TASK_ALREADY_RUNNING');
  assert.equal(conflict.body.details.activeRun.runId, 'active-1');
  assert.equal(conflict.body.details.activeRun.progress.completed, 1);

  const badBody = await request('/api/ops-center/integrity-check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repair: true })
  });
  assert.equal(badBody.status, 400);

  const arrayBody = await request('/api/ops-center/integrity-check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]'
  });
  assert.equal(arrayBody.status, 400, '数组也不是空请求体');
});

test('task-run 详情返回状态/进度/计数/result；400/404 可辨识', async (t) => {
  const startedAt = new Date('2026-11-24T07:30:00.000Z');
  const doc = {
    _id: RUN_ID,
    taskName: 'price-integrity-check',
    runKey: 'manual:2026-11-24T07:30:00.000Z',
    trigger: 'MANUAL',
    status: 'PARTIAL',
    startedAt,
    endedAt: new Date('2026-11-24T07:31:00.000Z'),
    durationMs: 60000,
    totalCount: 2,
    successCount: 1,
    failureCount: 1,
    failures: [{ item: 'VOO.US', category: 'DATA_GAP', message: 'missing 1/3' }],
    progress: { completed: 2, total: 2, updatedAt: new Date('2026-11-24T07:31:00.000Z') },
    result: { totals: { expectedCount: 3, actualCount: 2, missingCount: 1 }, assets: [] }
  };
  t.mock.method(TaskRun, 'findById', () => ({ lean: async () => doc }));

  const result = await request(`/api/ops-center/task-runs/${RUN_ID}`);
  assert.equal(result.status, 200);
  const data = result.body.data;
  assert.equal(data.runId, RUN_ID);
  assert.equal(data.status, 'PARTIAL');
  assert.equal(data.stale, false);
  assert.equal(data.progress.completed, 2);
  assert.equal(data.counts.failureCount, 1);
  assert.equal(data.result.totals.missingCount, 1);
  assert.equal('lockKey' in data, false);

  const invalid = await request('/api/ops-center/task-runs/not-an-object-id');
  assert.equal(invalid.status, 400);

  t.mock.method(TaskRun, 'findById', () => ({ lean: async () => null }));
  const missing = await request('/api/ops-center/task-runs/64b000000000000000000099');
  assert.equal(missing.status, 404);
});

test('member 可读取 task-run 详情（服务端仅要求登录）', async (t) => {
  setSessionUser(MEMBER_USER);
  t.mock.method(TaskRun, 'findById', () => ({
    lean: async () => ({
      _id: RUN_ID, taskName: 'price-integrity-check', runKey: 'manual:x', trigger: 'MANUAL',
      status: 'RUNNING', startedAt: new Date(), progress: { completed: 0, total: 1, updatedAt: new Date() }
    })
  }));

  const result = await request(`/api/ops-center/task-runs/${RUN_ID}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.status, 'RUNNING');
});
