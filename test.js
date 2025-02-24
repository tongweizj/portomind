const mongoose = require('mongoose');
const etfService = require('./app/services/chinese.etf.service');
// 连接 MongoDB
mongoose.connect('mongodb://etfdata:etfdata123@192.168.2.110:27017/etf-data?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('Starting ETF data fetch...');
const etfCodes = ['510300', '510050']; // 需要抓取的 ETF 代码
etfService.fetchAndSaveChineseETFData(etfCodes);
