// models/Portfolio.js
const mongoose = require('mongoose');


// —— 新增：再平衡阈值子文档 —— //
const RebalanceSettingsSchema = new mongoose.Schema({
  absoluteDeviation: {   // 绝对偏离阈值（%）
    type: Number,
    default: 5
  },
  relativeDeviation: {   // 相对偏离阈值（%）
    type: Number,
    default: 10
  },
  timeInterval: {        // 时间间隔阈值（天）
    type: Number,
    default: 60
  },
  rebalanceSchedule: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily',   // 默认每天检查一次
    required: true
  },
}, { _id: false });

const PortfolioSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,

  // ✅ 新增：类型（活钱、稳健、长期）
  type: {
    type: String,
    enum: ['活钱', '稳健', '长期'],
    default: '稳健'
  },

  // ✅ 新增：币种（人民币，加币，美金）
  currency: {
    type: String,
    enum: ['CNY', 'CAD', 'USD'],
    default: 'CAD'
  },

  // ✅ 新增：账户类型（账户载体）。与 type（风险定位：活钱/稳健/长期）正交：
  // tiantian 天天基金 / xueqiu 雪球 / tfsa / rrsp / resp / taxable 应税 / other。
  // 存量组合未写入该字段时，业务侧按 'other' 处理（前端展示时兜底）。
  accountType: {
    type: String,
    enum: ['tiantian', 'xueqiu', 'tfsa', 'rrsp', 'resp', 'taxable', 'other'],
    default: 'other'
  },
  // ✅ 新增：归档标记（CM-20）。归档 ≠ 删除：数据完整保留，
  // 默认列表与再平衡 AUTO 调度排除已归档组合；业务侧未写入时按 false 处理。
  archived: {
    type: Boolean,
    default: false
  },
  targets: [{
    // level='asset'：symbol 为资产代码（业务层统一大写）；
    // level='asset_class'（CM-08）：symbol 为大类代码（equity/bond/gold/cash，统一小写，
    // 见 constants/asset.constants ASSET_CLASSES）。故此处不做 uppercase，由
    // validateTargets.normalizeTargets 按 level 规范化大小写。
    // 混合模式禁止：存在任一 asset_class 目标则全部必须为 asset_class（二选一）。
    symbol: { type: String, required: true, trim: true },
    targetRatio: { type: Number, required: true, min: 0, max: 100 },
    level: { type: String, enum: ['asset', 'asset_class'], default: 'asset' }
  }],
  rebalanceSettings: {
    type: RebalanceSettingsSchema,
    default: () => ({})
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Portfolio', PortfolioSchema);
