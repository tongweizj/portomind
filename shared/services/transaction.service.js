const mongoose = require('mongoose');
const Transaction = require('../models/transaction');
const Portfolio = require('../models/portfolio');
const Asset = require('../models/asset');
const { calculatePositions } = require('./transaction/positionCalculator');

const WRITABLE_FIELDS = ['portfolioId', 'symbol', 'action', 'quantity', 'price', 'fee', 'date', 'notes'];
const TRANSACTION_SORT = { date: -1, _id: -1 };
const ACTIONS = ['buy', 'sell', 'div_cash', 'div_reinvest'];

function businessError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeInput(input, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw businessError(400, 'INVALID_BODY', 'request body must be an object');
  }
  const data = {};
  for (const field of WRITABLE_FIELDS) {
    if (existing[field] !== undefined) data[field] = existing[field];
  }
  for (const field of WRITABLE_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field];
  }
  data.symbol = String(data.symbol || '').trim().toUpperCase();
  data.action = String(data.action || '').trim().toLowerCase();
  data.quantity = Number(data.quantity);
  data.price = Number(data.price);
  data.fee = data.fee === undefined ? 0 : Number(data.fee);
  data.date = data.date ? new Date(data.date) : new Date();

  if (!mongoose.Types.ObjectId.isValid(data.portfolioId)) {
    throw businessError(400, 'INVALID_PORTFOLIO_ID', 'Invalid or missing portfolioId');
  }
  if (!data.symbol) throw businessError(400, 'INVALID_SYMBOL', 'symbol is required');
  if (!ACTIONS.includes(data.action)) {
    throw businessError(400, 'INVALID_ACTION', `action must be one of: ${ACTIONS.join(', ')}`);
  }
  if (!Number.isFinite(data.quantity) || data.quantity <= 0) {
    throw businessError(400, 'INVALID_QUANTITY', 'quantity must be greater than zero');
  }
  if (!Number.isFinite(data.price) || data.price <= 0) {
    throw businessError(400, 'INVALID_PRICE', 'price must be greater than zero');
  }
  if (!Number.isFinite(data.fee) || data.fee < 0) {
    throw businessError(400, 'INVALID_FEE', 'fee must be a non-negative number');
  }
  if (Number.isNaN(data.date.getTime())) {
    throw businessError(400, 'INVALID_DATE', 'date must be a valid date');
  }
  if (data.notes !== undefined && typeof data.notes !== 'string') {
    throw businessError(400, 'INVALID_NOTES', 'notes must be a string');
  }
  return data;
}

async function validateReferences(data) {
  const [portfolio, asset] = await Promise.all([
    Portfolio.exists({ _id: data.portfolioId }),
    Asset.findOne({ symbol: data.symbol })
  ]);
  if (!portfolio) throw businessError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found');
  if (!asset) throw businessError(404, 'ASSET_NOT_FOUND', `Asset ${data.symbol} not found`);
  if (!asset.active) throw businessError(400, 'ASSET_INACTIVE', `Asset ${data.symbol} is inactive`);
  return asset;
}

async function validateLedger(candidate, transactionId, previous) {
  const ledgers = new Map();
  const addKey = value => ledgers.set(`${value.portfolioId}:${value.symbol}`, value);
  addKey(candidate);
  if (previous) addKey(previous);

  for (const ledger of ledgers.values()) {
    const query = { portfolioId: ledger.portfolioId, symbol: ledger.symbol };
    if (transactionId) query._id = { $ne: transactionId };
    const transactions = await Transaction.find(query).lean();
    const isCandidateLedger = String(candidate.portfolioId) === String(ledger.portfolioId) &&
      candidate.symbol === ledger.symbol;
    calculatePositions(
      isCandidateLedger ? [...transactions, { ...candidate, _id: transactionId }] : transactions
    );
  }
}

async function getTransactions({ page = 1, pageSize = 20, portfolioId, symbol } = {}) {
  const query = {};
  if (portfolioId) query.portfolioId = portfolioId;
  if (symbol) query.symbol = symbol.trim().toUpperCase();
  const [total, data] = await Promise.all([
    Transaction.countDocuments(query),
    Transaction.find(query)
      .sort(TRANSACTION_SORT)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
  ]);
  return { total, data };
}

function getTransactionsByPortfolio(portfolioId, options = {}) {
  return getTransactions({ ...options, portfolioId });
}

async function getTransactionById(id) {
  return Transaction.findById(id);
}

async function createTransaction(input) {
  const data = normalizeInput(input);
  const asset = await validateReferences(data);
  const transaction = {
    ...data,
    assetType: asset.type,
    market: asset.market,
    currency: asset.currency
  };
  await validateLedger(transaction);
  return Transaction.create(transaction);
}

async function updateTransaction(id, input) {
  const existing = await Transaction.findById(id).lean();
  if (!existing) throw businessError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
  const data = normalizeInput(input, existing);
  const asset = await validateReferences(data);
  const transaction = {
    ...data,
    assetType: asset.type,
    market: asset.market,
    currency: asset.currency
  };
  await validateLedger(transaction, id, existing);
  return Transaction.findByIdAndUpdate(id, transaction, {
    new: true,
    runValidators: true,
    context: 'query'
  });
}

async function deleteTransaction(id) {
  const existing = await Transaction.findById(id).lean();
  if (!existing) throw businessError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
  const remaining = await Transaction.find({
    portfolioId: existing.portfolioId,
    symbol: existing.symbol,
    _id: { $ne: id }
  }).lean();
  calculatePositions(remaining);
  return Transaction.findByIdAndDelete(id);
}

// ───────────────────────── TR-08：A股整手软警告 ─────────────────────────

const CN_LOT_MARKETS = ['CN-SH', 'CN-SZ'];
const CN_LOT_SIZE = 100;

/**
 * A股整手警告（不阻断）：CN 市场买入非 100 股整数倍时返回警告。
 * @returns {Array<string>} 警告数组（无警告为空）
 */
function detectLotWarnings({ asset, action, quantity }) {
  if (action !== 'buy' || !asset || !CN_LOT_MARKETS.includes(asset.market)) return [];
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return [];
  if (qty % CN_LOT_SIZE !== 0) {
    return [`CN_LOT_SIZE:${asset.symbol}`];
  }
  return [];
}

// ───────────────────────── TR-09：CSV 批量导入 ─────────────────────────

/**
 * 批量导入交易（幂等 + 整批回滚）。
 * - 数据校验失败（字段非法/引用不存在/超卖）→ 整批回滚，不写入任何记录；
 * - 幂等：与库中已有交易按 (portfolioId, symbol, action, quantity, price, date, fee) 完全
 *   一致则跳过（skipped），同一批次内重复条目去重；
 * - 返回 { imported, skipped, errors: [{ index, message }] }。
 */
async function importTransactions({ portfolioId, transactions = [] }) {
  if (!mongoose.Types.ObjectId.isValid(portfolioId)) {
    throw businessError(400, 'INVALID_PORTFOLIO_ID', 'Invalid or missing portfolioId');
  }
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw businessError(400, 'INVALID_IMPORT_BODY', 'transactions must be a non-empty array');
  }
  if (transactions.length > 500) {
    throw businessError(400, 'IMPORT_TOO_LARGE', 'Import batch cannot exceed 500 rows');
  }

  // 1. 逐条规范化 + 引用校验（失败收集，整批回滚）
  const portfolioExists = await Portfolio.exists({ _id: portfolioId });
  if (!portfolioExists) throw businessError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found');

  const normalized = [];
  const errors = [];
  const assetsBySymbol = new Map();
  for (let index = 0; index < transactions.length; index += 1) {
    try {
      const data = normalizeInput({ ...transactions[index], portfolioId });
      const asset = await validateReferences(data);
      assetsBySymbol.set(data.symbol, asset);
      normalized.push({ index, data, asset });
    } catch (error) {
      errors.push({ index, message: error.message || 'Invalid row' });
    }
  }
  if (errors.length > 0) {
    return { imported: 0, skipped: 0, errors };
  }

  // 2. 幂等：批次内去重 + 与库中记录比对（按日比较，避免时刻差异）
  const dayKey = value => new Date(value).toISOString().slice(0, 10);
  const dedupKey = item => [
    String(item.data.portfolioId), item.data.symbol, item.data.action,
    item.data.quantity, item.data.price, dayKey(item.data.date), item.data.fee || 0
  ].join('|');
  const seen = new Set();
  const unique = [];
  for (const item of normalized) {
    const key = dedupKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const existingKeys = new Set();
  if (unique.length > 0) {
    const existing = await Transaction.find({ portfolioId }).select(
      'symbol action quantity price date fee'
    ).lean();
    for (const tx of existing) {
      existingKeys.add([
        String(tx.portfolioId), tx.symbol, tx.action, tx.quantity, tx.price,
        dayKey(tx.date), tx.fee || 0
      ].join('|'));
    }
  }
  const toImport = [];
  let skipped = 0;
  for (const item of unique) {
    if (existingKeys.has(dedupKey(item))) {
      skipped += 1;
      continue;
    }
    toImport.push(item);
  }

  // 3. 超卖重放校验（含批次内新增，按 symbol 分组）
  const symbols = [...new Set(toImport.map(item => item.data.symbol))];
  for (const symbol of symbols) {
    const ledger = await Transaction.find({ portfolioId, symbol }).lean();
    const additions = toImport
      .filter(item => item.data.symbol === symbol)
      .map(item => ({ ...item.data, _id: `import-${item.index}` }));
    calculatePositions([...ledger, ...additions]);
  }

  // 4. 写入（批量创建）
  const created = await Transaction.insertMany(
    toImport.map(item => ({
      portfolioId,
      symbol: item.data.symbol,
      assetType: item.asset.type,
      market: item.asset.market,
      currency: item.asset.currency,
      action: item.data.action,
      quantity: item.data.quantity,
      price: item.data.price,
      fee: item.data.fee || 0,
      date: item.data.date,
      notes: item.data.notes || ''
    }))
  );
  return {
    imported: created.length,
    skipped,
    errors
  };
}

module.exports = {
  TRANSACTION_SORT,
  getTransactions,
  getTransactionsByPortfolio,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  detectLotWarnings,
  importTransactions
};
