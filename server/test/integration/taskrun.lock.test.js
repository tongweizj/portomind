// server/test/integration/taskrun.lock.test.js
//
// TASK-070：TaskRun 跨进程 lockKey、异步启动句柄与运行中 progress。

const test = require('node:test');
const assert = require('node:assert/strict');

const TaskRun = require('@portomind/shared/models/taskRun');
const TaskSkip = require('@portomind/shared/models/taskSkip');
const {
  startTrackedTask,
  runTrackedTask
} = require('@portomind/shared/services/taskRunner');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function activeRun(over = {}) {
  return {
    _id: 'active-run',
    taskName: 'price-integrity-check',
    runKey: 'manual:old',
    trigger: 'MANUAL',
    status: 'RUNNING',
    startedAt: new Date(),
    progress: { completed: 1, total: 10, updatedAt: new Date() },
    ...over
  };
}

test('startTrackedTask 立即返回 runId，执行完成后写终态与 progress', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: 'run-1' }));
  const updates = [];
  t.mock.method(TaskRun, 'updateOne', async (filter, update) => {
    updates.push({ filter, update });
    return { modifiedCount: 1 };
  });

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const handle = await startTrackedTask({
    taskName: 'price-integrity-check',
    runKey: 'manual:2026-11-24T07:30:00.000Z',
    trigger: 'MANUAL',
    lockKey: 'ops:price-integrity-check',
    staleAfterMs: 30 * 60 * 1000,
    progressThrottleMs: 0,
    execute: async ({ reportProgress }) => {
      reportProgress(1, 2);
      await gate;
      reportProgress(2, 2);
      return { totalCount: 2, successCount: 2, failureCount: 0, result: { checkedCount: 2 } };
    }
  });

  assert.equal(handle.ok, true);
  assert.equal(handle.runId, 'run-1');
  assert.equal(handle.status, 'RUNNING');
  await sleep(20);
  assert.ok(updates.some(({ update }) => update.$set?.progress?.completed === 1));

  release();
  const summary = await handle.promise;
  assert.equal(summary.status, 'SUCCEEDED');
  assert.equal(summary.runId, 'run-1');
  const final = updates.at(-1).update;
  assert.equal(final.$set.progress.completed, 2);
  assert.equal(final.$set.progress.total, 2);
  assert.equal(final.$unset.lockKey, 1);
});

test('lockKey 冲突且活跃运行未过期时返回冲突信息并写 TaskSkip', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => {
    throw Object.assign(new Error('duplicate lock'), { code: 11000 });
  });
  t.mock.method(TaskRun, 'findOne', () => ({
    sort() { return this; },
    lean: async () => activeRun()
  }));
  const skips = [];
  t.mock.method(TaskSkip, 'create', async (doc) => { skips.push(doc); return { _id: 'skip-1' }; });

  const handle = await startTrackedTask({
    taskName: 'price-integrity-check',
    runKey: 'manual:new',
    trigger: 'MANUAL',
    lockKey: 'ops:price-integrity-check',
    staleAfterMs: 30 * 60 * 1000,
    execute: async () => assert.fail('冲突时不得执行')
  });

  assert.equal(handle.ok, false);
  assert.equal(handle.reason, 'ALREADY_RUNNING');
  assert.equal(handle.activeRun.runId, 'active-run');
  assert.equal(skips.length, 1);
  assert.equal(skips[0].reason, 'ALREADY_RUNNING');
  assert.equal(skips[0].activeRunKey, 'ops:price-integrity-check');
});

test('过期 lockKey 先标旧运行 FAILED/改 runKey，再创建新运行', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  let created = 0;
  t.mock.method(TaskRun, 'create', async (doc) => {
    created += 1;
    if (created === 1) throw Object.assign(new Error('duplicate lock'), { code: 11000 });
    return { ...doc, _id: 'run-new' };
  });
  const old = activeRun({
    startedAt: new Date(Date.now() - 60 * 60 * 1000),
    progress: { completed: 1, total: 10, updatedAt: new Date(Date.now() - 60 * 60 * 1000) }
  });
  t.mock.method(TaskRun, 'findOne', () => ({
    sort() { return this; },
    lean: async () => old
  }));
  const updates = [];
  t.mock.method(TaskRun, 'updateOne', async (filter, update) => {
    updates.push({ filter, update });
    return { modifiedCount: 1 };
  });

  const handle = await startTrackedTask({
    taskName: 'price-integrity-check',
    runKey: 'manual:new',
    trigger: 'MANUAL',
    lockKey: 'ops:price-integrity-check',
    staleAfterMs: 30 * 60 * 1000,
    execute: async () => ({ totalCount: 1, successCount: 1, failureCount: 0, result: {} })
  });

  assert.equal(handle.ok, true);
  assert.equal(handle.runId, 'run-new');
  const recovery = updates.find(({ filter }) => filter._id === 'active-run');
  assert.equal(recovery.update.$set.status, 'FAILED');
  assert.match(recovery.update.$set.runKey, /^interrupted:/);
  assert.equal(recovery.update.$unset.lockKey, 1);
  await handle.promise;
});

test('runTrackedTask 保持同步返回语义且不新增 SKIPPED TaskRun', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: 'run-legacy' }));
  t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));

  const summary = await runTrackedTask({
    taskName: 'legacy-task',
    runKey: 'legacy-key',
    execute: async () => ({ totalCount: 1, successCount: 1, failureCount: 0, result: {} })
  });

  assert.equal(summary.status, 'SUCCEEDED');
  assert.equal(summary.runId, 'run-legacy');
});
