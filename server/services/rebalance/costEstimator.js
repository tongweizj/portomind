// server/services/rebalanceEngine/costEstimator.js

/**
 * 交易成本预估
 * @param {Array} suggestions
 * @param {Object} feeModel { fixedFee, ratioFee, taxRate }
 * @returns {Array} suggestionsWithCost
 */
function estimateCost(suggestions, feeModel) {
  
    return suggestions.map(s => {
      const tradeValue = s.quantity * (s.price||0);
      const cost = (feeModel.fixedFee||0) + tradeValue * (feeModel.ratioFee||0);
      const tax  = tradeValue * (feeModel.taxRate||0);
      return { ...s, estimatedCost: cost, estimatedTax: tax };
    });
  }
  
  module.exports = { estimateCost };
  
  