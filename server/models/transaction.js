// server/models/Transaction.js

const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  assetType: { type: String, enum: ['stock', 'etf', 'crypto', 'cash', 'bond'], required: true },
  symbol: { type: String, required: true }, // 如 AAPL, BTC, VTI
  action: { type: String, enum: ['buy', 'sell'], required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  notes: { type: String }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
