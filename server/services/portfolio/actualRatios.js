// 实际持仓比例

// server/services/portfolio/actualRatios.js

const Transaction = require('../../models/transaction');
const Price       = require('../../models/price');

/**
 * computeActualRatios
 * 计算组合中每个标的的实际持仓比例
 * 原 logic 位于 controllers/portfolio.controller.js#getActualRatios
 * @param {String} portfolioId - 组合 ID
 * @returns {Promise<Array<{ symbol: string, ratio: number }>>}
 */

async function computeActualRatios(portfolioId) {
  // 1. 拉取该组合下所有交易记录
  const txs = await Transaction.find({ portfolioId }).lean();

  // 2. 按 symbol 累加净持仓数量（买入 +，卖出 -）
  const positionMap = {};
  txs.forEach(tx => {
    const sign = tx.action === 'buy' ? 1 : -1;
    positionMap[tx.symbol] = (positionMap[tx.symbol] || 0) + sign * tx.quantity;
  });

  // 3. 过滤掉净持仓 <= 0 的资产
  const assets = Object.entries(positionMap)
    .filter(([_, qty]) => qty > 0);

  // 4. 获取最新价格 & 计算各资产市值
  let totalValue = 0;
  const assetValues = await Promise.all(
    assets.map(async ([symbol, qty]) => {
      const priceDoc = await Price
        .findOne({ symbol })
        .sort({ timestamp: -1 })  // 按最新 timestamp
        .lean();
      const price = priceDoc?.price ?? 0;
      const value = price * qty;
      totalValue += value;
      return { symbol, value };
    })
  );

  // 5. 计算比例并返回
  return assetValues.map(({ symbol, value }) => ({
    symbol,
    ratio: totalValue > 0
      ? parseFloat((value / totalValue * 100).toFixed(1))
      : 0
  }));
}

module.exports = { computeActualRatios };
