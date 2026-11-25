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
const Price = require('@portomind/shared/models/price');
const { dateBounds } = require('@portomind/shared/utils/marketTime');
const {
  installAdminSession,
  uninstallSessionStub,
  setSessionUser,
  authHeaders,
  ADMIN_USER,
  MEMBER_USER
} = require('../helpers/auth');

const RUN_ID = '64b000000000000000000070';
const ASSET_ID = '64b0000000000000000000a1';
const ASSET_ID_2 = '64b0000000000000000000a2';
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
  t.mock.method(Asset, 'find', () => ({
    sort() { return this; },
    then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
    lean: async () => []
  }));
}

function stubStartSuccess(t, over = {}) {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: RUN_ID, ...over }));
  t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));
  stubEmptyAssets(t);
}

function stubPriceSyncStart(t) {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  const runs = [];
  const updates = [];
  t.mock.method(TaskRun, 'create', async (doc) => {
    runs.push(doc);
    return { ...doc, _id: RUN_ID };
  });
  t.mock.method(TaskRun, 'updateOne', async (filter, update) => {
    updates.push(update);
    return { modifiedCount: 1 };
  });
  stubEmptyAssets(t);
  return { runs, updates };
}

async function waitFor(predicate, timeout = 1000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition was not met before timeout');
}

test('未登录触发/读取均返回 401', async () => {
  const start = await request('/api/ops-center/integrity-check', { method: 'POST', body: '{}' }, { authenticated: false });
  assert.equal(start.status, 401);
  const priceSync = await request('/api/ops-center/price-sync', { method: 'POST', body: '{}' }, { authenticated: false });
  assert.equal(priceSync.status, 401);
  const backfill = await request(`/api/ops-center/assets/${ASSET_ID}/price-backfill`, {
    method: 'POST', body: '{}'
  }, { authenticated: false });
  assert.equal(backfill.status, 401);
  const batch = await request('/api/ops-center/price-backfill', {
    method: 'POST', body: '{}'
  }, { authenticated: false });
  assert.equal(batch.status, 401);
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

test('价格同步 202 + runId，空 Body 表示全部 active 并使用全局锁', async (t) => {
  const { runs, updates } = stubPriceSyncStart(t);
  const all = await request('/api/ops-center/price-sync', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(all.status, 202);
  assert.equal(all.body.data.runId, RUN_ID);
  assert.equal(all.body.data.taskName, 'daily-price-sync');
  assert.equal(all.body.data.status, 'RUNNING');
  assert.equal(runs[0].lockKey, 'ops:daily-price-sync');
  await waitFor(() => updates.some((update) => update.$set?.status === 'SUCCEEDED'));
});

test('价格同步将 CN / US_CA 市场组传入共享任务', async (t) => {
  const { updates } = stubPriceSyncStart(t);
  const cn = await request('/api/ops-center/price-sync', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ marketGroup: 'CN' })
  });
  assert.equal(cn.status, 202);
  await waitFor(() => updates.some((update) => update.$set?.result?.marketGroup === 'CN'));

  const usCa = await request('/api/ops-center/price-sync', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ marketGroup: 'US_CA' })
  });
  assert.equal(usCa.status, 202);
  await waitFor(() => updates.some((update) => update.$set?.result?.marketGroup === 'US_CA'));
});

test('价格同步非法市场组/额外字段返回 400', async () => {
  for (const body of [
    { marketGroup: 'HK' }, { marketGroup: null }, { marketGroup: ['CN'] },
    { marketGroup: 'CN', repair: true }
  ]) {
    const response = await request('/api/ops-center/price-sync', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  }
});

function stubBackfillAsset(t, over = {}) {
  const asset = {
    _id: ASSET_ID, symbol: 'VOO.US', market: 'US',
    launchDate: new Date('2020-01-01T12:00:00Z'), ...over
  };
  t.mock.method(Asset, 'findById', async () => asset);
  return asset;
}

function stubBackfillPrice(t, timestamp = dateBounds('2026-11-20').start) {
  t.mock.method(Price, 'find', () => ({
    lean: async () => [{ timestamp }]
  }));
}

function stubBackfillTaskRun(t) {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: RUN_ID }));
  t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));
}

test('单资产补采同步等待并返回 200 + 摘要', async (t) => {
  stubBackfillAsset(t);
  stubBackfillPrice(t);
  stubBackfillTaskRun(t);

  const response = await request(`/api/ops-center/assets/${ASSET_ID}/price-backfill`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: '2026-11-20', to: '2026-11-20' })
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'SUCCEEDED');
  assert.equal(response.body.data.assetId, ASSET_ID);
  assert.equal(response.body.data.symbol, 'VOO.US');
  assert.equal(response.body.data.from, '2026-11-20');
  assert.equal(response.body.data.missingBeforeCount, 0);
  assert.equal(response.body.data.missingAfterCount, 0);
  assert.equal(response.body.data.fetchedCount, 0);
});

test('单资产补采：非法 id 400、资产不存在 404、无 launchDate/非法区间 400', async (t) => {
  const invalidId = await request('/api/ops-center/assets/not-an-object-id/price-backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(invalidId.status, 400);

  t.mock.method(Asset, 'findById', async () => null);
  const missing = await request(`/api/ops-center/assets/${ASSET_ID}/price-backfill`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(missing.status, 404);

  stubBackfillAsset(t, { launchDate: null });
  const noLaunch = await request(`/api/ops-center/assets/${ASSET_ID}/price-backfill`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(noLaunch.status, 400);

  stubBackfillAsset(t);
  const badRange = await request(`/api/ops-center/assets/${ASSET_ID}/price-backfill`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: '2026-11-20', to: '2026-11-01' })
  });
  assert.equal(badRange.status, 400);

  for (const body of [{ year: 9999 }, { year: 2026, from: '2026-01-01' }]) {
    const badYear = await request(`/api/ops-center/assets/${ASSET_ID}/price-backfill`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.equal(badYear.status, 400);
  }
});

function stubBatchAssets(t) {
  const assets = [
    { _id: ASSET_ID, symbol: 'VOO.US', market: 'US', launchDate: new Date('2020-01-01T12:00:00Z') },
    { _id: ASSET_ID_2, symbol: 'VTI.US', market: 'US', launchDate: new Date('2020-01-01T12:00:00Z') }
  ];
  t.mock.method(Asset, 'findById', async (id) => assets.find((asset) => asset._id === id) || null);
  t.mock.method(Price, 'find', () => ({
    lean: async () => [{ timestamp: dateBounds('2026-11-20').start }]
  }));
  return assets;
}

function stubBatchTaskRuns(t) {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  let child = 0;
  t.mock.method(TaskRun, 'create', async (doc) => {
    const id = doc.taskName === 'asset-history-backfill-batch' ? 'batch-run' : `child-${child += 1}`;
    return { ...doc, _id: id };
  });
  const updates = [];
  t.mock.method(TaskRun, 'updateOne', async (filter, update) => {
    updates.push(update);
    return { modifiedCount: 1 };
  });
  return updates;
}

test('批量补采预览返回资产数/缺失天数且不创建 TaskRun', async (t) => {
  stubBatchAssets(t);
  const taskRunCreate = t.mock.method(TaskRun, 'create', async () => assert.fail('preview must not create TaskRun'));

  const response = await request('/api/ops-center/price-backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetIds: [ASSET_ID, ASSET_ID_2], from: '2026-11-20', to: '2026-11-20', preview: true })
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.assetCount, 2);
  assert.equal(response.body.data.readyCount, 2);
  assert.equal(response.body.data.missingDateCount, 0);
  assert.equal(taskRunCreate.mock.callCount(), 0);
});

test('批量补采支持 year 参数，并在 501 个资产时返回 400', async (t) => {
  stubBatchAssets(t);
  const yearPreview = await request('/api/ops-center/price-backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetIds: [ASSET_ID], year: 2025, preview: true })
  });
  assert.equal(yearPreview.status, 200);
  assert.equal(yearPreview.body.data.range.year, 2025);
  assert.equal(yearPreview.body.data.range.from, '2025-01-01');
  assert.equal(yearPreview.body.data.range.to, '2025-12-31');

  const tooMany = Array.from({ length: 501 }, (_, index) => index.toString(16).padStart(24, '0'));
  const response = await request('/api/ops-center/price-backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetIds: tooMany, preview: true })
  });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /cannot exceed 500/);
});

test('批量补采异步返回 202，父 TaskRun 汇总逐资产结果', async (t) => {
  stubBatchAssets(t);
  const updates = stubBatchTaskRuns(t);

  const response = await request('/api/ops-center/price-backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetIds: [ASSET_ID, ASSET_ID_2], from: '2026-11-20', to: '2026-11-20' })
  });
  assert.equal(response.status, 202);
  assert.equal(response.body.data.taskName, 'asset-history-backfill-batch');

  await waitFor(() => updates.some((update) => update.$set?.result?.assetCount === 2));
  const final = updates.find((update) => update.$set?.result?.assetCount === 2);
  assert.equal(final.$set.status, 'SUCCEEDED');
  assert.equal(final.$set.result.successCount, 2);
  assert.equal(final.$set.result.assets.length, 2);
});

test('批量补采：空/非法 assetIds 400，活跃批量运行 409', async (t) => {
  for (const body of [
    {}, { assetIds: [] }, { assetIds: ['not-an-id'] },
    { assetIds: [ASSET_ID], from: '2026-11-20', to: '2026-11-01' }
  ]) {
    const response = await request('/api/ops-center/price-backfill', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.equal(response.status, 400);
  }

  stubBatchAssets(t);
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => {
    throw Object.assign(new Error('duplicate lock'), { code: 11000 });
  });
  t.mock.method(TaskRun, 'findOne', () => ({
    sort() { return this; },
    lean: async () => ({
      _id: 'active-batch', taskName: 'asset-history-backfill-batch', runKey: 'manual:old',
      status: 'RUNNING', startedAt: new Date(), progress: { completed: 1, total: 2, updatedAt: new Date() }
    })
  }));
  t.mock.method(TaskSkip, 'create', async () => ({ _id: 'skip-batch' }));

  const conflict = await request('/api/ops-center/price-backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetIds: [ASSET_ID], from: '2026-11-20', to: '2026-11-20' })
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'TASK_ALREADY_RUNNING');
});

test('单资产补采已有活跃运行时返回 409 + 当前运行信息', async (t) => {
  stubBackfillAsset(t);
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => {
    throw Object.assign(new Error('duplicate lock'), { code: 11000 });
  });
  const active = {
    _id: 'active-backfill', taskName: 'asset-history-backfill', runKey: 'manual:old',
    status: 'RUNNING', startedAt: new Date(),
    progress: { completed: 0, total: 1, updatedAt: new Date() }
  };
  t.mock.method(TaskRun, 'findOne', () => ({
    sort() { return this; },
    lean: async () => active
  }));
  t.mock.method(TaskSkip, 'create', async () => ({ _id: 'skip-backfill' }));

  const response = await request(`/api/ops-center/assets/${ASSET_ID}/price-backfill`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: '2026-11-20', to: '2026-11-20' })
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'TASK_ALREADY_RUNNING');
  assert.equal(response.body.details.activeRun.runId, 'active-backfill');
});

test('价格同步已有活跃运行时返回 409 + 当前运行信息', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => {
    throw Object.assign(new Error('duplicate lock'), { code: 11000 });
  });
  const active = {
    _id: 'active-price', taskName: 'daily-price-sync', runKey: 'manual:old',
    status: 'RUNNING', startedAt: new Date(),
    progress: { completed: 2, total: 6, updatedAt: new Date() }
  };
  t.mock.method(TaskRun, 'findOne', () => ({
    sort() { return this; },
    lean: async () => active
  }));
  t.mock.method(TaskSkip, 'create', async () => ({ _id: 'skip-price' }));

  const response = await request('/api/ops-center/price-sync', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'TASK_ALREADY_RUNNING');
  assert.equal(response.body.details.activeRun.runId, 'active-price');
  assert.equal(response.body.details.activeRun.progress.total, 6);
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
