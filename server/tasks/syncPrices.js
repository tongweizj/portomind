// ✅ 文件：server/tasks/syncPrices.js（只执行一次同步，并退出）
const mongoose = require('mongoose');
const logger = require('../config/logger');   
const fs = require('fs');
const path = require('path');
const Asset = require('../models/asset');
const Price = require('../models/price');
const getYahooPrice = require('../services/yahooPrice');
const getFundDailyInfo = require('../services/tiantianPrice');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

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
    logger.info('✅ MongoDB 已连接');

    const assets = await Asset.find({ active: true });
    logger.info(`📊 准备抓取 ${assets.length} 个资产价格...`);

    for (const asset of assets) {
      let { symbol, market } = asset;
      let fetcher;

      try {
        fetcher = getPriceFetcher(market);
      } catch (fetcherErr) {
        logger.info(`❌ ${asset.symbol}: ${fetcherErr.message}`);
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
          logger.info(`✅ 跳过已存在价格: ${resolvedSymbol}`);
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

        logger.info(`📦 成功保存：${resolvedSymbol} @ ${price}`);
      } catch (err) {
        logger.info(`❌ 抓取失败 ${asset.symbol}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.info(`❌ 数据库连接失败：${err.message}`);
  } finally {
    await mongoose.disconnect();
    logger.info('✅ 断开 MongoDB 连接');
  }
}

if (require.main === module) {
  syncPrices()
    .then(() => {
      logger.info('✅ 同步完成，进程退出');
      process.exit(0);
    })
    .catch(err => {
      logger.info(`❌ 同步失败: ${err.message}`);
      process.exit(1);
    });
}

module.exports = syncPrices;
