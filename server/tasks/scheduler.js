const { logger } = require('../config/logger');
const { startPriceScheduler } = require('./priceScheduler');
const rebalanceScheduleManager = require('../services/rebalance/scheduleManager');

let schedulerState = null;

async function startSchedulers() {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    logger.info('SCHEDULERS_DISABLED');
    return { enabled: false, stop() {} };
  }
  if (schedulerState) return schedulerState;

  const priceJob = startPriceScheduler();
  try {
    await rebalanceScheduleManager.initSchedules();
  } catch (error) {
    priceJob.stop();
    throw error;
  }
  schedulerState = {
    enabled: true,
    stop() {
      priceJob.stop();
      rebalanceScheduleManager.cancelAllSchedules();
      schedulerState = null;
    }
  };
  logger.info('SCHEDULERS_STARTED', { owner: 'node-resident-process' });
  return schedulerState;
}

module.exports = { startSchedulers };
