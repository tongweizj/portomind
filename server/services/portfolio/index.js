const settings      = require('./rebalanceSettings');
const tracker       = require('./positionTracker');
const stats         = require('./stats');
const actualRatios  = require('./actualRatios');
const lister         = require('./listPositions');
const deletion       = require('./deletePortfolio');
const summary        = require('./summary');

module.exports = {
  getRebalanceSettings: settings.getRebalanceSettings,
  updateRebalanceSettings: settings.updateRebalanceSettings,
  aggregatePositions: tracker.aggregate,
  calculatePnL: tracker.calculatePnL,
  getHistory: tracker.getHistory,
  computeStats: stats.computeStats,
  computeActualRatios: actualRatios.computeActualRatios,
  listPositions: lister.listPositions,
  deletePortfolioCascade: deletion.deletePortfolioCascade,
  computeSummary: summary.computeSummary,
  buildPortfolioSummary: summary.buildPortfolioSummary
};
