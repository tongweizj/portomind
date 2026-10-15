// cron-worker/src/tasks/dailySync.js
// 手动价格同步的 CLI 入口（`npm run sync:prices`）。
// 注意：**定时调度不经过本文件** —— src/schedulers/priceScheduler.js 直接调用
// @portomind/shared/tasks/dailySync（与 server 侧 `npm run sync:prices` 同一实现）。
// 本文件只负责：加载 cron-worker/.env → 建立 MongoDB 连接 → 调用共享任务 → 断开连接。

require('../config/env');
const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const { taskLogger } = require('@portomind/shared/config/logger');
const dailySync = require('@portomind/shared/tasks/dailySync');

async function runFromCommandLine() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const summary = await dailySync({ trigger: 'MANUAL' });
    if (summary.status === 'PARTIAL' || summary.status === 'FAILED') process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runFromCommandLine().catch(error => {
    taskLogger.error('PRICE_SYNC_COMMAND_FAILED', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  });
}

module.exports = dailySync;
module.exports.syncActiveAssetPrices = dailySync.syncActiveAssetPrices;
module.exports.marketDate = dailySync.marketDate;
