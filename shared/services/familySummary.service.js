// server/services/familySummary.service.js
// 家庭层汇总（PRD §3，FAM-01/02/04）。
// - FAM-01：以 RMB 折算的家庭总资产 + USD/CAD/CNY/HKD 各自金额分桶（HKD 单列）；
// - FAM-02：按组合贡献分解（各组合市值、占家庭比例，RMB 基准）；
// - FAM-04：最近交易与再平衡动态。
//
// 口径约定：
// - 组合内保持原币种记账，折算仅在此处发生（裁决 #1）；
// - 汇率取最新 FxRate（对 CNY）；CNY 恒为 1；
// - 币种桶内任一持仓缺最新价 → 该桶视为数据不完整（null），不参与家庭总额折算
//   （与组合卡片「缺价显示 —」口径一致，宁可少报不可错报）；
// - 归档组合不参与（CM-20）。

const Portfolio = require('../models/portfolio');
const Transaction = require('../models/transaction');
const RebalanceRecord = require('../models/rebalanceRecord');
const tracker = require('./portfolio/positionTracker');
const fxRateService = require('./fxRate.service');

const RECENT_LIMIT = 10;

/** 纯函数：持仓列表 → 按币种聚合市值桶。桶内任一持仓缺价 → 该桶 null。 */
function buildCurrencyBuckets(positions = []) {
  const buckets = new Map();
  for (const position of positions) {
    const currency = position.currency || 'UNKNOWN';
    const bucket = buckets.get(currency) || { marketValue: 0, hasMissingPrice: false };
    if (position.marketValue == null) bucket.hasMissingPrice = true;
    else bucket.marketValue += position.marketValue;
    buckets.set(currency, bucket);
  }
  const result = {};
  for (const [currency, bucket] of buckets.entries()) {
    result[currency] = bucket.hasMissingPrice ? null : Number(bucket.marketValue.toFixed(2));
  }
  return result;
}

/**
 * 纯函数：家庭汇总计算。
 * @param {Object} options
 * @param {Array} options.portfolioValues [{ portfolioId, name, currency, buckets }]
 * @param {Object} options.rates { USD?, CAD?, HKD? }（缺失 = 无汇率）
 * @returns {Object} 家庭汇总（见函数体）
 */
function buildFamilySummary({ portfolioValues = [], rates = {} }) {
  const buckets = {}; // 各币种：{ amount, cnyValue, rate }
  let totalCny = 0;
  const contributions = [];

  for (const { portfolioId, name, currency, buckets: pBuckets } of portfolioValues) {
    let cnyValue = 0;
    const marketValueByCurrency = {};
    let incomplete = false;

    for (const [bucketCurrency, amount] of Object.entries(pBuckets || {})) {
      if (amount == null) {
        // 桶内缺价：该组合此币种不完整，整体折算标记 incomplete
        marketValueByCurrency[bucketCurrency] = null;
        incomplete = true;
        continue;
      }
      marketValueByCurrency[bucketCurrency] = amount;
      const rate = bucketCurrency === 'CNY' ? 1 : rates[bucketCurrency];
      if (rate == null) {
        // 该币种无汇率 → 无法折算，视为不完整
        incomplete = true;
        continue;
      }
      cnyValue += amount * rate;
    }

    if (!incomplete) totalCny += cnyValue;
    contributions.push({
      portfolioId,
      name,
      currency,
      marketValueByCurrency,
      cnyValue: incomplete ? null : Number(cnyValue.toFixed(2))
    });
  }

  // 家庭级币种分桶：跨组合按币种合计（原币金额 + 折算 RMB）
  for (const contribution of contributions) {
    for (const [bucketCurrency, amount] of Object.entries(contribution.marketValueByCurrency || {})) {
      if (amount == null) continue;
      const rate = bucketCurrency === 'CNY' ? 1 : rates[bucketCurrency];
      const bucket = buckets[bucketCurrency] || { amount: 0, cnyValue: 0, rate: rate ?? null };
      bucket.amount += amount;
      if (rate != null) bucket.cnyValue += amount * rate;
      buckets[bucketCurrency] = bucket;
    }
  }
  for (const bucket of Object.values(buckets)) {
    bucket.amount = Number(bucket.amount.toFixed(2));
    bucket.cnyValue = Number(bucket.cnyValue.toFixed(2));
  }

  const ratios = totalCny > 0
    ? contributions.map(contribution => ({
      ...contribution,
      ratio: contribution.cnyValue == null ? null : Number((contribution.cnyValue / totalCny * 100).toFixed(2))
    }))
    : contributions.map(contribution => ({ ...contribution, ratio: null }));

  return {
    totalCny: Number(totalCny.toFixed(2)),
    buckets,
    fxRates: rates,
    portfolioContributions: ratios
  };
}

/**
 * 数据库编排：聚合家庭汇总 + 最近动态。
 * @param {Object} [options]
 * @param {Date} [options.now] 测试可注入
 */
async function computeFamilySummary({ now = new Date() } = {}) {
  const portfolios = await Portfolio.find({ archived: { $ne: true } }).sort({ createdAt: -1 }).lean();
  const portfolioById = new Map(portfolios.map(p => [p._id.toString(), p]));

  const portfolioValues = [];
  for (const portfolio of portfolios) {
    const positions = await tracker.aggregate(portfolio._id);
    portfolioValues.push({
      portfolioId: portfolio._id,
      name: portfolio.name,
      currency: portfolio.currency,
      buckets: buildCurrencyBuckets(positions)
    });
  }

  const [rates, recentTransactions, recentRebalanceRecords] = await Promise.all([
    fxRateService.getLatestRates(now),
    Transaction.find().sort({ date: -1, _id: -1 }).limit(RECENT_LIMIT).lean(),
    RebalanceRecord.find().sort({ timestamp: -1, _id: -1 }).limit(RECENT_LIMIT).lean()
  ]);

  const summary = buildFamilySummary({ portfolioValues, rates });

  const decoratePortfolioName = item => ({
    ...item,
    portfolioName: portfolioById.get(String(item.portfolioId || ''))?.name || '已删除组合'
  });

  return {
    asOf: now,
    ...summary,
    recentTransactions: recentTransactions.map(decoratePortfolioName),
    recentRebalanceRecords: recentRebalanceRecords.map(decoratePortfolioName)
  };
}

module.exports = { computeFamilySummary, buildFamilySummary, buildCurrencyBuckets };
