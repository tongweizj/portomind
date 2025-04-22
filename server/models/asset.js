const mongoose = require('mongoose');
const AssetSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    name: String,
    market: String,
    currency: String,
    type: String,               // stock, etf, fund, etc.
    tags: [String],
    watchlist: { type: Boolean, default: false },
    active: { type: Boolean, default: true }, 
    createdAt: { type: Date, default: Date.now }
  });

module.exports = mongoose.model('Asset', AssetSchema);