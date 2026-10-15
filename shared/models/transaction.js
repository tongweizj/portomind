const mongoose = require('mongoose');
const {
  ASSET_TYPES,
  ASSET_MARKETS,
  ASSET_CURRENCIES
} = require('../constants/asset.constants');

const TransactionSchema = new mongoose.Schema({
  portfolioId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'portfolioId is required'],
    ref: 'Portfolio',
    index: true
  },
  assetType: { type: String, enum: ASSET_TYPES, required: true },
  symbol: { type: String, required: true, trim: true, uppercase: true },
  market: { type: String, enum: ASSET_MARKETS, required: true },
  currency: { type: String, enum: ASSET_CURRENCIES, required: true },
  // buy 增加持仓；sell 减少持仓，且不允许超过交易日期当时的可用数量。
  // buy 增加持仓；sell 减少持仓，且不允许超过交易日期当时的可用数量。
  // div_cash 现金分红（不进持仓，记 quantity×price 现金）；div_reinvest 分红再投（转增持仓）。
  action: { type: String, enum: ['buy', 'sell', 'div_cash', 'div_reinvest'], required: true },
  quantity: { type: Number, required: true, min: [Number.EPSILON, 'quantity must be greater than zero'] },
  price: { type: Number, required: true, min: [Number.EPSILON, 'price must be greater than zero'] },
  // fee（TR-06）：买入成本含费（remainingCost += qty×price + fee）；卖出净得扣费
  // （realizedPnl 扣 fee）；div_reinvest 成本含费。与再平衡建议费用模型口径统一（RB-10）。
  fee: { type: Number, default: 0, min: 0 },
  date: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true, versionKey: false });

TransactionSchema.index({ portfolioId: 1, date: -1, _id: -1 });
TransactionSchema.index({ portfolioId: 1, symbol: 1, date: 1, _id: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
