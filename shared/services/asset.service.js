const Asset = require('../models/asset');
const { normalizeSymbol, toStorageSymbol } = require('../utils/symbol');
const { ASSET_SORT_FIELDS, ASSET_CLASSES } = require('../constants/asset.constants');
const { launchDateFromDay } = require('../utils/launchDate');

const WRITABLE_FIELDS = [
  'symbol', 'name', 'market', 'currency', 'type', 'assetClass', 'tags', 'active', 'watchlist', 'launchDate'
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

  if (data.name !== undefined) data.name = data.name.trim();
  if (data.launchDate !== undefined && data.launchDate !== null) {
    const date = launchDateFromDay(data.launchDate);
    if (!date) throw badRequest('launchDate must be a valid non-future YYYY-MM-DD date or null');
    data.launchDate = date;
  }
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

// 按符号列表取 active 资产（顺序保持与传入符号一致）；不存在的符号会被忽略。
// 供历史回补 / 完整性检查等按符号运行的任务使用（由 cron-worker 侧实现合并而来）。
async function getAssetsBySymbols(symbols = []) {
  const uniqueSymbols = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  if (uniqueSymbols.length === 0) return [];
  const assets = await Asset.find({ active: true, symbol: { $in: uniqueSymbols } });
  const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));
  return uniqueSymbols
    .map(symbol => bySymbol.get(symbol))
    .filter(Boolean);
}

async function createAsset(input) {
  const data = normalizeInput(input);
  if (data.symbol !== undefined) data.symbol = toStorageSymbol(data.symbol, data.market);
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
  if (data.market !== undefined || data.symbol !== undefined) {
    const current = await getAssetById(id);
    if (!current) return null;
    if (data.market !== undefined && data.market !== current.market) {
      throw badRequest('market cannot be changed');
    }
    if (data.symbol !== undefined &&
        toStorageSymbol(data.symbol, current.market) !== toStorageSymbol(current.symbol, current.market)) {
      throw badRequest('symbol cannot be changed');
    }
    // 允许表单回传同一个键，旧资产的实际存储键留给 TASK-077。
    delete data.market;
    delete data.symbol;
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
  getAssetsBySymbols,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset
};
