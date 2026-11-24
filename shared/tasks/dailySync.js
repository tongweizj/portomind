// shared/tasks/dailySync.js
// 每日价格同步（业务能力，server 与 cron-worker 共用；本模块**不**加载 .env、不建立连接）：
// 获取全部激活资产 → 逐资产校验市场当日是否开市（休市跳过并记 info）→
// 经带重试的 Fetcher 抓取并入库；整体由 runTrackedTask / startTrackedTask 追踪（耗时、成功/失败明细）。
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
const { runTrackedTask, startTrackedTask } = require('../services/taskRunner');
const { OPS_TASK_CONFIG } = require('../config/opsTasks');
const { isMarketOpenToday } = require('../services/calendar.service');
const { MARKET_DATA_ERROR, MarketDataError } = require('../fetchers/errors');

let scheduledBatch = Promise.resolve();
const PROVIDER_FAILURE_LIMIT = 3;

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
    failures: [],
    assets: []
  };
  const outageCounts = new Map();
  const openedProviders = new Set();
  const reportProgress = typeof context.reportProgress === 'function' ? context.reportProgress : () => {};
  const marketDay = context.scheduledDay || marketDate(context.now);
  const assetResult = (asset, status, extra = {}) => ({
    assetId: asset._id ? String(asset._id) : null,
    symbol: asset.symbol,
    market: asset.market,
    status,
    ...extra
  });

  taskLogger.info('PRICE_SYNC_ASSETS_LOADED', { totalCount: assets.length, marketGroup: context.marketGroup });
  await reportProgress(0, assets.length);
  for (const asset of assets) {
    let provider;
    let fetching = false;
    try {
      if (!marketOpen(asset.market, calendarDate)) {
        summary.skippedCount += 1;
        summary.assets.push(assetResult(asset, 'skipped', { reason: 'MARKET_CLOSED', priceDate: null }));
        taskLogger.info('PRICE_SYNC_ASSET_SKIPPED_MARKET_CLOSED', {
          symbol: asset.symbol,
          market: asset.market,
          marketDate: marketDay
        });
        continue;
      }
      provider = resolveFetcher(asset).provider;
      if (openedProviders.has(provider)) {
        throw new MarketDataError(MARKET_DATA_ERROR.CIRCUIT_OPEN, provider, `Price fetch skipped after ${PROVIDER_FAILURE_LIMIT} provider failures`);
      }
      fetching = true;
      const priceData = await loadPrice(asset);
      fetching = false;
      outageCounts.delete(provider);
      if (context.marketGroup === 'CN' && context.scheduledDay && priceData.market === 'CN-FUND') {
        const navDay = todayString(priceData.timestamp);
        if (navDay !== context.scheduledDay) {
          throw new MarketDataError(
            MARKET_DATA_ERROR.UPSTREAM,
            provider,
            `Expected NAV for ${context.scheduledDay}, received NAV for ${navDay}`,
            { retryable: false }
          );
        }
      }
      await persistPrice(priceData, context);
      summary.successCount += 1;
      summary.assets.push(assetResult(asset, 'fetched', {
        priceDate: todayString(priceData.timestamp)
      }));
      taskLogger.info('PRICE_SYNC_ASSET_SUCCEEDED', {
        symbol: asset.symbol,
        timestamp: priceData.timestamp,
        price: priceData.price
      });
    } catch (error) {
      if (fetching) {
        if (error.retryable) {
          const count = (outageCounts.get(provider) || 0) + 1;
          outageCounts.set(provider, count);
          if (count >= PROVIDER_FAILURE_LIMIT) openedProviders.add(provider);
        } else {
          // 标的不存在等资产级响应表明行情源仍可用。
          outageCounts.delete(provider);
        }
      }
      summary.failureCount += 1;
      const failure = {
        item: asset.symbol,
        category: error.category || 'INTERNAL',
        provider: error.provider || (fetching ? provider : undefined),
        retryable: Boolean(error.retryable),
        message: error.message
      };
      if (Number.isInteger(error.status)) failure.status = error.status;
      if (error.responseBody !== undefined) failure.responseBody = error.responseBody;
      summary.failures.push(failure);
      summary.assets.push(assetResult(asset, 'failed', {
        reason: failure.category,
        priceDate: null
      }));
      taskLogger.error('PRICE_SYNC_ASSET_FAILED', failure);
    } finally {
      await reportProgress(summary.assets.length, assets.length);
    }
  }
  if (openedProviders.size) summary.circuitOpened = [...openedProviders];
  return summary;
}

function assertMarketGroup(marketGroup) {
  if (marketGroup !== undefined && !Object.hasOwn(PRICE_SYNC_GROUPS, marketGroup)) {
    throw new RangeError(`Unknown price sync market group: ${marketGroup}`);
  }
}

function resolveContext(options = {}) {
  const trigger = options.trigger || 'SCHEDULED';
  const { marketGroup } = options;
  assertMarketGroup(marketGroup);
  const now = options.now || new Date();
  const scheduledDay = trigger === 'SCHEDULED' ? marketDate(now) : undefined;
  const runKey = options.runKey || (trigger === 'SCHEDULED'
    ? (marketGroup ? `${scheduledDay}:${marketGroup}` : scheduledDay)
    : `manual:${now.toISOString()}`);
  return { trigger, marketGroup, now, scheduledDay, runKey };
}

function trackedOptions(options, context) {
  return {
    taskName: OPS_TASK_CONFIG.priceSync.taskName,
    runKey: context.runKey,
    trigger: context.trigger,
    lockKey: OPS_TASK_CONFIG.priceSync.lockKey,
    staleAfterMs: OPS_TASK_CONFIG.priceSync.staleAfterMs,
    execute: async ({ reportProgress }) => {
      const summary = await syncActiveAssetPrices(options.dependencies, {
        trigger: context.trigger,
        runKey: context.runKey,
        marketGroup: context.marketGroup,
        scheduledDay: context.scheduledDay,
        now: context.now,
        reportProgress
      });
      const result = { skippedCount: summary.skippedCount, assets: summary.assets };
      if (context.marketGroup) result.marketGroup = context.marketGroup;
      if (summary.circuitOpened) result.circuitOpened = summary.circuitOpened;
      return { ...summary, result };
    }
  };
}

async function dailySync(options = {}) {
  const context = resolveContext(options);
  const run = () => runTrackedTask(trackedOptions(options, context));
  if (!context.scheduledDay || !context.marketGroup) return run();

  // TaskRun 看板依赖原任务名，两个定时批次顺序进入同名任务的进程内锁。
  const batch = scheduledBatch.then(run);
  scheduledBatch = batch.catch(() => {});
  return batch;
}

/** server 手动触发：立即返回 runId，执行在后台继续。 */
function startDailySync(options = {}) {
  const context = resolveContext(options);
  return startTrackedTask(trackedOptions(options, context));
}

module.exports = dailySync;
module.exports.syncActiveAssetPrices = syncActiveAssetPrices;
module.exports.startDailySync = startDailySync;
module.exports.marketDate = marketDate;
