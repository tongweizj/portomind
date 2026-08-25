// cron-worker/src/services/asset.service.js
// Worker 所需的资产查询服务。完整 CRUD 仍保留在 ../server/services/asset.service.js，本包仅移植同步任务用到的读取。

const Asset = require('../models/asset');

// 内部同步任务只处理 active 资产；watchlist 不参与该判断。
async function getActiveAssets() {
  return Asset.find({ active: true }).sort({ symbol: 1 });
}

// 按符号列表取 active 资产（顺序保持与传入符号一致）；不存在的符号会被忽略。
async function getAssetsBySymbols(symbols = []) {
  const uniqueSymbols = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  if (uniqueSymbols.length === 0) return [];
  const assets = await Asset.find({ active: true, symbol: { $in: uniqueSymbols } });
  const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));
  return uniqueSymbols
    .map(symbol => bySymbol.get(symbol))
    .filter(Boolean);
}

module.exports = { getActiveAssets, getAssetsBySymbols };
