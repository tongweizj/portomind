const mongoose = require('mongoose');
const { ASSET_TYPES, ASSET_MARKETS, ASSET_CURRENCIES } = require('../constants/asset.constants');

// 证券划转的暂存一端（TASK-099 / Spec #93 AC-07，Human 决定：先到的一端在服务端暂存）。
// 先导入的报表只有转出或转入一端时，该端写入本集合（status=staged），不进任何账本；
// 另一端在后续导入中到达时自动配对，两端在同一次确认中写入各自组合的账本（共同入账）。
//
// 状态：
// - pending：随导入批次写入中（翻转前对配对不可见；失败时删除）
// - staged：待核对，等待另一端
// - consuming：已被某次确认占用（consumedBatchId），条件更新保证同一端只被配对一次
// - committed：已与另一端共同入账（transactionId 指向写入的账本流水）
// - discarded：用户放弃暂存（之后需重新提供该端）
const TransferLegSchema = new mongoose.Schema({
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true },
  sourceAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceAccount' },
  direction: { type: String, enum: ['out', 'in'], required: true },
  symbol: { type: String, required: true, trim: true, uppercase: true },
  // 经代码映射（symbolMap，#102）前的报表代码：后到一端据此判断是否同一证券
  mappedFrom: { type: String, trim: true, uppercase: true },
  assetType: { type: String, enum: ASSET_TYPES, required: true },
  market: { type: String, enum: ASSET_MARKETS, required: true },
  // 资产原币种（承接成本以转入资产币种计）
  currency: { type: String, enum: ASSET_CURRENCIES, required: true },
  quantity: { type: Number, required: true, min: Number.EPSILON },
  date: { type: Date, required: true },
  dateKind: { type: String, enum: ['datetime', 'date'] },
  timeZone: { type: String, trim: true },
  timeZoneSource: { type: String, enum: ['report', 'user'] },
  settlementDate: Date,
  settlementStatus: { type: String, enum: ['known', 'unknown'] },
  pairGroup: { type: String, trim: true },
  // 报表给出的转入成本与换算依据（转入端）
  transferCost: Number,
  transferCostCurrency: { type: String, enum: ASSET_CURRENCIES },
  transferFxRate: Number,
  sequence: Number,
  notes: { type: String, trim: true, maxlength: 500 },
  source: {
    type: new mongoose.Schema({
      format: String,
      fileName: { type: String, maxlength: 255 },
      rowNumber: Number,
      rowNumberKind: { type: String, enum: ['original', 'file'] },
      externalId: { type: String, default: null },
      rawHash: String
    }, { _id: false }),
    default: undefined
  },
  status: {
    type: String,
    enum: ['pending', 'staged', 'consuming', 'committed', 'discarded'],
    default: 'pending'
  },
  stagedBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportBatch' },
  consumedBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportBatch' },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }
}, { timestamps: true, versionKey: false });

TransferLegSchema.index({ status: 1, direction: 1, date: 1 });
TransferLegSchema.index({ stagedBatchId: 1 }, { partialFilterExpression: { stagedBatchId: { $exists: true } } });
TransferLegSchema.index({ consumedBatchId: 1 }, { partialFilterExpression: { consumedBatchId: { $exists: true } } });

module.exports = mongoose.model('TransferLeg', TransferLegSchema);
