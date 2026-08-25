// cron-worker/src/schedulers/cronScheduler.js
// 通用 cron 调度器工厂：统一 cron 表达式校验、时区解析、回调 try/catch 与启动日志，
// 供 priceScheduler / healthScheduler 复用，消除重复。

const cron = require('node-cron');
const { taskLogger } = require('../config/logger');

function resolveTimezone() {
  return process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto';
}

// 日志代码：taskName 'price-sync' → PRICE_SYNC_SCHEDULER_STARTED / _FAILED。
function logCode(taskName, suffix) {
  return `${taskName.replace(/-/g, '_').toUpperCase()}_SCHEDULER_${suffix}`;
}

// 参数：
//   envKey      读取 cron 表达式的环境变量名，如 'PRICE_SYNC_CRON'
//   defaultCron 默认 cron 表达式
//   taskName    任务名（用于日志代码，如 'price-sync'）
//   run         触发时执行的任务函数（async）；可在 start 的 options.run 中覆盖
function createCronScheduler({ envKey, defaultCron, taskName, run }) {
  if (!envKey || !defaultCron || !taskName || typeof run !== 'function') {
    throw new TypeError('createCronScheduler requires { envKey, defaultCron, taskName, run }');
  }

  return function startScheduler(options = {}) {
    const cronExpression = options.cronExpression || process.env[envKey] || defaultCron;
    const timezone = options.timezone || resolveTimezone();
    const execute = options.run || run;

    if (!cron.validate(cronExpression)) throw new Error(`Invalid ${envKey}: ${cronExpression}`);

    const job = cron.schedule(cronExpression, async () => {
      try {
        await execute();
      } catch (error) {
        taskLogger.error(logCode(taskName, 'FAILED'), {
          message: error.message,
          category: error.category || 'INTERNAL'
        });
      }
    }, { scheduled: true, timezone });

    taskLogger.info(logCode(taskName, 'STARTED'), { cronExpression, timezone });
    return job;
  };
}

module.exports = { createCronScheduler };
