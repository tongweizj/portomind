const mongoose = require('mongoose');
const etfService = require('../services/sina.service');
require('dotenv').config();
// 连接 MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('Starting ETF data fetch...');
const etfCodes = ['510300', '510050']; // 需要抓取的 ETF 代码
etfService.fetchAndSaveChineseETFData(etfCodes);
