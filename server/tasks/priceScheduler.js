const cron = require('node-cron');
const { taskLogger } = require('../config/logger');
const dailySync = require('./dailySync');

const DEFAULT_PRICE_SYNC_CRON = '0 3 * * *';

function startPriceScheduler(options = {}) {
  const cronExpression = options.cronExpression || process.env.PRICE_SYNC_CRON || DEFAULT_PRICE_SYNC_CRON;
  const timezone = options.timezone || process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto';
  const sync = options.dailySync || dailySync;

  if (!cron.validate(cronExpression)) throw new Error(`Invalid PRICE_SYNC_CRON: ${cronExpression}`);

  const job = cron.schedule(cronExpression, async () => {
    try {
      await sync({ trigger: 'SCHEDULED' });
    } catch (error) {
      taskLogger.error('PRICE_SYNC_SCHEDULER_FAILED', {
        message: error.message,
        category: error.category || 'INTERNAL'
      });
    }
  }, { scheduled: true, timezone });

  taskLogger.info('PRICE_SYNC_SCHEDULER_STARTED', { cronExpression, timezone });
  return job;
}

module.exports = { DEFAULT_PRICE_SYNC_CRON, startPriceScheduler };
