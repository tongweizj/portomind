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
  const data = req.body;
  const newAsset = await assetService.createAsset(data);
  res.status(201).json({ success: true, data: newAsset });
});

exports.updateAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const updated = await assetService.updateAsset(id, data);

  if (!updated) {
    return res
      .status(404)
      .json({ success: false, message: 'Asset not found' });
  }

  res.json({ success: true, data: updated });
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
