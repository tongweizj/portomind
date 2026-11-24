// shared/services/opsCenter.service.js
//
// TASK-068：运维中心「资产数据」总表聚合。
// 只负责读取与派生，不写任何数据：
//   - 默认只取 active 资产，分页由服务端完成（排序在 Ticket 03 再扩展）；
//   - 今日价格按 marketDay.service 的目标市场日口径；
//   - 基础信息复用 assetMetadata.service 的 5 字段校验；
//   - 有效性与历史价格完整性复用 priceCoverage.service 的最近 3 个目标市场日窗口；
//   - 历史完整度本票只返回 unavailable 占位契约（Ticket 04 填充）。

const assetService = require('./asset.service');
const { ASSET_MARKETS } = require('../constants/asset.constants');
const { marketDate, MARKET_TIMEZONE } = require('../utils/marketTime');
const { pickTargetInfo, isMarketOpenOn, marketTimezone } = require('./marketDay.service');
const {
  MARKET_DAY_COUNT,
  priceWindow,
  loadPrices,
  pricedDaysBySymbol,
  matchedPriceDate,
  dateHasPrice
} = require('./priceCoverage.service');
const { metadataReasons, missingFieldsOf } = require('./assetMetadata.service');

const DEFAULT_PAGE_SIZE = 50;

// 今日价格状态（稳定契约，客户端只负责展示文案）：
// priced 有价 / missing 缺价 / market_closed 休市 / not_due 未到点 /
// not_listed 未上市 / unknown 无法判断（不支持的市场或无法确定目标日）。
const TODAY_PRICE_STATUS = Object.freeze({
  PRICED: 'priced',
  MISSING: 'missing',
  MARKET_CLOSED: 'market_closed',
  NOT_DUE: 'not_due',
  NOT_LISTED: 'not_listed',
  UNKNOWN: 'unknown'
});

const VALIDITY_STATUS = Object.freeze({
  NORMAL: 'normal',
  NEEDS_REVIEW: 'needs_review',
  UNKNOWN: 'unknown'
});

const HISTORY_STATUS = Object.freeze({ UNAVAILABLE: 'unavailable' });

function validDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

// 资产上市日在目标市场时区下的日期串；缺失/非法/不支持市场一律 null（不猜）。
function launchDayOf(asset) {
  const launchDate = validDate(asset.launchDate);
  if (!launchDate || !ASSET_MARKETS.includes(asset.market)) return null;
  return marketDate(launchDate, marketTimezone(asset.market));
}

function targetInfoOf(market, now, tz) {
  try {
    return pickTargetInfo(market, now, tz);
  } catch {
    return null;
  }
}

function windowOf(market, now, tz) {
  try {
    return priceWindow(market, now, tz);
  } catch {
    return null;
  }
}

function todayPriceOf(asset, targetInfo, pricedDays) {
  const marketDay = targetInfo?.targetMarketDate ?? null;
  if (!ASSET_MARKETS.includes(asset.market) || !targetInfo || !marketDay) {
    return { marketDay, status: TODAY_PRICE_STATUS.UNKNOWN, priceDate: null };
  }

  const launchDay = launchDayOf(asset);
  if (launchDay && launchDay > marketDay) {
    return { marketDay, status: TODAY_PRICE_STATUS.NOT_LISTED, priceDate: null };
  }
  // 今日休市 / 尚未到当日同步点时，没有新价格可采，不能报成缺价。
  if (!isMarketOpenOn(asset.market, targetInfo.todayStr)) {
    return { marketDay, status: TODAY_PRICE_STATUS.MARKET_CLOSED, priceDate: null };
  }
  if (targetInfo.effectiveSyncDay !== targetInfo.todayStr) {
    return { marketDay, status: TODAY_PRICE_STATUS.NOT_DUE, priceDate: null };
  }

  const priceDate = matchedPriceDate(pricedDays.get(asset.symbol), asset.market, marketDay);
  return {
    marketDay,
    status: priceDate ? TODAY_PRICE_STATUS.PRICED : TODAY_PRICE_STATUS.MISSING,
    priceDate
  };
}

function validityOf(asset, window, pricedDays) {
  const launchDay = launchDayOf(asset);
  if (!window || window.dates.length < MARKET_DAY_COUNT || !launchDay) {
    return { status: VALIDITY_STATUS.UNKNOWN };
  }
  // 上市不足 3 个市场日 → 无法判断，不能把「样本不足」误判成资料有问题。
  if (launchDay > window.dates[0]) return { status: VALIDITY_STATUS.UNKNOWN };
  const days = pricedDays.get(asset.symbol);
  return {
    status: window.dates.some((date) => dateHasPrice(days, asset.market, date))
      ? VALIDITY_STATUS.NORMAL
      : VALIDITY_STATUS.NEEDS_REVIEW
  };
}

/**
 * 资产总表默认页：active 资产 + 服务端分页。
 * @param {{ page?: number, pageSize?: number, now?: Date }} [options]
 * @returns {Promise<{ total: number, data: object[] }>}
 */
async function getAssetsOverview({ page = 1, pageSize = DEFAULT_PAGE_SIZE, now = new Date() } = {}) {
  const { total, data } = await assetService.getAllAssets({
    page,
    pageSize,
    active: true,
    sortBy: 'symbol',
    sortOrder: 'asc'
  });
  const tz = process.env.SCHEDULER_TIMEZONE || MARKET_TIMEZONE;
  const markets = [...new Set(data
    .map((asset) => asset.market)
    .filter((market) => ASSET_MARKETS.includes(market)))];

  const targetInfos = new Map(markets.map((market) => [market, targetInfoOf(market, now, tz)]));
  const windows = new Map(markets.map((market) => [market, windowOf(market, now, tz)]));
  const buckets = new Set();
  for (const window of windows.values()) {
    if (!window) continue;
    for (const bucket of window.buckets) buckets.add(bucket);
  }
  const symbols = data.map((asset) => asset.symbol).filter((symbol) => typeof symbol === 'string' && symbol.length > 0);
  const prices = await loadPrices(symbols, buckets);
  const pricedDays = pricedDaysBySymbol(prices);

  return {
    total,
    data: data.map((asset) => {
      const reasons = metadataReasons(asset, now);
      return {
        assetId: String(asset._id),
        symbol: asset.symbol ?? null,
        name: asset.name ?? null,
        market: asset.market ?? null,
        currency: asset.currency ?? null,
        launchDate: validDate(asset.launchDate),
        todayPrice: todayPriceOf(asset, targetInfos.get(asset.market), pricedDays),
        basicInfo: {
          complete: reasons.length === 0,
          missingFields: missingFieldsOf(reasons)
        },
        validity: validityOf(asset, windows.get(asset.market), pricedDays),
        history: { status: HISTORY_STATUS.UNAVAILABLE }
      };
    })
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  TODAY_PRICE_STATUS,
  VALIDITY_STATUS,
  HISTORY_STATUS,
  getAssetsOverview
};
