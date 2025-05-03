// server/tasks/dailySync.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const cron = require('node-cron');
const { taskLogger } = require('../config/logger');
const { getAllAssets } = require('../services/assetService');
const { fetchLatest } = require('../services/priceFetch.service');
const { saveLatest } = require('../services/priceStorage.service');

/**
 * 每日最新价同步函数
 */
async function dailySync() {
  taskLogger.info('Sync_Prices_START');
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    taskLogger.info('✅ MongoDB 已连接');

    const assets = await getAllAssets();
    taskLogger.info(`📊 准备抓取 ${assets.length} 个资产价格...`);

    for (const asset of assets) {
      try {
        const priceData = await fetchLatest(asset.symbol);
        await saveLatest(priceData);
        taskLogger.info(`Saved latest price for ${asset.symbol}: ${priceData.price}`);
      } catch (err) {
        taskLogger.error(`❌ Error syncing ${asset.symbol}: ${err.message}`, { stack: err.stack });
      }
    }
  } catch (err) {
    taskLogger.error(`dailySync failed: ${err.message}`, { stack: err.stack });
  }
}

// 测试时, 以脚本方式运行，则执行一次后退出
if (require.main === module) {
  taskLogger.info('✅  from module');
  dailySync()
    .then(() => {
      taskLogger.info('✅  One-off dailySync completed');
      process.exit(0);
    })
    .catch(err => {
      taskLogger.error(err);
      process.exit(1);
    });
}

module.exports = dailySync;
