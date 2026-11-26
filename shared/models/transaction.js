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
  // div_cash 现金分红（不进持仓，记 quantity×price 现金）；div_reinvest 分红再投（转增持仓）。
  // TASK-099：transfer_out / transfer_in 为证券划转两端（跨账户 / 跨组合），只移动份额与成本，不产生买卖盈亏。
  action: { type: String, enum: ['buy', 'sell', 'div_cash', 'div_reinvest', 'transfer_out', 'transfer_in'], required: true },
  quantity: { type: Number, required: true, min: [Number.EPSILON, 'quantity must be greater than zero'] },
  price: { type: Number, required: true, min: [Number.EPSILON, 'price must be greater than zero'] },
  // fee（TR-06）：买入成本含费（remainingCost += qty×price + fee）；卖出净得扣费
  // （realizedPnl 扣 fee）；div_reinvest 成本含费。与再平衡建议费用模型口径统一（RB-10）。
  fee: { type: Number, default: 0, min: 0 },
  date: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true, maxlength: 500 },

  // ── TASK-094：导入来源追溯（全部可选；手动录入与旧数据不受影响）──
  sourceAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceAccount', default: undefined },
  source: {
    type: new mongoose.Schema({
      kind: { type: String, enum: ['manual', 'import'], default: 'import' },
      format: { type: String, trim: true },
      fileName: { type: String, trim: true, maxlength: 255 },
      // 原报表行号；缺失时为上传文件行号（rowNumberKind 区分）
      rowNumber: Number,
      rowNumberKind: { type: String, enum: ['original', 'file'] },
      // 券商原成交编号；无编号留空（null），从不合成
      externalId: { type: String, trim: true, default: null },
      importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportBatch' },
      // 规范化原行内容哈希：同来源同内容重复导入判定
      rawHash: String
    }, { _id: false }),
    default: undefined
  },
  // 日期精度：datetime 保留明确时刻（含午夜）；date 仅日期（存当日 UTC 零点，同手动录入）
  dateKind: { type: String, enum: ['datetime', 'date'], default: undefined },
  timeZone: { type: String, trim: true, default: undefined },
  // TASK-096：时区来源 report（报表自带）/ user（报表无时区，用户确认北京或多伦多）
  timeZoneSource: { type: String, enum: ['report', 'user'], default: undefined },
  // 结算日独立于成交日；settlementStatus=unknown 表示报表未提供（settlementDate 留空）
  settlementDate: { type: Date, default: undefined },
  settlementStatus: { type: String, enum: ['known', 'unknown'], default: undefined },
  // 券商带符号现金净额与实际币种（可与资产币种不同，后续工单使用）
  cashAmount: { type: Number, default: undefined },
  cashCurrency: { type: String, enum: ASSET_CURRENCIES, default: undefined },
  cashAmountSource: { type: String, enum: ['broker', 'derived'], default: undefined },
  feeSource: { type: String, enum: ['broker', 'derived', 'user', 'confirmed_zero'], default: undefined },
  // 成交金额 = 数量 × 单价（无编号成交匹配字段，不含佣金/净额）
  grossAmount: { type: Number, default: undefined },
  pairGroupId: { type: String, trim: true, default: undefined },
  // 同一报表内的原行顺序（按时间正序）；同一时刻按 sequence 重放，手动流水无 sequence 排在其后
  sequence: { type: Number, default: undefined },
  // TASK-096：用户确认的同日先后（同一 UTC 交易日内生效，默认 0；before → 负值，after → 正值）。
  // 重放顺序 (UTC 交易日, orderRank, date, sequence, _id)，见 transaction/positionCalculator.js
  orderRank: { type: Number, default: undefined },
  // ── TASK-099：证券划转 ──
  // transfer_in 的承接成本（转入资产原币种，重放时代替 qty×price）；price 仅为每单位快照
  carryCost: { type: Number, min: 0, default: undefined },
  carryCostCurrency: { type: String, enum: ASSET_CURRENCIES, default: undefined },
  // report 报表给出 / carried 同币种承接转出成本 / fx 按换算依据折算 / user 用户补填
  carryCostSource: { type: String, enum: ['report', 'carried', 'fx', 'user'], default: undefined },
  // 换算依据：1 单位转出资产币种折合多少转入资产币种（跨币种划转）
  transferFxRate: { type: Number, default: undefined },
  // 对端归属（两端以 pairGroupId 关联，同一 importBatchId 共同入账）
  transfer: {
    type: new mongoose.Schema({
      direction: { type: String, enum: ['out', 'in'] },
      counterpartPortfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio' },
      counterpartSourceAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceAccount' },
      // 该端曾在服务端暂存（TransferLeg）时的记录 id
      stagedLegId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransferLeg' }
    }, { _id: false }),
    default: undefined
  },
  // 应用层整批提交：pending 行对所有读取方不可见（见 transaction/visibility.js）
  status: { type: String, enum: ['pending', 'committed'], default: undefined }
}, { timestamps: true, versionKey: false });

TransactionSchema.index({ portfolioId: 1, date: -1, _id: -1 });
TransactionSchema.index({ portfolioId: 1, symbol: 1, date: 1, _id: 1 });
// TASK-094：同来源账户的原成交编号查找（非唯一：跨组合同编号须能被发现并展示原组合，#95）
TransactionSchema.index(
  { sourceAccountId: 1, 'source.externalId': 1 },
  { partialFilterExpression: { 'source.externalId': { $type: 'string' } } }
);
TransactionSchema.index({ sourceAccountId: 1, 'source.rawHash': 1 }, { partialFilterExpression: { sourceAccountId: { $exists: true } } });
TransactionSchema.index({ 'source.importBatchId': 1 }, { partialFilterExpression: { 'source.importBatchId': { $exists: true } } });

module.exports = mongoose.model('Transaction', TransactionSchema);
