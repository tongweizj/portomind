// server/controllers/asset.controller.js (CommonJS 版)

const asyncHandler = require('express-async-handler');
const assetService = require('../services/assetService');

exports.getAllAssets = asyncHandler(async (req, res) => {
  const assets = await assetService.getAllAssets();
  res.json({ success: true, data: assets });
});

exports.getAssetById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const asset = await assetService.getAssetById(id);

  if (!asset) {
    return res
      .status(404)
      .json({ success: false, message: 'Asset not found' });
  }

  res.json({ success: true, data: asset });
});

exports.createAsset = asyncHandler(async (req, res) => {
  try {
    const data = req.body;
    const newAsset = await assetService.createAsset(data);
    res.status(201).json({ success: true, data: newAsset });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: err.message,
        details: err.errors,
      });
    } else if (err.code === 11000) {
      // MongoDB duplicate key error
      return res.status(409).json({
        success: false,
        error: 'DuplicateKey',
        message: 'Asset already exists with the same unique key.',
        keyValue: err.keyValue,
      });
    } else {
      // generic error
      console.error(err);
      return res.status(500).json({
        success: false,
        error: 'ServerError',
        message: 'An unexpected error occurred while creating the asset.',
      });
    }
  }
});

exports.updateAsset = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await assetService.updateAsset(id, data);
    res.status(201).json({ success: true, data: updated });
  } catch (err) {
     if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: err.message,
        details: err.errors,
      });
    } else if (err.code === 11000) {
      // MongoDB duplicate key error
      return res.status(409).json({
        success: false,
        error: 'DuplicateKey',
        message: 'Asset already exists with the same unique key.',
        keyValue: err.keyValue,
      });
    } else {
      // generic error
      console.error(err);
      return res.status(500).json({
        success: false,
        error: 'ServerError',
        message: 'An unexpected error occurred while creating the asset.',
      });
    }

    
  }
});

exports.deleteAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await assetService.deleteAsset(id);

  if (!deleted) {
    return res
      .status(404)
      .json({ success: false, message: 'Asset not found' });
  }

  res.json({ success: true, data: deleted });
});
