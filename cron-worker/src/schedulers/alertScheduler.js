// cron-worker/src/schedulers/alertScheduler.js
// 提醒评估 cron（PRD AL-05）：默认每日 04:00（ALERT_EVAL_CRON）跑批。
// 由 TASK-005（统一调度器）自 server/tasks/alertScheduler.js 迁入——
// 业务引擎仍来自 @portomind/shared（server 的 POST /api/alerts/evaluate 手动入口共用同一实现）。

const { createCronScheduler, resolveTimezone } = require('./cronScheduler');
const { taskLogger } = require('@portomind/shared/config/logger');
const { runTrackedTask } = require('@portomind/shared/services/taskRunner');
const { evaluateAll } = require('@portomind/shared/services/alertEngine.service');
const { marketDate } = require('@portomind/shared/utils/marketTime');

const DEFAULT_ALERT_EVAL_CRON = '0 4 * * *';

// runKey 保持与迁移前一致（daily:<调度时区当日日期>），避免 taskruns 历史断代。
async function evaluateAllTracked() {
  const timezone = resolveTimezone();
  return runTrackedTask({
    taskName: 'alert-evaluate',
    runKey: `daily:${marketDate(new Date(), timezone)}`,
    trigger: 'SCHEDULED',
    execute: async () => {
      const stats = await evaluateAll();
      taskLogger.info('ALERT_EVALUATE_DONE', stats);
      return { totalCount: 1, successCount: 1, failureCount: 0, ...stats };
    }
  });
}

const startAlertScheduler = createCronScheduler({
  envKey: 'ALERT_EVAL_CRON',
  defaultCron: DEFAULT_ALERT_EVAL_CRON,
  taskName: 'alert-evaluate',
  run: evaluateAllTracked
});

module.exports = { DEFAULT_ALERT_EVAL_CRON, startAlertScheduler, evaluateAllTracked };
