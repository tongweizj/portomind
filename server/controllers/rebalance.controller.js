// server/controllers/rebalance.controller.js

const ThresholdChecker     = require('../services/rebalanceEngine/thresholdChecker');
const SuggestionGenerator  = require('../services/rebalanceEngine/suggestionGenerator');
const CostEstimator        = require('../services/rebalanceEngine/costEstimator');
const Recorder             = require('../services/rebalanceEngine/recorder');
const positionTracker      = require('../services/portfolioService').positionTracker;

/**
 * POST /api/portfolios/:pid/rebalance/check
 * 阈值检测
 */
exports.check = async (req, res, next) => {
  try {
    const { pid } = req.params;
    const { needsRebalance, triggeredThresholds } =
      await ThresholdChecker.checkThresholds(pid);
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
    // 1. 聚合持仓
    const positions = await positionTracker.aggregate(pid);
    // 2. 阈值检测（可选：决定是否需要建议）
    const { triggeredThresholds } = await ThresholdChecker.checkThresholds(pid);
    // 3. 生成建议
    let suggestions = await SuggestionGenerator.generateSuggestions(pid, positions, triggeredThresholds);
    // 4. 预估成本
    const feeModel = req.body.feeModel || {};
    suggestions = CostEstimator.estimateCost(suggestions, feeModel);
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
    const suggestions = req.body.suggestions;
    // 1. 创建记录，模式取自请求
    const mode = req.body.mode === 'AUTO' ? 'AUTO' : 'MANUAL';
    const record = await Recorder.createRecord(pid, mode, suggestions);
    // 2. TODO: 实际交易逻辑写入 TransactionFlow
    // 3. 更新状态为 EXECUTED
    const updated = await Recorder.updateStatus(record._id, 'EXECUTED');
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
    const page     = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 20, 1);
    const { total, data } = await Recorder.getHistory(pid, page, pageSize);
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
