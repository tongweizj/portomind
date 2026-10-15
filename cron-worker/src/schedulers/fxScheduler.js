// cron-worker/src/schedulers/fxScheduler.js
// 汇率采集 cron（PRD §3 家庭层前置）：默认每日 09:30（FX_SYNC_CRON，央行中间价公布后）
// 同步最新 USD/CAD/HKD → CNY 汇率。失败仅记日志，不阻塞其他调度。
// 由 TASK-005（统一调度器）自 server/tasks/fxScheduler.js 迁入——
// 业务引擎仍来自 @portomind/shared（server 的 POST /api/family/fx/sync 手动入口共用同一实现）。

const { createCronScheduler, resolveTimezone } = require('./cronScheduler');
const { taskLogger } = require('@portomind/shared/config/logger');
const { runTrackedTask } = require('@portomind/shared/services/taskRunner');
const { syncLatestRates } = require('@portomind/shared/services/fxRate.service');
const { marketDate } = require('@portomind/shared/utils/marketTime');

const DEFAULT_FX_SYNC_CRON = '30 9 * * *';

// runKey 保持与迁移前一致（daily:<调度时区当日日期>），避免 taskruns 历史断代。
async function syncLatestRatesTracked() {
  const timezone = resolveTimezone();
  return runTrackedTask({
    taskName: 'fx-rate-sync',
    runKey: `daily:${marketDate(new Date(), timezone)}`,
    trigger: 'SCHEDULED',
    execute: async () => {
      const records = await syncLatestRates();
      taskLogger.info('FX_SYNC_DONE', { count: records.length });
      return { totalCount: 1, successCount: 1, failureCount: 0, fxCount: records.length };
    }
  });
}

const startFxScheduler = createCronScheduler({
  envKey: 'FX_SYNC_CRON',
  defaultCron: DEFAULT_FX_SYNC_CRON,
  taskName: 'fx-rate-sync',
  run: syncLatestRatesTracked
});

module.exports = { DEFAULT_FX_SYNC_CRON, startFxScheduler, syncLatestRatesTracked };
