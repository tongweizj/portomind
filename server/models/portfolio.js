// models/Portfolio.js
const mongoose = require('mongoose');

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
    enum: ['RMB', 'CAD', 'USD'],
    default: '加币'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Portfolio', PortfolioSchema);
