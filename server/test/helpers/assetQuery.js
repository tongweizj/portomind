// server/test/helpers/assetQuery.js
//
// TASK-069：Asset.find(query) 的测试替身共用的最小 query 匹配器。
// 只覆盖资产总表用到的 active/market/$or(symbol|name) 条件。
function matchesAssetQuery(query, asset) {
  if (query.active !== undefined && asset.active !== query.active) return false;
  if (query.market && asset.market !== query.market) return false;
  if (query.$or) {
    return query.$or.some((condition) => {
      const field = Object.keys(condition)[0];
      return condition[field].test(String(asset[field] ?? ''));
    });
  }
  return true;
}

module.exports = { matchesAssetQuery };
