const Portfolio = require('../../models/portfolio');
const RebalanceRecord = require('../../models/rebalanceRecord');
const { aggregatePositions } = require('../portfolio');
const {
  getAssetClassMap,
  buildClassPositions,
  hasClassTargets
} = require('../portfolio/assetClassAggregator');

function businessError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function evaluateThresholds({ targets = [], positions = [], settings = {}, lastExecutedAt = null, now = new Date() }) {
  const positionBySymbol = new Map(positions.map(position => [position.symbol, position]));
  const targetBySymbol = new Map(targets.map(target => [target.symbol, target]));
  const symbols = [...new Set([...positionBySymbol.keys(), ...targetBySymbol.keys()])].sort();
  const totalValue = positions.reduce(
    (sum, position) => sum + (Number.isFinite(position.marketValue) ? position.marketValue : 0),
    0
  );
  const triggered = new Set();
  const reasons = [];

  const details = symbols.map(symbol => {
    const currentValue = positionBySymbol.get(symbol)?.marketValue || 0;
    const targetRatio = Number(targetBySymbol.get(symbol)?.targetRatio || 0);
    const currentRatio = totalValue > 0 ? currentValue / totalValue * 100 : 0;
    const absoluteDeviation = totalValue > 0 ? Math.abs(currentRatio - targetRatio) : null;
    const relativeDeviation = totalValue > 0 && targetRatio > 0
      ? absoluteDeviation / targetRatio * 100
      : null;
    const symbolTriggers = [];
    if (absoluteDeviation != null && settings.absoluteDeviation != null &&
        absoluteDeviation > Number(settings.absoluteDeviation)) {
      triggered.add('absoluteDeviation');
      symbolTriggers.push('absoluteDeviation');
    }
    if (relativeDeviation != null && settings.relativeDeviation != null &&
        relativeDeviation > Number(settings.relativeDeviation)) {
      triggered.add('relativeDeviation');
      symbolTriggers.push('relativeDeviation');
    }
    return {
      symbol,
      targetRatio,
      currentRatio,
      absoluteDeviation,
      relativeDeviation,
      triggeredThresholds: symbolTriggers
    };
  });

  if (totalValue <= 0) reasons.push('TOTAL_VALUE_ZERO');

  if (settings.timeInterval != null) {
    const elapsedDays = lastExecutedAt
      ? (new Date(now) - new Date(lastExecutedAt)) / 86400000
      : null;
    if (lastExecutedAt == null || elapsedDays >= Number(settings.timeInterval)) {
      triggered.add('timeInterval');
      reasons.push(lastExecutedAt == null ? 'NEVER_EXECUTED' : 'TIME_INTERVAL_EXCEEDED');
    }
  }

  return {
    needsRebalance: triggered.size > 0,
    triggeredThresholds: [...triggered],
    totalValue,
    details,
    reasons
  };
}

async function checkThresholds(portfolioId) {
  const [portfolio, positions, lastRecord] = await Promise.all([
    Portfolio.findById(portfolioId).lean(),
    aggregatePositions(portfolioId),
    RebalanceRecord.findOne({ portfolioId, status: 'EXECUTED' }).sort({ executedAt: -1, timestamp: -1 }).lean()
  ]);
  if (!portfolio) throw businessError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found');

  // CM-08 大类目标模式：把持仓按大类聚合为伪持仓后复用 evaluateThresholds
  const classMode = hasClassTargets(portfolio.targets);
  const targets = portfolio.targets;
  let classPositions = positions;
  if (classMode) {
    const symbols = positions.map(position => position.symbol);
    const assetClassBySymbol = await getAssetClassMap(symbols);
    classPositions = buildClassPositions(positions, assetClassBySymbol);
  }

  return evaluateThresholds({
    targets,
    positions: classPositions,
    settings: portfolio.rebalanceSettings,
    lastExecutedAt: lastRecord?.executedAt || lastRecord?.timestamp
  });
}

module.exports = { checkThresholds, evaluateThresholds };
