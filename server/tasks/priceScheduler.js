// ✅ 文件：server/tasks/priceScheduler.js
const cron = require('node-cron');
const {taskLogger} = require('../config/logger'); 
const syncPrices = require('./syncPrices');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 每天早上 8 点触发
cron.schedule('0 8 * * *', () => {
  taskLogger.info('🕗 启动定时任务：每日价格同步');
  syncPrices();
});

// 防止主进程退出（让 cron 保持活动）
taskLogger.info('📅 priceScheduler 已启动，等待每日任务触发');
