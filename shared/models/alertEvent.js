// server/models/alertEvent.js
// 提醒事件（PRD §4.4.4）：触发记录，不可删除（审计），可标记已读/忽略。
// 冗余 portfolioId/symbol 便于筛选与前端跳转；ruleId 可空（再平衡通知无对应规则）。
const mongoose = require('mongoose');

const AlertEventSchema = new mongoose.Schema({
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AlertRule',
    default: null
  },
  portfolioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Portfolio',
    default: null
  },
  symbol: { type: String, trim: true, uppercase: true, default: '' },
  level: {
    type: String,
    enum: ['info', 'warning', 'action'],
    default: 'info'
  },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  content: { type: String, trim: true, maxlength: 1000, default: '' },
  // 触发时快照（价格/成本/漂移等），便于回看当时条件
  snapshot: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  triggeredAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['unread', 'read', 'dismissed'],
    default: 'unread'
  }
}, {
  versionKey: false,
  timestamps: true
});

AlertEventSchema.index({ status: 1, triggeredAt: -1 });
AlertEventSchema.index({ ruleId: 1, triggeredAt: -1 });
AlertEventSchema.index({ portfolioId: 1, status: 1 });

module.exports = mongoose.model('AlertEvent', AlertEventSchema);
