const Portfolio = require('../../models/portfolio');
const Transaction = require('../../models/transaction');
const RebalanceRecord = require('../../models/rebalanceRecord');

async function deletePortfolioCascade(portfolioId) {
  const portfolio = await Portfolio.findById(portfolioId);
  if (!portfolio) return null;

  // 子资源先删；若清理失败，组合本身仍保留，避免产生新的孤儿记录。
  const [transactionResult, rebalanceResult] = await Promise.all([
    Transaction.deleteMany({ portfolioId }),
    RebalanceRecord.deleteMany({ portfolioId })
  ]);
  await Portfolio.findByIdAndDelete(portfolioId);

  return {
    portfolio,
    deletedTransactions: transactionResult.deletedCount ?? transactionResult.n ?? 0,
    deletedRebalanceRecords: rebalanceResult.deletedCount ?? rebalanceResult.n ?? 0
  };
}

module.exports = { deletePortfolioCascade };
