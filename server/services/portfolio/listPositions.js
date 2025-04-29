// server/services/portfolio/listPositions.js

const { aggregate }    = require('./positionTracker');
const { calculatePnL } = require('./positionTracker');

/**
 * listPositions
 * 分页获取持仓概览（聚合 + 盈亏）
 * 抽取了分页逻辑，代替 Controller 中的 slice 与 console.log
 *
 * @param {String} portfolioId - 组合 ID
 * @param {Object} options
 * @param {Number|String} [options.page=1]
 * @param {Number|String} [options.pageSize=20]
 * @param {String} [options.symbol]
 * @returns {Promise<{ total: number, data: Array }>} - total: 总条数; data: 当前页数组
 */
async function listPositions(portfolioId, { page = 1, pageSize = 20, symbol } = {}) {
  // 1. 聚合持仓
  const raw = await aggregate(portfolioId, symbol || null);
  // 2. 计算盈亏
  const full = calculatePnL(raw);

  // 3. 分页参数校准
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const total = full.length;
  const start = (p - 1) * size;

  // 4. 切片返回
  const data = full.slice(start, start + size);
  return { total, data };
}

module.exports = { listPositions };