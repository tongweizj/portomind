require('dotenv').config();
const { logger } = require('./config/logger');
const app = require('./app');
const db = require('./models');
const { startSchedulers } = require('./tasks/scheduler');

async function startServer() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await db.mongoose.connect(process.env.MONGO_URI);
  logger.info('DATABASE_CONNECTED');

  await startSchedulers();
  const port = process.env.PORT || 8080;
  return app.listen(port, () => logger.info('SERVER_STARTED', { port }));
}

if (require.main === module) {
  startServer().catch(error => {
    logger.error('SERVER_START_FAILED', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  });
}

module.exports = { startServer };
