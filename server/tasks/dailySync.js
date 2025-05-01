// server/tasks/dailySync.js

const cron = require('node-cron');
const logger = require('../config/logger');
const { getAllAssets } = require('../services/assetService');
const { fetchLatest } = require('../services/priceFetch.service');
const { saveLatest } = require('../services/priceStorage.service');

/**
 * 每日最新价同步函数
 */
async function dailySync() {
  try {
    const assets = await getAllAssets();
    for (const asset of assets) {
      try {
        const priceData = await fetchLatest(asset.symbol);
        await saveLatest(priceData);
        logger.info(`Saved latest price for ${asset.symbol}: ${priceData.price}`);
      } catch (err) {
        logger.error(`Error syncing ${asset.symbol}: ${err.message}`, { stack: err.stack });
      }
    }
  } catch (err) {
    logger.error(`dailySync failed: ${err.message}`, { stack: err.stack });
  }
}

// 注册为 Cron 任务：每天 08:00（东部时区）
cron.schedule('0 8 * * *', () => {
  logger.info('Starting daily price sync');
  dailySync();
}, {
  timezone: 'America/Toronto'
});

// 如果直接以脚本方式运行，则执行一次后退出
if (require.main === module) {
  dailySync()
    .then(() => {
      logger.info('One-off dailySync completed');
      process.exit(0);
    })
    .catch(err => {
      logger.error(err);
      process.exit(1);
    });
}

module.exports = dailySync;
