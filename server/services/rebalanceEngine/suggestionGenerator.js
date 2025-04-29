// server/services/rebalanceEngine/suggestionGenerator.js

const Portfolio = require('../../models/portfolio');

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

module.exports = { generateSuggestions };