const cron = require('node-cron');
const etfService = require('../services/etfService');

// 每天上午 9:30 执行抓取任务
const startFetchTask = () => {
  cron.schedule('30 9 * * *', () => {
    console.log('Starting ETF data fetch...');
    const etfCodes = ['510300', '510050']; // 需要抓取的 ETF 代码
    etfService.fetchAndSaveETFData(etfCodes);
  });
};

module.exports = startFetchTask;