const mongoose = require('mongoose');

const PriceSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: [true, 'symbol is required'],
    trim: true,
    uppercase: true,
    maxlength: 32
  },
  name: { type: String, trim: true },
  price: {
    type: Number,
    required: [true, 'price is required'],
    min: [0, 'price cannot be negative']
  },
  currency: { type: String, trim: true, uppercase: true },
  market: { type: String, trim: true, uppercase: true },
  // UTC Date；业务日期边界统一由 MARKET_TIMEZONE 解释。
  timestamp: { type: Date, required: true, default: Date.now }
}, { versionKey: false });

PriceSchema.index({ symbol: 1, timestamp: 1 }, { unique: true });
PriceSchema.index({ timestamp: -1, symbol: 1 });

module.exports = mongoose.model('Price', PriceSchema);
