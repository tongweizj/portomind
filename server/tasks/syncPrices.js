// ✅ 文件：server/tasks/syncPrices.js（正式修复版本）
const mongoose = require('mongoose');
const cron = require('node-cron');
const fs = require('fs');
const Asset = require('../models/asset');
const Price = require('../models/price');
const getYahooPrice = require('../services/yahooPrice');
const getFundDailyInfo = require('../services/tiantianPrice');
require('dotenv').config();
const logFile = fs.createWriteStream('/workspace/sync.log', { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toLocaleString()}] ${msg}\n`;
  console.log(line.trim());
  logFile.write(line);
}
function getPriceFetcher(market) {
    if (market === 'CN-FUND') return getFundDailyInfo;
    if (['US', 'CA', 'CN-SH', 'CN-SZ'].includes(market)) return getYahooPrice;
    throw new Error(`❌ 不支持的市场类型: ${market}`);
  }
  
  async function syncPrices() {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      log('✅ MongoDB 已连接');
  
      const assets = await Asset.find({ active: true });
      log(`📊 准备抓取 ${assets.length} 个资产价格...`);
  
      for (const asset of assets) {
        let { symbol, market } = asset;
        let fetcher;
  
        try {
          fetcher = getPriceFetcher(market);
        } catch (fetcherErr) {
          console.warn(fetcherErr.message);
          log(`❌ ${asset.symbol}: ${fetcherErr.message}`);
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
            log(`✅ 跳过已存在价格: ${resolvedSymbol}`);
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
  
          log(`📦 成功保存：${resolvedSymbol} @ ${price}`);
        } catch (err) {
          log(`❌ 抓取失败 ${asset.symbol}:`, err.message);
        }
      }
    } catch (err) {
      log('❌ 数据库连接失败：', err);
    } finally {
      await mongoose.disconnect();
      log('✅ 断开 MongoDB 连接');
    }
  }
  
  // ✅ 每天早上 8:00 自动执行
  cron.schedule('0 8 * * *', () => {
    log('🕗 启动定时任务：每日价格同步');
    syncPrices();
  });
  
  // ✅ 允许直接执行一次
  if (require.main === module) {
    syncPrices();
  }
  