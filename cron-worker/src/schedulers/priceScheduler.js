// cron-worker/src/schedulers/priceScheduler.js
// 价格同步 cron：基于通用工厂创建，按 PRICE_SYNC_CRON 触发 dailySync。
// dailySync 在回调内延迟加载，避免任务模块在调度注册阶段就被求值。

const { createCronScheduler } = require('./cronScheduler');

const DEFAULT_PRICE_SYNC_CRON = '0 3 * * *';

const startPriceScheduler = createCronScheduler({
  envKey: 'PRICE_SYNC_CRON',
  defaultCron: DEFAULT_PRICE_SYNC_CRON,
  taskName: 'price-sync',
  // 任务实现来自 @portomind/shared（与 server 侧 `npm run sync:prices` 同一份代码）
  run: () => require('@portomind/shared/tasks/dailySync')({ trigger: 'SCHEDULED' })
});

module.exports = { DEFAULT_PRICE_SYNC_CRON, startPriceScheduler };
