// ✅ 文件：server/tasks/syncPrices.js（正式修复版本）
const mongoose = require('mongoose');
const Asset = require('../models/asset');
const Price = require('../models/price');
const getYahooPrice = require('../services/yahooPrice');
const getFundDailyInfo = require('../services/tiantianPrice');

const MONGO_URI = 'mongodb://etfdata:etfdata123@192.168.2.110:27017/etf-data?authSource=admin';

function getPriceFetcher(market) {
    if (market === 'CN-FUND') return getFundDailyInfo;
    if (['US', 'CA', 'CN-SH', 'CN-SZ'].includes(market)) return getYahooPrice;
    throw new Error(`❌ 不支持的市场类型: ${market}`);
  }
  
  async function syncPrices() {
    try {
      await mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('✅ MongoDB 已连接');
  
      const assets = await Asset.find({ active: true });
      console.log(`📊 准备抓取 ${assets.length} 个资产价格...`);
  
      for (const asset of assets) {
        let { symbol, market } = asset;
        let fetcher;
  
        try {
          fetcher = getPriceFetcher(market);
        } catch (fetcherErr) {
          console.warn(fetcherErr.message);
          continue;
        }
  
        // ⛏️ 如果是中国基金，去除 .cn 后缀
        if (market === 'CN-FUND') {
          symbol = symbol.replace('.cn', '');
        }
  
        try {
          const data = await fetcher(symbol);
  
          const resolvedSymbol = data.symbol || data.code || asset.symbol;
          const name = data.name || '';
          const price = data.price;
          const change = data.change ?? 0;
  
          if (!resolvedSymbol || !price) throw new Error('无效数据');
  
          const alreadyExists = await Price.findOne({
            symbol: resolvedSymbol,
            date: { $gte: new Date().setHours(0, 0, 0, 0) }
          });
  
          if (alreadyExists) {
            console.log(`✅ 跳过已存在价格: ${resolvedSymbol}`);
            continue;
          }
  
          await Price.create({
            symbol: resolvedSymbol,
            name,
            price,
            change,
            date: new Date(),
            source: market
          });
  
          console.log(`📦 成功保存：${resolvedSymbol} @ ${price}`);
        } catch (err) {
          console.error(`❌ 抓取失败 ${asset.symbol}:`, err.message);
        }
      }
    } catch (err) {
      console.error('❌ 数据库连接失败：', err);
    } finally {
      await mongoose.disconnect();
      console.log('✅ 断开 MongoDB 连接');
    }
  }
  
  // ✅ 每天早上 8:00 自动执行
  cron.schedule('0 8 * * *', () => {
    console.log('🕗 启动定时任务：每日价格同步');
    syncPrices();
  });
  
  // ✅ 允许直接执行一次
  if (require.main === module) {
    syncPrices();
  }
  