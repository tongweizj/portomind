// cron-worker/src/tasks/integrityCheck.js
// 数据质量完整性检查：回答「每一支基金理论上有多少价格，实际采了多少」。
// 对指定资产或全部激活资产：
//   1. 依据 asset.launchDate 与所属市场，推算 [launchDate, to] 区间内理论上应有的交易日数（Expected Count）；
//   2. 查询 Price 集合中该资产实际落库的价格记录数（Actual Count）；
//   3. 输出含缺失数（Missing Count）与完整率（Completeness Ratio）的结构化健康度报告；
//   4. 存在缺失时自动 warn，并可选（INTEGRITY_AUTO_REPAIR，默认开）按缺失日期区间调用 historySync 补全。
//      自动补全默认只覆盖「最近 INTEGRITY_REPAIR_MAX_DAYS 天」（默认 30），更早的缺口会被延后
//      （INTEGRITY_REPAIR_DEFERRED），避免首次运行时 launchDate 很旧、DB 无历史触发超大规模回补；
//      可用 --dry-run 只出预览报告不执行补全。
//
// 说明：价格按 MARKET_TIMEZONE 单一全局时区归桶（继承自 server 的行为）。US/CA 的桶日期与
// 交易日历完全一致；CN 白天价可能落入前一/当日 ET 桶（见 expectedBucketCandidates），因此 CN 的
// 缺失判定按「任一候选桶存在记录」近似，完整率会略好于逐日精确值。

require('../config/env');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const minimist = require('minimist');

dayjs.extend(utc);
dayjs.extend(timezone);

const { taskLogger } = require('../config/logger');
const { getActiveAssets, getAssetsBySymbols } = require('../services/asset.service');
const { isMarketOpenToday, normalizeMarket } = require('../services/calendar.service');
const { MARKETS } = require('../config/markets');
const { dateBounds, marketDate, todayString, MARKET_TIMEZONE } = require('../utils/marketTime');
const { runTrackedTask } = require('../services/taskRunner');
const historySync = require('./historySync.cjs');

const TASK_NAME = 'price-integrity-check';

function marketTimezone(market) {
  const normalized = normalizeMarket(market);
  const config = MARKETS[normalized];
  if (!config) throw new Error(`Unsupported market: ${market}`);
  return config.timezone;
}

// 市场本地「今天」；CN 时区比 ET 领先，可能与 MARKET_TIMEZONE 的今天相差一天。
function marketToday(market, now = new Date()) {
  return dayjs(now).tz(marketTimezone(market)).format('YYYY-MM-DD');
}

// 上市日期 → 市场本地日期字符串（launchDate 可能带时间分量）。
function launchDateStr(launchDate, market) {
  return dayjs(launchDate).tz(marketTimezone(market)).format('YYYY-MM-DD');
}

// 计算 [from, to]（均为市场本地日期）内理论上应有的交易日列表。
function expectedTradingDates(market, from, to, isOpen = isMarketOpenToday) {
  const tz = marketTimezone(market);
  const expected = [];
  let cursor = dayjs.tz(from, tz);
  const end = dayjs.tz(to, tz);
  while (cursor.isBefore(end, 'day') || cursor.isSame(end, 'day')) {
    if (isOpen(market, cursor.toDate())) expected.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return expected;
}

// 市场交易日 dateStr 可能落入的 ET 桶日期：US/CA 即当日；CN 因时区领先可落入前一日或当日。
function expectedBucketCandidates(market, dateStr) {
  if (normalizeMarket(market) === 'CN') {
    const marketMidnight = dayjs.tz(dateStr, marketTimezone(market));
    const etDate = marketMidnight.tz(MARKET_TIMEZONE).format('YYYY-MM-DD');
    return [etDate, dayjs(etDate).add(1, 'day').format('YYYY-MM-DD')];
  }
  return [dateStr];
}

// 实际落库的 ET 桶日期列表（来自 Price 集合，按 MARKET_TIMEZONE 解释）。
async function storedBucketDates(symbol, from, to, PriceModel = require('../models/price')) {
  const { start } = dateBounds(from);
  const { end } = dateBounds(to);
  const docs = await PriceModel.find(
    { symbol, timestamp: { $gte: start, $lt: end } },
    { timestamp: 1, _id: 0 }
  ).lean();
  return docs.map(doc => dayjs(doc.timestamp).tz(MARKET_TIMEZONE).format('YYYY-MM-DD'));
}

// 计算单个资产的完整性指标。
async function countAsset(asset, from, to, dependencies = {}) {
  const market = asset.market;
  const expectedFn = dependencies.expectedTradingDates || expectedTradingDates;
  const storedFn = dependencies.storedBucketDates || storedBucketDates;

  // CN 记录的 ET 桶可能比市场日期早一天，查询窗口下界放宽一日。
  const lower = normalizeMarket(market) === 'CN'
    ? dayjs.utc(from).subtract(1, 'day').format('YYYY-MM-DD')
    : from;

  const [expectedDates, storedDates] = await Promise.all([
    expectedFn(market, from, to),
    storedFn(asset.symbol, lower, to)
  ]);
  const actualSet = new Set(storedDates);
  const missingDates = expectedDates.filter(dateStr =>
    !expectedBucketCandidates(market, dateStr).some(candidate => actualSet.has(candidate))
  );

  const expectedCount = expectedDates.length;
  const actualCount = actualSet.size;
  const missingCount = missingDates.length;
  const completenessRatio = expectedCount > 0
    ? (expectedCount - missingCount) / expectedCount
    : 1;

  return {
    expectedDates,
    missingDates,
    expectedCount,
    actualCount,
    missingCount,
    completenessRatio
  };
}

// 将缺失日期合并为补全区间（相邻日期间隔 <= mergeDays 视为同一区间）。
function groupMissingRanges(missingDates, mergeDays = 3) {
  if (missingDates.length === 0) return [];
  const sorted = [...missingDates].sort();
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (dayjs(sorted[i]).diff(dayjs(prev), 'day') <= mergeDays) {
      prev = sorted[i];
    } else {
      ranges.push({ from: start, to: prev });
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push({ from: start, to: prev });
  return ranges;
}

// 限制单资产单次修复的天数跨度：只保留「最近 repairMaxDays 天窗口」内的缺失区间，
// 跨窗口区间被裁剪到窗口内，整体早于窗口的区间延后。返回 { repairable, deferred }。
function clipRepairRanges(missingRanges, to, repairMaxDays) {
  if (!Number.isInteger(repairMaxDays) || repairMaxDays <= 0) {
    return { repairable: [], deferred: missingRanges };
  }
  const cutoff = dayjs(to).subtract(repairMaxDays, 'day').format('YYYY-MM-DD');
  const repairable = [];
  const deferred = [];
  for (const range of missingRanges) {
    const from = range.from < cutoff ? cutoff : range.from;
    if (from <= range.to) repairable.push({ from, to: range.to });
    else deferred.push(range);
  }
  return { repairable, deferred };
}

async function repairAsset(symbol, ranges, repairFn = historySync) {
  const failures = [];
  for (const range of ranges) {
    try {
      const fromDate = dayjs.utc(range.from).toDate();
      const toDate = dayjs.utc(range.to).toDate();
      const results = await repairFn(fromDate, toDate, { symbols: [symbol] });
      const failed = results.filter(result => result.error).length;
      if (failed > 0) {
        taskLogger.warn('INTEGRITY_REPAIR_PARTIAL', { symbol, from: range.from, to: range.to, failed });
        failures.push({ from: range.from, to: range.to, failed });
      }
    } catch (error) {
      taskLogger.error('INTEGRITY_REPAIR_FAILED', {
        symbol, from: range.from, to: range.to,
        category: error.category || 'INTERNAL',
        message: error.message
      });
      failures.push({ from: range.from, to: range.to, error: error.message });
    }
  }
  return failures;
}

async function runIntegrityCheck(options = {}) {
  const loadAssets = options.getActiveAssets || getActiveAssets;
  const loadBySymbols = options.getAssetsBySymbols || getAssetsBySymbols;
  const countFn = options.countAsset || countAsset;
  const now = options.now || new Date();
  const fromOption = options.from || null;
  const toOption = options.to || null;
  const dryRun = Boolean(options.dryRun);
  const repair = !dryRun && (options.repair !== undefined
    ? Boolean(options.repair)
    : process.env.INTEGRITY_AUTO_REPAIR !== 'false');
  const maxRepairRanges = Number.isInteger(options.maxRepairRanges) && options.maxRepairRanges > 0
    ? options.maxRepairRanges
    : 50;
  const repairMaxDays = Number.isInteger(options.repairMaxDays) && options.repairMaxDays > 0
    ? options.repairMaxDays
    : Number(process.env.INTEGRITY_REPAIR_MAX_DAYS) > 0
      ? Number(process.env.INTEGRITY_REPAIR_MAX_DAYS)
      : 30;

  const assets = options.symbols && options.symbols.length
    ? await loadBySymbols(options.symbols)
    : await loadAssets();

  const report = {
    taskName: TASK_NAME,
    range: { from: fromOption || 'launchDate', to: toOption || todayString(now) },
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

  taskLogger.info('INTEGRITY_CHECK_START', {
    totalCount: assets.length,
    from: report.range.from,
    to: report.range.to,
    repair: repair ? 'enabled' : 'disabled',
    dryRun: dryRun || undefined
  });

  for (const asset of assets) {
    const symbol = asset.symbol;
    const market = asset.market;
    const entry = { symbol, market };

    try {
      const from = fromOption || (asset.launchDate ? launchDateStr(asset.launchDate, market) : null);
      if (!from) {
        entry.status = 'SKIPPED_NO_LAUNCH_DATE';
        report.skippedCount += 1;
        report.assets.push(entry);
        taskLogger.warn('INTEGRITY_ASSET_SKIPPED_NO_LAUNCH_DATE', { symbol, market });
        continue;
      }
      const to = toOption || marketToday(market, now);
      const counted = await countFn(asset, from, to, options);
      const missingRanges = groupMissingRanges(counted.missingDates);

      Object.assign(entry, {
        launchDate: asset.launchDate ? asset.launchDate.toISOString() : null,
        from,
        to,
        expectedCount: counted.expectedCount,
        actualCount: counted.actualCount,
        missingCount: counted.missingCount,
        completenessRatio: counted.completenessRatio,
        missingRanges
      });

      if (counted.missingCount > 0) {
        entry.status = 'GAP';
        report.failureCount += 1;
        report.failures.push({
          item: symbol,
          category: 'DATA_GAP',
          provider: null,
          retryable: false,
          message: `missing ${counted.missingCount}/${counted.expectedCount} trading days (completeness ${(counted.completenessRatio * 100).toFixed(2)}%)`
        });
        taskLogger.warn('INTEGRITY_ASSET_GAP', {
          symbol, market,
          expectedCount: counted.expectedCount,
          actualCount: counted.actualCount,
          missingCount: counted.missingCount,
          completenessRatio: counted.completenessRatio,
          missingRanges: missingRanges.slice(0, 5)
        });

        if (repair && missingRanges.length > 0) {
          const { repairable, deferred } = clipRepairRanges(missingRanges, to, repairMaxDays);
          const rangesToRepair = repairable.slice(0, maxRepairRanges);
          const deferredDays = deferred.reduce(
            (sum, range) => sum + dayjs(range.to).diff(dayjs(range.from), 'day') + 1,
            0
          );

          if (deferred.length > 0) {
            entry.repairDeferred = deferred.length;
            entry.repairDeferredDays = deferredDays;
            taskLogger.warn('INTEGRITY_REPAIR_DEFERRED', {
              symbol, market,
              deferredRanges: deferred.length,
              deferredDays,
              repairMaxDays
            });
          }
          if (rangesToRepair.length < repairable.length) {
            const truncated = repairable.length - rangesToRepair.length;
            entry.repairTruncated = truncated;
            taskLogger.warn('INTEGRITY_REPAIR_TRUNCATED', {
              symbol, market,
              truncatedRanges: truncated,
              maxRepairRanges
            });
          }

          if (rangesToRepair.length > 0) {
            const repairFailures = await repairAsset(symbol, rangesToRepair, options.historySync);
            const recounted = await countFn(asset, from, to, options);
            entry.actualCount = recounted.actualCount;
            entry.missingCount = recounted.missingCount;
            entry.completenessRatio = recounted.completenessRatio;
            entry.missingRanges = groupMissingRanges(recounted.missingDates);
            entry.repaired = true;
            entry.repairRanges = rangesToRepair.length;
            entry.repairFailures = repairFailures;
            taskLogger.info('INTEGRITY_ASSET_REPAIRED', {
              symbol, market,
              repairedRanges: rangesToRepair.length,
              repairFailures: repairFailures.length,
              remainingMissing: recounted.missingCount,
              completenessRatio: recounted.completenessRatio
            });
          } else {
            entry.repaired = false;
            taskLogger.warn('INTEGRITY_ASSET_REPAIR_SKIPPED', {
              symbol, market,
              reason: 'all missing ranges beyond repair window',
              repairMaxDays
            });
          }
        }
      } else {
        entry.status = 'OK';
        report.successCount += 1;
        taskLogger.info('INTEGRITY_ASSET_OK', {
          symbol, market,
          expectedCount: counted.expectedCount,
          actualCount: counted.actualCount,
          completenessRatio: counted.completenessRatio
        });
      }

      report.checkedCount += 1;
      report.totals.expectedCount += entry.expectedCount || 0;
      report.totals.actualCount += entry.actualCount || 0;
      report.totals.missingCount += entry.missingCount || 0;
      report.assets.push(entry);
    } catch (error) {
      entry.status = 'ERROR';
      report.failureCount += 1;
      const failure = {
        item: symbol,
        category: error.category || 'INTERNAL',
        provider: error.provider,
        retryable: Boolean(error.retryable),
        message: error.message
      };
      report.failures.push(failure);
      report.assets.push(entry);
      taskLogger.error('INTEGRITY_ASSET_FAILED', { symbol, market, ...failure });
    }
  }

  report.completenessRatio = report.totals.expectedCount > 0
    ? (report.totals.expectedCount - report.totals.missingCount) / report.totals.expectedCount
    : 1;

  taskLogger.info('INTEGRITY_CHECK_END', {
    totalCount: report.totalCount,
    checkedCount: report.checkedCount,
    skippedCount: report.skippedCount,
    successCount: report.successCount,
    failureCount: report.failureCount,
    expectedCount: report.totals.expectedCount,
    actualCount: report.totals.actualCount,
    missingCount: report.totals.missingCount,
    completenessRatio: report.completenessRatio
  });

  return report;
}

async function integrityCheck(options = {}) {
  const trigger = options.trigger || 'SCHEDULED';
  const runKey = options.runKey || (trigger === 'SCHEDULED'
    ? marketDate()
    : `manual:${new Date().toISOString()}`);

  return runTrackedTask({
    taskName: TASK_NAME,
    runKey,
    trigger,
    execute: () => runIntegrityCheck(options)
  });
}

async function runFromCommandLine() {
  const argv = minimist(process.argv.slice(2));
  const symbols = argv.symbols
    ? String(argv.symbols).split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const from = argv.from || null;
  const to = argv.to || null;
  const dryRun = Boolean(argv['dry-run']);
  const repair = dryRun
    ? false
    : (argv.repair !== undefined
      ? Boolean(argv.repair)
      : process.env.INTEGRITY_AUTO_REPAIR !== 'false');

  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  if (from) dateBounds(from); // 校验格式，非法时抛错
  if (to) dateBounds(to);

  const mongoose = require('mongoose');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const summary = await integrityCheck({ trigger: 'MANUAL', symbols, from, to, repair, dryRun });
    if (summary.status === 'PARTIAL' || summary.status === 'FAILED') process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runFromCommandLine().catch(error => {
    taskLogger.error('INTEGRITY_CHECK_COMMAND_FAILED', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  });
}

module.exports = integrityCheck;
module.exports.runIntegrityCheck = runIntegrityCheck;
module.exports.countAsset = countAsset;
module.exports.expectedTradingDates = expectedTradingDates;
module.exports.expectedBucketCandidates = expectedBucketCandidates;
module.exports.storedBucketDates = storedBucketDates;
module.exports.groupMissingRanges = groupMissingRanges;
module.exports.clipRepairRanges = clipRepairRanges;
module.exports.repairAsset = repairAsset;
module.exports.marketDate = marketDate;
module.exports.TASK_NAME = TASK_NAME;
