function normalizeFeeModel(feeModel = {}) {
  const normalized = {
    fixedFee: Number(feeModel.fixedFee || 0),
    ratioFee: Number(feeModel.ratioFee || 0),
    taxRate: Number(feeModel.taxRate || 0)
  };
  for (const [field, value] of Object.entries(normalized)) {
    if (!Number.isFinite(value) || value < 0) {
      const error = new Error(`${field} must be a non-negative number`);
      error.status = 400;
      error.code = 'INVALID_FEE_MODEL';
      throw error;
    }
  }
  for (const field of ['ratioFee', 'taxRate']) {
    if (normalized[field] > 1) {
      const error = new Error(`${field} must be between 0 and 1`);
      error.status = 400;
      error.code = 'INVALID_FEE_MODEL';
      throw error;
    }
  }
  return normalized;
}

function estimateTradeCost(action, grossValue, feeModel = {}) {
  const model = normalizeFeeModel(feeModel);
  const estimatedFee = grossValue > 0 ? model.fixedFee + grossValue * model.ratioFee : 0;
  // 第一版采用卖出成交额税率；买入不计交易税。
  const estimatedTax = action === 'sell' ? grossValue * model.taxRate : 0;
  return {
    estimatedFee,
    estimatedTax,
    estimatedCost: estimatedFee + estimatedTax
  };
}

function estimateCost(suggestions, feeModel = {}) {
  return suggestions.map(suggestion => {
    const grossValue = Number(suggestion.quantity) * Number(suggestion.price || 0);
    return {
      ...suggestion,
      grossValue,
      ...estimateTradeCost(String(suggestion.action).toLowerCase(), grossValue, feeModel)
    };
  });
}

module.exports = { estimateCost, estimateTradeCost, normalizeFeeModel };
