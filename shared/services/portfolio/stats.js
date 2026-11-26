const Transaction = require('../../models/transaction');
const { visibleQuery } = require('../transaction/visibility');
const { calculatePositions } = require('../transaction/positionCalculator');

module.exports.computeStats = async function computeStats(portfolioId) {
  const transactions = await Transaction
    .find(visibleQuery({ portfolioId }))
    .sort({ date: 1, _id: 1 })
    .lean();
  return calculatePositions(transactions).map(position => ({
    symbol: position.symbol,
    assetType: position.assetType,
    quantity: position.quantity,
    remainingCost: Number(position.remainingCost.toFixed(2)),
    totalCost: Number(position.remainingCost.toFixed(2)),
    avgCost: Number(position.avgCost.toFixed(2)),
    realizedPnl: Number(position.realizedPnl.toFixed(2))
  }));
};
