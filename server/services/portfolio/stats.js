// 组合统计

const Transaction = require('../../models/transaction');
module.exports.computeStats = async function (portfolioId) {
    // 原 getPortfolioStats 中的聚合逻辑
    // 返回 { symbol, quantity, totalCost, avgCost } 数组
    // 查询所有交易流水
    const transactions = await Transaction.find({ portfolioId }).lean();;

    // 聚合 symbol 维度的数量与成本
    const statsMap = {};
    transactions.forEach(tx => {
        const { symbol, assetType, quantity, price, action } = tx;
        if (!statsMap[symbol]) {
            statsMap[symbol] = { symbol, assetType, quantity: 0, totalCost: 0 };
        }
        const multiplier = action === 'buy' ? 1 : -1;
        statsMap[symbol].quantity += multiplier * quantity;
        statsMap[symbol].totalCost += multiplier * quantity * price;
    });

    // 生成结果数组并计算 avgCost
    return Object.values(statsMap).map(item => {
        const avgCost = item.quantity
            ? parseFloat((item.totalCost / item.quantity).toFixed(2))
            : 0;
        return {
            symbol: item.symbol,
            assetType: item.assetType,
            quantity: item.quantity,
            totalCost: parseFloat(item.totalCost.toFixed(2)),
            avgCost
        };
    });
};