// server/controllers/family.controller.js
// 家庭层 API（PRD §3）：家庭汇总 + 汇率管理。
const FxRate = require('../models/fxRate');
const fxRateService = require('../services/fxRate.service');
const familySummaryService = require('../services/familySummary.service');
const { success, failure } = require('../utils/apiResponse');

// ─────────────────────── 家庭汇总（FAM-01/02/04） ───────────────────────

exports.getFamilySummary = async (req, res, next) => {
  try {
    return success(res, await familySummaryService.computeFamilySummary());
  } catch (err) {
    next(err);
  }
};

// ─────────────────────── 汇率（家庭层前置） ───────────────────────

exports.getFxRates = async (req, res, next) => {
  try {
    const docs = await fxRateService.getLatestRateDocs();
    return success(res, docs);
  } catch (err) {
    next(err);
  }
};

exports.upsertFxRate = async (req, res, next) => {
  try {
    const currency = String(req.params.currency || '').toUpperCase();
    if (!fxRateService.SUPPORTED_CURRENCIES.includes(currency)) {
      return failure(req, res, 400, `currency must be one of: ${fxRateService.SUPPORTED_CURRENCIES.join(', ')}`);
    }
    const rateToCny = Number(req.body.rateToCny);
    if (!Number.isFinite(rateToCny) || rateToCny <= 0) {
      return failure(req, res, 400, 'rateToCny must be a positive number');
    }
    const doc = await fxRateService.upsertRate({
      currency,
      rateToCny,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      source: 'manual',
      note: req.body.note || 'manual entry'
    });
    return success(res, doc, { status: 201 });
  } catch (err) {
    next(err);
  }
};

exports.syncFxRates = async (req, res, next) => {
  try {
    const records = await fxRateService.syncLatestRates();
    return success(res, { count: records.length, records });
  } catch (err) {
    // 采集失败返回 502，提示可手动录入
    return failure(req, res, 502, `汇率采集失败：${err.message}；可在汇率管理手动录入`);
  }
};

module.exports.FxRate = FxRate;
