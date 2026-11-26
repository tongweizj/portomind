// 应用层整批提交（TASK-094，Human 决定：不引入副本集事务）。
//
// 1. 取锁：插入 ImportBatch{status:'committing', lockKey:'portfolio:<id>'}；
//    部分唯一索引保证同组合并发确认只有一个成功，其余 409 IMPORT_IN_PROGRESS。
//    同时取来源账户伴随锁 source:<key>（同一来源账户并发确认到不同组合互斥）；手动写入检查组合锁（assertPortfolioUnlocked）。
// 2. 锁内重算预览并核对 token / 账本指纹（prepare），确保写入与确认一致。
// 3. 新行以 status='pending' 写入（对所有读取方不可见，见 transaction/visibility.js）。
//    更新（#95）：先把目标旧流水的原值写入 ImportBatch.updates（预写日志），再改写旧流水。
//    取舍：更新在翻转前即可见（窗口极短）；失败时按原值恢复。
// 4. 单语句 updateMany 把本批 pending 翻转为 committed：成对流水同时可见。
// 5. 任一步失败：删除本批 pending 行、恢复更新前原值、标记 rolled_back 并释放锁。
//    进程崩溃遗留的 committing 批次在下一次确认前按超时回收（recoverStaleBatches）。
//
// TASK-099 证券划转：
// - 对端组合（暂存一端所在组合）在主锁之后按 id 顺序取伴随锁（ImportBatch{parentBatchId}），任一失败 → 409；
// - 暂存对端以条件更新 staged → consuming 占用（consumedBatchId），未命中 → 409 PREVIEW_STALE；
// - 先到的一端以 TransferLeg{status:'pending', stagedBatchId} 写入；
// - 翻转顺序：Transaction pending→committed → ImportBatch.phase='flipped' → TransferLeg pending→staged、consuming→committed；
// - 回滚：phase 未到 flipped → 删除本批 pending 流水与暂存一端，consuming 恢复为 staged
//   （其对端流水已可见时补完为 committed，防止同一端被再次配对）；phase=flipped → 只向前补完暂存一端状态，
//   不回滚账本。两端流水同属一次 updateMany 翻转，因此不会出现单边可见。

const Transaction = require('../../models/transaction');
const ImportBatch = require('../../models/importBatch');
const TransferLeg = require('../../models/transferLeg');
const { businessError } = require('./common');

const STALE_BATCH_MS = 10 * 60 * 1000;

const portfolioLockKey = portfolioId => `portfolio:${portfolioId}`;
const sourceLockKey = sourceKey => `source:${sourceKey}`;

/**
 * 手动新增 / 修改 / 删除流水前检查组合导入锁（代码审查 S3）：确认进行中（pending 写入到翻转之间）不接受手动写入，
 * 避免手动写入绕过锁内的账本校验。只读检查，不取锁（残余窗口：检查与写入之间的毫秒级竞态）。
 */
async function assertPortfolioUnlocked(portfolioId) {
  const busy = await ImportBatch.exists({ lockKey: portfolioLockKey(portfolioId), status: 'committing' });
  if (busy) throw businessError(409, 'IMPORT_IN_PROGRESS', '该组合有导入正在确认，请稍后再试');
}


async function finishLegs(batchId) {
  await TransferLeg.updateMany({ stagedBatchId: batchId, status: 'pending' }, { $set: { status: 'staged' } });
  await TransferLeg.updateMany({ consumedBatchId: batchId, status: 'consuming' }, { $set: { status: 'committed' } });
}

async function releaseCompanions(batchId, status) {
  await ImportBatch.updateMany(
    { parentBatchId: batchId, status: 'committing' },
    { $set: { status }, $unset: { lockKey: '' } }
  );
}


async function rollbackBatch(batchId, updates = [], reason = 'rolled back', phase) {
  if (phase === 'flipped') {
    // 翻转已完成：账本已整批可见，只补完暂存一端状态（向前恢复）
    await finishLegs(batchId);
    await releaseCompanions(batchId, 'committed');
    await ImportBatch.updateOne(
      { _id: batchId },
      { $set: { status: 'committed', phase: 'flipped', error: `recovered forward: ${String(reason).slice(0, 400)}` }, $unset: { lockKey: '' } }
    );
    return;
  }
  await TransferLeg.deleteMany({ stagedBatchId: batchId, status: 'pending' });
  // 被占用的暂存对端：若其账本流水已翻转可见（翻转与 phase 落盘之间中断），补完为 committed，否则恢复 staged
  const consuming = await TransferLeg.find({ consumedBatchId: batchId, status: 'consuming' }).lean();
  for (const leg of consuming) {
    const visible = await Transaction.countDocuments({ 'transfer.stagedLegId': leg._id, status: 'committed' });
    await TransferLeg.updateOne(
      { _id: leg._id, status: 'consuming' },
      visible ? { $set: { status: 'committed' } } : { $set: { status: 'staged' }, $unset: { consumedBatchId: '' } }
    );
  }
  await releaseCompanions(batchId, 'rolled_back');
  await Transaction.deleteMany({ 'source.importBatchId': batchId, status: 'pending' });
  for (const { transactionId, before, unset } of updates || []) {
    const restore = {};
    if (before && Object.keys(before).length) restore.$set = before;
    if (unset && unset.length) restore.$unset = Object.fromEntries(unset.map(key => [key, '']));
    if (Object.keys(restore).length) await Transaction.updateOne({ _id: transactionId }, restore);
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
  for (const batch of stale) {
    if (batch.parentBatchId) {
      // 伴随锁超时：回收其主批次（主批次的写入可能在任一组合）
      const [parent] = await ImportBatch.find({ _id: batch.parentBatchId, status: 'committing' }).lean();
      if (parent) await rollbackBatch(parent._id, parent.updates, 'stale batch recovered', parent.phase);
      await ImportBatch.updateOne({ _id: batch._id, status: 'committing' }, { $set: { status: 'rolled_back' }, $unset: { lockKey: '' } });
      continue;
    }
    await rollbackBatch(batch._id, batch.updates, 'stale batch recovered', batch.phase);
  }
  return stale.length;
}

/**
 * @param {object} plan
 * @param {string} plan.portfolioId
 * @param {() => Promise<object>} plan.prepare 锁内重算预览；抛错即放弃（不写入）
 * @param {(preview) => Promise<id>} plan.ensureSource 落库来源账户
 * @param {(preview, ctx) => Array<{rowKey, doc}>} plan.buildDocuments
 * @param {(preview, ctx) => Array<{rowKey, transactionId, set}>} [plan.buildUpdates]
 * @param {(preview, ctx) => object} plan.summarize
 * @param {string[]} [plan.extraLockPortfolioIds] TASK-099：一并加锁的对端组合
 * @param {string[]} [plan.extraLockKeys] 其他伴随锁键（来源账户 source:<key>）
 * @param {(preview, ctx) => Array} [plan.claimLegs] TASK-099：要占用的暂存对端 id
 * @param {(preview, ctx) => Array<{rowKey, doc}>} [plan.buildStagedLegs] TASK-099：要暂存的先到一端
 */
async function runAtomicCommit(plan) {
  const lockKey = portfolioLockKey(plan.portfolioId);
  // 伴随锁：对端组合（TASK-099）+ 来源账户（代码审查 S3：外部编号按来源账户跨组合匹配，
  // 同一来源账户并发确认到不同组合时须互斥，否则双方都看不到对方的 pending 行而重复入账）
  const extraKeys = [...new Set([
    ...(plan.extraLockPortfolioIds || []).map(String).filter(id => id !== String(plan.portfolioId)).map(portfolioLockKey),
    ...(plan.extraLockKeys || [])
  ])].sort();
  await recoverStaleBatches(lockKey);
  for (const key of extraKeys) await recoverStaleBatches(key);

  let batch;
  try {
    batch = await ImportBatch.create({ portfolioId: plan.portfolioId, status: 'committing', lockKey });
  } catch (error) {
    if (error.code === 11000) {
      throw businessError(409, 'IMPORT_IN_PROGRESS', '该组合有另一个导入正在确认，请稍后重新预览');
    }
    throw error;
  }
  for (const key of extraKeys) {
    const ownerId = key.startsWith('portfolio:') ? key.slice('portfolio:'.length) : plan.portfolioId;
    try {
      await ImportBatch.create({ portfolioId: ownerId, status: 'committing', lockKey: key, parentBatchId: batch._id });
    } catch (error) {
      await rollbackBatch(batch._id, [], 'companion lock busy');
      if (error.code === 11000) {
        throw businessError(409, 'IMPORT_IN_PROGRESS', key.startsWith('portfolio:')
          ? '划转对端组合有另一个导入正在确认，请稍后重新预览'
          : '同一来源账户有另一个导入正在确认，请稍后重新预览');
      }
      throw error;
    }
  }

  let preview;
  try {
    preview = await plan.prepare();
  } catch (error) {
    await rollbackBatch(batch._id, [], error.code || error.message);
    throw error;
  }

  const journal = [];
  let phase;
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
    // TASK-099：先占用暂存对端（条件更新），失败即放弃（尚未写入任何流水）
    const claims = plan.claimLegs ? plan.claimLegs(preview, ctx) : [];
    for (const legId of claims) {
      const outcome = await TransferLeg.updateOne(
        { _id: legId, status: 'staged' },
        { $set: { status: 'consuming', consumedBatchId: batch._id } }
      );
      if (!outcome.matchedCount) {
        throw businessError(409, 'PREVIEW_STALE', '划转对端已被其他导入配对或放弃，请重新预览', { reason: 'LEDGER_CHANGED' });
      }
    }
    const created = planned.length ? await Transaction.insertMany(planned.map(item => item.doc), { ordered: true }) : [];
    const written = planned.map((item, index) => ({
      rowKey: item.rowKey, transactionId: created[index]._id, kind: 'add', counterpart: Boolean(item.counterpart)
    }));
    for (const [index, item] of planned.entries()) {
      const legId = item.doc.transfer?.stagedLegId;
      if (item.counterpart && legId) {
        await TransferLeg.updateOne({ _id: legId, consumedBatchId: batch._id }, { $set: { transactionId: created[index]._id } });
      }
    }
    const stagedPlan = plan.buildStagedLegs ? plan.buildStagedLegs(preview, ctx) : [];
    const stagedDocs = stagedPlan.length ? await TransferLeg.insertMany(stagedPlan.map(item => item.doc), { ordered: true }) : [];
    stagedPlan.forEach((item, index) => written.push({ rowKey: item.rowKey, transactionId: stagedDocs[index]._id, kind: 'stage' }));
    const updates = plan.buildUpdates ? plan.buildUpdates(preview, ctx) : [];
    for (const update of updates) {
      const current = await Transaction.findById(update.transactionId).lean();
      if (!current) throw businessError(409, 'PREVIEW_STALE', '待更新的旧流水已不存在，请重新预览', { reason: 'LEDGER_CHANGED' });
      const set = {};
      const unsetKeys = [];
      for (const [key, value] of Object.entries(update.set)) {
        if (value === undefined) unsetKeys.push(key); else set[key] = value;
      }
      const touched = [...Object.keys(set), ...unsetKeys];
      const before = {};
      const unset = [];
      for (const key of touched) {
        if (current[key] === undefined) unset.push(key); else before[key] = current[key];
      }
      journal.push({ transactionId: update.transactionId, before, unset });
      await ImportBatch.updateOne({ _id: batch._id }, { $set: { updates: journal } });
      const change = { $set: set };
      if (unsetKeys.length) change.$unset = Object.fromEntries(unsetKeys.map(key => [key, '']));
      await Transaction.updateOne({ _id: update.transactionId }, change);
      written.push({ rowKey: update.rowKey, transactionId: update.transactionId, kind: 'update' });
    }
    await Transaction.updateMany(
      { 'source.importBatchId': batch._id, status: 'pending' },
      { $set: { status: 'committed' } }
    );
    await ImportBatch.updateOne({ _id: batch._id }, { $set: { phase: 'flipped' } });
    phase = 'flipped';
    await finishLegs(batch._id);
    await releaseCompanions(batch._id, 'committed');
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
    await rollbackBatch(batch._id, journal, error.message, phase);
    // 已翻转：账本整批可见，向前补完后按成功返回会丢失结果摘要，仍抛出原错误由调用方重新预览核对
    throw error;
  }
}

module.exports = { runAtomicCommit, recoverStaleBatches, rollbackBatch, assertPortfolioUnlocked, sourceLockKey, STALE_BATCH_MS };
