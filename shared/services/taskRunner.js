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

async function runTrackedTask({ taskName, runKey, trigger = 'SCHEDULED', execute }) {
  if (activeTasks.has(taskName)) {
    const activeRunKey = activeTasks.get(taskName);
    taskLogger.warn('TASK_SKIPPED_ALREADY_RUNNING', {
      taskName, runKey, trigger, activeRunKey
    });
    const persisted = await recordSkip({ taskName, runKey, trigger, reason: 'ALREADY_RUNNING', activeRunKey });
    return { taskName, runKey, trigger, status: 'SKIPPED', reason: 'ALREADY_RUNNING', ...persisted };
  }

  activeTasks.set(taskName, runKey);
  const startedAt = new Date();
  let taskRun;

  try {
    try {
      taskRun = await TaskRun.create({ taskName, runKey, trigger, startedAt });
    } catch (error) {
      if (error && error.code === 11000) {
        taskLogger.warn('TASK_SKIPPED_DUPLICATE_RUN_KEY', { taskName, runKey, trigger });
        const persisted = await recordSkip({ taskName, runKey, trigger, reason: 'DUPLICATE_RUN_KEY' });
        return { taskName, runKey, trigger, status: 'SKIPPED', reason: 'DUPLICATE_RUN_KEY', ...persisted };
      }
      throw error;
    }

    taskLogger.info('TASK_START', {
      taskName,
      runKey,
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
        taskName, runKey, trigger, status,
        startedAt, endedAt, durationMs,
        ...result
      };

      await TaskRun.updateOne({ _id: taskRun._id }, { $set: summary });
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
      await TaskRun.updateOne({ _id: taskRun._id }, { $set: summary });
      taskLogger.error('TASK_END', {
        taskRunId: taskRun._id.toString(), taskName, runKey, trigger,
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
