const { aggregate } = require('./positionTracker');

/** 比例仅在相同原币种内部计算；未引入汇率前不跨币种汇总。 */
async function computeActualRatios(portfolioId) {
  const positions = await aggregate(portfolioId);
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
