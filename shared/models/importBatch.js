const mongoose = require('mongoose');

// 导入批次（TASK-094）：应用层整批提交的锁与补偿记录（单机 MongoDB 无多文档事务）。
// 不是长期导入历史（Spec #93 Out of Scope）；仅用于并发互斥、故障回滚与「当次结果」。
// - status=committing 且带 lockKey 的记录参与唯一约束 → 同组合并发确认只有一个成功；
// - 终态（committed / rolled_back）释放 lockKey，不永久占锁。
const ImportBatchSchema = new mongoose.Schema({
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true },
  sourceAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceAccount' },
  format: { type: String, trim: true },
  fileName: { type: String, trim: true, maxlength: 255 },
  status: {
    type: String,
    enum: ['committing', 'committed', 'rolled_back'],
    default: 'committing'
  },
  lockKey: { type: String, trim: true, default: undefined },
  previewToken: String,
  ledgerFingerprint: String,
  counts: { type: mongoose.Schema.Types.Mixed },
  // 更新类处置（#95）写入前的原值，回滚时恢复。
  updates: [{ _id: false, transactionId: mongoose.Schema.Types.ObjectId, before: mongoose.Schema.Types.Mixed, unset: [String] }],
  error: String
}, { timestamps: true, versionKey: false });

ImportBatchSchema.index(
  { lockKey: 1 },
  {
    unique: true,
    name: 'import_batch_active_lock_unique',
    partialFilterExpression: { status: 'committing', lockKey: { $type: 'string' } }
  }
);
ImportBatchSchema.index({ portfolioId: 1, createdAt: -1 });

module.exports = mongoose.model('ImportBatch', ImportBatchSchema);
