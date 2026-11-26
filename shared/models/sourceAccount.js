const mongoose = require('mongoose');
const { SOURCE_BROKERS } = require('../constants/import.constants');

// 来源账户（TASK-094）：流水的券商账户来源身份。
// - 身份是 _id；alias 仅为用户标签，可改，不参与识别。
// - 不存完整账号（Human 决定）：只存 sha256(broker + 账号) 与末 4 位用于展示。
// - 一个来源账户可关联多个组合（portfolioIds 仅作信息记录）；每笔流水仍只归属一个组合。
const SourceAccountSchema = new mongoose.Schema({
  broker: { type: String, enum: SOURCE_BROKERS, required: true },
  accountKeyHash: { type: String, trim: true, default: undefined },
  accountKeyLast4: { type: String, trim: true, maxlength: 4, default: undefined },
  alias: { type: String, required: true, trim: true, maxlength: 60 },
  accountType: { type: String, trim: true, maxlength: 60 },
  portfolioIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio' }]
}, { timestamps: true, versionKey: false });

SourceAccountSchema.index(
  { broker: 1, accountKeyHash: 1 },
  {
    unique: true,
    name: 'source_account_identity_unique',
    partialFilterExpression: { accountKeyHash: { $type: 'string' } }
  }
);

module.exports = mongoose.model('SourceAccount', SourceAccountSchema);
