// cron-worker/src/tasks/scheduler.js
// 调度统一启动入口：价格 cron 与健康检查 cron 统一由 src/schedulers/ 下的工厂创建并注册，
// 与 ../server/tasks/scheduler.js 保持一致（不含再平衡）。

const { logger } = require('../config/logger');
const { startPriceScheduler } = require('../schedulers/priceScheduler');
const { startHealthScheduler } = require('../schedulers/healthScheduler');

let schedulerState = null;

async function startSchedulers() {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    logger.info('SCHEDULERS_DISABLED');
    return { enabled: false, stop() {} };
  }
  if (schedulerState) return schedulerState;

  const priceJob = startPriceScheduler();
  const healthJob = startHealthScheduler();
  schedulerState = {
    enabled: true,
    stop() {
      priceJob.stop();
      healthJob.stop();
      schedulerState = null;
    }
  };
  logger.info('SCHEDULERS_STARTED', { owner: 'node-resident-process' });
  return schedulerState;
}

module.exports = { startSchedulers };
