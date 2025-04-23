// ✅ 文件：server/tasks/priceScheduler.js
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const syncPrices = require('./syncPrices');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 日志输出位置
const logPath = path.resolve(process.env.LOG || './logs');
const logFile = fs.createWriteStream(`${logPath}/sync.log`, { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toLocaleString()}] ${msg}\n`;
  console.log(line.trim());
  logFile.write(line);
}

// 每天早上 8 点触发
cron.schedule('0 */1 * * *', () => {
  log('🕗 启动定时任务：每日价格同步');
  syncPrices();
});

// 防止主进程退出（让 cron 保持活动）
log('📅 priceScheduler 已启动，等待每日任务触发');
