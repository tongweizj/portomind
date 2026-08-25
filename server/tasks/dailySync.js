const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const { taskLogger } = require('../config/logger');
const { getActiveAssets } = require('../services/asset.service');
const { fetchLatest } = require('../services/priceFetch.service');
const { saveLatest } = require('../services/priceStorage.service');
const { runTrackedTask } = require('../services/taskRunner');

function marketDate(date = new Date(), timeZone = process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

async function syncActiveAssetPrices(dependencies = {}) {
  const loadAssets = dependencies.getActiveAssets || getActiveAssets;
  const loadPrice = dependencies.fetchLatest || fetchLatest;
  const persistPrice = dependencies.saveLatest || saveLatest;
  const assets = await loadAssets();
  const summary = { totalCount: assets.length, successCount: 0, failureCount: 0, failures: [] };

  taskLogger.info('PRICE_SYNC_ASSETS_LOADED', { totalCount: assets.length });
  for (const asset of assets) {
    try {
      const priceData = await loadPrice(asset.symbol);
      await persistPrice(priceData);
      summary.successCount += 1;
      taskLogger.info('PRICE_SYNC_ASSET_SUCCEEDED', {
        symbol: asset.symbol,
        timestamp: priceData.timestamp,
        price: priceData.price
      });
    } catch (error) {
      summary.failureCount += 1;
      const failure = {
        item: asset.symbol,
        category: error.category || 'INTERNAL',
        provider: error.provider,
        retryable: Boolean(error.retryable),
        message: error.message
      };
      summary.failures.push(failure);
      taskLogger.error('PRICE_SYNC_ASSET_FAILED', failure);
    }
  }
  return summary;
}

async function dailySync(options = {}) {
  const trigger = options.trigger || 'SCHEDULED';
  const runKey = options.runKey || (trigger === 'SCHEDULED'
    ? marketDate()
    : `manual:${new Date().toISOString()}`);

  return runTrackedTask({
    taskName: 'daily-price-sync',
    runKey,
    trigger,
    execute: () => syncActiveAssetPrices(options.dependencies)
  });
}

async function runFromCommandLine() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const summary = await dailySync({ trigger: 'MANUAL' });
    if (summary.status === 'PARTIAL' || summary.status === 'FAILED') process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runFromCommandLine().catch(error => {
    taskLogger.error('PRICE_SYNC_COMMAND_FAILED', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  });
}

module.exports = dailySync;
module.exports.syncActiveAssetPrices = syncActiveAssetPrices;
module.exports.marketDate = marketDate;
