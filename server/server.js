require('dotenv').config();
const { logger } = require('@portomind/shared/config/logger');
const app = require('./app');
const db = require('@portomind/shared/models');
const userService = require('@portomind/shared/services/user.service');

async function startServer() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await db.mongoose.connect(process.env.MONGO_URI);
  logger.info('DATABASE_CONNECTED');

  // TASK-058：首次部署 seed 默认 admin/admin（users 为空时；幂等，不覆盖既有用户；日志不打印密码）
  await userService.ensureDefaultAdmin();

  // 本进程不启动任何 cron：全部定时任务由 cron-worker 单进程调度（见 ADR-002）。
  // 手动触发入口（POST /api/alerts/evaluate、POST /api/family/fx/sync、再平衡 check/suggestions/execute）
  // 仍由本进程提供，业务引擎来自 @portomind/shared。
  const port = process.env.PORT || 8080;
  return app.listen(port, () => logger.info('SERVER_STARTED', { port, scheduler: 'none' }));
}

if (require.main === module) {
  startServer().catch(error => {
    logger.error('SERVER_START_FAILED', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  });
}

module.exports = { startServer };
