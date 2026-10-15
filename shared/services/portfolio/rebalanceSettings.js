// server/services/portfolio/rebalanceSettings.js

const Portfolio = require('../../models/portfolio');

/**
 * 获取组合的再平衡阈值配置
 * 原逻辑在 PortfolioController#getRebalanceSettings
 * @param {String} portfolioId
 * @returns {Promise<Object>} rebalanceSettings 子文档
 */
async function getRebalanceSettings(portfolioId) {
  const portfolio = await Portfolio.findById(portfolioId).lean();
  if (!portfolio) throw new Error(`Portfolio ${portfolioId} not found`);
  return portfolio.rebalanceSettings;
}

/**
 * 更新组合的再平衡阈值配置
 * 原逻辑在 PortfolioController#updateRebalanceSettings
 * @param {String} portfolioId
 * @param {Object} cfg 包含可选字段：absoluteDeviation, relativeDeviation, timeInterval, rebalanceSchedule
 * @returns {Promise<Object>} 更新后的 rebalanceSettings
 */
async function updateRebalanceSettings(portfolioId, cfg) {
  const updates = {};
  ['absoluteDeviation','relativeDeviation','timeInterval','rebalanceSchedule']
    .forEach(key => {
      if (cfg[key] !== undefined) {
        updates[`rebalanceSettings.${key}`] = cfg[key];
      }
    });

  const updated = await Portfolio.findByIdAndUpdate(
    portfolioId,
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) throw new Error(`Portfolio ${portfolioId} not found`);
  return updated.rebalanceSettings;
}

module.exports = { getRebalanceSettings, updateRebalanceSettings };