// server/models/fxRate.js
// 汇率模型（PRD §3 家庭层前置）：记录各外币对 CNY 的汇率（1 外币 = rateToCny 人民币）。
// 家庭视图折算专用：组合内记账保持原币种，折算只发生在家庭层汇总时。
// 数据来源：每日自动采集（er-api 公开源）或手动录入（source='manual' 兜底）。
const mongoose = require('mongoose');

const FxRateSchema = new mongoose.Schema({
  currency: {
    type: String,
    enum: ['USD', 'CAD', 'HKD'],
    required: true
  },
  // 1 外币折合人民币
  rateToCny: {
    type: Number,
    required: true,
    min: 0.000001,
    max: 100000
  },
  // 汇率日期（市场日，不精确到时刻；按 (currency, date) 幂等 upsert）
  date: {
    type: Date,
    required: true
  },
  source: {
    type: String,
    enum: ['er-api', 'manual'],
    default: 'er-api'
  },
  note: { type: String, trim: true, maxlength: 200, default: '' }
}, {
  versionKey: false,
  timestamps: true
});

FxRateSchema.index({ currency: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('FxRate', FxRateSchema);
