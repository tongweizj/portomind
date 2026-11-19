// cron-worker/src/schedulers/priceScheduler.js
// 按市场组注册价格同步 cron，共用 dailySync。
// dailySync 在回调内延迟加载，避免任务模块在调度注册阶段就被求值。

const { createCronScheduler } = require('./cronScheduler');
const { PRICE_SYNC_GROUPS } = require('@portomind/shared/config/priceSync');

function defaultCron({ hour, minute }) {
  return `${minute} ${hour} * * *`;
}

const DEFAULT_PRICE_SYNC_CRON = defaultCron(PRICE_SYNC_GROUPS.US_CA);
const DEFAULT_PRICE_SYNC_CN_CRON = defaultCron(PRICE_SYNC_GROUPS.CN);

const startUsCaScheduler = createCronScheduler({
  envKey: 'PRICE_SYNC_US_CA_CRON',
  defaultCron: DEFAULT_PRICE_SYNC_CRON,
  taskName: 'price-sync-us-ca',
  run: () => require('@portomind/shared/tasks/dailySync')({ trigger: 'SCHEDULED', marketGroup: 'US_CA' })
});

const startCnPriceScheduler = createCronScheduler({
  envKey: 'PRICE_SYNC_CN_CRON',
  defaultCron: DEFAULT_PRICE_SYNC_CN_CRON,
  taskName: 'price-sync-cn',
  run: () => require('@portomind/shared/tasks/dailySync')({ trigger: 'SCHEDULED', marketGroup: 'CN' })
});

function startPriceScheduler(options = {}) {
  return startUsCaScheduler({
    ...options,
    cronExpression: options.cronExpression || process.env.PRICE_SYNC_US_CA_CRON || process.env.PRICE_SYNC_CRON
  });
}

module.exports = { DEFAULT_PRICE_SYNC_CRON, DEFAULT_PRICE_SYNC_CN_CRON, startPriceScheduler, startCnPriceScheduler };
