// ✅ 文件：server/tasks/syncPrices.js（只执行一次同步，并退出）
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Asset = require('../models/asset');
const Price = require('../models/price');
const getYahooPrice = require('../services/yahooPrice');
const getFundDailyInfo = require('../services/tiantianPrice');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const logPath = path.resolve(process.env.LOG || './logs');
const logFile = fs.createWriteStream(`${logPath}/sync.log`, { flags: 'a' });

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
        log(`❌ ${asset.symbol}: ${fetcherErr.message}`);
        continue;
      }

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
        log(`❌ 抓取失败 ${asset.symbol}: ${err.message}`);
      }
    }
  } catch (err) {
    log(`❌ 数据库连接失败：${err.message}`);
  } finally {
    await mongoose.disconnect();
    log('✅ 断开 MongoDB 连接');
  }
}

if (require.main === module) {
  syncPrices()
    .then(() => {
      log('✅ 同步完成，进程退出');
      process.exit(0);
    })
    .catch(err => {
      log(`❌ 同步失败: ${err.message}`);
      process.exit(1);
    });
}

module.exports = syncPrices;
