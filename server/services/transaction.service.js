const mongoose = require('mongoose');
const Transaction = require('../models/transaction');
const Portfolio = require('../models/portfolio');
const Asset = require('../models/asset');
const { calculatePositions } = require('./transaction/positionCalculator');

const WRITABLE_FIELDS = ['portfolioId', 'symbol', 'action', 'quantity', 'price', 'date', 'notes'];
const TRANSACTION_SORT = { date: -1, _id: -1 };

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
  data.date = data.date ? new Date(data.date) : new Date();

  if (!mongoose.Types.ObjectId.isValid(data.portfolioId)) {
    throw businessError(400, 'INVALID_PORTFOLIO_ID', 'Invalid or missing portfolioId');
  }
  if (!data.symbol) throw businessError(400, 'INVALID_SYMBOL', 'symbol is required');
  if (!['buy', 'sell'].includes(data.action)) {
    throw businessError(400, 'INVALID_ACTION', 'action must be buy or sell');
  }
  if (!Number.isFinite(data.quantity) || data.quantity <= 0) {
    throw businessError(400, 'INVALID_QUANTITY', 'quantity must be greater than zero');
  }
  if (!Number.isFinite(data.price) || data.price <= 0) {
    throw businessError(400, 'INVALID_PRICE', 'price must be greater than zero');
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

module.exports = {
  TRANSACTION_SORT,
  getTransactions,
  getTransactionsByPortfolio,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction
};
