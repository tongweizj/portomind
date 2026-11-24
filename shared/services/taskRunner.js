// shared/services/taskRunner.js
//
// 任务执行外壳（TaskRun 生命周期、并发互斥、计数归一、运行中进度）。
// TASK-070：新增 startTrackedTask（server 手动触发立即拿 runId）与 lockKey
// 跨进程互斥；runTrackedTask 保持原有同步返回语义。

const TaskRun = require('../models/taskRun');
const TaskSkip = require('../models/taskSkip');
const { taskLogger } = require('../config/logger');
const { PROGRESS_THROTTLE_MS, DEFAULT_STALE_MS } = require('../config/opsTasks');

const activeTasks = new Map();

function normalizeCounts(result = {}) {
  const normalized = {
    totalCount: Number(result.totalCount || 0),
    successCount: Number(result.successCount || 0),
    failureCount: Number(result.failureCount || 0),
    failures: Array.isArray(result.failures) ? result.failures : []
  };
  // TASK-057（AC2）：只透传调用方**显式**包进 result 键的内容。
  if (Object.prototype.hasOwnProperty.call(result, 'result')) {
    normalized.result = result.result;
  }
  return normalized;
}

/**
 * TASK-057（D-01）：跳过事件写入独立 taskskips 集合。
 */
async function recordSkip({ taskName, runKey, trigger, reason, activeRunKey }) {
  const payload = { taskName, runKey, trigger, reason, skippedAt: new Date() };
  if (activeRunKey) payload.activeRunKey = activeRunKey;
  try {
    const doc = await TaskSkip.create(payload);
    return { skipPersisted: true, skipId: doc && doc._id ? String(doc._id) : undefined };
  } catch (error) {
    taskLogger.error('TASK_SKIP_RECORD_FAILED', {
      taskName, runKey, trigger, reason,
      message: error && error.message ? error.message : 'unknown'
    });
    return { skipPersisted: false };
  }
}

function lastHeartbeatAt(doc) {
  return doc?.progress?.updatedAt || doc?.startedAt || null;
}

function isStaleRun(doc, staleAfterMs, now = new Date()) {
  if (!doc || doc.status !== 'RUNNING') return false;
  const heartbeat = lastHeartbeatAt(doc);
  return heartbeat instanceof Date
    && Number.isFinite(heartbeat.getTime())
    && heartbeat.getTime() <= now.getTime() - staleAfterMs;
}

async function findActiveRunByLockKey(lockKey) {
  if (!lockKey) return null;
  return TaskRun.findOne({ lockKey, status: 'RUNNING' }).sort({ startedAt: -1 }).lean();
}

async function lookupActiveRunForSkip(lockKey) {
  try {
    return await findActiveRunByLockKey(lockKey);
  } catch (error) {
    taskLogger.warn('TASK_ACTIVE_RUN_LOOKUP_FAILED', {
      lockKey,
      message: error && error.message ? error.message : 'unknown'
    });
    return null;
  }
}

async function findRunByKey(taskName, runKey) {
  return TaskRun.findOne({ taskName, runKey }).lean();
}

function durationMsOf(startedAt, endedAt) {
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  return Number.isFinite(start) ? Math.max(endedAt.getTime() - start, 0) : null;
}

async function recoverStaleRun(activeRun, now) {
  const interruptedKey = `interrupted:${activeRun._id}`;
  const endedAt = now;
  const updated = await TaskRun.updateOne(
    { _id: activeRun._id, status: 'RUNNING', lockKey: activeRun.lockKey },
    {
      $set: {
        runKey: interruptedKey,
        status: 'FAILED',
        endedAt,
        durationMs: durationMsOf(activeRun.startedAt, endedAt),
        failureCount: 1,
        failures: [{
          item: activeRun.taskName,
          category: 'TIMEOUT',
          message: 'Task run expired without heartbeat'
        }],
        progress: {
          ...(activeRun.progress || {}),
          updatedAt: endedAt
        }
      },
      $unset: { lockKey: 1 }
    }
  );
  if (updated.modifiedCount === 1) {
    taskLogger.warn('TASK_LOCK_RECOVERED', {
      taskName: activeRun.taskName,
      runId: String(activeRun._id),
      lockKey: activeRun.lockKey,
      interruptedKey
    });
  }
  return updated.modifiedCount === 1;
}

async function createExclusiveRun(doc, staleAfterMs) {
  // 等待已有的 taskName + runKey 唯一索引就绪。持锁记录本身就是这次 TaskRun。
  await TaskRun.init();
  try {
    return await TaskRun.create(doc);
  } catch (error) {
    if (error.code !== 11000) throw error;
    const expired = await TaskRun.updateOne({
      taskName: doc.taskName, runKey: doc.runKey, status: 'RUNNING',
      startedAt: { $lte: new Date(doc.startedAt.getTime() - staleAfterMs) }
    }, [{ $set: {
      runKey: { $concat: ['manual:interrupted:', { $toString: '$_id' }] },
      status: 'FAILED', endedAt: doc.startedAt, durationMs: { $subtract: [doc.startedAt, '$startedAt'] },
      failureCount: 1, failures: [{ item: doc.taskName, category: 'TIMEOUT', message: 'Exclusive task run expired' }]
    } }]);
    if (expired.modifiedCount !== 1) throw error;
    return TaskRun.create(doc);
  }
}

function createTrackedRun(doc, { lockKey, exclusiveRunKey, staleAfterMs, now }) {
  if (lockKey) {
    return TaskRun.init().then(() => TaskRun.create(doc)).catch(async (error) => {
      if (error.code !== 11000) throw error;
      const activeRun = await findActiveRunByLockKey(lockKey);
      if (activeRun && isStaleRun(activeRun, staleAfterMs, now)) {
        const recovered = await recoverStaleRun(activeRun, now);
        if (recovered) {
          try {
            return await TaskRun.create(doc);
          } catch (retryError) {
            if (retryError.code !== 11000) throw retryError;
            // 恢复后另一个进程抢到了锁：返回冲突，不要把它升级成 500。
            const currentRun = await findActiveRunByLockKey(lockKey);
            const existing = currentRun ? null : await findRunByKey(doc.taskName, doc.runKey);
            return {
              conflict: currentRun
                ? { reason: 'ALREADY_RUNNING', activeRun: currentRun }
                : { reason: 'DUPLICATE_RUN_KEY', activeRun: existing }
            };
          }
        }
      }
      if (activeRun) return { conflict: { reason: 'ALREADY_RUNNING', activeRun } };
      const existing = await findRunByKey(doc.taskName, doc.runKey);
      return { conflict: { reason: 'DUPLICATE_RUN_KEY', activeRun: existing } };
    });
  }
  if (exclusiveRunKey) {
    return createExclusiveRun(doc, exclusiveRunKey.staleAfterMs).catch((error) => {
      if (error.code === 11000) {
        return { conflict: { reason: 'ALREADY_RUNNING', activeRun: null } };
      }
      throw error;
    });
  }
  return TaskRun.create(doc).catch((error) => {
    if (error.code === 11000) {
      return { conflict: { reason: 'DUPLICATE_RUN_KEY', activeRun: null } };
    }
    throw error;
  });
}


function normalizeProgress(progress) {
  if (!progress) return null;
  return {
    completed: Number.isFinite(progress.completed) ? progress.completed : 0,
    total: Number.isFinite(progress.total) ? progress.total : null,
    updatedAt: progress.updatedAt ?? null
  };
}

function activeRunInfo(activeRun) {
  if (!activeRun) return null;
  return {
    runId: activeRun._id === undefined || activeRun._id === null ? null : String(activeRun._id),
    taskName: activeRun.taskName ?? null,
    runKey: activeRun.runKey ?? null,
    status: activeRun.status ?? null,
    startedAt: activeRun.startedAt ?? null,
    progress: normalizeProgress(activeRun.progress)
  };
}

function activeKeyOf({ lockKey, taskName }) {
  return lockKey || taskName;
}

/**
 * 启动一个 tracked task 并立即返回 runId；执行在后台继续。
 * 冲突时返回 ok:false + reason + activeRun，并写 TaskSkip。
 */
async function startTrackedTask({
  taskName,
  runKey,
  trigger = 'SCHEDULED',
  execute,
  exclusiveRunKey,
  lockKey,
  staleAfterMs = DEFAULT_STALE_MS,
  progressThrottleMs = PROGRESS_THROTTLE_MS
}) {
  const activeKey = activeKeyOf({ lockKey, taskName });
  if (activeTasks.has(activeKey)) {
    const activeRunKey = activeTasks.get(activeKey);
    taskLogger.warn('TASK_SKIPPED_ALREADY_RUNNING', { taskName, runKey, trigger, activeRunKey });
    const activeRun = await lookupActiveRunForSkip(lockKey);
    const persisted = await recordSkip({
      taskName, runKey, trigger, reason: 'ALREADY_RUNNING', activeRunKey
    });
    return {
      ok: false,
      taskName,
      runKey,
      trigger,
      status: 'SKIPPED',
      reason: 'ALREADY_RUNNING',
      activeRunKey,
      activeRun: activeRunInfo(activeRun),
      ...persisted
    };
  }

  activeTasks.set(activeKey, lockKey || (exclusiveRunKey && exclusiveRunKey.key) || runKey);
  const startedAt = new Date();
  const storedRunKey = lockKey ? runKey : ((exclusiveRunKey && exclusiveRunKey.key) || runKey);
  let taskRun;

  try {
    const doc = { taskName, runKey: storedRunKey, trigger, startedAt };
    if (lockKey) {
      doc.lockKey = lockKey;
      doc.progress = { completed: 0, total: null, updatedAt: startedAt };
    }
    const created = await createTrackedRun(doc, { lockKey, exclusiveRunKey, staleAfterMs, now: startedAt });
    if (created && created.conflict) {
      activeTasks.delete(activeKey);
      const { reason, activeRun } = created.conflict;
      const persisted = await recordSkip({
        taskName, runKey, trigger, reason,
        activeRunKey: lockKey || (exclusiveRunKey && exclusiveRunKey.key) || runKey
      });
      taskLogger.warn('TASK_SKIPPED_ALREADY_RUNNING', {
        taskName, runKey, trigger, reason, activeRunKey: lockKey
      });
      return {
        ok: false,
        taskName,
        runKey,
        trigger,
        status: 'SKIPPED',
        reason,
        activeRun: activeRunInfo(activeRun),
        ...persisted
      };
    }
    taskRun = created;
  } catch (error) {
    activeTasks.delete(activeKey);
    throw error;
  }

  const runId = String(taskRun._id);
  const finishedKey = exclusiveRunKey ? `${runKey}:${runId}` : runKey;
  const filter = lockKey
    ? { _id: taskRun._id, lockKey }
    : (exclusiveRunKey ? { _id: taskRun._id, runKey: storedRunKey } : { _id: taskRun._id });

  let lastProgress = lockKey ? { completed: 0, total: null } : null;
  let lastProgressWriteAt = 0;

  const reportProgress = async (completed, total) => {
    if (!lockKey) return;
    const safeCompleted = Number.isFinite(Number(completed)) ? Math.max(Number(completed), 0) : 0;
    const safeTotal = Number.isFinite(Number(total)) ? Math.max(Number(total), 0) : null;
    lastProgress = { completed: safeCompleted, total: safeTotal };
    const now = Date.now();
    if (progressThrottleMs > 0 && now - lastProgressWriteAt < progressThrottleMs) return;
    lastProgressWriteAt = now;
    try {
      await TaskRun.updateOne(
        { _id: taskRun._id, status: 'RUNNING', lockKey },
        { $set: { progress: { completed: safeCompleted, total: safeTotal, updatedAt: new Date(now) } } }
      );
    } catch (error) {
      taskLogger.warn('TASK_PROGRESS_WRITE_FAILED', {
        taskName, runId, message: error && error.message ? error.message : 'unknown'
      });
    }
  };

  const promise = (async () => {
    taskLogger.info('TASK_START', {
      taskName,
      runKey: finishedKey,
      trigger,
      taskRunId: runId,
      startedAt: startedAt.toISOString()
    });
    try {
      const result = normalizeCounts(await execute({ runId, reportProgress }));
      const endedAt = new Date();
      const durationMs = endedAt.getTime() - startedAt.getTime();
      const status = result.failureCount > 0 ? 'PARTIAL' : 'SUCCEEDED';
      const summary = {
        runId,
        taskName,
        runKey: finishedKey,
        trigger,
        status,
        startedAt,
        endedAt,
        durationMs,
        ...result
      };
      const finalProgress = lockKey
        ? {
            completed: lastProgress && lastProgress.total !== null
              ? Math.min(lastProgress.completed, lastProgress.total)
              : result.totalCount,
            total: lastProgress && lastProgress.total !== null ? lastProgress.total : result.totalCount,
            updatedAt: endedAt
          }
        : undefined;
      const update = { $set: finalProgress ? { ...summary, progress: finalProgress } : summary };
      if (lockKey) update.$unset = { lockKey: 1 };

      const saved = await TaskRun.updateOne(filter, update);
      if ((lockKey || exclusiveRunKey) && saved.modifiedCount !== 1) {
        throw new Error('Tracked task run is no longer active');
      }
      taskLogger.info('TASK_END', { taskRunId: runId, ...summary, progress: finalProgress });
      return summary;
    } catch (error) {
      const endedAt = new Date();
      const durationMs = endedAt.getTime() - startedAt.getTime();
      const summary = {
        runId,
        status: 'FAILED',
        endedAt,
        durationMs,
        failureCount: 1,
        failures: [{
          item: taskName,
          category: error.category || 'INTERNAL',
          message: error.message
        }]
      };
      const failedSet = exclusiveRunKey ? { ...summary, runKey: finishedKey } : summary;
      if (lockKey) failedSet.progress = {
        ...(lastProgress || { completed: 0, total: null }),
        updatedAt: endedAt
      };
      const update = { $set: failedSet };
      if (lockKey) update.$unset = { lockKey: 1 };
      try {
        await TaskRun.updateOne(filter, update);
      } catch (persistError) {
        taskLogger.error('TASK_FAILED_PERSIST_ERROR', {
          taskName, runId, message: persistError.message
        });
      }
      taskLogger.error('TASK_END', {
        taskRunId: runId,
        taskName,
        runKey: finishedKey,
        trigger,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs,
        successCount: 0,
        failureCount: 1,
        error: { message: error.message, category: error.category || 'INTERNAL' }
      });
      throw error;
    } finally {
      activeTasks.delete(activeKey);
    }
  })();

  // server 端会 await promise；内部挂一个空 catch，避免后台触发未处理拒绝导致进程退出。
  promise.catch(() => {});

  return {
    ok: true,
    runId,
    taskName,
    runKey: finishedKey,
    trigger,
    status: 'RUNNING',
    startedAt,
    promise
  };
}

async function runTrackedTask(options) {
  const handle = await startTrackedTask(options);
  if (!handle.ok) return handle;
  return handle.promise;
}

module.exports = {
  startTrackedTask,
  runTrackedTask,
  normalizeCounts,
  recordSkip,
  isStaleRun,
  findActiveRunByLockKey,
  normalizeProgress
};
