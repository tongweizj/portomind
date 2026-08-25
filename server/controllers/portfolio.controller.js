const mongoose = require('mongoose');
const Portfolio = require('../models/portfolio');
const PortfolioService = require('../services/portfolio');
const { validateTargets } = require('../services/portfolio/validateTargets');
const { success, failure, pagination, parsePagination } = require('../utils/apiResponse');

function validId(req, res, id) {
  if (mongoose.Types.ObjectId.isValid(id)) return true;
  failure(req, res, 400, 'Invalid portfolio ID');
  return false;
}

function forward(err, next, fallbackStatus) {
  if (err.name === 'ValidationError' || err.name === 'CastError') err.status = 400;
  else if (!err.status) err.status = fallbackStatus;
  next(err);
}

exports.createPortfolio = async (req, res, next) => {
  try {
    validateTargets(req.body.targets);
    return success(res, await new Portfolio(req.body).save(), { status: 201 });
  } catch (err) {
    forward(err, next, 400);
  }
};

exports.getAllPortfolios = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const [total, data] = await Promise.all([
      Portfolio.countDocuments({}),
      Portfolio.find().sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return success(res, data, { pagination: pagination(page, pageSize, total) });
  } catch (err) {
    next(err);
  }
};

exports.getPortfolioById = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    const portfolio = await Portfolio.findById(req.params.id);
    if (!portfolio) return failure(req, res, 404, 'Portfolio not found');
    return success(res, portfolio);
  } catch (err) {
    next(err);
  }
};

exports.updatePortfolio = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    validateTargets(req.body.targets);
    const updated = await Portfolio.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!updated) return failure(req, res, 404, 'Portfolio not found');
    return success(res, updated);
  } catch (err) {
    forward(err, next, 400);
  }
};

exports.deletePortfolio = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    const deleted = await PortfolioService.deletePortfolioCascade(req.params.id);
    if (!deleted) return failure(req, res, 404, 'Portfolio not found');
    return success(res, deleted);
  } catch (err) {
    next(err);
  }
};

exports.getPortfolioStats = async (req, res, next) => {
  try {
    return success(res, await PortfolioService.computeStats(req.params.id));
  } catch (err) {
    next(err);
  }
};

exports.getActualRatios = async (req, res, next) => {
  try {
    return success(res, await PortfolioService.computeActualRatios(req.params.id));
  } catch (err) {
    next(err);
  }
};

exports.getRebalanceSettings = async (req, res, next) => {
  try {
    return success(res, await PortfolioService.getRebalanceSettings(req.params.pid));
  } catch (err) {
    if (err.message.includes('not found')) return failure(req, res, 404, err.message);
    next(err);
  }
};

exports.updateRebalanceSettings = async (req, res, next) => {
  try {
    const data = await PortfolioService.updateRebalanceSettings(req.params.pid, req.body);
    return success(res, data);
  } catch (err) {
    if (err.message.includes('not found')) return failure(req, res, 404, err.message);
    forward(err, next, 400);
  }
};

exports.getPositions = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await PortfolioService.listPositions(req.params.pid, {
      page,
      pageSize,
      symbol: req.query.symbol,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    });
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (err) {
    next(err);
  }
};

exports.getPositionHistory = async (req, res, next) => {
  try {
    const interval = req.query.interval || 'day';
    if (!['day', 'week', 'month'].includes(interval)) {
      return failure(req, res, 400, 'interval must be day, week, or month');
    }
    const data = await PortfolioService.getHistory(req.params.pid, req.query.symbol || null, interval);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};
