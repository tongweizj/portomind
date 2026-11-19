// shared/tasks/dailySync.js
// 每日价格同步（业务能力，server 与 cron-worker 共用；本模块**不**加载 .env、不建立连接）：
// 获取全部激活资产 → 逐资产校验市场当日是否开市（休市跳过并记 info）→
// 经带重试的 Fetcher 抓取并入库；整体由 runTrackedTask 追踪（耗时、成功/失败明细）。
//
// 调用方约定：
//  - 调度触发：cron-worker/src/schedulers/priceScheduler.js（进程已连接 MongoDB）
//  - 手动触发：server/tasks/dailySync.js / cron-worker/src/tasks/dailySync.js（CLI 薄壳，负责
//    加载 .env 与建连，再调用本模块）

const { taskLogger } = require('../config/logger');
const { PRICE_SYNC_GROUPS, priceSyncGroupOf } = require('../config/priceSync');
const { marketDate, todayString } = require('../utils/marketTime');
const { getActiveAssets } = require('../services/asset.service');
const { fetchLatest, resolveFetcher } = require('../services/priceFetch.service');
const { saveLatest } = require('../services/priceStorage.service');
const { runTrackedTask } = require('../services/taskRunner');
const { isMarketOpenToday } = require('../services/calendar.service');
const { MARKET_DATA_ERROR, MarketDataError } = require('../fetchers/errors');

let scheduledBatch = Promise.resolve();

async function syncActiveAssetPrices(dependencies = {}, context = {}) {
  const loadAssets = dependencies.getActiveAssets || getActiveAssets;
  const loadPrice = dependencies.fetchLatest || fetchLatest;
  const persistPrice = dependencies.saveLatest || saveLatest;
  const marketOpen = dependencies.isMarketOpenToday || isMarketOpenToday;

  const activeAssets = await loadAssets();
  const assets = context.marketGroup
    ? activeAssets.filter(asset => priceSyncGroupOf(asset.market) === context.marketGroup)
    : activeAssets;
  // ET 中午时亚洲已跨日。用批次的目标日判断该市场是否开市。
  const calendarDate = context.marketGroup && context.scheduledDay
    ? new Date(`${context.scheduledDay}T12:00:00Z`)
    : undefined;
  const summary = {
    totalCount: assets.length,
    successCount: 0,
    skippedCount: 0,
    failureCount: 0,
    failures: []
  };

  taskLogger.info('PRICE_SYNC_ASSETS_LOADED', { totalCount: assets.length, marketGroup: context.marketGroup });
  for (const asset of assets) {
    try {
      if (!marketOpen(asset.market, calendarDate)) {
        summary.skippedCount += 1;
        taskLogger.info('PRICE_SYNC_ASSET_SKIPPED_MARKET_CLOSED', {
          symbol: asset.symbol,
          market: asset.market,
          marketDate: context.scheduledDay || marketDate()
        });
        continue;
      }
      const priceData = await loadPrice(asset);
      if (context.marketGroup === 'CN' && context.scheduledDay && priceData.market === 'CN-FUND') {
        const navDay = todayString(priceData.timestamp);
        if (navDay !== context.scheduledDay) {
          throw new MarketDataError(
            MARKET_DATA_ERROR.UPSTREAM,
            resolveFetcher(asset).provider,
            `Expected NAV for ${context.scheduledDay}, received NAV for ${navDay}`,
            { retryable: false }
          );
        }
      }
      await persistPrice(priceData, context);
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
  const { marketGroup } = options;
  if (marketGroup !== undefined && !Object.hasOwn(PRICE_SYNC_GROUPS, marketGroup)) {
    throw new RangeError(`Unknown price sync market group: ${marketGroup}`);
  }
  const now = options.now || new Date();
  const scheduledDay = trigger === 'SCHEDULED' ? marketDate(now) : undefined;
  const runKey = options.runKey || (trigger === 'SCHEDULED'
    ? (marketGroup ? `${scheduledDay}:${marketGroup}` : scheduledDay)
    : `manual:${now.toISOString()}`);

  const run = () => runTrackedTask({
    taskName: 'daily-price-sync',
    runKey,
    trigger,
    execute: async () => {
      const summary = await syncActiveAssetPrices(options.dependencies, { trigger, runKey, marketGroup, scheduledDay });
      const result = { skippedCount: summary.skippedCount };
      if (marketGroup) result.marketGroup = marketGroup;
      return { ...summary, result };
    }
  });
  if (!scheduledDay || !marketGroup) return run();

  // TaskRun 看板依赖原任务名，两个定时批次顺序进入同名任务的进程内锁。
  const batch = scheduledBatch.then(run);
  scheduledBatch = batch.catch(() => {});
  return batch;
}

module.exports = dailySync;
module.exports.syncActiveAssetPrices = syncActiveAssetPrices;
module.exports.marketDate = marketDate;
