#!/usr/bin/env node
// server/tasks/historySync.cjs
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const minimist = require('minimist');
const dayjs    = require('dayjs');
const {logger}   = require('../config/logger');
const { getAllAssets }  = require('../services/assetService');
const { fetchHistory }  = require('../services/priceFetch.service');
const { saveHistory }   = require('../services/priceStorage.service');

// 可选：指定本地 symbol 列表，留空则从数据库读取
const symbolList = [];  

async function historySync(from, to) {
  let symbols;
  if (symbolList.length > 0) {
    symbols = symbolList;
  } else {
    const assets = await getAllAssets();
    symbols = assets.map(a => a.symbol);
  }

  for (const symbol of symbols) {
    try {
      const records = await fetchHistory(symbol, from, to);
      await saveHistory(records);
      logger.info(`Saved ${records.length} records for ${symbol}`);
    } catch (err) {
      logger.error(`Error for ${symbol}: ${err.message}`, { stack: err.stack });
    }
  }
}

if (require.main === module) {
  // 解析 CLI 参数
  const argv = minimist(process.argv.slice(2));
  const from = argv.from ? dayjs(argv.from, 'YYYY-MM-DD') : null;
  const to   = argv.to   ? dayjs(argv.to,   'YYYY-MM-DD') : dayjs();

  if (!from || !from.isValid()) {
    console.error('Error: 参数 --from 必须为 YYYY-MM-DD 格式');
    process.exit(1);
  }
  if (!to.isValid()) {
    console.error('Error: 参数 --to 必须为 YYYY-MM-DD 格式');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Error: 未配置 MONGODB_URI 环境变量');
    process.exit(1);
  }

  mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
    .then(() => {
      logger.info('MongoDB connected');
      return historySync(from.toDate(), to.toDate());
    })
    .then(() => mongoose.disconnect())
    .then(() => {
      logger.info('historySync completed and MongoDB disconnected');
      process.exit(0);
    })
    .catch(err => {
      logger.error(`historySync uncaught error: ${err.message}`, { stack: err.stack });
      mongoose.disconnect().finally(() => process.exit(1));
    });
}

module.exports = historySync;
