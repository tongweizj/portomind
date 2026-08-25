const mongoose = require('mongoose');
const assetService = require('../services/asset.service');
const { ASSET_SORT_FIELDS } = require('../constants/asset.constants');
const { success, failure, pagination, parsePagination } = require('../utils/apiResponse');

function validateId(req, res) {
  if (mongoose.Types.ObjectId.isValid(req.params.id)) return true;
  failure(req, res, 400, 'Invalid asset ID');
  return false;
}

function validateListQuery(req, res) {
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
  if (req.query.sortBy && !ASSET_SORT_FIELDS.includes(req.query.sortBy)) {
    failure(req, res, 400, `sortBy must be one of: ${ASSET_SORT_FIELDS.join(', ')}`);
    return false;
  }
  if (req.query.sortOrder && !['asc', 'desc'].includes(req.query.sortOrder)) {
    failure(req, res, 400, 'sortOrder must be asc or desc');
    return false;
  }
  if (req.query.search && req.query.search.length > 100) {
    failure(req, res, 400, 'search cannot exceed 100 characters');
    return false;
  }
  for (const field of ['active', 'watchlist']) {
    if (req.query[field] !== undefined && !['true', 'false'].includes(req.query[field])) {
      failure(req, res, 400, `${field} must be true or false`);
      return false;
    }
  }
  return true;
}

function handleAssetError(err, req, res, next) {
  if (err.status === 409 || err.code === 11000) {
    const symbol = err.keyValue?.symbol;
    return failure(req, res, 409, err.message || `Asset symbol "${symbol}" already exists`);
  }
  if (err.status === 400 || err.name === 'ValidationError' || err.name === 'CastError') {
    return failure(req, res, 400, err.message, err.errors);
  }
  return next(err);
}

exports.getAllAssets = async (req, res, next) => {
  if (!validateListQuery(req, res)) return;
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await assetService.getAllAssets({
      page,
      pageSize,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      active: req.query.active === undefined ? undefined : req.query.active === 'true',
      watchlist: req.query.watchlist === undefined ? undefined : req.query.watchlist === 'true'
    });
    return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
  } catch (err) {
    next(err);
  }
};

exports.getAssetById = async (req, res, next) => {
  if (!validateId(req, res)) return;
  try {
    const asset = await assetService.getAssetById(req.params.id);
    if (!asset) return failure(req, res, 404, 'Asset not found');
    return success(res, asset);
  } catch (err) {
    handleAssetError(err, req, res, next);
  }
};

exports.createAsset = async (req, res, next) => {
  try {
    return success(res, await assetService.createAsset(req.body), { status: 201 });
  } catch (err) {
    handleAssetError(err, req, res, next);
  }
};

exports.updateAsset = async (req, res, next) => {
  if (!validateId(req, res)) return;
  try {
    const updated = await assetService.updateAsset(req.params.id, req.body);
    if (!updated) return failure(req, res, 404, 'Asset not found');
    return success(res, updated);
  } catch (err) {
    handleAssetError(err, req, res, next);
  }
};

exports.deleteAsset = async (req, res, next) => {
  if (!validateId(req, res)) return;
  try {
    const deleted = await assetService.deleteAsset(req.params.id);
    if (!deleted) return failure(req, res, 404, 'Asset not found');
    return success(res, deleted);
  } catch (err) {
    handleAssetError(err, req, res, next);
  }
};
