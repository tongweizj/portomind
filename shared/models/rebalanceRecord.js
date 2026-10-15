// server/models/rebalanceRecord.js

const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

/**
 * RebalanceRecord Schema
 * 记录每次再平衡操作的建议与状态，支持撤销/重做
 */
const RebalanceRecordSchema = new Schema({
  // 关联的组合ID
  portfolioId: {
    type: Types.ObjectId,
    ref: 'Portfolio',
    required: true
  },

  // 操作时间戳
  timestamp: {
    type: Date,
    default: Date.now
  },

  // 模式：自动或手动触发
  mode: {
    type: String,
    enum: ['AUTO', 'MANUAL'],
    required: true
  },

  // 建议数组，元素格式由 SuggestionGenerator 输出
  suggestions: {
    type: [Schema.Types.Mixed],
    required: true
  },

  // 当前记录状态
  status: {
    type: String,
    enum: ['PENDING', 'EXECUTED', 'REVOKED'],
    default: 'PENDING'
  },
  triggeredThresholds: { type: [String], default: [] },
  thresholdDetails: { type: [Schema.Types.Mixed], default: [] },
  warnings: { type: [String], default: [] },
  feeModel: { type: Schema.Types.Mixed, default: () => ({}) },
  cashBudget: { type: Number, default: 0, min: 0 },
  funding: { type: Schema.Types.Mixed, default: () => ({}) },
  // CM-08：大类目标模式标记（建议由大类目标摊分生成）
  classMode: { type: Boolean, default: false },
  executedTransactionIds: [{ type: Types.ObjectId, ref: 'Transaction' }],
  reversalTransactionIds: [{ type: Types.ObjectId, ref: 'Transaction' }],
  sourceRecordId: { type: Types.ObjectId, ref: 'RebalanceRecord', default: null },
  executedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

module.exports = model('RebalanceRecord', RebalanceRecordSchema);
