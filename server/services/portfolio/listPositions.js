// server/services/portfolio/listPositions.js

const { aggregate } = require('./positionTracker');

/**
 * listPositions
 * 分页获取持仓概览（聚合 + 盈亏）
 * 将聚合结果的排序和分页集中在服务层。
 *
 * @param {String} portfolioId - 组合 ID
 * @param {Object} options
 * @param {Number|String} [options.page=1]
 * @param {Number|String} [options.pageSize=20]
 * @param {String} [options.symbol]
 * @returns {Promise<{ total: number, data: Array }>} - total: 总条数; data: 当前页数组
 */
async function listPositions(portfolioId, { page = 1, pageSize = 20, symbol, sortBy, sortOrder } = {}) {
  // 1. 聚合持仓
  const full = await aggregate(portfolioId, symbol || null);

  // 3. 分页参数校准
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const allowedSortFields = new Set(['symbol', 'marketValue', 'pnlPct', 'quantity', 'avgCost']);
  if (allowedSortFields.has(sortBy)) {
    const direction = sortOrder === 'desc' ? -1 : 1;
    full.sort((left, right) => {
      if (left[sortBy] === right[sortBy]) return 0;
      if (left[sortBy] == null) return 1;
      if (right[sortBy] == null) return -1;
      return left[sortBy] > right[sortBy] ? direction : -direction;
    });
  }
  const total = full.length;
  const start = (p - 1) * size;

  // 4. 切片返回
  const data = full.slice(start, start + size);
  return { total, data };
}

module.exports = { listPositions };
