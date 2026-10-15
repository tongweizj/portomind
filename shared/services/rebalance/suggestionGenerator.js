const Portfolio = require('../../models/portfolio');
const { aggregatePositions } = require('../portfolio');
const marketData = require('../marketData.service');
const thresholdChecker = require('./thresholdChecker');
const recorder = require('./recorder');
const { estimateTradeCost, normalizeFeeModel } = require('./costEstimator');
const {
  getAssetClassMap,
  hasClassTargets,
  deriveSymbolTargets,
  UNCLASSIFIED
} = require('../portfolio/assetClassAggregator');

const EPSILON = 1e-8;

function businessError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function buildSuggestions({ targets = [], positions = [], latestPrices = {}, feeModel = {}, cashBudget = 0 }) {
  const fees = normalizeFeeModel(feeModel);
  const externalCash = Number(cashBudget);
  if (!Number.isFinite(externalCash) || externalCash < 0) {
    throw businessError(400, 'INVALID_CASH_BUDGET', 'cashBudget must be a non-negative number');
  }

  const positionBySymbol = new Map(positions.map(position => [position.symbol, position]));
  const targetBySymbol = new Map(targets.map(target => [
    String(target.symbol).toUpperCase(), Number(target.targetRatio)
  ]));
  const symbols = [...new Set([...positionBySymbol.keys(), ...targetBySymbol.keys()])].sort();
  const warnings = [];

  for (const position of positions) {
    if (position.marketValue == null || position.latestPrice == null) {
      throw businessError(400, 'MISSING_MARKET_PRICE', `Latest price is required for ${position.symbol}`);
    }
  }

  const currentTotalValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const investableValue = currentTotalValue + externalCash;
  if (investableValue <= EPSILON) {
    return {
      suggestions: [],
      warnings: ['TOTAL_VALUE_ZERO'],
      funding: { cashBudget: externalCash, saleProceeds: 0, availableForBuys: externalCash }
    };
  }

  const rows = [];
  for (const symbol of symbols) {
    const position = positionBySymbol.get(symbol);
    const targetRatio = targetBySymbol.get(symbol) || 0;
    const currentValue = position?.marketValue || 0;
    const priceValue = position?.latestPrice ?? latestPrices[symbol];
    const price = priceValue == null ? null : Number(priceValue);
    if (!Number.isFinite(price) || price <= 0) {
      if (targetRatio > 0 || currentValue > 0) warnings.push(`MISSING_PRICE:${symbol}`);
      continue;
    }
    rows.push({
      symbol,
      price,
      currentValue,
      currentQuantity: position?.quantity || 0,
      targetRatio,
      desiredValue: investableValue * targetRatio / 100
    });
  }

  const suggestions = [];
  let saleProceeds = 0;
  const projectedValues = new Map(rows.map(row => [row.symbol, row.currentValue]));

  // 先卖出，卖出净所得才可成为买入资金。
  for (const row of rows.filter(item => item.currentValue - item.desiredValue > EPSILON)) {
    const desiredGross = row.currentValue - row.desiredValue;
    const quantity = Math.min(row.currentQuantity, desiredGross / row.price);
    if (quantity <= EPSILON) continue;
    const grossValue = quantity * row.price;
    const costs = estimateTradeCost('sell', grossValue, fees);
    const netProceeds = Math.max(grossValue - costs.estimatedCost, 0);
    saleProceeds += netProceeds;
    projectedValues.set(row.symbol, row.currentValue - grossValue);
    suggestions.push({
      symbol: row.symbol,
      action: 'sell',
      quantity,
      price: row.price,
      grossValue,
      ...costs,
      cashImpact: netProceeds,
      targetRatio: row.targetRatio
    });
  }

  const desiredBuys = rows
    .map(row => ({ ...row, desiredGross: Math.max(row.desiredValue - row.currentValue, 0) }))
    .filter(row => row.desiredGross > EPSILON);
  const totalDesiredBuy = desiredBuys.reduce((sum, row) => sum + row.desiredGross, 0);
  const availableForBuys = externalCash + saleProceeds;
  let buySpend = 0;

  for (const row of desiredBuys) {
    const allocation = totalDesiredBuy > 0
      ? availableForBuys * row.desiredGross / totalDesiredBuy
      : 0;
    const affordableGross = Math.max((allocation - fees.fixedFee) / (1 + fees.ratioFee), 0);
    const grossValue = Math.min(row.desiredGross, affordableGross);
    const quantity = grossValue / row.price;
    if (quantity <= EPSILON) continue;
    const costs = estimateTradeCost('buy', grossValue, fees);
    const cashRequired = grossValue + costs.estimatedCost;
    buySpend += cashRequired;
    projectedValues.set(row.symbol, row.currentValue + grossValue);
    suggestions.push({
      symbol: row.symbol,
      action: 'buy',
      quantity,
      price: row.price,
      grossValue,
      ...costs,
      cashImpact: -cashRequired,
      targetRatio: row.targetRatio
    });
  }

  if (totalDesiredBuy > availableForBuys + EPSILON || buySpend + EPSILON < totalDesiredBuy) {
    warnings.push('BUYS_LIMITED_BY_AVAILABLE_CASH');
  }

  const postTotalValue = [...projectedValues.values()].reduce((sum, value) => sum + value, 0);
  for (const suggestion of suggestions) {
    suggestion.postRebalanceRatio = postTotalValue > EPSILON
      ? projectedValues.get(suggestion.symbol) / postTotalValue * 100
      : 0;
  }

  suggestions.sort((left, right) => {
    if (left.action !== right.action) return left.action === 'sell' ? -1 : 1;
    return left.symbol.localeCompare(right.symbol);
  });
  return {
    suggestions,
    warnings: [...new Set(warnings)],
    funding: {
      cashBudget: externalCash,
      saleProceeds,
      availableForBuys,
      buySpend,
      remainingCash: Math.max(availableForBuys - buySpend, 0)
    }
  };
}

async function getSuggestions(portfolioId, { feeModel = {}, cashBudget = 0, mode = 'MANUAL' } = {}) {
  const [portfolio, positions, thresholdResult] = await Promise.all([
    Portfolio.findById(portfolioId).lean(),
    aggregatePositions(portfolioId),
    thresholdChecker.checkThresholds(portfolioId)
  ]);
  if (!portfolio) throw businessError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found');

  // CM-08 大类目标模式：大类目标按类内市值占比摊分到 symbol 级，复用 symbol 级建议流程；
  // 建议标注 assetClass 便于前端按大类查看。
  const classMode = hasClassTargets(portfolio.targets);
  let targets = portfolio.targets;
  let symbolClassMap = null;
  const warnings = [];

  if (classMode) {
    const assetClassBySymbol = await getAssetClassMap(positions.map(position => position.symbol));
    const derived = deriveSymbolTargets({ targets: portfolio.targets, positions, assetClassBySymbol });
    targets = derived.targets;
    symbolClassMap = derived.symbolClassMap;

    // 大类缺口可观察性：目标大类但当前无持仓（无法摊分）；存在未分类持仓
    const classTargets = new Set(portfolio.targets.map(target => target.symbol));
    const heldClasses = new Set(Object.values(symbolClassMap));
    for (const assetClass of classTargets) {
      if (!heldClasses.has(assetClass)) warnings.push(`CLASS_NO_POSITIONS:${assetClass}`);
    }
    if (heldClasses.has(UNCLASSIFIED)) warnings.push('UNCLASSIFIED_POSITIONS');
  }

  const targetSymbols = targets.map(target => String(target.symbol).toUpperCase());
  const latestPrices = targetSymbols.length ? await marketData.getLatestPrices(targetSymbols) : {};
  const result = buildSuggestions({
    targets,
    positions,
    latestPrices,
    feeModel,
    cashBudget
  });

  if (classMode && symbolClassMap) {
    result.suggestions = result.suggestions.map(suggestion => ({
      ...suggestion,
      assetClass: symbolClassMap[suggestion.symbol] || UNCLASSIFIED
    }));
  }
  const mergedWarnings = [...new Set([...warnings, ...result.warnings])];

  const record = await recorder.createRecord(portfolioId, mode, result.suggestions, {
    feeModel: normalizeFeeModel(feeModel),
    cashBudget: Number(cashBudget),
    triggeredThresholds: thresholdResult.triggeredThresholds,
    thresholdDetails: thresholdResult.details,
    warnings: mergedWarnings,
    funding: result.funding,
    classMode
  });
  return {
    recordId: record._id,
    status: record.status,
    suggestions: result.suggestions,
    triggeredThresholds: thresholdResult.triggeredThresholds,
    thresholdDetails: thresholdResult.details,
    warnings: mergedWarnings,
    funding: result.funding,
    classMode
  };
}

module.exports = { getSuggestions, buildSuggestions, generateSuggestions: buildSuggestions };
