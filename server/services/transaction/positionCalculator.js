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

function compareTransactions(left, right) {
  const dateDifference = new Date(left.date) - new Date(right.date);
  if (dateDifference !== 0) return dateDifference;
  return String(left._id || '').localeCompare(String(right._id || ''));
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
 */
function calculatePositions(transactions, latestPrices = {}) {
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
    const transactionDate = new Date(transaction.date);

    if (!symbol) throw calculationError('INVALID_SYMBOL', 'transaction symbol is required');
    if (!['buy', 'sell'].includes(action)) {
      throw calculationError('INVALID_ACTION', `Invalid transaction action for ${symbol}`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw calculationError('INVALID_QUANTITY', `Invalid transaction quantity for ${symbol}`);
    }
    if (!Number.isFinite(tradePrice) || tradePrice <= 0) {
      throw calculationError('INVALID_PRICE', `Invalid transaction price for ${symbol}`);
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

    if (action === 'buy') {
      position.quantity += quantity;
      position.remainingCost += quantity * tradePrice;
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
      position.realizedPnl += (tradePrice - averageCost) * quantity;
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
  calculatePositionHistory,
  compareTransactions,
  periodKey
};
