// server/controllers/valuation.controller.js
// 估值分位 API（AS-11）：列表 / 手动录入（衔接 index-valuation-selfcalc 产出）。
const valuationService = require('../services/valuation.service');
const { success, failure } = require('../utils/apiResponse');

exports.getValuations = async (req, res, next) => {
  try {
    return success(res, await valuationService.getLatestValuations());
  } catch (err) {
    next(err);
  }
};

exports.upsertValuation = async (req, res, next) => {
  try {
    const indexCode = String(req.params.indexCode || '').trim().toUpperCase();
    const metric = String(req.params.metric || '').toLowerCase();
    if (!valuationService.INDEX_METRICS.includes(metric)) {
      return failure(req, res, 400, `metric must be one of: ${valuationService.INDEX_METRICS.join(', ')}`);
    }
    const percentile = Number(req.body.percentile);
    const value = Number(req.body.value);
    if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) {
      return failure(req, res, 400, 'percentile must be between 0 and 100');
    }
    if (!Number.isFinite(value) || value < 0) {
      return failure(req, res, 400, 'value must be a non-negative number');
    }
    const doc = await valuationService.upsertValuation({
      indexCode,
      metric,
      indexName: req.body.indexName,
      value,
      percentile,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      source: 'manual',
      note: req.body.note
    });
    return success(res, doc, { status: 201 });
  } catch (err) {
    next(err);
  }
};
