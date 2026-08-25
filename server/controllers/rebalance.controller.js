const { thresholdChecker, suggestionGenerator, recorder } = require('../services/rebalance');
const {
  executeRebalance,
  revokeExecution,
  prepareReexecution
} = require('../services/rebalance/executeRebalance');
const { success, failure, pagination, parsePagination } = require('../utils/apiResponse');

exports.check = async (req, res, next) => {
  try {
    return success(res, await thresholdChecker.checkThresholds(req.params.pid));
  } catch (err) {
    next(err);
  }
};

exports.suggestions = async (req, res, next) => {
  try {
    return success(res, await suggestionGenerator.getSuggestions(req.params.pid, {
      feeModel: req.body.feeModel || {},
      cashBudget: req.body.cashBudget || 0,
      mode: 'MANUAL'
    }), { status: 201 });
  } catch (err) {
    next(err);
  }
};

exports.execute = async (req, res, next) => {
  const { recordId, suggestions, mode = 'MANUAL' } = req.body;
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return failure(req, res, 400, 'suggestions must be a non-empty array');
  }
  if (!recordId) {
    return failure(req, res, 400, 'recordId is required');
  }
  if (mode !== 'MANUAL') {
    return failure(req, res, 400, 'mode must be MANUAL; automatic execution is disabled');
  }
  try {
    const updated = await executeRebalance(req.params.pid, { recordId, suggestions, mode });
    return success(res, {
      recordId: updated._id,
      status: updated.status,
      transactionIds: updated.executedTransactionIds
    });
  } catch (err) {
    next(err);
  }
};

exports.history = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await recorder.getHistory(req.params.pid, page, pageSize);
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (err) {
    next(err);
  }
};

exports.revoke = async (req, res, next) => {
  try {
    const record = await revokeExecution(req.params.recordId);
    return success(res, {
      recordId: record._id,
      status: record.status,
      reversalTransactionIds: record.reversalTransactionIds
    });
  } catch (err) {
    next(err);
  }
};

exports.reexecute = async (req, res, next) => {
  try {
    const record = await prepareReexecution(req.params.recordId);
    return success(res, {
      recordId: record._id,
      sourceRecordId: record.sourceRecordId,
      status: record.status,
      suggestions: record.suggestions
    }, { status: 201 });
  } catch (err) {
    next(err);
  }
};
