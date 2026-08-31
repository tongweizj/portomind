// server/services/portfolio/summary.js
// 组合列表汇总：一次返回全部组合 + 每组合的 { positionCount, marketValueByCurrency, drift }，
// 供组合列表卡片增强（CM-12）使用，避免前端 N+1 逐组合调用 stats。
//
// 口径约定（与 PRD §4.1.7 T2 一致）：
// - 市值按币种分桶，绝不跨币种合计（全局原则：不同币种不直接合计）；
// - 某币种内任一持仓缺最新价 → 该币种桶为 null（前端显示「—」），不误报半数市值；
// - 漂移徽标复用 thresholdChecker.evaluateThresholds 口径，仅反映绝对/相对偏离触发；
//   无目标配置、无持仓或存在缺价持仓时 drift 为 null（前端显示「—」）。

const Portfolio = require('../../models/portfolio');
const RebalanceRecord = require('../../models/rebalanceRecord');
const tracker = require('./positionTracker');
const { evaluateThresholds } = require('../rebalance/thresholdChecker');

const DRIFT_THRESHOLDS = ['absoluteDeviation', 'relativeDeviation'];

/** 纯函数：单组合统计。positions 为 calculatePositions 输出（含 marketValue/currency）。 */
function buildPortfolioSummary({ portfolio, positions = [], lastExecutedAt = null, now = new Date() }) {
  const positionCount = positions.length;

  const currencyBuckets = new Map();
  for (const position of positions) {
    const currency = position.currency || 'UNKNOWN';
    const bucket = currencyBuckets.get(currency) || { marketValue: 0, hasMissingPrice: false };
    if (position.marketValue == null) bucket.hasMissingPrice = true;
    else bucket.marketValue += position.marketValue;
    currencyBuckets.set(currency, bucket);
  }
  const marketValueByCurrency = {};
  for (const [currency, bucket] of [...currencyBuckets.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    marketValueByCurrency[currency] = bucket.hasMissingPrice
      ? null
      : Number(bucket.marketValue.toFixed(2));
  }

  const targets = Array.isArray(portfolio.targets) ? portfolio.targets : [];
  const hasMissingPrice = positions.some(position => position.marketValue == null);
  let drift = null;
  if (targets.length > 0 && positionCount > 0 && !hasMissingPrice) {
    const result = evaluateThresholds({
      targets,
      positions,
      settings: portfolio.rebalanceSettings || {},
      lastExecutedAt,
      now
    });
    const driftTriggered = result.triggeredThresholds.filter(
      threshold => DRIFT_THRESHOLDS.includes(threshold)
    );
    drift = {
      needsRebalance: driftTriggered.length > 0,
      triggeredThresholds: driftTriggered
    };
  }

  return { positionCount, marketValueByCurrency, drift };
}

/** 数据库编排：全部组合 + 逐组合持仓与最近一次已执行再平衡记录。 */
async function computeSummary() {
  const portfolios = await Portfolio.find().sort({ createdAt: -1 }).lean();
  return Promise.all(portfolios.map(async (portfolio) => {
    const [positions, lastExecuted] = await Promise.all([
      tracker.aggregate(portfolio._id),
      RebalanceRecord
        .findOne({ portfolioId: portfolio._id, status: 'EXECUTED' })
        .sort({ executedAt: -1, timestamp: -1 })
        .lean()
    ]);
    return {
      ...portfolio,
      stats: buildPortfolioSummary({
        portfolio,
        positions,
        lastExecutedAt: lastExecuted?.executedAt || lastExecuted?.timestamp || null
      })
    };
  }));
}

module.exports = { computeSummary, buildPortfolioSummary };
