// server/services/rebalanceEngine/thresholdChecker.js

const Portfolio = require('../../models/portfolio');
const { positionTracker } = require('../portfolio');
const RebalanceRecord = require('../../models/rebalanceRecord');

/**
 * 阈值检测
 * @param {String} portfolioId
 * @returns {Promise<{ needsRebalance: boolean, triggeredThresholds: string[] }>}
 */
async function checkThresholds(portfolioId) {
  // 1. 读取 portfolio 配置
  const portfolio = await Portfolio.findById(portfolioId).lean();
  if (!portfolio) throw new Error('Portfolio not found');
  console.log("portfolio:", portfolio);
  const { rebalanceSettings, targets } = portfolio;

  // 2. 当前持仓聚合
  const positions = await positionTracker.aggregate(portfolioId);
  const totalValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);

  // 3. 绝对偏离 & 相对偏离检查
  const triggered = [];
  console.log("positions:", positions);
  positions.forEach(p => {
    console.log("targets:", targets);
    const target = targets.find(t => t.symbol === p.symbol);
   
    if (!target) return;
    const targetValue = totalValue * (target.targetRatio / 100);
    const currValue = p.marketValue || 0;
    const absDev = Math.abs(currValue - targetValue) / totalValue * 100;
    if (absDev > rebalanceSettings.absoluteDeviation) {
      triggered.push('absoluteDeviation');
    }
    const relDev = targetValue>0 ? Math.abs(currValue - targetValue) / targetValue * 100 : 0;
    if (relDev > rebalanceSettings.relativeDeviation) {
      triggered.push('relativeDeviation');
    }
  });

  // 4. 时间间隔阈值检查
  const lastRecord = await RebalanceRecord.findOne({ portfolioId })
    .sort({ timestamp: -1 }).lean();
  if (lastRecord) {
    const days = (Date.now() - new Date(lastRecord.timestamp)) / 86400000;
    if (days >= rebalanceSettings.timeInterval) {
      triggered.push('timeInterval');
    }
  } else {
    triggered.push('timeInterval');
  }

  // 去重并决定是否触发
  const triggeredThresholds = Array.from(new Set(triggered));
  return { needsRebalance: triggeredThresholds.length > 0, triggeredThresholds };
}

module.exports = { checkThresholds };