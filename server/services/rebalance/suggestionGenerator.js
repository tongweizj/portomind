// server/services/rebalanceEngine/suggestionGenerator.js
const { aggregatePositions } = require('../portfolio');
const thresholdChecker    = require('./thresholdChecker');
const costEstimator       = require('./costEstimator');
const Portfolio = require('../../models/portfolio');
 /**
   * 生成再平衡建议并预估成本
   * @param {String} portfolioId
   * @param {Object} [feeModel={}]  固定费/比例费/税率等
   * @returns {Promise<Array>}      建议列表，每项含 symbol, action, quantity, estimatedCost, estimatedTax, postRebalanceRatio
   */
 async function getSuggestions(portfolioId, feeModel = {}) {
  // 1. 聚合当前持仓
  const positions = await aggregatePositions(portfolioId);

  // 2. 阈值检测，决定哪些阈值被触发
  const { triggeredThresholds } = await thresholdChecker.checkThresholds(portfolioId);

  // 3. 生成原始建议
  let suggestions = await generateSuggestions(
    portfolioId,
    positions,
    triggeredThresholds
  );

  // 4. 对每条建议预估交易成本和税费
  suggestions = costEstimator.estimateCost(suggestions, feeModel);

  return suggestions;
}


/**
 * 建议生成子模块
 * 根据触发的阈值，为每个持仓生成买/卖建议
 * @param {String} portfolioId - 组合 ID
 * @param {Array} positions - 持仓数组，元素为 { symbol, quantity, avgCost, price, marketValue }
 * @param {Array} triggeredThresholds - 触发的阈值列表
 * @returns {Promise<Array>} - 建议列表，元素 { symbol, action, quantity, estimatedCost, postRebalanceRatio }
 */
async function generateSuggestions(portfolioId, positions, triggeredThresholds) {
  // 1. 加载组合，获取目标配比
  const portfolio = await Portfolio.findById(portfolioId).lean();
  if (!portfolio) throw new Error('Portfolio not found');
  const { targets } = portfolio;

  // 2. 计算组合总市值
  const totalValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);

  // 3. 为每笔持仓生成再平衡建议
  const suggestions = positions.map(p => {
    // 找到对应的目标配比（%）
    const target = targets.find(t => t.symbol === p.symbol) || { targetRatio: 0 };
    const targetValue = totalValue * (target.targetRatio / 100);
    const currValue   = p.marketValue || 0;
    const deltaValue  = targetValue - currValue;
    const price       = p.price || 0;

    // 计算交易数量：买入向上取整，卖出向下取整
    const tradeQty = price > 0
      ? (deltaValue > 0
          ? Math.ceil(deltaValue / price)
          : Math.floor(deltaValue / price))
      : 0;
    const action = deltaValue > 0 ? 'BUY' : 'SELL';

    // 计算调整后的配比
    const postRatio = price > 0
      ? ((currValue + tradeQty * price) / totalValue * 100)
      : target.targetRatio;

    return {
      symbol: p.symbol,
      action,
      quantity: Math.abs(tradeQty),
      estimatedCost: 0,          // 由 CostEstimator 模块后续填充
      postRebalanceRatio: postRatio
    };
  });

  return suggestions;
}

module.exports = { getSuggestions, generateSuggestions };