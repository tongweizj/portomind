const Transaction = require('../models/transaction');

/**
 * 获取某个组合下的所有交易流水
 * @param {String} portfolioId - 组合的 MongoDB _id
 * @param {Object} [opts] - 可选过滤／分页参数
 * @param {String} [opts.symbol] - 按标的代码过滤
 * @param {Number} [opts.page=1]
 * @param {Number} [opts.pageSize=50]
 */
async function getTransactionsByPortfolio(portfolioId, opts = {}) {
  const { symbol, page = 1, pageSize = 50 } = opts;
  console.log("portfolioId: ",portfolioId)
  // 构造查询条件
  const query = { portfolioId };
  if (symbol) {
    query.symbol = symbol;            // 精确匹配，也可改为 {$regex: symbol, $options:'i'}
  }

  // 统计总条数（分页时返回给前端）
  const total = await Transaction.countDocuments(query);
console.log("total: ",total)
  // 分页、排序并返回纯 JS 对象
  const data = await Transaction
    .find(query)
    .sort({ timestamp: -1 })          // 或按你模型里的字段，例如 createdAt
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return { total, data };
}

module.exports = { getTransactionsByPortfolio };
