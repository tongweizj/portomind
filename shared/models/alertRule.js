// server/models/alertRule.js
// 提醒规则（PRD §4.4.4）。两类规则：
// - 规则引擎（自动）：price_above/price_below/gain_loss_pct/drift_exceed，每日跑批评估；
// - 信号登记（人工）：signal，登记外部投资建议（E大/有知有行），有效期 validUntil 内
//   常显于通知中心，过期自动 active=false 归档（裁决 #6：canonical_schema 建议并入）。
const mongoose = require('mongoose');

const AlertRuleSchema = new mongoose.Schema({
  scope: {
    type: String,
    enum: ['asset', 'portfolio'],
    required: true,
    // asset：绑定 symbol（可带 portfolioId 限定组合，空 = 跨组合关注）；
    // portfolio：绑定 portfolioId（用于 drift_exceed / 组合级 signal）
  },
  portfolioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Portfolio',
    default: null
  },
  symbol: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  ruleType: {
    type: String,
    enum: [
      'price_above', 'price_below', 'gain_loss_pct', 'drift_exceed', 'signal',
      'high_52w', 'low_52w', 'valuation_percentile'
    ],
    required: true
  },
  // 规则参数（Mixed）：
  // price_above/price_below → { threshold: Number }（价格阈值，严格大于/小于触发）
  // gain_loss_pct          → { pct: Number }（正=浮盈超 pct% 触发；负=浮亏超 |pct|% 触发）
  // drift_exceed           → { drift: Number }（组合偏离阈值 %，复用 thresholdChecker 口径）
  // signal                 → 无参数
  // high_52w/low_52w       → { lookbackDays?: Number 默认 365 }（52 周新高/新低，严格突破触发）
  // valuation_percentile   → { indexCode, metric: 'pe'|'pb', threshold: 0-100,
  //                            direction: 'above'|'below' }（估值分位高估/低估，输入来自 AS-11）
  params: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  // signal 必填：buy / sell / hold
  direction: {
    type: String,
    enum: ['buy', 'sell', 'hold'],
    default: null
  },
  // signal 的建议理由（E大/有知有行原文摘录或说明）
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  // signal 可选；普通规则可空 = 长期有效。过期由评估引擎归档（active=false）。
  validUntil: { type: Date, default: null },
  // 触发后静默天数（AL-06）：同规则在 cooldownDays 内不重复产生事件；0 = 仅同日幂等去重
  cooldownDays: { type: Number, default: 7, min: 0, max: 365 },
  active: { type: Boolean, default: true }
}, {
  versionKey: false,
  timestamps: true
});

AlertRuleSchema.index({ active: 1, ruleType: 1 });
AlertRuleSchema.index({ portfolioId: 1, active: 1 });
AlertRuleSchema.index({ symbol: 1, active: 1 });

module.exports = mongoose.model('AlertRule', AlertRuleSchema);
