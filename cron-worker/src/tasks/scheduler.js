// cron-worker/src/tasks/scheduler.js
//
// 调度统一启动入口：5 类定时任务，价格同步按两组注册，共 6 个 cron。
// cron-worker 是**唯一**的调度所有者（ADR-002）；server 进程不注册任何 cron。
//
//   1. 价格同步     priceScheduler      PRICE_SYNC_US_CA_CRON / PRICE_SYNC_CN_CRON
//   2. 完整性检查   healthScheduler     HEALTH_CHECK_CRON
//   3. 提醒评估     alertScheduler      ALERT_EVAL_CRON
//   4. 汇率同步     fxScheduler         FX_SYNC_CRON
//   5. 再平衡分发   rebalanceScheduler  REBALANCE_CHECK_CRON

const { logger } = require('@portomind/shared/config/logger');
const { startPriceScheduler, startCnPriceScheduler } = require('../schedulers/priceScheduler');
const { startHealthScheduler } = require('../schedulers/healthScheduler');
const { startAlertScheduler } = require('../schedulers/alertScheduler');
const { startFxScheduler } = require('../schedulers/fxScheduler');
const { startRebalanceScheduler } = require('../schedulers/rebalanceScheduler');

let schedulerState = null;

async function startSchedulers() {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    logger.info('SCHEDULERS_DISABLED');
    return { enabled: false, jobs: [], stop() {} };
  }
  if (schedulerState) return schedulerState;

  const starters = [
    startPriceScheduler, startCnPriceScheduler, startHealthScheduler,
    startAlertScheduler, startFxScheduler, startRebalanceScheduler
  ];
  const jobs = [];
  try {
    for (const start of starters) jobs.push(start());
  } catch (error) {
    for (const job of jobs) job.stop();
    throw error;
  }

  schedulerState = {
    enabled: true,
    jobs,
    stop() {
      for (const job of jobs) job.stop();
      schedulerState = null;
    }
  };
  logger.info('SCHEDULERS_STARTED', { owner: 'cron-worker', count: jobs.length });
  return schedulerState;
}

module.exports = { startSchedulers };
