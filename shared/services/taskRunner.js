const TaskRun = require('../models/taskRun');
const { taskLogger } = require('../config/logger');

const activeTasks = new Map();

function normalizeCounts(result = {}) {
  return {
    totalCount: Number(result.totalCount || 0),
    successCount: Number(result.successCount || 0),
    failureCount: Number(result.failureCount || 0),
    failures: Array.isArray(result.failures) ? result.failures : []
  };
}

async function runTrackedTask({ taskName, runKey, trigger = 'SCHEDULED', execute }) {
  if (activeTasks.has(taskName)) {
    taskLogger.warn('TASK_SKIPPED_ALREADY_RUNNING', {
      taskName, runKey, trigger, activeRunKey: activeTasks.get(taskName)
    });
    return { taskName, runKey, trigger, status: 'SKIPPED', reason: 'ALREADY_RUNNING' };
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
        return { taskName, runKey, trigger, status: 'SKIPPED', reason: 'DUPLICATE_RUN_KEY' };
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

module.exports = { runTrackedTask };
