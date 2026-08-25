const Transaction = require('../../models/transaction');
const transactionService = require('../transaction.service');
const recorder = require('./recorder');

function businessError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizedSuggestion(suggestion) {
  const result = {
    symbol: String(suggestion?.symbol || '').trim().toUpperCase(),
    action: String(suggestion?.action || '').trim().toLowerCase(),
    quantity: Number(suggestion?.quantity),
    price: Number(suggestion?.price)
  };
  if (!result.symbol || !['buy', 'sell'].includes(result.action) ||
      !Number.isFinite(result.quantity) || result.quantity <= 0 ||
      !Number.isFinite(result.price) || result.price <= 0) {
    throw businessError(400, 'INVALID_REBALANCE_SUGGESTION', 'Invalid rebalance suggestion');
  }
  return result;
}

function assertSuggestionsMatch(recorded, submitted) {
  if (!Array.isArray(submitted) || submitted.length !== recorded.length) {
    throw businessError(400, 'SUGGESTIONS_CHANGED', 'Submitted suggestions do not match the pending record');
  }
  const expected = recorded.map(normalizedSuggestion);
  const actual = submitted.map(normalizedSuggestion);
  for (let index = 0; index < expected.length; index += 1) {
    for (const field of ['symbol', 'action']) {
      if (expected[index][field] !== actual[index][field]) {
        throw businessError(400, 'SUGGESTIONS_CHANGED', 'Submitted suggestions do not match the pending record');
      }
    }
    for (const field of ['quantity', 'price']) {
      if (Math.abs(expected[index][field] - actual[index][field]) > 1e-8) {
        throw businessError(400, 'SUGGESTIONS_CHANGED', 'Submitted suggestions do not match the pending record');
      }
    }
  }
  return expected;
}

async function executeRebalance(portfolioId, { recordId, suggestions, mode = 'MANUAL' }) {
  if (mode !== 'MANUAL') {
    throw businessError(400, 'AUTO_EXECUTION_DISABLED', 'Automatic trade execution is disabled');
  }
  if (!recordId) throw businessError(400, 'RECORD_ID_REQUIRED', 'recordId is required');
  const record = await recorder.getRecord(recordId);
  if (!record || String(record.portfolioId) !== String(portfolioId)) {
    throw businessError(404, 'REBALANCE_RECORD_NOT_FOUND', 'Rebalance record not found');
  }
  if (record.status !== 'PENDING') {
    throw businessError(409, 'REBALANCE_RECORD_NOT_PENDING', 'Only a PENDING record can be executed');
  }

  const trades = assertSuggestionsMatch(record.suggestions, suggestions)
    .sort((left, right) => left.action === right.action ? 0 : left.action === 'sell' ? -1 : 1);
  const executedTransactionIds = [];
  for (const trade of trades) {
    const transaction = await transactionService.createTransaction({
      portfolioId,
      symbol: trade.symbol,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      date: new Date(),
      notes: `Rebalance execution ${recordId}`
    });
    executedTransactionIds.push(transaction._id);
  }

  return recorder.updateStatus(recordId, 'EXECUTED', {
    mode: 'MANUAL',
    executedAt: new Date(),
    executedTransactionIds
  });
}

async function revokeExecution(recordId) {
  const record = await recorder.getRecord(recordId);
  if (!record) throw businessError(404, 'REBALANCE_RECORD_NOT_FOUND', 'Rebalance record not found');
  if (record.status !== 'EXECUTED') {
    throw businessError(409, 'REBALANCE_RECORD_NOT_EXECUTED', 'Only an EXECUTED record can be revoked');
  }
  const ids = (record.executedTransactionIds || []).map(String);
  if (ids.length === 0) {
    throw businessError(409, 'EXECUTED_TRADES_MISSING', 'Executed transactions are missing');
  }
  const transactions = await Transaction.find({ _id: { $in: ids } }).lean();
  const byId = new Map(transactions.map(transaction => [String(transaction._id), transaction]));
  const originals = ids.map(id => byId.get(id));
  if (originals.some(transaction => !transaction)) {
    throw businessError(409, 'EXECUTED_TRADES_MISSING', 'An executed transaction no longer exists');
  }

  const reversalTransactionIds = [];
  for (const original of originals.reverse()) {
    const reversal = await transactionService.createTransaction({
      portfolioId: original.portfolioId,
      symbol: original.symbol,
      action: original.action === 'buy' ? 'sell' : 'buy',
      quantity: original.quantity,
      price: original.price,
      date: new Date(),
      notes: `Reversal of rebalance ${recordId}`
    });
    reversalTransactionIds.push(reversal._id);
  }
  return recorder.updateStatus(recordId, 'REVOKED', {
    revokedAt: new Date(),
    reversalTransactionIds
  });
}

async function prepareReexecution(recordId) {
  const record = await recorder.getRecord(recordId);
  if (!record) throw businessError(404, 'REBALANCE_RECORD_NOT_FOUND', 'Rebalance record not found');
  if (record.status !== 'REVOKED') {
    throw businessError(409, 'REBALANCE_RECORD_NOT_REVOKED', 'Only a REVOKED record can be prepared again');
  }
  return recorder.createRecord(record.portfolioId, 'MANUAL', record.suggestions, {
    sourceRecordId: record._id,
    feeModel: record.feeModel,
    cashBudget: record.cashBudget,
    triggeredThresholds: record.triggeredThresholds,
    thresholdDetails: record.thresholdDetails,
    warnings: record.warnings,
    funding: record.funding
  });
}

module.exports = {
  executeRebalance,
  revokeExecution,
  prepareReexecution,
  assertSuggestionsMatch
};
