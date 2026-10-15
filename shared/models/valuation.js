// server/models/valuation.js
// 估值分位模型（AS-11）：A股宽基指数（沪深300/上证50/中证500 等）PE/PB 历史分位。
// 用途：提醒规则 valuation_percentile 的评估输入（AL-10）。
// 数据来源：手动录入为主（衔接 index-valuation-selfcalc 的自算结果，
// 或用户从 E大/有知有行/韭圈儿等渠道获得的分位值），source 标记来源。
const mongoose = require('mongoose');

const INDEX_METRICS = ['pe', 'pb'];

const ValuationSchema = new mongoose.Schema({
  // 指数代码（中证指数代码，如 000300=沪深300、000016=上证50、000905=中证500）
  indexCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 12
  },
  indexName: { type: String, trim: true, maxlength: 60, default: '' },
  metric: { type: String, enum: INDEX_METRICS, required: true },
  // 当前估值（PE/PB 值）
  value: { type: Number, required: true, min: 0 },
  // 历史分位（0-100）：当前估值在历史区间的位置
  percentile: { type: Number, required: true, min: 0, max: 100 },
  // 估值日期（按 (indexCode, metric, date) 幂等 upsert）
  date: { type: Date, required: true },
  source: {
    type: String,
    enum: ['manual', 'external'],
    default: 'manual'
  },
  note: { type: String, trim: true, maxlength: 200, default: '' }
}, {
  versionKey: false,
  timestamps: true
});

ValuationSchema.index({ indexCode: 1, metric: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('Valuation', ValuationSchema);
