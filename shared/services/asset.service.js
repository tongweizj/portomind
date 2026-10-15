const Asset = require('../models/asset');
const { ASSET_SORT_FIELDS, ASSET_CLASSES } = require('../constants/asset.constants');

const WRITABLE_FIELDS = [
  'symbol', 'name', 'market', 'currency', 'type', 'assetClass', 'tags', 'active', 'watchlist'
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function duplicateSymbol(symbol) {
  const error = new Error(`Asset symbol "${symbol}" already exists`);
  error.status = 409;
  error.code = 'ASSET_SYMBOL_EXISTS';
  return error;
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('request body must be an object');
  }
  const data = {};
  for (const field of WRITABLE_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field];
  }

  for (const field of ['symbol', 'name', 'market', 'currency', 'type']) {
    if (data[field] !== undefined && typeof data[field] !== 'string') {
      throw badRequest(`${field} must be a string`);
    }
  }
  if (data.symbol !== undefined) data.symbol = data.symbol.trim().toUpperCase();
  if (data.name !== undefined) data.name = data.name.trim();
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) throw badRequest('tags must be an array of strings');
    if (data.tags.some(tag => typeof tag !== 'string')) {
      throw badRequest('tags must be an array of strings');
    }
    data.tags = [...new Set(data.tags.map(tag => tag.trim()).filter(Boolean))];
  }
  for (const field of ['active', 'watchlist']) {
    if (data[field] !== undefined && typeof data[field] !== 'boolean') {
      throw badRequest(`${field} must be a boolean`);
    }
  }
  // assetClass（AS-09）：合法大类或 null/空串（= 未分类）
  if (data.assetClass !== undefined) {
    const value = data.assetClass === '' ? null : String(data.assetClass).toLowerCase();
    if (value !== null && !ASSET_CLASSES.includes(value)) {
      throw badRequest(`assetClass must be one of: ${ASSET_CLASSES.join(', ')} (or empty for unclassified)`);
    }
    data.assetClass = value;
  }
  return data;
}

async function getAllAssets({
  page = 1,
  pageSize = 20,
  search,
  sortBy = 'symbol',
  sortOrder = 'asc',
  active,
  watchlist,
  assetClass
} = {}) {
  const term = String(search || '').trim();
  const regex = term ? new RegExp(escapeRegExp(term), 'i') : null;
  const query = {};
  if (regex) query.$or = [{ symbol: regex }, { name: regex }, { tags: regex }];
  if (typeof active === 'boolean') query.active = active;
  if (typeof watchlist === 'boolean') query.watchlist = watchlist;
  // AS-09：assetClass 筛选；'unclassified' 特例匹配未分类（null）
  if (assetClass) query.assetClass = assetClass === 'unclassified' ? null : assetClass;
  const field = ASSET_SORT_FIELDS.includes(sortBy) ? sortBy : 'symbol';
  const direction = sortOrder === 'desc' ? -1 : 1;

  const [total, data] = await Promise.all([
    Asset.countDocuments(query),
    Asset.find(query)
      .sort({ [field]: direction, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
  ]);
  return { total, data };
}

async function getAssetById(id) {
  return Asset.findById(id);
}

// 内部同步任务只处理 active 资产；watchlist 不参与该判断。
async function getActiveAssets() {
  return Asset.find({ active: true }).sort({ symbol: 1 });
}

async function createAsset(input) {
  const data = normalizeInput(input);
  if (data.symbol && await Asset.exists({ symbol: data.symbol })) {
    throw duplicateSymbol(data.symbol);
  }
  try {
    return await Asset.create(data);
  } catch (error) {
    if (error.code === 11000) throw duplicateSymbol(data.symbol);
    throw error;
  }
}

async function updateAsset(id, input) {
  const data = normalizeInput(input);
  if (data.symbol && await Asset.exists({ symbol: data.symbol, _id: { $ne: id } })) {
    throw duplicateSymbol(data.symbol);
  }
  try {
    return await Asset.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
      context: 'query'
    });
  } catch (error) {
    if (error.code === 11000) throw duplicateSymbol(data.symbol);
    throw error;
  }
}

async function deleteAsset(id) {
  return Asset.findByIdAndDelete(id);
}

module.exports = {
  getAllAssets,
  getActiveAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset
};
