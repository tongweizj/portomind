// shared/tasks/assetHistoryBackfill.js
//
// TASK-072：单资产历史价格补采。同步等待结果，复用 priceCoverage 的
// expected/stored/missing 计算与 shared historySync；不另写历史口径。
// 只补指定区间内的缺失交易日，不修改资产基础信息字段。

const { getAssetById } = require('../services/asset.service');
const { OPS_TASK_CONFIG } = require('../config/opsTasks');
const { runTrackedTask, startTrackedTask } = require('../services/taskRunner');
const { isDateString, dateBounds } = require('../utils/marketTime');
const {
  countAssetCoverage,
  groupMissingRanges,
  MAX_MISSING_RANGES,
  boundedMissingRanges,
  targetMarketDay,
  marketLocalDate
} = require('../services/priceCoverage.service');
const historySync = require('./historySync');

function badRequest(message, code = 'INVALID_RANGE') {
  const error = new RangeError(message);
  error.status = 400;
  error.code = code;
  return error;
}

function assetNotFound() {
  const error = new Error('Asset not found');
  error.status = 404;
  error.code = 'ASSET_NOT_FOUND';
  return error;
}

function resolveWindow(asset, options = {}) {
  const now = options.now || new Date();
  let target;
  try {
    target = targetMarketDay(asset.market, now);
  } catch (error) {
    throw badRequest(`Unsupported market: ${asset.market}`, 'UNSUPPORTED_MARKET');
  }
  if (!target) throw badRequest('Unable to determine target market day', 'NO_TARGET_MARKET_DAY');

  const currentYear = Number(target.slice(0, 4));
  const hasYear = options.year !== undefined;
  if (hasYear) {
    if (!Number.isInteger(options.year) || options.year < 1970 || options.year > currentYear) {
      throw badRequest('year must be an integer between 1970 and the current market year', 'INVALID_YEAR');
    }
    if (options.from !== undefined || options.to !== undefined) {
      throw badRequest('year and from/to are mutually exclusive', 'INVALID_RANGE');
    }
  }
  if (options.from !== undefined && !isDateString(options.from)) {
    throw badRequest('from must be YYYY-MM-DD', 'INVALID_RANGE');
  }
  if (options.to !== undefined && !isDateString(options.to)) {
    throw badRequest('to must be YYYY-MM-DD', 'INVALID_RANGE');
  }

  let from = hasYear ? `${options.year}-01-01` : (options.from || `${currentYear}-01-01`);
  let to = hasYear
    ? (options.year === currentYear ? target : `${options.year}-12-31`)
    : (options.to || target);
  if (to > target) to = target;
  if (from > to) throw badRequest('from must be earlier than or equal to to', 'INVALID_RANGE');

  if (!asset.launchDate) {
    throw badRequest('asset launchDate is required for history backfill', 'ASSET_LAUNCH_DATE_REQUIRED');
  }
  let launchDay;
  try {
    launchDay = marketLocalDate(asset.launchDate, asset.market);
  } catch (error) {
    throw badRequest(`Unsupported market: ${asset.market}`, 'UNSUPPORTED_MARKET');
  }
  if (from < launchDay) from = launchDay;
  if (from > to) throw badRequest('range is before asset launchDate', 'RANGE_BEFORE_LAUNCH');
  return { from, to };
}

async function resolveBackfillRequest(options = {}) {
  if (!options.assetId) throw badRequest('assetId is required', 'INVALID_ASSET');
  const loadAsset = options.getAssetById || getAssetById;
  const asset = await loadAsset(options.assetId);
  if (!asset) throw assetNotFound();
  const now = options.now || new Date();
  return { asset, ...resolveWindow(asset, { ...options, now }), now };
}

function failureForRange(asset, range, error) {
  return {
    item: asset.symbol,
    category: error.category || 'INTERNAL',
    provider: error.provider,
    retryable: Boolean(error.retryable),
    message: `${range.from}..${range.to}: ${error.message}`
  };
}

async function runAssetBackfill(asset, from, to, options = {}) {
  const countFn = options.countAssetCoverage || countAssetCoverage;
  const syncFn = options.historySync || historySync;
  const reportProgress = typeof options.reportProgress === 'function' ? options.reportProgress : () => {};
  const before = await countFn(asset, from, to, options.countOptions || {});
  // 抓取规划只合并连续缺失日；报告区间仍按 3 天容差合并。
  const ranges = groupMissingRanges(before.missingDates, 1);
  const failures = [];
  let completed = 0;
  await reportProgress(0, ranges.length);

  for (const range of ranges) {
    try {
      const results = await syncFn(
        dateBounds(range.from).start,
        dateBounds(range.to).end,
        { symbols: [asset.symbol], concurrency: 1 }
      );
      for (const result of results || []) {
        if (result && result.error) {
          const error = new Error(result.error.message || 'history sync failed');
          Object.assign(error, result.error);
          failures.push(failureForRange(asset, range, error));
        }
      }
    } catch (error) {
      failures.push(failureForRange(asset, range, error));
    }
    completed += 1;
    await reportProgress(completed, ranges.length);
  }

  const after = await countFn(asset, from, to, options.countOptions || {});
  const requested = boundedMissingRanges(before.missingDates, 3);
  const remaining = boundedMissingRanges(after.missingDates, 3);
  const remainingFailure = after.missingCount > 0
    ? [{
        item: asset.symbol,
        category: 'HISTORY_GAP',
        message: `missing ${after.missingCount}/${after.expectedCount} trading days after backfill`
      }]
    : [];
  const allFailures = [...failures, ...remainingFailure];
  const success = after.missingCount === 0 && failures.length === 0;
  const result = {
    assetId: String(asset._id),
    symbol: asset.symbol,
    market: asset.market,
    from,
    to,
    expectedCount: before.expectedCount,
    missingBeforeCount: before.missingCount,
    missingAfterCount: after.missingCount,
    fetchedCount: Math.max(after.actualCount - before.actualCount, 0),
    requestedRanges: requested.ranges,
    requestedRangesTruncated: requested.truncated,
    missingRanges: remaining.ranges,
    missingRangesTruncated: remaining.truncated,
    failureRanges: failures.slice(0, MAX_MISSING_RANGES)
  };

  return {
    totalCount: 1,
    successCount: success ? 1 : 0,
    failureCount: success ? 0 : 1,
    failures: allFailures,
    result
  };
}

function trackedOptions(options, context) {
  return {
    taskName: OPS_TASK_CONFIG.assetBackfill.taskName,
    runKey: options.runKey || `manual:${String(context.asset._id)}:${context.now.toISOString()}`,
    trigger: options.trigger || 'MANUAL',
    lockKey: `${OPS_TASK_CONFIG.assetBackfill.lockKeyPrefix}${String(context.asset._id)}`,
    staleAfterMs: OPS_TASK_CONFIG.assetBackfill.staleAfterMs,
    execute: async ({ reportProgress }) => {
      const summary = await runAssetBackfill(context.asset, context.from, context.to, {
        ...options,
        reportProgress
      });
      return summary;
    }
  };
}

/** server 端点使用：先校验资产/区间，再启动 TaskRun；调用方 await handle.promise。 */
async function startAssetHistoryBackfill(options = {}) {
  const context = await resolveBackfillRequest(options);
  return startTrackedTask(trackedOptions(options, context));
}

module.exports = {
  startAssetHistoryBackfill,
  resolveWindow,
  runAssetBackfill
};
