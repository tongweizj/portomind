// server/services/alertEngine.service.js
// 提醒评估引擎（PRD §4.4，AL-02/05/06）。
// - evaluateRule：纯函数，按规则类型判定触发（边界约定：恰好等于阈值不触发，严格大于/小于才触发）；
// - evaluateAll：每日跑批编排——聚合最新价/持仓/漂移 → 逐规则评估（故障隔离）→
//   cooldown 静默 + 同日幂等去重 → 生成 AlertEvent；signal 规则常显/过期归档。
//
// 口径约定：
// - 价格规则输入为 Price 集合最新价（marketData.getLatestPrices）；
// - 盈亏规则输入为移动平均成本持仓（positionTracker.aggregate 的 pnlPct）；
// - 漂移规则复用 portfolio/summary.buildPortfolioSummary 的 drift 口径（绝对/相对偏离，
//   timeInterval 不计入），避免与组合卡片徽标口径漂移。

const AlertRule = require('../models/alertRule');
const AlertEvent = require('../models/alertEvent');
const Portfolio = require('../models/portfolio');
const RebalanceRecord = require('../models/rebalanceRecord');
const marketData = require('./marketData.service');
const tracker = require('./portfolio/positionTracker');
const aggregator = require('./portfolio/assetClassAggregator');
const { buildPortfolioSummary } = require('./portfolio/summary');
const { todayString } = require('../utils/marketTime');
const { logger } = require('../config/logger');

const RULE_TYPE_LABELS = {
  price_above: '价格高于',
  price_below: '价格低于',
  gain_loss_pct: '盈亏比例',
  drift_exceed: '组合偏离',
  signal: '人工信号'
};

const DIRECTION_LABELS = { buy: '买入', sell: '卖出', hold: '持有' };

/**
 * 纯函数：评估单条规则是否触发。
 * @param {Object} rule 规则文档（lean）
 * @param {Object} ctx
 * @param {Object} ctx.latestPrices       { [symbol]: price|null }
 * @param {Object} ctx.positionsBySymbol  { [symbol]: position }（含 avgCost/pnlPct）
 * @param {Object|null} ctx.drift         { needsRebalance, triggeredThresholds }（组合级）
 * @returns {Object|null} { level, title, content, snapshot }；不触发/缺输入返回 null
 */
function evaluateRule(rule, { latestPrices = {}, positionsBySymbol = {}, drift = null }) {
  const symbol = rule.symbol || '';
  switch (rule.ruleType) {
    case 'price_above':
    case 'price_below': {
      const price = latestPrices[symbol];
      const threshold = Number(rule.params && rule.params.threshold);
      if (price == null || !Number.isFinite(threshold)) return null;
      const triggered = rule.ruleType === 'price_above' ? price > threshold : price < threshold;
      if (!triggered) return null;
      const op = rule.ruleType === 'price_above' ? '高于' : '低于';
      return {
        level: 'info',
        title: `${symbol || rule.name} 价格${op}阈值`,
        content: `最新价 ${price}，阈值 ${threshold}`,
        snapshot: { price, threshold }
      };
    }
    case 'gain_loss_pct': {
      const position = positionsBySymbol[symbol];
      const pct = Number(rule.params && rule.params.pct);
      if (!position || !Number.isFinite(position.pnlPct) || !Number.isFinite(pct)) return null;
      // pct 为正 → 浮盈超 pct% 触发；为负 → 浮亏超 |pct|% 触发（严格比较）
      const triggered = pct >= 0 ? position.pnlPct > pct : position.pnlPct < pct;
      if (!triggered) return null;
      const isLoss = pct < 0;
      return {
        level: isLoss ? 'warning' : 'info',
        title: `${symbol || rule.name} 盈亏${isLoss ? '亏损' : '盈利'}超过 ${Math.abs(pct)}%`,
        content: `当前盈亏 ${position.pnlPct.toFixed(2)}%（成本 ${position.avgCost}，最新价 ${position.latestPrice}）`,
        snapshot: {
          pnlPct: position.pnlPct,
          avgCost: position.avgCost,
          latestPrice: position.latestPrice
        }
      };
    }
    case 'drift_exceed': {
      if (!drift || !Array.isArray(drift.triggeredThresholds) || drift.triggeredThresholds.length === 0) return null;
      const threshold = Number(rule.params && rule.params.drift);
      if (!Number.isFinite(threshold)) return null;
      return {
        level: 'warning',
        title: `${rule.name || '组合'}偏离阈值`,
        content: `触发条件：${drift.triggeredThresholds.join('、')}`,
        snapshot: { triggeredThresholds: drift.triggeredThresholds, threshold }
      };
    }
    default:
      return null;
  }
}

/**
 * 静默/幂等判断：cooldownDays 内不重复产生事件；同日重复跑批不重复（按市场日幂等）。
 * @returns {Promise<boolean>} true=应抑制（不产生事件）
 */
async function shouldSuppress(rule, now) {
  const last = await AlertEvent.findOne({ ruleId: rule._id }).sort({ triggeredAt: -1 }).lean();
  if (!last) return false;
  const lastTriggered = new Date(last.triggeredAt);
  // 同日幂等：市场日相同不重复（覆盖 cooldownDays=0 的场景）
  if (todayString(lastTriggered) === todayString(now)) return true;
  const elapsedDays = (now - lastTriggered) / 86400000;
  return Number(rule.cooldownDays || 0) > 0 && elapsedDays < Number(rule.cooldownDays);
}

/** 组合漂移（复用组合卡片徽标口径，见 summary.buildPortfolioSummary）。 */
async function computeDrift(portfolioId) {
  const [portfolio, positions, lastExecuted] = await Promise.all([
    Portfolio.findById(portfolioId).lean(),
    tracker.aggregate(portfolioId),
    RebalanceRecord
      .findOne({ portfolioId, status: 'EXECUTED' })
      .sort({ executedAt: -1, timestamp: -1 })
      .lean()
  ]);
  if (!portfolio) return null;
  // CM-08：大类目标模式下按大类伪持仓计算漂移（drift_exceed 规则口径一致）
  let classPositions = null;
  if (aggregator.hasClassTargets(portfolio.targets)) {
    const assetClassBySymbol = await aggregator.getAssetClassMap(
      positions.map(position => position.symbol)
    );
    classPositions = aggregator.buildClassPositions(positions, assetClassBySymbol);
  }
  return buildPortfolioSummary({
    portfolio,
    positions,
    classPositions,
    lastExecutedAt: lastExecuted?.executedAt || lastExecuted?.timestamp || null
  }).drift;
}

/**
 * 每日跑批：评估全部 active 规则并生成事件。
 * @param {Object} [options]
 * @param {Date} [options.now] 测试可注入
 * @returns {Promise<{evaluated:number, created:number, archived:number, failed:number}>}
 */
async function evaluateAll({ now = new Date() } = {}) {
  const rules = await AlertRule.find({ active: true }).lean();
  const stats = { evaluated: rules.length, created: 0, archived: 0, failed: 0 };

  const assetRules = rules.filter(rule => rule.ruleType !== 'signal');
  const signalRules = rules.filter(rule => rule.ruleType === 'signal');

  // ── signal：过期归档；有效期内未 dismissed 则常显（不重复创建） ──
  for (const rule of signalRules) {
    try {
      if (rule.validUntil && new Date(rule.validUntil) < now) {
        await AlertRule.updateOne({ _id: rule._id }, { $set: { active: false } });
        stats.archived += 1;
        continue;
      }
      const last = await AlertEvent.findOne({ ruleId: rule._id, status: { $ne: 'dismissed' } })
        .sort({ triggeredAt: -1 }).lean();
      if (last) continue; // 已有未处理事件，常显
      const direction = DIRECTION_LABELS[rule.direction] || rule.direction || '持有';
      const title = rule.name || `信号：${direction}`;
      const event = await AlertEvent.create({
        ruleId: rule._id,
        portfolioId: rule.portfolioId,
        symbol: rule.symbol,
        level: 'action',
        title,
        content: rule.reason || (rule.validUntil
          ? `有效期至 ${rule.validUntil.toISOString().slice(0, 10)}`
          : ''),
        snapshot: { direction: rule.direction, validUntil: rule.validUntil },
        triggeredAt: now,
        status: 'unread'
      });
      stats.created += 1;
      logger.info('ALERT_EVENT_CREATED', { ruleId: rule._id.toString(), eventId: event._id.toString(), ruleType: 'signal' });
    } catch (error) {
      stats.failed += 1;
      logger.error('ALERT_RULE_EVAL_FAILED', { ruleId: rule._id?.toString(), message: error.message });
    }
  }

  if (assetRules.length === 0) return stats;

  // ── 聚合评估输入 ──
  const symbols = [...new Set(assetRules
    .filter(rule => rule.ruleType === 'price_above' || rule.ruleType === 'price_below' ||
      rule.ruleType === 'gain_loss_pct')
    .map(rule => rule.symbol)
    .filter(Boolean))];
  const latestPrices = symbols.length ? await marketData.getLatestPrices(symbols) : {};

  const portfolioIds = [...new Set(assetRules
    .map(rule => rule.portfolioId)
    .filter(Boolean))];
  const positionsByPortfolio = {};
  for (const portfolioId of portfolioIds) {
    positionsByPortfolio[portfolioId.toString()] = await tracker.aggregate(portfolioId);
  }

  const driftCache = new Map();
  for (const rule of assetRules.filter(rule => rule.ruleType === 'drift_exceed')) {
    const key = rule.portfolioId.toString();
    if (!driftCache.has(key)) driftCache.set(key, await computeDrift(rule.portfolioId));
  }

  // ── 逐规则评估（故障隔离：单规则异常不中断批次） ──
  for (const rule of assetRules) {
    try {
      const positions = rule.portfolioId
        ? positionsByPortfolio[rule.portfolioId.toString()] || []
        : [];
      const positionsBySymbol = Object.fromEntries(
        positions.map(position => [position.symbol, position])
      );
      const drift = rule.ruleType === 'drift_exceed'
        ? driftCache.get(rule.portfolioId.toString())
        : null;

      const result = evaluateRule(rule, { latestPrices, positionsBySymbol, drift });
      if (!result) continue;

      if (await shouldSuppress(rule, now)) continue;

      const event = await AlertEvent.create({
        ruleId: rule._id,
        portfolioId: rule.portfolioId,
        symbol: rule.symbol,
        level: result.level,
        title: result.title,
        content: result.content,
        snapshot: result.snapshot,
        triggeredAt: now,
        status: 'unread'
      });
      stats.created += 1;
      logger.info('ALERT_EVENT_CREATED', {
        ruleId: rule._id.toString(),
        eventId: event._id.toString(),
        ruleType: rule.ruleType
      });
    } catch (error) {
      stats.failed += 1;
      logger.error('ALERT_RULE_EVAL_FAILED', { ruleId: rule._id?.toString(), message: error.message });
    }
  }

  return stats;
}

module.exports = { evaluateRule, evaluateAll, shouldSuppress, RULE_TYPE_LABELS };
