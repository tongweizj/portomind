// 应用层整批提交（TASK-094，Human 决定：不引入副本集事务）。
//
// 1. 取锁：插入 ImportBatch{status:'committing', lockKey:'portfolio:<id>'}；
//    部分唯一索引保证同组合并发确认只有一个成功，其余 409 IMPORT_IN_PROGRESS。
// 2. 锁内重算预览并核对 token / 账本指纹（prepare），确保写入与确认一致。
// 3. 新行以 status='pending' 写入（对所有读取方不可见，见 transaction/visibility.js）。
// 4. 单语句 updateMany 把本批 pending 翻转为 committed：成对流水同时可见。
// 5. 任一步失败：删除本批 pending 行、恢复更新前原值、标记 rolled_back 并释放锁。
//    进程崩溃遗留的 committing 批次在下一次确认前按超时回收（recoverStaleBatches）。

const Transaction = require('../../models/transaction');
const ImportBatch = require('../../models/importBatch');

const STALE_BATCH_MS = 10 * 60 * 1000;

function businessError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

async function rollbackBatch(batchId, updates = [], reason = 'rolled back') {
  await Transaction.deleteMany({ 'source.importBatchId': batchId, status: 'pending' });
  for (const { transactionId, before } of updates) {
    if (before) await Transaction.updateMany({ _id: transactionId }, { $set: before });
  }
  await ImportBatch.updateOne(
    { _id: batchId },
    { $set: { status: 'rolled_back', error: String(reason).slice(0, 500) }, $unset: { lockKey: '' } }
  );
}

/** 回收超时未完成的批次（进程在写入中途退出）。 */
async function recoverStaleBatches(lockKey, now = Date.now()) {
  const stale = await ImportBatch.find({
    lockKey,
    status: 'committing',
    updatedAt: { $lt: new Date(now - STALE_BATCH_MS) }
  }).lean();
  for (const batch of stale) await rollbackBatch(batch._id, batch.updates, 'stale batch recovered');
  return stale.length;
}

/**
 * @param {object} plan
 * @param {string} plan.portfolioId
 * @param {() => Promise<object>} plan.prepare 锁内重算预览；抛错即放弃（不写入）
 * @param {(preview) => Promise<id>} plan.ensureSource 落库来源账户
 * @param {(preview, ctx) => Array<{rowKey, doc}>} plan.buildDocuments
 * @param {(preview, ctx) => object} plan.summarize
 */
async function runAtomicCommit(plan) {
  const lockKey = `portfolio:${plan.portfolioId}`;
  await recoverStaleBatches(lockKey);

  let batch;
  try {
    batch = await ImportBatch.create({ portfolioId: plan.portfolioId, status: 'committing', lockKey });
  } catch (error) {
    if (error.code === 11000) {
      throw businessError(409, 'IMPORT_IN_PROGRESS', '该组合有另一个导入正在确认，请稍后重新预览');
    }
    throw error;
  }

  let preview;
  try {
    preview = await plan.prepare();
  } catch (error) {
    await rollbackBatch(batch._id, [], error.code || error.message);
    throw error;
  }

  try {
    const sourceAccountId = await plan.ensureSource(preview);
    const ctx = { sourceAccountId, importBatchId: batch._id };
    const planned = plan.buildDocuments(preview, ctx);
    await ImportBatch.updateOne({ _id: batch._id }, {
      $set: {
        sourceAccountId,
        format: preview.format,
        fileName: preview.file?.name,
        previewToken: preview.previewToken,
        ledgerFingerprint: preview.ledgerFingerprint
      }
    });
    const created = planned.length ? await Transaction.insertMany(planned.map(item => item.doc), { ordered: true }) : [];
    const written = planned.map((item, index) => ({ rowKey: item.rowKey, transactionId: created[index]._id }));
    await Transaction.updateMany(
      { 'source.importBatchId': batch._id, status: 'pending' },
      { $set: { status: 'committed' } }
    );
    const result = plan.summarize(preview, { ...ctx, written });
    await ImportBatch.updateOne({ _id: batch._id }, {
      $set: {
        status: 'committed',
        counts: { added: result.added, updated: result.updated, skipped: result.skipped, deferred: result.deferred }
      },
      $unset: { lockKey: '' }
    });
    return result;
  } catch (error) {
    await rollbackBatch(batch._id, [], error.message);
    throw error;
  }
}

module.exports = { runAtomicCommit, recoverStaleBatches, rollbackBatch, STALE_BATCH_MS };
