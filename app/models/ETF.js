const mongoose = require('mongoose');

const etfSchema = new mongoose.Schema({
  code: String,       // 基金代码
  name: String,       // 基金名称
  price: Number,      // 当前价格
  change: String,     // 涨跌幅
  volume: Number,     // 成交量
  date: { type: Date, default: Date.now }, // 抓取时间
});

module.exports = mongoose.model('ETF', etfSchema);