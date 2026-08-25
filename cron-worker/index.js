// cron-worker/index.js
// 服务启动入口：加载环境变量 → 连接 MongoDB → 启动调度。

require('./src/config/env');

const { logger } = require('./src/config/logger');
const { connect, disconnect } = require('./src/config/database');
const { startSchedulers } = require('./src/tasks/scheduler');

let scheduler = null;

async function start() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await connect(process.env.MONGO_URI);
  logger.info('DATABASE_CONNECTED');

  scheduler = await startSchedulers();
  logger.info('WORKER_STARTED');
}

async function shutdown(signal) {
  logger.info('WORKER_SHUTTING_DOWN', { signal });
  try {
    if (scheduler && typeof scheduler.stop === 'function') scheduler.stop();
  } catch (error) {
    logger.error('SCHEDULER_STOP_FAILED', { message: error.message });
  }
  try {
    await disconnect();
  } catch (error) {
    logger.error('DB_DISCONNECT_FAILED', { message: error.message });
  }
  process.exit(0);
}

if (require.main === module) {
  start()
    .then(() => {
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch(error => {
      logger.error('WORKER_START_FAILED', { message: error.message, stack: error.stack });
      process.exit(1);
    });
}

module.exports = { start, shutdown };
