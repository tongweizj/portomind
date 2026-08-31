// server/tasks/alertScheduler.js
// 提醒评估定时任务（PRD AL-05）：默认每日 04:00（ALERT_EVAL_CRON）跑批，
// 复用 runTrackedTask 做 TaskRun 防重追踪（与 priceScheduler 同一模式）。
const cron = require('node-cron');
const { taskLogger } = require('../config/logger');
const { runTrackedTask } = require('../services/taskRunner');
const { evaluateAll } = require('../services/alertEngine.service');

const DEFAULT_ALERT_EVAL_CRON = '0 4 * * *';

function startAlertScheduler(options = {}) {
  const cronExpression = options.cronExpression || process.env.ALERT_EVAL_CRON || DEFAULT_ALERT_EVAL_CRON;
  const timezone = options.timezone || process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto';
  const evaluator = options.evaluator || evaluateAll;

  if (!cron.validate(cronExpression)) throw new Error(`Invalid ALERT_EVAL_CRON: ${cronExpression}`);

  const job = cron.schedule(cronExpression, async () => {
    try {
      await runTrackedTask({
        taskName: 'alert-evaluate',
        runKey: `daily:${new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date())}`,
        trigger: 'SCHEDULED',
        execute: async () => {
          const stats = await evaluator();
          taskLogger.info('ALERT_EVALUATE_DONE', stats);
          return { totalCount: 1, successCount: 1, failureCount: 0, ...stats };
        }
      });
    } catch (error) {
      taskLogger.error('ALERT_SCHEDULER_FAILED', {
        message: error.message,
        category: error.category || 'INTERNAL'
      });
    }
  }, { scheduled: true, timezone });

  taskLogger.info('ALERT_SCHEDULER_STARTED', { cronExpression, timezone });
  return job;
}

module.exports = { DEFAULT_ALERT_EVAL_CRON, startAlertScheduler };
