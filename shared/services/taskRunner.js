// shared/services/taskRunner.js
//
// 内部工具，不加 service 后缀（TASK-071 M9，命名约定说明，无行为变更）。
// 本文件提供任务执行的外壳（TaskRun 生命周期、并发互斥、计数归一），
// 不是业务域服务，故不遵循 `<domain>.service.js` 命名；调用方为 cron-worker 的各任务入口。
//
// 注：同目录的 alertVisibility.js 不加后缀一事按 D-3 **待定**，本任务未改动（见计划 §6 D-3）。
const TaskRun = require('../models/taskRun');
const TaskSkip = require('../models/taskSkip');
const { taskLogger } = require('../config/logger');

const activeTasks = new Map();

function normalizeCounts(result = {}) {
  const normalized = {
    totalCount: Number(result.totalCount || 0),
    successCount: Number(result.successCount || 0),
    failureCount: Number(result.failureCount || 0),
    failures: Array.isArray(result.failures) ? result.failures : []
  };
  // TASK-057（AC2）：只透传调用方**显式**包进 result 键的内容。
  // 顶层裸字段（ok/gap/...）继续丢弃，白名单没有被改成全量透传。
  if (Object.prototype.hasOwnProperty.call(result, 'result')) {
    normalized.result = result.result;
  }
  return normalized;
}

/**
 * TASK-057（D-01）：跳过事件写入独立 taskskips 集合。
 * 不得因观测写入失败而放行业务或谎称可查询；失败只记受控日志 + skipPersisted=false。
 */
async function recordSkip({ taskName, runKey, trigger, reason, activeRunKey }) {
  const payload = { taskName, runKey, trigger, reason, skippedAt: new Date() };
  if (activeRunKey) payload.activeRunKey = activeRunKey;
  try {
    const doc = await TaskSkip.create(payload);
    return { skipPersisted: true, skipId: doc && doc._id ? String(doc._id) : undefined };
  } catch (error) {
    taskLogger.error('TASK_SKIP_RECORD_FAILED', {
      taskName,
      runKey,
      trigger,
      reason,
      message: error && error.message ? error.message : 'unknown'
    });
    return { skipPersisted: false };
  }
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

async function runTrackedTask({ taskName, runKey, trigger = 'SCHEDULED', execute, exclusiveRunKey }) {
  if (activeTasks.has(taskName)) {
    const activeRunKey = activeTasks.get(taskName);
    taskLogger.warn('TASK_SKIPPED_ALREADY_RUNNING', {
      taskName, runKey, trigger, activeRunKey
    });
    const persisted = await recordSkip({ taskName, runKey, trigger, reason: 'ALREADY_RUNNING', activeRunKey });
    return { taskName, runKey, trigger, status: 'SKIPPED', reason: 'ALREADY_RUNNING', ...persisted };
  }

  const storedKey = exclusiveRunKey?.key || runKey;
  activeTasks.set(taskName, storedKey);
  const startedAt = new Date();
  let taskRun;

  try {
    try {
      const doc = { taskName, runKey: storedKey, trigger, startedAt };
      taskRun = exclusiveRunKey ? await createExclusiveRun(doc, exclusiveRunKey.staleAfterMs) : await TaskRun.create(doc);
    } catch (error) {
      if (error && error.code === 11000) {
        if (exclusiveRunKey) {
          const reason = 'ALREADY_RUNNING';
          const persisted = await recordSkip({ taskName, runKey, trigger, reason, activeRunKey: storedKey });
          taskLogger.warn('TASK_SKIPPED_ALREADY_RUNNING', { taskName, runKey, trigger, activeRunKey: storedKey });
          return { taskName, runKey, trigger, status: 'SKIPPED', reason, ...persisted };
        }
        taskLogger.warn('TASK_SKIPPED_DUPLICATE_RUN_KEY', { taskName, runKey, trigger });
        const persisted = await recordSkip({ taskName, runKey, trigger, reason: 'DUPLICATE_RUN_KEY' });
        return { taskName, runKey, trigger, status: 'SKIPPED', reason: 'DUPLICATE_RUN_KEY', ...persisted };
      }
      throw error;
    }

    const finishedKey = exclusiveRunKey ? `${runKey}:${taskRun._id}` : runKey;
    const filter = exclusiveRunKey ? { _id: taskRun._id, runKey: storedKey } : { _id: taskRun._id };
    taskLogger.info('TASK_START', {
      taskName,
      runKey: finishedKey,
      trigger,
      taskRunId: taskRun._id.toString(),
      startedAt: startedAt.toISOString()
    });

    try {
      const result = normalizeCounts(await execute());
      const endedAt = new Date();
      const durationMs = endedAt.getTime() - startedAt.getTime();
      const status = result.failureCount > 0 ? 'PARTIAL' : 'SUCCEEDED';
      const summary = {
        taskName, runKey: finishedKey, trigger, status,
        startedAt, endedAt, durationMs,
        ...result
      };

      const saved = await TaskRun.updateOne(filter, { $set: summary });
      if (exclusiveRunKey && saved.modifiedCount !== 1) throw new Error('Exclusive task run is no longer active');
      taskLogger.info('TASK_END', { taskRunId: taskRun._id.toString(), ...summary });
      return summary;
    } catch (error) {
      const endedAt = new Date();
      const durationMs = endedAt.getTime() - startedAt.getTime();
      const summary = {
        status: 'FAILED', endedAt, durationMs,
        failureCount: 1,
        failures: [{ item: taskName, category: error.category || 'INTERNAL', message: error.message }]
      };
      await TaskRun.updateOne(filter, { $set: exclusiveRunKey ? { ...summary, runKey: finishedKey } : summary });
      taskLogger.error('TASK_END', {
        taskRunId: taskRun._id.toString(), taskName, runKey: finishedKey, trigger,
        startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(),
        durationMs, successCount: 0, failureCount: 1,
        error: { message: error.message, category: error.category || 'INTERNAL' }
      });
      throw error;
    }
  } finally {
    activeTasks.delete(taskName);
  }
}

module.exports = { runTrackedTask, normalizeCounts, recordSkip };
