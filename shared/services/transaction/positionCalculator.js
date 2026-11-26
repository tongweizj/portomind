const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { MARKET_TIMEZONE } = require('../../utils/marketTime');

dayjs.extend(utc);
dayjs.extend(timezone);

const EPSILON = 1e-10;

function calculationError(code, message) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function orderNumber(value, fallback) {
  const number = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number) ? fallback : number;
}

// 预览中尚未写入的导入行使用的批次键：按码位比较排在任何已入账 ObjectId 之后。
const PREVIEW_BATCH_KEY = '~preview';

function codeUnitCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function batchKeyOf(transaction) {
  const batchId = transaction.source?.importBatchId;
  return batchId === undefined || batchId === null ? '' : String(batchId);
}

/**
 * 重放顺序（TASK-096）：(UTC 交易日, orderRank, date, 导入批次, sequence, _id)。
 * - 仅日期流水存当日 UTC 零点，与同日带时刻流水落在同一 UTC 交易日；
 * - orderRank：用户确认的同日先后（默认 0），只在同一交易日内生效，不改写成交时刻；
 * - 同一时刻：手动 / 旧流水（无批次）在前，导入流水按批次先后（ObjectId 时间序），
 *   同批次内按 sequence（原行顺序，时间正序）；预览行用 PREVIEW_BATCH_KEY 排在全部已入账流水之后；
 * - _id：最终稳定次序。字符串一律按码位比较（localeCompare 会把 '~' 排在十六进制字符之前）。
 * 预览、确认后重放与后续编辑共用此比较器，保证三者顺序一致。
 */
function compareTransactions(left, right) {
  const leftTime = new Date(left.date).getTime();
  const rightTime = new Date(right.date).getTime();
  const dayDifference = Math.floor(leftTime / DAY_MS) - Math.floor(rightTime / DAY_MS);
  if (dayDifference !== 0) return dayDifference;
  const rankDifference = orderNumber(left.orderRank, 0) - orderNumber(right.orderRank, 0);
  if (rankDifference !== 0) return rankDifference;
  if (leftTime !== rightTime) return leftTime - rightTime;
  const batchDifference = codeUnitCompare(batchKeyOf(left), batchKeyOf(right));
  if (batchDifference !== 0) return batchDifference;
  const sequenceDifference = orderNumber(left.sequence, -1) - orderNumber(right.sequence, -1);
  if (sequenceDifference !== 0) return sequenceDifference;
  return codeUnitCompare(String(left._id || ''), String(right._id || ''));
}

/** UTC 交易日键（YYYY-MM-DD），与 compareTransactions 的日分桶一致。 */
function replayDayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function latestPriceFor(latestPrices, symbol) {
  const value = latestPrices instanceof Map ? latestPrices.get(symbol) : latestPrices?.[symbol];
  const price = value && typeof value === 'object' ? value.price : value;
  if (price === null || price === undefined || price === '') return null;
  return Number.isFinite(Number(price)) ? Number(price) : null;
}

/**
 * 使用移动平均成本重放标准化交易。该函数不访问数据库，也不做汇率换算。
 * 不同币种通过 currency 保持隔离，调用方不可直接跨币种汇总。
 *
 * 口径（TR-06/TR-07）：
 * - buy：数量 += qty，成本 += qty×price + fee（成本含费）；
 * - sell：数量 -= qty，成本按卖出前均价减记，realizedPnl += (price - avgCost)×qty - fee（净得扣费）；
 * - div_cash：现金分红，不进持仓（数量/成本不变），realizedPnl 不变；
 * - div_reinvest：分红再投，等价 buy（数量与成本增加，含 fee）；
 * - fee 只影响发生之后的持仓，不回溯漂移（重放天然满足）。
 */
function replayLedger(transactions) {
  if (!Array.isArray(transactions)) {
    throw calculationError('INVALID_TRANSACTIONS', 'transactions must be an array');
  }

  const positions = new Map();
  const ordered = [...transactions].sort(compareTransactions);

  for (const transaction of ordered) {
    const symbol = String(transaction.symbol || '').trim().toUpperCase();
    const action = String(transaction.action || '').trim().toLowerCase();
    const quantity = Number(transaction.quantity);
    const tradePrice = Number(transaction.price);
    const fee = Number(transaction.fee) || 0;
    const transactionDate = new Date(transaction.date);

    if (!symbol) throw calculationError('INVALID_SYMBOL', 'transaction symbol is required');
    if (!['buy', 'sell', 'div_cash', 'div_reinvest'].includes(action)) {
      throw calculationError('INVALID_ACTION', `Invalid transaction action for ${symbol}`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw calculationError('INVALID_QUANTITY', `Invalid transaction quantity for ${symbol}`);
    }
    if (!Number.isFinite(tradePrice) || tradePrice <= 0) {
      throw calculationError('INVALID_PRICE', `Invalid transaction price for ${symbol}`);
    }
    if (!Number.isFinite(fee) || fee < 0) {
      throw calculationError('INVALID_FEE', `Invalid transaction fee for ${symbol}`);
    }
    if (Number.isNaN(transactionDate.getTime())) {
      throw calculationError('INVALID_DATE', `Invalid transaction date for ${symbol}`);
    }

    const position = positions.get(symbol) || {
      symbol,
      assetType: transaction.assetType,
      market: transaction.market,
      currency: transaction.currency,
      quantity: 0,
      remainingCost: 0,
      realizedPnl: 0
    };

    if (action === 'buy' || action === 'div_reinvest') {
      // div_reinvest 等价买入（分红再投转增持仓）
      position.quantity += quantity;
      position.remainingCost += quantity * tradePrice + fee;
    } else if (action === 'div_cash') {
      // 现金分红：不进持仓，仅记录；数量/成本/已实现盈亏均不变
    } else {
      if (quantity > position.quantity + EPSILON) {
        throw calculationError(
          'INSUFFICIENT_POSITION',
          `Sell quantity exceeds available position for ${symbol} on ${transactionDate.toISOString()}`
        );
      }
      const averageCost = position.quantity > EPSILON
        ? position.remainingCost / position.quantity
        : 0;
      position.quantity -= quantity;
      position.remainingCost -= averageCost * quantity;
      position.realizedPnl += (tradePrice - averageCost) * quantity - fee;
      if (Math.abs(position.quantity) < EPSILON) {
        position.quantity = 0;
        position.remainingCost = 0;
      }
    }

    position.assetType = transaction.assetType || position.assetType;
    position.market = transaction.market || position.market;
    position.currency = transaction.currency || position.currency;
    positions.set(symbol, position);
  }

  return positions;
}

/**
 * 持仓（仅数量 > 0）。重放口径见 replayLedger；
 * replayLedger 另返回已清仓标的（含已实现盈亏），供导入顺序核对比较同日结果。
 */
function calculatePositions(transactions, latestPrices = {}) {
  const positions = replayLedger(transactions);
  return [...positions.values()]
    .filter(position => position.quantity > EPSILON)
    .sort((left, right) => left.symbol.localeCompare(right.symbol))
    .map(position => {
      const avgCost = position.remainingCost / position.quantity;
      const latestPrice = latestPriceFor(latestPrices, position.symbol);
      const marketValue = latestPrice == null ? null : position.quantity * latestPrice;
      const unrealizedPnl = marketValue == null ? null : marketValue - position.remainingCost;
      const pnlPct = unrealizedPnl == null || position.remainingCost <= EPSILON
        ? null
        : unrealizedPnl / position.remainingCost * 100;
      return {
        ...position,
        avgCost,
        // totalCost/price/pnl 是现有前端字段的兼容别名。
        totalCost: position.remainingCost,
        latestPrice,
        price: latestPrice,
        marketValue,
        unrealizedPnl,
        pnl: unrealizedPnl,
        pnlPct
      };
    });
}

function periodKey(value, interval) {
  const date = dayjs(value).tz(MARKET_TIMEZONE);
  if (!date.isValid()) throw calculationError('INVALID_DATE', 'Invalid history event date');
  if (interval === 'month') return date.format('YYYY-MM');
  if (interval === 'week') return date.startOf('week').format('YYYY-MM-DD');
  return date.format('YYYY-MM-DD');
}

/** 每个快照仍调用 calculatePositions，确保概览与历史规则一致。 */
function calculatePositionHistory(transactions, prices, interval = 'day') {
  if (!['day', 'week', 'month'].includes(interval)) {
    throw calculationError('INVALID_INTERVAL', 'interval must be day, week, or month');
  }
  if (!Array.isArray(transactions) || !Array.isArray(prices)) {
    throw calculationError('INVALID_HISTORY_INPUT', 'transactions and prices must be arrays');
  }

  const transactionGroups = new Map();
  const priceGroups = new Map();
  const periodKeys = new Set();
  const add = (map, key, value) => map.set(key, [...(map.get(key) || []), value]);

  for (const transaction of transactions) {
    const key = periodKey(transaction.date, interval);
    periodKeys.add(key);
    add(transactionGroups, key, transaction);
  }
  for (const price of prices) {
    const key = periodKey(price.timestamp, interval);
    periodKeys.add(key);
    add(priceGroups, key, price);
  }

  const ledger = [];
  const latestPrices = {};
  const currenciesSeen = new Set();
  const history = [];

  for (const key of [...periodKeys].sort()) {
    const periodTransactions = (transactionGroups.get(key) || []).sort(compareTransactions);
    ledger.push(...periodTransactions);
    for (const transaction of periodTransactions) {
      currenciesSeen.add(transaction.currency || 'UNKNOWN');
    }
    const periodPrices = [...(priceGroups.get(key) || [])]
      .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
    for (const price of periodPrices) {
      if (Number.isFinite(Number(price.price))) {
        latestPrices[String(price.symbol).toUpperCase()] = Number(price.price);
      }
    }

    const positions = calculatePositions(ledger, latestPrices);
    for (const currency of [...currenciesSeen].sort()) {
      const currencyPositions = positions.filter(
        position => (position.currency || 'UNKNOWN') === currency
      );
      const remainingCost = currencyPositions.reduce((sum, item) => sum + item.remainingCost, 0);
      const hasMissingPrice = currencyPositions.some(item => item.marketValue == null);
      const marketValue = hasMissingPrice
        ? null
        : currencyPositions.reduce((sum, item) => sum + item.marketValue, 0);
      const unrealizedPnl = marketValue == null ? null : marketValue - remainingCost;
      history.push({
        date: key,
        currency,
        quantity: currencyPositions.length === 1 ? currencyPositions[0].quantity : null,
        remainingCost,
        costBaseline: remainingCost,
        marketValue,
        unrealizedPnl,
        pnlPct: unrealizedPnl == null || remainingCost <= EPSILON
          ? null
          : unrealizedPnl / remainingCost * 100,
        positions: currencyPositions
      });
    }
  }

  return history;
}

module.exports = {
  calculatePositions,
  replayLedger,
  replayDayKey,
  calculatePositionHistory,
  compareTransactions,
  PREVIEW_BATCH_KEY,
  periodKey
};
