// server/services/asset.service.js

const Asset = require('../models/asset');

/**
 * 获取所有资产
 * @returns {Promise<Array>} 资产数组
 */
async function getAllAssets() {
  return await Asset.find();
}

/**
 * 根据 ID 获取单个资产
 * @param {String} id 资产 ID
 * @returns {Promise<Object|null>} 资产对象或 null
 */
async function getAssetById(id) {
  return await Asset.findById(id);
}

/**
 * 创建新资产
 * @param {Object} data 资产数据
 * @returns {Promise<Object>} 创建后的资产对象
 */
async function createAsset(data) {
  return await Asset.create(data);
}

/**
 * 更新指定 ID 的资产
 * @param {String} id 资产 ID
 * @param {Object} data 更新的数据
 * @returns {Promise<Object|null>} 更新后的资产对象或 null
 */
async function updateAsset(id, data) {
  return await Asset.findByIdAndUpdate(id, data, { new: true });
}

/**
 * 删除指定 ID 的资产
 * @param {String} id 资产 ID
 * @returns {Promise<Object|null>} 被删除的资产对象或 null
 */
async function deleteAsset(id) {
  return await Asset.findByIdAndDelete(id);
}

module.exports = {
  getAllAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset
};
