const dayjs = require('dayjs');
const Asset = require('../models/asset');
const Price = require('../models/price');
const { ASSET_MARKETS, ASSET_CURRENCIES } = require('../constants/asset.constants');
const { PRICE_TARGET_MAX_LOOKBACK_DAYS } = require('../constants/cronStatus.constants');
const { marketDate, dateBounds, MARKET_TIMEZONE } = require('../utils/marketTime');
const { toStorageSymbol } = require('../utils/symbol');
const { pickTargetInfo, lastOpenDayBefore, expectedBucketCandidates, marketTimezone, isMarketOpenOn } = require('./marketDay.service');

const TASK_NAME = 'asset-integrity-check';
const EXPECTED_CURRENCY = { US: 'USD', CA: 'CAD', HK: 'HKD', 'CN-SH': 'CNY', 'CN-SZ': 'CNY', 'CN-FUND': 'CNY' };
const MARKET_DAY_COUNT = 3;
const DATE_REASONS = new Set(['LAUNCH_DATE_MISSING', 'LAUNCH_DATE_INVALID', 'LAUNCH_DATE_FUTURE']);

function launchDateReason(asset, now) {
  const { launchDate, market } = asset;
  if (launchDate == null) return 'LAUNCH_DATE_MISSING';
  if (!(launchDate instanceof Date) || !Number.isFinite(launchDate.getTime())) return 'LAUNCH_DATE_INVALID';
  const tz = ASSET_MARKETS.includes(market) ? marketTimezone(market) : MARKET_TIMEZONE;
  return marketDate(launchDate, tz) > marketDate(now, tz) ? 'LAUNCH_DATE_FUTURE' : null;
}

function metadataReasons(asset, now) {
  const { symbol, market, currency } = asset;
  const name = typeof asset.name === 'string' ? asset.name.trim() : '';
  const validMarket = ASSET_MARKETS.includes(market);
  const reasons = [];
  if (typeof symbol !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(symbol)) reasons.push('SYMBOL_FORMAT');
  else if (validMarket && symbol !== toStorageSymbol(symbol, market)) reasons.push('SYMBOL_SUFFIX');
  if (!name) reasons.push('NAME_EMPTY');
  else if (name.length > 120) reasons.push('NAME_TOO_LONG');
  if (!validMarket) reasons.push('MARKET_INVALID');
  if (!ASSET_CURRENCIES.includes(currency)) reasons.push('CURRENCY_INVALID');
  else if (validMarket && EXPECTED_CURRENCY[market] !== currency) reasons.push('CURRENCY_MISMATCH');
  const dateReason = launchDateReason(asset, now);
  if (dateReason) reasons.push(dateReason);
  return reasons;
}

function incompleteEntry(asset, reasons) {
  return { assetId: String(asset._id), symbol: asset.symbol ?? null, name: asset.name ?? null, market: asset.market ?? null, reasons };
}

function summarize(total, incompleteAssets) {
  const missingByReason = {};
  for (const { reasons } of incompleteAssets) {
    for (const reason of reasons) missingByReason[reason] = (missingByReason[reason] || 0) + 1;
  }
  return {
    total, complete: total - incompleteAssets.length, incomplete: incompleteAssets.length,
    launchDateMissing: missingByReason.LAUNCH_DATE_MISSING || 0,
    priceEmpty3MarketDays: missingByReason.PRICE_EMPTY_3_MARKET_DAYS || 0,
    missingByReason, incompleteAssets
  };
}

function priceWindow(market, now, tz) {
  const { targetMarketDate } = pickTargetInfo(market, now, tz);
  const dates = [];
  if (targetMarketDate) {
    const lower = dayjs.utc(targetMarketDate).subtract(PRICE_TARGET_MAX_LOOKBACK_DAYS - 1, 'day').format('YYYY-MM-DD');
    let date = targetMarketDate;
    while (date && date >= lower && dates.length < MARKET_DAY_COUNT) {
      dates.push(date);
      if (dates.length < MARKET_DAY_COUNT) date = lastOpenDayBefore(market, date, tz);
    }
  }
  const buckets = new Set(dates);
  for (const date of dates) {
    for (const candidate of expectedBucketCandidates(market, date)) {
      // 窗外开市日的桶可能是它自己的价格。只有休市日的旧桶可无歧义归给窗口。
      if (!buckets.has(candidate) && !isMarketOpenOn(market, candidate)) buckets.add(candidate);
    }
  }
  return { dates, buckets };
}

async function loadPrices(symbols, buckets) {
  if (!symbols.length || !buckets.size) return [];
  return Price.find({
    symbol: { $in: symbols },
    $or: [...buckets].map(day => {
      const { start, end } = dateBounds(day);
      return { timestamp: { $gte: start, $lt: end } };
    })
  }).select('symbol price timestamp').lean();
}

async function inspectAssetIntegrity({ now = new Date(), dependencies = {} } = {}) {
  const listAssets = dependencies.listAssets || (() => Asset.find({ active: true }).select('symbol name market currency launchDate').lean());
  const assets = await listAssets();
  const tz = process.env.SCHEDULER_TIMEZONE || MARKET_TIMEZONE;
  const windows = new Map([...new Set(assets.map(asset => asset.market))]
    .filter(market => ASSET_MARKETS.includes(market)).map(market => [market, priceWindow(market, now, tz)]));
  const buckets = new Set([...windows.values()].flatMap(window => [...window.buckets]));
  const prices = await (dependencies.loadPrices || loadPrices)(assets.map(asset => asset.symbol).filter(Boolean), buckets);
  const pricedDays = new Map();
  for (const { symbol, price, timestamp } of prices) {
    if (!Number.isFinite(price) || !(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) continue;
    if (!pricedDays.has(symbol)) pricedDays.set(symbol, new Set());
    pricedDays.get(symbol).add(marketDate(timestamp, MARKET_TIMEZONE));
  }

  const incompleteAssets = [];
  for (const asset of assets) {
    const reasons = metadataReasons(asset, now);
    const window = windows.get(asset.market);
    if (window && window.dates.length < MARKET_DAY_COUNT) reasons.push('INSUFFICIENT_MARKET_DAYS');
    else if (window && ![...window.buckets].some(day => pricedDays.get(asset.symbol)?.has(day))) {
      reasons.push('PRICE_EMPTY_3_MARKET_DAYS');
    }
    if (reasons.length) incompleteAssets.push(incompleteEntry(asset, reasons));
  }
  return { ...summarize(assets.length, incompleteAssets), checkedAssetIds: assets.map(asset => String(asset._id)) };
}

async function assetCompletenessSnapshot(run, activeAssets, now) {
  const result = run?.result;
  const counts = [result?.total, result?.complete, result?.incomplete, result?.launchDateMissing, result?.priceEmpty3MarketDays];
  if (run?.status === 'SUCCEEDED' && run.endedAt && counts.every(count => Number.isInteger(count) && count >= 0)
    && Array.isArray(result.incompleteAssets)) {
    const incomplete = new Map(result.incompleteAssets.map(entry => [entry.assetId, entry]));
    const checked = new Set(result.checkedAssetIds || incomplete.keys());
    const activeIds = new Set(activeAssets.map(asset => String(asset._id)));
    const missingIds = [...checked].filter(id => !activeIds.has(id));
    // 当前启用清单供价格看板使用。上次受检的资产即使已停用，仍应刷新日期判定。
    const previouslyChecked = missingIds.length
      ? await Asset.find({ _id: { $in: missingIds } }).select('symbol name market launchDate').lean()
      : [];
    for (const asset of [...activeAssets, ...previouslyChecked]) {
      const id = String(asset._id);
      if (!checked.has(id)) continue;
      const previous = incomplete.get(id);
      const reasons = previous ? previous.reasons.filter(reason => !DATE_REASONS.has(reason)) : [];
      const dateReason = launchDateReason(asset, now);
      if (dateReason) reasons.push(dateReason);
      if (reasons.length) incomplete.set(id, previous ? { ...previous, reasons } : incompleteEntry(asset, reasons));
      else incomplete.delete(id);
    }
    const summary = summarize(result.total, [...incomplete.values()]);
    const dataStateLevel = summary.total === 0 ? 'unknown' : summary.incomplete > 0 ? 'warn' : 'ok';
    return { ...summary, contractReady: true, checkedAt: run.endedAt, dataStateLevel, notes: [] };
  }
  return {
    contractReady: false, checkedAt: null, dataStateLevel: 'unknown', total: null, complete: null, incomplete: null,
    launchDateMissing: null, priceEmpty3MarketDays: null, missingByReason: {}, incompleteAssets: [],
    notes: [{ code: 'NO_CHECK_RUN', message: run ? '最近一次资产信息检查尚无可用结果' : '尚未运行过资产信息检查' }]
  };
}

module.exports = { TASK_NAME, inspectAssetIntegrity, assetCompletenessSnapshot };
