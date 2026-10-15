const tracker = require('./positionTracker');
const aggregator = require('./assetClassAggregator');
const { UNCLASSIFIED } = aggregator;

/** 比例仅在相同原币种内部计算；未引入汇率前不跨币种汇总。 */
async function computeActualRatios(portfolioId, { level = 'asset' } = {}) {
  const positions = await tracker.aggregate(portfolioId);

  if (level === 'asset_class') {
    // CM-08：按 (币种, 大类) 聚合，币种内大类占比
    const assetClassBySymbol = await aggregator.getAssetClassMap(positions.map(position => position.symbol));
    const buckets = new Map(); // key: `${currency}:${assetClass}`
    const totalsByCurrency = {};
    for (const position of positions) {
      if (position.marketValue == null) continue;
      const currency = position.currency || 'UNKNOWN';
      const assetClass = assetClassBySymbol[position.symbol] || UNCLASSIFIED;
      const key = `${currency}:${assetClass}`;
      buckets.set(key, (buckets.get(key) || 0) + position.marketValue);
      totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + position.marketValue;
    }
    return [...buckets.entries()]
      .map(([key, marketValue]) => {
        const [currency, assetClass] = key.split(':');
        const total = totalsByCurrency[currency] || 0;
        return {
          symbol: assetClass,
          currency,
          ratio: total > 0 ? Number((marketValue / total * 100).toFixed(1)) : 0
        };
      })
      .sort((left, right) =>
        left.symbol.localeCompare(right.symbol) || left.currency.localeCompare(right.currency));
  }

  const totalsByCurrency = positions.reduce((totals, position) => {
    if (position.marketValue != null) {
      const currency = position.currency || 'UNKNOWN';
      totals[currency] = (totals[currency] || 0) + position.marketValue;
    }
    return totals;
  }, {});

  return positions.map(position => {
    const currency = position.currency || 'UNKNOWN';
    const total = totalsByCurrency[currency] || 0;
    return {
      symbol: position.symbol,
      currency,
      ratio: position.marketValue != null && total > 0
        ? Number((position.marketValue / total * 100).toFixed(1))
        : 0
    };
  });
}

module.exports = { computeActualRatios };
