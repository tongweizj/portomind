// server/services/portfolio/assetClassAggregator.js
// 大类聚合器（CM-08）：持仓 symbol → assetClass 映射 + 按大类聚合市值。
// - 未分类资产（assetClass=null）归入 'UNCLASSIFIED'，使大类偏离可见、提示用户补分类；
// - 聚合沿用 evaluateThresholds 既有口径（全部持仓市值求和，不做汇率折算——
//   与 symbol 级行为一致；家庭服务器场景多为单币种组合）。

const Asset = require('../../models/asset');

const UNCLASSIFIED = 'UNCLASSIFIED';

/** 纯函数：按大类聚合持仓市值。assetClassBySymbol 缺省视为未分类。 */
function aggregateByAssetClass(positions = [], assetClassBySymbol = {}) {
  const buckets = new Map();
  for (const position of positions) {
    if (position.marketValue == null) continue; // 缺价持仓不参与聚合（与口径一致）
    const assetClass = assetClassBySymbol[position.symbol] || UNCLASSIFIED;
    const bucket = buckets.get(assetClass) || { marketValue: 0, symbols: [] };
    bucket.marketValue += position.marketValue;
    if (!bucket.symbols.includes(position.symbol)) bucket.symbols.push(position.symbol);
    buckets.set(assetClass, bucket);
  }
  return [...buckets.entries()]
    .map(([assetClass, bucket]) => ({
      assetClass,
      marketValue: Number(bucket.marketValue.toFixed(2)),
      symbols: bucket.symbols
    }))
    .sort((left, right) => left.assetClass.localeCompare(right.assetClass));
}

/** 数据库编排：批量构建 symbol → assetClass 映射（未登记资产不在结果中）。 */
async function getAssetClassMap(symbols = []) {
  const unique = [...new Set(symbols.filter(Boolean))];
  if (unique.length === 0) return {};
  const assets = await Asset.find({ symbol: { $in: unique } }).select('symbol assetClass').lean();
  return Object.fromEntries(assets.map(asset => [asset.symbol, asset.assetClass]));
}

/** 大类目标模式下，把持仓聚合成「大类伪持仓」供 evaluateThresholds 复用。 */
function buildClassPositions(positions = [], assetClassBySymbol = {}) {
  return aggregateByAssetClass(positions, assetClassBySymbol).map(item => ({
    symbol: item.assetClass,
    marketValue: item.marketValue,
    currency: 'AGG'
  }));
}

/** 判断 targets 是否为大类目标模式。 */
function hasClassTargets(targets = []) {
  return targets.some(target => target.level === 'asset_class');
}

/**
 * 大类目标 → symbol 级目标摊分（保持大类内部结构）：
 * symbol 摊分比例 = 大类目标 × symbol 市值在该大类内占比；未分类持仓无目标 → 0。
 * @returns {{ targets: Array, symbolClassMap: Object }}
 *   targets：symbol 级派生目标（合计 ≤ 100%，新大类无持仓时不摊分）；
 *   symbolClassMap：symbol → assetClass（含 UNCLASSIFIED），供建议标注。
 */
function deriveSymbolTargets({ targets = [], positions = [], assetClassBySymbol = {} }) {
  const classTargets = new Map(
    targets
      .filter(target => target.level === 'asset_class')
      .map(target => [target.symbol, Number(target.targetRatio)])
  );
  const classValues = new Map();
  const symbolClassMap = {};
  for (const position of positions) {
    if (position.marketValue == null) continue;
    const assetClass = assetClassBySymbol[position.symbol] || UNCLASSIFIED;
    symbolClassMap[position.symbol] = assetClass;
    classValues.set(assetClass, (classValues.get(assetClass) || 0) + position.marketValue);
  }

  const derived = [];
  for (const position of positions) {
    if (position.marketValue == null) continue;
    const assetClass = symbolClassMap[position.symbol];
    const classTarget = classTargets.get(assetClass) || 0;
    const classTotal = classValues.get(assetClass) || 0;
    const share = classTotal > 0 ? position.marketValue / classTotal : 0;
    derived.push({
      symbol: position.symbol,
      targetRatio: classTarget > 0 ? Number((classTarget * share).toFixed(4)) : 0,
      level: 'asset'
    });
  }
  return { targets: derived, symbolClassMap };
}

module.exports = {
  UNCLASSIFIED,
  aggregateByAssetClass,
  getAssetClassMap,
  buildClassPositions,
  hasClassTargets,
  deriveSymbolTargets
};
