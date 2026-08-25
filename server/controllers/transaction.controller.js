const mongoose = require('mongoose');
const transactionService = require('../services/transaction.service');
const { success, failure, pagination, parsePagination } = require('../utils/apiResponse');

function validId(req, res, id, label = 'transaction') {
  if (mongoose.Types.ObjectId.isValid(id)) return true;
  failure(req, res, 400, `Invalid ${label} ID`);
  return false;
}

function validPagination(req, res) {
  for (const field of ['page', 'pageSize']) {
    if (req.query[field] !== undefined && !/^[1-9]\d*$/.test(req.query[field])) {
      failure(req, res, 400, `${field} must be a positive integer`);
      return false;
    }
  }
  if (Number(req.query.pageSize) > 100) {
    failure(req, res, 400, 'pageSize cannot exceed 100');
    return false;
  }
  return true;
}

function forwardBusinessError(error, next) {
  if (error.name === 'ValidationError' || error.name === 'CastError') error.status = 400;
  next(error);
}

exports.getAllTransactions = async (req, res, next) => {
  if (!validPagination(req, res)) return;
  if (req.query.portfolioId && !validId(req, res, req.query.portfolioId, 'portfolio')) return;
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await transactionService.getTransactions({
      page,
      pageSize,
      portfolioId: req.query.portfolioId,
      symbol: req.query.symbol
    });
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (error) {
    forwardBusinessError(error, next);
  }
};

exports.getByPortfolio = async (req, res, next) => {
  if (!validPagination(req, res)) return;
  if (!validId(req, res, req.params.pid, 'portfolio')) return;
  try {
    const { page, pageSize } = parsePagination(req.query, { pageSize: 50 });
    const result = await transactionService.getTransactionsByPortfolio(req.params.pid, {
      symbol: req.query.symbol,
      page,
      pageSize
    });
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (error) {
    forwardBusinessError(error, next);
  }
};

exports.getTransactionById = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    const transaction = await transactionService.getTransactionById(req.params.id);
    if (!transaction) return failure(req, res, 404, 'Transaction not found');
    return success(res, transaction);
  } catch (error) {
    forwardBusinessError(error, next);
  }
};

exports.createTransaction = async (req, res, next) => {
  try {
    return success(res, await transactionService.createTransaction(req.body), { status: 201 });
  } catch (error) {
    forwardBusinessError(error, next);
  }
};

exports.updateTransaction = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    return success(res, await transactionService.updateTransaction(req.params.id, req.body));
  } catch (error) {
    forwardBusinessError(error, next);
  }
};

exports.deleteTransaction = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    return success(res, await transactionService.deleteTransaction(req.params.id));
  } catch (error) {
    forwardBusinessError(error, next);
  }
};
