const Transaction = require('../../models/transaction');
const Price = require('../../models/price');
const marketData = require('../marketData.service');
const {
  calculatePositions,
  calculatePositionHistory
} = require('../transaction/positionCalculator');

/** 数据库适配层：读取交易和最新价，计算由纯函数完成。 */
async function aggregate(portfolioId, symbolFilter) {
  const match = { portfolioId };
  if (symbolFilter) match.symbol = String(symbolFilter).trim().toUpperCase();
  const transactions = await Transaction.find(match).sort({ date: 1, _id: 1 }).lean();
  const symbols = [...new Set(transactions.map(transaction => transaction.symbol))];
  const latestPrices = symbols.length ? await marketData.getLatestPrices(symbols) : {};
  return calculatePositions(transactions, latestPrices);
}

// 保留旧导出，调用者获得的持仓已经包含完整盈亏字段。
function calculatePnL(positions) {
  return positions;
}

/**
 * 使用 Transaction.date/quantity 和 Price.timestamp/price 构建历史快照。
 * 多币种按 currency 分行返回，不做跨币种加总。
 */
async function getHistory(portfolioId, symbol, interval) {
  const transactionQuery = { portfolioId };
  if (symbol) transactionQuery.symbol = String(symbol).trim().toUpperCase();
  const transactions = await Transaction
    .find(transactionQuery)
    .sort({ date: 1, _id: 1 })
    .lean();
  if (transactions.length === 0) return [];

  const symbols = [...new Set(transactions.map(transaction => transaction.symbol))];
  const prices = await Price
    .find({ symbol: { $in: symbols } })
    .sort({ timestamp: 1, _id: 1 })
    .lean();

  return calculatePositionHistory(transactions, prices, interval);
}

module.exports = { aggregate, calculatePnL, getHistory };
