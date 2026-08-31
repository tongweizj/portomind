// server/controllers/alert.controller.js
// 提醒中心 API（PRD §4.4.5）：规则 CRUD + 事件列表/已读/未读数 + 手动跑批。
const mongoose = require('mongoose');
const AlertRule = require('../models/alertRule');
const AlertEvent = require('../models/alertEvent');
// 属性访问（而非解构），便于测试对 evaluateAll 做 stub
const alertEngine = require('../services/alertEngine.service');
const { success, failure, pagination, parsePagination } = require('../utils/apiResponse');

const RULE_TYPES = ['price_above', 'price_below', 'gain_loss_pct', 'drift_exceed', 'signal'];
const EVENT_STATUSES = ['unread', 'read', 'dismissed'];
const EVENT_LEVELS = ['info', 'warning', 'action'];
const SCOPE_TYPES = ['asset', 'portfolio'];
const DIRECTIONS = ['buy', 'sell', 'hold'];

function validId(req, res, id) {
  if (mongoose.Types.ObjectId.isValid(id)) return true;
  failure(req, res, 400, 'Invalid alert id');
  return false;
}

function forward(err, next, fallbackStatus) {
  if (err.name === 'ValidationError' || err.name === 'CastError') err.status = 400;
  else if (!err.status) err.status = fallbackStatus;
  next(err);
}

/** 规则创建/更新前的业务校验（scope/symbol/ruleType/params/direction 关联）。 */
function validateRuleBody(req, res, body) {
  if (!RULE_TYPES.includes(body.ruleType)) {
    failure(req, res, 400, `ruleType must be one of: ${RULE_TYPES.join(', ')}`);
    return false;
  }
  if (body.scope !== undefined && !SCOPE_TYPES.includes(body.scope)) {
    failure(req, res, 400, `scope must be one of: ${SCOPE_TYPES.join(', ')}`);
    return false;
  }
  const scope = body.scope || 'asset';
  if (scope === 'asset' && !body.symbol) {
    failure(req, res, 400, 'scope=asset 时 symbol 必填');
    return false;
  }
  if (scope === 'portfolio' && !body.portfolioId) {
    failure(req, res, 400, 'scope=portfolio 时 portfolioId 必填');
    return false;
  }
  if (body.ruleType === 'signal') {
    if (!DIRECTIONS.includes(body.direction)) {
      failure(req, res, 400, `signal 规则 direction 必填且为: ${DIRECTIONS.join(', ')}`);
      return false;
    }
  } else if (body.direction !== undefined) {
    failure(req, res, 400, '仅 signal 规则可设置 direction');
    return false;
  }
  if (body.ruleType === 'price_above' || body.ruleType === 'price_below') {
    const threshold = Number(body.params && body.params.threshold);
    if (!Number.isFinite(threshold)) {
      failure(req, res, 400, 'price 规则需 params.threshold 数值');
      return false;
    }
  }
  if (body.ruleType === 'gain_loss_pct') {
    const pct = Number(body.params && body.params.pct);
    if (!Number.isFinite(pct)) {
      failure(req, res, 400, 'gain_loss_pct 规则需 params.pct 数值');
      return false;
    }
  }
  if (body.ruleType === 'drift_exceed') {
    const drift = Number(body.params && body.params.drift);
    if (!Number.isFinite(drift)) {
      failure(req, res, 400, 'drift_exceed 规则需 params.drift 数值');
      return false;
    }
  }
  return true;
}

function sanitizeRuleInput(body) {
  const { scope, portfolioId, symbol, name, ruleType, params, direction, reason, validUntil, cooldownDays, active } = body;
  const input = {
    scope,
    portfolioId: portfolioId || null,
    symbol: symbol ? String(symbol).trim().toUpperCase() : '',
    name,
    ruleType,
    params,
    direction: ruleType === 'signal' ? direction : undefined,
    reason,
    validUntil: validUntil || null,
    cooldownDays,
    active
  };
  Object.keys(input).forEach(key => input[key] === undefined && delete input[key]);
  return input;
}

// ─────────────────────── 规则 CRUD ───────────────────────

exports.getRules = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const filter = {};
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    if (req.query.scope) {
      if (!SCOPE_TYPES.includes(req.query.scope)) return failure(req, res, 400, 'scope 无效');
      filter.scope = req.query.scope;
    }
    if (req.query.portfolioId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.portfolioId)) return failure(req, res, 400, 'portfolioId 无效');
      filter.portfolioId = req.query.portfolioId;
    }
    if (req.query.ruleType) {
      if (!RULE_TYPES.includes(req.query.ruleType)) return failure(req, res, 400, 'ruleType 无效');
      filter.ruleType = req.query.ruleType;
    }
    const [total, data] = await Promise.all([
      AlertRule.countDocuments(filter),
      AlertRule.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return success(res, data, { pagination: pagination(page, pageSize, total) });
  } catch (err) {
    next(err);
  }
};

exports.createRule = async (req, res, next) => {
  try {
    if (!validateRuleBody(req, res, req.body)) return;
    const rule = await new AlertRule(sanitizeRuleInput(req.body)).save();
    return success(res, rule, { status: 201 });
  } catch (err) {
    forward(err, next, 400);
  }
};

exports.getRuleById = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    const rule = await AlertRule.findById(req.params.id);
    if (!rule) return failure(req, res, 404, 'Alert rule not found');
    return success(res, rule);
  } catch (err) {
    next(err);
  }
};

exports.updateRule = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    if (!validateRuleBody(req, res, req.body)) return;
    const updated = await AlertRule.findByIdAndUpdate(
      req.params.id,
      sanitizeRuleInput(req.body),
      { new: true, runValidators: true }
    );
    if (!updated) return failure(req, res, 404, 'Alert rule not found');
    return success(res, updated);
  } catch (err) {
    forward(err, next, 400);
  }
};

exports.deleteRule = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    const deleted = await AlertRule.findByIdAndDelete(req.params.id);
    if (!deleted) return failure(req, res, 404, 'Alert rule not found');
    // 规则删除不级联删事件（事件为审计留存）；事件上的 ruleId 保留但悬空
    return success(res, deleted);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────── 事件 ───────────────────────

exports.getEvents = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) {
      if (!EVENT_STATUSES.includes(req.query.status)) return failure(req, res, 400, 'status 无效');
      filter.status = req.query.status;
    }
    if (req.query.level) {
      if (!EVENT_LEVELS.includes(req.query.level)) return failure(req, res, 400, 'level 无效');
      filter.level = req.query.level;
    }
    if (req.query.portfolioId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.portfolioId)) return failure(req, res, 400, 'portfolioId 无效');
      filter.portfolioId = req.query.portfolioId;
    }
    if (req.query.ruleId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.ruleId)) return failure(req, res, 400, 'ruleId 无效');
      filter.ruleId = req.query.ruleId;
    }
    const [total, data] = await Promise.all([
      AlertEvent.countDocuments(filter),
      AlertEvent.find(filter).sort({ triggeredAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return success(res, data, { pagination: pagination(page, pageSize, total) });
  } catch (err) {
    next(err);
  }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await AlertEvent.countDocuments({ status: 'unread' });
    return success(res, { count });
  } catch (err) {
    next(err);
  }
};

exports.markEventRead = async (req, res, next) => {
  if (!validId(req, res, req.params.id)) return;
  try {
    const status = req.body.status || 'read';
    if (!EVENT_STATUSES.includes(status)) return failure(req, res, 400, `status must be one of: ${EVENT_STATUSES.join(', ')}`);
    const updated = await AlertEvent.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!updated) return failure(req, res, 404, 'Alert event not found');
    return success(res, updated);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────── 手动跑批（调试/演示） ───────────────────────

exports.evaluate = async (req, res, next) => {
  try {
    const stats = await alertEngine.evaluateAll();
    return success(res, stats);
  } catch (err) {
    next(err);
  }
};

module.exports.RULE_TYPES = RULE_TYPES;
