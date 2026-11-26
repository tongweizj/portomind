const mongoose = require('mongoose');
const {
  ASSET_TYPES,
  ASSET_MARKETS,
  ASSET_CURRENCIES
} = require('../constants/asset.constants');
const { TRANSACTION_ACTIONS, POSITION_ACTIONS } = require('../constants/transaction.constants');

// 影响持仓的动作必须有标的、数量与单价；现金类流水（TASK-097）可无标的、无数量单价。
function isPositionAction() {
  return POSITION_ACTIONS.includes(this.action);
}
// 有单价的持仓动作（拆股不记单价）
function isPricedAction() {
  return POSITION_ACTIONS.includes(this.action) && this.action !== 'split';
}
function hasSymbolOrPositionAction() {
  return POSITION_ACTIONS.includes(this.action) || Boolean(this.symbol);
}

const TransactionSchema = new mongoose.Schema({
  portfolioId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'portfolioId is required'],
    ref: 'Portfolio',
    index: true
  },
  // 资产快照（有标的时从 Asset 复制）。无标的的现金流水（利息、划转、独立费用）无 assetType/market/symbol，
  // currency 记现金币种（组合层金额保留原币种，规则 10）。
  assetType: { type: String, enum: ASSET_TYPES, required: hasSymbolOrPositionAction },
  symbol: { type: String, required: isPositionAction, trim: true, uppercase: true },
  market: { type: String, enum: ASSET_MARKETS, required: hasSymbolOrPositionAction },
  currency: { type: String, enum: ASSET_CURRENCIES, required: true },
  // buy 增加持仓；sell 减少持仓，且不允许超过交易日期当时的可用数量；div_reinvest 分红再投（转增持仓）。
  // 现金类（不进持仓，金额见 cashAmount / cashCurrency）：div_cash 现金分红（手动录入记 quantity×price）、
  // tax 税款、interest 利息、cash_in / cash_out 现金划入 / 划出、fee 独立费用。
  // split（TASK-098）拆股：quantity 为带符号份额变动（拆股为正、合股为负），不记单价；
  // 总成本不变、单位成本按新份额重算（见 transaction/positionCalculator.js）。
  // transfer_out / transfer_in（TASK-099）证券划转两端（跨账户 / 跨组合）：只移动份额与成本，不产生买卖盈亏；
  // price 为每单位成本快照，转入成本见 carryCost。
  action: { type: String, enum: TRANSACTION_ACTIONS, required: true },
  quantity: {
    type: Number,
    required: isPositionAction,
    validate: {
      validator(value) { return this.action === 'split' ? value !== 0 : value >= Number.EPSILON; },
      message: 'quantity must be greater than zero (split: non-zero share change)'
    }
  },
  price: { type: Number, required: isPricedAction, min: [Number.EPSILON, 'price must be greater than zero'] },
  // 拆股比例 = 新份额 / 旧份额（如 1 拆 2 为 2、10 合 1 为 0.1）；可选，已知时重放核对份额变动
  splitRatio: { type: Number, default: undefined, min: [Number.EPSILON, 'splitRatio must be greater than zero'] },
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
  // 券商带符号现金净额（流入为正、流出为负）与实际现金币种（可与资产币种 currency 不同）。
  // 现金类流水的金额即 cashAmount；成交行优先保存券商净额，缺失时按数量×单价±佣金推算（cashAmountSource=derived）。
  cashAmount: { type: Number, default: undefined },
  cashCurrency: { type: String, enum: ASSET_CURRENCIES, default: undefined },
  cashAmountSource: { type: String, enum: ['broker', 'derived'], default: undefined },
  // TASK-100：跨币种成交的报表汇率（1 资产币种 = cashFxRate 现金币种，如美股以 CAD 结算）。
  // price / fee / grossAmount 已按它换回资产币种，cashAmount 保持券商现金净额；同币种成交留空。
  cashFxRate: { type: Number, min: [Number.EPSILON, 'cashFxRate must be greater than zero'], default: undefined },
  feeSource: { type: String, enum: ['broker', 'derived', 'user', 'confirmed_zero'], default: undefined },
  // 成交金额 = 数量 × 单价（无编号成交匹配字段，不含佣金/净额）
  grossAmount: { type: Number, default: undefined },
  pairGroupId: { type: String, trim: true, default: undefined },
  // 同一报表内的原行顺序（按时间正序）；同一时刻按 sequence 重放，手动流水无 sequence 排在其后
  sequence: { type: Number, default: undefined },
  // TASK-096：用户确认的同日先后（同一当地交易日内生效，默认 0；before → 负值，after → 正值）。
  // 重放顺序 (当地交易日, orderRank, date, sequence, _id)，见 transaction/positionCalculator.js
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
