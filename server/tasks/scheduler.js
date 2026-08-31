const { logger } = require('../config/logger');
const { startPriceScheduler } = require('./priceScheduler');
const { startAlertScheduler } = require('./alertScheduler');
const { startFxScheduler } = require('./fxScheduler');
const rebalanceScheduleManager = require('../services/rebalance/scheduleManager');

let schedulerState = null;

async function startSchedulers() {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    logger.info('SCHEDULERS_DISABLED');
    return { enabled: false, stop() {} };
  }
  if (schedulerState) return schedulerState;

  const priceJob = startPriceScheduler();
  const alertJob = startAlertScheduler();
  const fxJob = startFxScheduler();
  try {
    await rebalanceScheduleManager.initSchedules();
  } catch (error) {
    priceJob.stop();
    alertJob.stop();
    fxJob.stop();
    throw error;
  }
  schedulerState = {
    enabled: true,
    stop() {
      priceJob.stop();
      alertJob.stop();
      fxJob.stop();
      rebalanceScheduleManager.cancelAllSchedules();
      schedulerState = null;
    }
  };
  logger.info('SCHEDULERS_STARTED', { owner: 'node-resident-process' });
  return schedulerState;
}

module.exports = { startSchedulers };
