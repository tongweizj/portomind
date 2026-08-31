// server/tasks/fxScheduler.js
// 汇率采集定时任务（PRD §3 家庭层前置）：默认每日 09:30（央行中间价公布后）同步
// 最新 USD/CAD/HKD → CNY 汇率；失败仅记日志，不阻塞其他调度（家庭视图可手动录入兜底）。
const cron = require('node-cron');
const { taskLogger } = require('../config/logger');
const { runTrackedTask } = require('../services/taskRunner');
const { syncLatestRates } = require('../services/fxRate.service');

const DEFAULT_FX_SYNC_CRON = '30 9 * * *';

function startFxScheduler(options = {}) {
  const cronExpression = options.cronExpression || process.env.FX_SYNC_CRON || DEFAULT_FX_SYNC_CRON;
  const timezone = options.timezone || process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto';
  const syncer = options.syncer || syncLatestRates;

  if (!cron.validate(cronExpression)) throw new Error(`Invalid FX_SYNC_CRON: ${cronExpression}`);

  const job = cron.schedule(cronExpression, async () => {
    try {
      await runTrackedTask({
        taskName: 'fx-rate-sync',
        runKey: `daily:${new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date())}`,
        trigger: 'SCHEDULED',
        execute: async () => {
          const records = await syncer();
          taskLogger.info('FX_SYNC_DONE', { count: records.length });
          return { totalCount: 1, successCount: 1, failureCount: 0, fxCount: records.length };
        }
      });
    } catch (error) {
      taskLogger.error('FX_SCHEDULER_FAILED', {
        message: error.message,
        category: error.category || 'INTERNAL'
      });
    }
  }, { scheduled: true, timezone });

  taskLogger.info('FX_SCHEDULER_STARTED', { cronExpression, timezone });
  return job;
}

module.exports = { DEFAULT_FX_SYNC_CRON, startFxScheduler };
