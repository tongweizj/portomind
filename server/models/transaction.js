const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  portfolioId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Portfolio'
  },
  assetType: { type: String, enum: ['stock', 'etf', 'crypto', 'cash', 'bond'], required: true },
  symbol: { type: String, required: true }, // 如 AAPL, BTC, VTI
  market: { type: String, enum: ['US', 'CA', 'CN-SH', 'CN-SZ', 'CN-FUND'], required: true },
  currency: { type: String, enum: ['USD', 'CAD', 'CNY'], required: true },
  action: { type: String, enum: ['buy', 'sell'], required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  notes: { type: String }
});

module.exports = mongoose.model('Transaction', TransactionSchema);

