// server/services/portfolioService/positionTracker.js

/**
 * PositionTracker 子模块
 * 提供持仓聚合、盈亏计算和历史趋势查询功能
 * 隶属于 PortfolioService
 */

const Transaction = require('../../models/transaction');
const Price       = require('../../models/price');
const marketData  = require('../marketDataService'); // 批量获取行情

// 可选：简单内存缓存，缓存 key -> { timestamp, data }
// const NodeCache = require('node-cache');
// const cache = new NodeCache({ stdTTL: 300 });

/**
 * 持仓聚合
 * @param {String} portfolioId - 组合 ID
 * @param {String} [symbolFilter] - 可选，过滤单个资产标识
 * @returns {Promise<Array<{ symbol, quantity, avgCost, price, marketValue }>>}
 */
async function aggregate(portfolioId, symbolFilter) {
  // 1. 用正确字段名查询交易
  const match = { portfolioId };
  if (symbolFilter) match.symbol = symbolFilter;
  const txns = await Transaction.find(match).lean();

// 2. 聚合计算 quantity 和加权成本
const agg = txns.reduce((map, txn) => {
  // 修正：从 txn.quantity 中解构 qty，确保变量已定义
  const { symbol, quantity: qty, price: txPrice } = txn;
  if (!map[symbol]) {
    map[symbol] = { symbol, quantity: 0, costAcc: 0 };
  }
  map[symbol].quantity += qty;
  map[symbol].costAcc += txPrice * qty;
  return map;
}, {});

  // 3. 构建数组并计算 avgCost
  const positions = Object.values(agg).map(({ symbol, quantity, costAcc }) => ({
    symbol,
    quantity,
    avgCost: parseFloat(quantity ? costAcc / quantity : 0).toFixed(2),
    totalCost:parseFloat(((quantity ? costAcc / quantity : 0) * quantity).toFixed(2))
  }));

  // 4. 批量获取最新价格
  const symbols = positions.map(p => p.symbol);
  console.log("symbols: ", symbols);
  const prices = await marketData.getLatestPrices(symbols);
  console.log("prices-11: ", prices);
  // 5. 计算 marketValue，并附上 price
  return positions.map(pos => {
    const price = prices[pos.symbol] ?? null;
    return {
      ...pos,
      price,
      marketValue: price != null ? pos.quantity * price : null
    };
  });
}

/**
 * 盈亏计算
 * @param {Array<{ symbol, quantity, avgCost, price, marketValue }>} positions
 * @returns {Array<{ symbol, quantity, avgCost, price, marketValue, pnl, pnlPct }>}
 */
function calculatePnL(positions) {
  return positions.map(pos => {
    const { quantity, avgCost, price } = pos;
    let pnl = null;
    let pnlPct = null;
    if (price != null && avgCost > 0) {
      pnl = (price - avgCost) * quantity;
      pnlPct = ((price / avgCost) - 1) * 100;
    }
    return { ...pos, pnl, pnlPct };
  });
}

/**
 * 历史趋势
 * 按指定粒度（day/week/month）聚合每个时间点的持仓数量、价值和成本基线
 * @param {String} portfolioId
 * @param {String} [symbol] - 可选，单个资产
 * @param {'day'|'week'|'month'} interval
 * @returns {Promise<Array<{ date, quantity, marketValue, costBaseline }>>}
 */
async function getHistory(portfolioId, symbol, interval) {
  // 时间截取函数
  const dateTrunc = {
    day:   { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
    week:  { $dateToString: { format: '%Y-%U', date: '$date' } },
    month: { $dateToString: { format: '%Y-%m', date: '$date' } }
  }[interval] || dateTrunc.day;

  // 1. 聚合交易，按符号和时间分组
  const txnMatch = { portfolio: portfolioId };
  if (symbol) txnMatch.symbol = symbol;
  const txnAgg = await Transaction.aggregate([
    { $match: txnMatch },
    { $group: {
        _id: { symbol: '$symbol', period: dateTrunc },
        quantity: { $sum: '$qty' },
        costAcc:  { $sum: { $multiply: ['$qty', '$price'] } }
    }},
    { $project: {
        symbol: '$_id.symbol',
        period: '$_id.period',
        quantity: 1,
        avgCost: { $cond: [ { $eq: ['$quantity', 0] }, 0, { $divide: ['$costAcc', '$quantity'] } ] }
    }}
  ]);

  // 2. 获取每期价格（取 period 的最后一日价格）并计算市值
  const history = [];
  for (const rec of txnAgg) {
    const priceDoc = await Price.findOne({ symbol: rec.symbol, date: new Date(rec.period) })
                             .sort({ date: -1 }).lean();
    const price = priceDoc?.close ?? null;
    history.push({
      date: rec.period,
      quantity: rec.quantity,
      costBaseline: rec.avgCost * rec.quantity,
      marketValue: price != null ? price * rec.quantity : null
    });
  }

  // 3. 返回排序后的结果
  return history.sort((a,b) => a.date.localeCompare(b.date));
}

module.exports = { aggregate, calculatePnL, getHistory };
