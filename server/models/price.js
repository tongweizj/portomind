const mongoose = require('mongoose');

const PriceSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  name: String,
  price: Number,
  currency: String,
  market: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Price', PriceSchema);
