const mongoose = require('mongoose');
const {
  ASSET_TYPES,
  ASSET_MARKETS,
  ASSET_CURRENCIES
} = require('../constants/asset.constants');

const AssetSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: [true, 'symbol is required'],
    unique: true,
    trim: true,
    uppercase: true,
    minlength: [1, 'symbol cannot be empty'],
    maxlength: [32, 'symbol cannot exceed 32 characters'],
    match: [/^[A-Z0-9][A-Z0-9._-]*$/, 'symbol contains unsupported characters']
  },
  name: {
    type: String,
    required: [true, 'name is required'],
    trim: true,
    maxlength: [120, 'name cannot exceed 120 characters']
  },
  market: { type: String, required: true, enum: ASSET_MARKETS },
  currency: { type: String, required: true, enum: ASSET_CURRENCIES },
  type: { type: String, required: true, enum: ASSET_TYPES },
  tags: {
    type: [{ type: String, trim: true, maxlength: 40 }],
    default: []
  },
  // launchDate: 上市日期。cron-worker 的完整性检查据此推断理论上应有的交易日数；
  // 未填写该字段的资产会被完整性检查跳过（SKIPPED_NO_LAUNCH_DATE）。
  launchDate: { type: Date },
  // active: 是否允许用于交易选择、行情同步等业务流程。
  active: { type: Boolean, default: true },
  // watchlist: 是否被用户关注，仅用于展示偏好，不代表资产可用于业务流程。
  watchlist: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, {
  versionKey: false
});

module.exports = mongoose.model('Asset', AssetSchema);
