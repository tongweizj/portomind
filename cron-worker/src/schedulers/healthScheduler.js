// cron-worker/src/schedulers/healthScheduler.js
// 健康检查 cron：基于通用工厂创建，在每日价格同步（默认 03:00）之后运行一次价格完整性检查，
// 对存在数据缺口的资产可选自动调用 historySync 补全（INTEGRITY_AUTO_REPAIR，默认开）。

const { createCronScheduler } = require('./cronScheduler');

// 默认 03:30，晚于 PRICE_SYNC_CRON（03:00）半小时，确保当日价格已入库后再校验。
const DEFAULT_HEALTH_CHECK_CRON = '30 3 * * *';

const startHealthScheduler = createCronScheduler({
  envKey: 'HEALTH_CHECK_CRON',
  defaultCron: DEFAULT_HEALTH_CHECK_CRON,
  taskName: 'health-check',
  run: () => require('../tasks/integrityCheck')({ trigger: 'SCHEDULED' })
});

module.exports = { DEFAULT_HEALTH_CHECK_CRON, startHealthScheduler };
