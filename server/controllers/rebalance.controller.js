// server/controllers/rebalance.controller.js

const { thresholdChecker, suggestionGenerator, costEstimator, recorder } = require('../services/rebalance');
const { aggregatePositions } = require('../services/portfolio');

/**
 * POST /api/portfolios/:pid/rebalance/check
 * 阈值检测
 */
exports.check = async (req, res, next) => {
  try {
    const { pid } = req.params;
    const { needsRebalance, triggeredThresholds } =
      await thresholdChecker.checkThresholds(pid);
    res.json({ needsRebalance, triggeredThresholds });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/portfolios/:pid/rebalance/suggestions
 * 生成再平衡建议
 */
exports.suggestions = async (req, res, next) => {
  try {
    const { pid } = req.params;
    // 从 body 中取费率模型，传给服务层
    const feeModel = req.body.feeModel || {};
    const suggestions = await suggestionGenerator.getSuggestions(pid, feeModel);
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/portfolios/:pid/rebalance/execute
 * 执行建议并记录
 */
exports.execute = async (req, res, next) => {
  try {
    const { pid } = req.params;
    const { suggestions, mode } = req.body;
    const updated = await recorder.reexecute(pid, mode, suggestions);
    res.json({ recordId: updated._id, status: updated.status });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/portfolios/:pid/rebalance/history
 * 查询再平衡记录
 */
exports.history = async (req, res, next) => {
  try {
    const { pid } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 20, 1);
    const { total, data } = await recorder.getHistory(pid, page, pageSize);
    res.json({ total, data });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rebalance/:recordId/revoke
 * 撤销再平衡操作
 */
exports.revoke = async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const rec = await Recorder.revoke(recordId);
    res.json({ recordId: rec._id, status: rec.status });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rebalance/:recordId/reexecute
 * 重做再平衡操作
 */
exports.reexecute = async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const rec = await Recorder.reexecute(recordId);
    res.json({ recordId: rec._id, status: rec.status });
  } catch (err) {
    next(err);
  }
};
