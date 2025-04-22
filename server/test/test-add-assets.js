const mongoose = require('mongoose');
const Asset = require('../models/asset');

mongoose.connect('mongodb://etfdata:etfdata123@192.168.2.110:27017/etf-data?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const sampleAssets = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    market: 'US',
    currency: 'USD',
    type: 'stock',
    tags: ['科技', '消费'],
    watchlist: true,
    active: true
  },
  {
    symbol: 'TD.TO',
    name: 'Toronto-Dominion Bank',
    market: 'CA',
    currency: 'CAD',
    type: 'stock',
    tags: ['银行'],
    watchlist: true,
    active: true
  },
  {
    symbol: '600519.SS',
    name: '贵州茅台',
    market: 'CN-SH',
    currency: 'CNY',
    type: 'stock',
    tags: ['白酒'],
    watchlist: false,
    active: true
  },
  {
    symbol: '000001.SZ',
    name: '平安银行',
    market: 'CN-SZ',
    currency: 'CNY',
    type: 'stock',
    tags: ['银行'],
    watchlist: false,
    active: false
  },
  {
    symbol: '005827.cn',
    name: '易方达蓝筹精选',
    market: 'CN-FUND',
    currency: 'CNY',
    type: 'fund',
    tags: ['基金'],
    watchlist: true,
    active: true
  }
];

async function seedAssets() {
  try {
    await Asset.deleteMany({});
    await Asset.insertMany(sampleAssets);
    console.log('✅ 测试资产已成功添加');
  } catch (err) {
    console.error('❌ 添加失败:', err);
  } finally {
    mongoose.connection.close();
  }
}

seedAssets();
