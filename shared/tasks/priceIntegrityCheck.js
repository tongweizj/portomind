// shared/tasks/priceIntegrityCheck.js
//
// TASK-070：价格完整性检查的业务实现（server 手动 refresh 与 cron-worker 定时共用）。
// 本模块不加载 .env、不建立连接；外部依赖通过 options.dependencies 注入。
// 手动 refresh 由调用方显式传 repair:false；定时任务由 cron-worker 薄壳按
// INTEGRITY_AUTO_REPAIR 决定是否修复。

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const {
  getActiveAssets,
  getAssetsBySymbols
} = require('../services/asset.service');
const { taskLogger } = require('../config/logger');
const { OPS_TASK_CONFIG, HISTORY_MIN_MARKET_DAYS } = require('../config/opsTasks');
const { allItemsSkipped } = require('../utils/taskResult');
const { marketDate } = require('../utils/marketTime');
const {
  marketLocalDate,
  targetMarketDay,
  countAssetCoverage,
  boundedMissingRanges,
  clipRepairRanges
} = require('../services/priceCoverage.service');
const { runTrackedTask, startTrackedTask } = require('../services/taskRunner');

const TASK_NAME = OPS_TASK_CONFIG.priceIntegrity.taskName;
const MIN_HISTORY_MARKET_DAYS = HISTORY_MIN_MARKET_DAYS;

function buildFailure(symbol, category, message, error = null) {
  return {
    item: symbol,
    category,
    provider: error?.provider || null,
    retryable: Boolean(error?.retryable),
    message
  };
}

function historyAssetOf(entry) {
  return {
    assetId: entry.assetId,
    symbol: entry.symbol,
    market: entry.market,
    launchDate: entry.launchDate,
    status: entry.status,
    from: entry.from ?? null,
    to: entry.to ?? null,
    expected: entry.expected,
    actual: entry.actual,
    missing: entry.missing,
    ratio: entry.ratio,
    missingRanges: entry.missingRanges,
    missingRangesTruncated: entry.missingRangesTruncated
  };
}

function buildResult(report) {
  return {
    totals: report.totals,
    checkedCount: report.checkedCount,
    skippedCount: report.skippedCount,
    allSkipped: report.allSkipped,
    completenessRatio: report.completenessRatio,
    // 资产级历史供运维中心回读；只存计算摘要与最多 20 个缺口区间，
    // 不落原始价格序列或补采错误详情，避免 TaskRun 无界增长。
    assets: report.assets.map(historyAssetOf),
    gapAssets: report.assets
      .filter((entry) => entry.status === 'GAP')
      .map((entry) => ({ symbol: entry.symbol, missingCount: entry.missing }))
  };
}

/**
 * 只读计算报告；不创建 TaskRun。
 * @param {{
 *   now?: Date, from?: string, to?: string, symbols?: string[],
 *   repair?: boolean, dryRun?: boolean, repairAsset?: Function,
 *   maxRepairRanges?: number, repairMaxDays?: number,
 *   dependencies?: object, reportProgress?: Function
 * }} options
 */
async function runIntegrityReport(options = {}) {
  const dependencies = options.dependencies || {};
  // 兼容既有 cron-worker CLI/测试的顶层注入名；新调用方统一走 dependencies。
  const loadAssets = dependencies.getActiveAssets || options.getActiveAssets || getActiveAssets;
  const loadBySymbols = dependencies.getAssetsBySymbols || options.getAssetsBySymbols || getAssetsBySymbols;
  const countFn = dependencies.countAssetCoverage || options.countAsset || countAssetCoverage;
  const countOptions = { ...options, ...dependencies };
  const repairFn = options.repairAsset || (typeof options.historySync === 'function'
    ? (symbol, ranges) => Promise.all(ranges.map((range) => options.historySync(
      dayjs.utc(range.from).toDate(),
      dayjs.utc(range.to).toDate(),
      { symbols: [symbol] }
    )))
    : null);
  const now = options.now || new Date();
  const fromOption = options.from || null;
  const toOption = options.to || null;
  const dryRun = Boolean(options.dryRun);
  const repair = !dryRun && Boolean(options.repair) && Boolean(repairFn || options.repairAsset || options.historySync);
  const maxRepairRanges = Number.isInteger(options.maxRepairRanges) && options.maxRepairRanges > 0
    ? options.maxRepairRanges
    : 50;
  const repairMaxDays = Number.isInteger(options.repairMaxDays) && options.repairMaxDays > 0
    ? options.repairMaxDays
    : 30;
  const reportProgress = typeof options.reportProgress === 'function'
    ? options.reportProgress
    : () => {};

  const assets = options.symbols && options.symbols.length
    ? await loadBySymbols(options.symbols)
    : await loadAssets();

  const report = {
    taskName: TASK_NAME,
    range: { from: fromOption || 'launchDate', to: toOption || 'targetMarketDate' },
    generatedAt: now.toISOString(),
    dryRun,
    repairMaxDays,
    totalCount: assets.length,
    checkedCount: 0,
    skippedCount: 0,
    successCount: 0,
    failureCount: 0,
    failures: [],
    assets: [],
    totals: { expectedCount: 0, actualCount: 0, missingCount: 0 }
  };
  await reportProgress(0, report.totalCount);

  taskLogger.info('INTEGRITY_CHECK_START', {
    totalCount: report.totalCount,
    from: report.range.from,
    to: report.range.to,
    repair: repair ? 'enabled' : 'disabled',
    dryRun: dryRun || undefined
  });

  for (const asset of assets) {
    const symbol = asset.symbol;
    const market = asset.market;
    const entry = {
      assetId: String(asset._id),
      symbol,
      market,
      launchDate: asset.launchDate ? new Date(asset.launchDate).toISOString() : null,
      status: null,
      expected: null,
      actual: null,
      missing: null,
      ratio: null,
      missingRanges: [],
      missingRangesTruncated: false
    };

    try {
      const from = fromOption || (asset.launchDate ? marketLocalDate(asset.launchDate, market) : null);
      if (!from) {
        entry.status = 'SKIPPED_NO_LAUNCH_DATE';
        report.skippedCount += 1;
        report.assets.push(entry);
        await reportProgress(report.assets.length, report.totalCount);
        continue;
      }
      const to = toOption || targetMarketDay(market, now);
      if (!to) {
        throw Object.assign(new Error('无法确定目标市场日'), { category: 'NO_TARGET_MARKET_DAY' });
      }
      entry.from = from;
      entry.to = to;

      const counted = await countFn(asset, from, to, countOptions);
      if (counted.expectedCount < MIN_HISTORY_MARKET_DAYS) {
        entry.status = 'INSUFFICIENT_SAMPLE';
        report.skippedCount += 1;
        report.assets.push(entry);
        await reportProgress(report.assets.length, report.totalCount);
        continue;
      }

      entry.expected = counted.expectedCount;
      entry.actual = counted.actualCount;
      entry.missing = counted.missingCount;
      entry.ratio = counted.completenessRatio;
      const bounded = boundedMissingRanges(counted.missingDates);
      entry.missingRanges = bounded.ranges;
      entry.missingRangesTruncated = bounded.truncated;

      if (counted.missingCount > 0) {
        entry.status = 'GAP';
        report.failureCount += 1;
        report.failures.push(buildFailure(
          symbol,
          'DATA_GAP',
          `missing ${counted.missingCount}/${counted.expectedCount} trading days (completeness ${(counted.completenessRatio * 100).toFixed(2)}%)`
        ));
        if (repair && repairFn && bounded.ranges.length > 0) {
          const { repairable, deferred } = clipRepairRanges(bounded.ranges, to, repairMaxDays);
          const rangesToRepair = repairable.slice(0, maxRepairRanges);
          entry.repairDeferred = deferred.length;
          entry.repairTruncated = Math.max(repairable.length - rangesToRepair.length, 0);
          entry.repaired = false;
          if (rangesToRepair.length > 0) {
            const repairFailures = await repairFn(symbol, rangesToRepair);
            const recounted = await countFn(asset, from, to, countOptions);
            entry.expected = recounted.expectedCount;
            entry.actual = recounted.actualCount;
            entry.missing = recounted.missingCount;
            entry.ratio = recounted.completenessRatio;
            const rebounded = boundedMissingRanges(recounted.missingDates);
            entry.missingRanges = rebounded.ranges;
            entry.missingRangesTruncated = rebounded.truncated;
            entry.repaired = true;
            entry.repairRanges = rangesToRepair.length;
            entry.repairFailures = repairFailures;
          }
        }
      } else {
        entry.status = 'OK';
        report.successCount += 1;
      }
      report.checkedCount += 1;
      report.totals.expectedCount += entry.expected || 0;
      report.totals.actualCount += entry.actual || 0;
      report.totals.missingCount += entry.missing || 0;
      report.assets.push(entry);
    } catch (error) {
      entry.status = 'ERROR';
      report.failureCount += 1;
      const failure = buildFailure(symbol, error.category || 'INTERNAL', error.message, error);
      report.failures.push(failure);
      report.assets.push(entry);
      taskLogger.error('INTEGRITY_ASSET_FAILED', { symbol, market, ...failure });
    }
    await reportProgress(report.assets.length, report.totalCount);
  }

  report.allSkipped = allItemsSkipped(report);
  const { expectedCount, missingCount } = report.totals;
  report.completenessRatio = expectedCount > 0
    ? (expectedCount - missingCount) / expectedCount
    : null;

  taskLogger.info('INTEGRITY_CHECK_END', {
    totalCount: report.totalCount,
    checkedCount: report.checkedCount,
    skippedCount: report.skippedCount,
    successCount: report.successCount,
    failureCount: report.failureCount,
    expectedCount: report.totals.expectedCount,
    actualCount: report.totals.actualCount,
    missingCount: report.totals.missingCount,
    allSkipped: report.allSkipped,
    completenessRatio: report.completenessRatio
  });

  return report;
}

function trackedOptions(options = {}) {
  const trigger = options.trigger || 'SCHEDULED';
  const now = options.now || new Date();
  const runKey = options.runKey || (trigger === 'SCHEDULED'
    ? marketDate(now)
    : `manual:${now.toISOString()}`);
  return {
    taskName: TASK_NAME,
    runKey,
    trigger,
    lockKey: OPS_TASK_CONFIG.priceIntegrity.lockKey,
    staleAfterMs: OPS_TASK_CONFIG.priceIntegrity.staleAfterMs,
    execute: async ({ reportProgress }) => {
      const report = await runIntegrityReport({ ...options, now, reportProgress });
      return { ...report, result: buildResult(report) };
    }
  };
}

/** 同步等待任务结束（cron-worker / CLI 使用）。 */
function priceIntegrityCheck(options = {}) {
  return runTrackedTask(trackedOptions(options));
}

/** server 手动触发：立即返回 runId，执行在后台继续。 */
function startPriceIntegrityCheck(options = {}) {
  return startTrackedTask(trackedOptions(options));
}

module.exports = {
  TASK_NAME,
  MIN_HISTORY_MARKET_DAYS,
  runIntegrityReport,
  buildResult,
  priceIntegrityCheck,
  startPriceIntegrityCheck
};
