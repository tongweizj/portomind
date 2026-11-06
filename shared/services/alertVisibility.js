// shared/services/alertVisibility.js
//
// TASK-068 / US-004 B16：删除组合后的事件「查询层隐藏」。
// 事件仍保留在库中（审计），仅查询不可见；资产级事件（portfolioId = null）
// 没有组合，必须始终保留。
//
// 这里只提供取现存组合 id 与构造共享过滤条件的单一来源，避免三个出口各写一遍。

const Portfolio = require('../models/portfolio');

/**
 * 取当前库中仍存在的组合 id（包含归档组合：归档不是删除，事件仍可见）。
 * 组合数量级为个位数，全量取 id 可接受。
 * @returns {Promise<Array>} ObjectId[]
 */
async function getVisiblePortfolioIds() {
  const rows = await Portfolio.find({}, { _id: 1 }).lean();
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && row._id != null)
    .map((row) => row._id);
}

/**
 * 三个出口共用的 Mongo 过滤条件。
 * @param {Array} ids 现存组合 id
 * @returns {{$or: Array}} `{ $or: [{ portfolioId: { $in: ids } }, { portfolioId: null }] }`
 */
function visibleAlertFilter(ids) {
  const visibleIds = Array.isArray(ids) ? ids : [];
  return {
    $or: [
      { portfolioId: { $in: visibleIds } },
      { portfolioId: null }
    ]
  };
}

module.exports = { getVisiblePortfolioIds, visibleAlertFilter };
