// 整批确认（代码审查 T5 自 index.js 拆出）：在导入锁内重算预览并核对 token / 指纹，写入第 1 批。
// 原子性（锁、pending 写入、一次翻转、回滚）由 commit.js 的 runAtomicCommit 负责。

const sourceAccounts = require('./sourceAccount.service');
const { runAtomicCommit, sourceLockKey } = require('./commit');
const transfers = require('./transfers');
const { businessError } = require('./common');
const { validateInput } = require('./input');
const { computePreview } = require('./preview');

// 新增与更新共用的导入字段（来源追溯 + 规范化成交值）。
function importedFields(preview, row, { sourceAccountId, importBatchId }) {
  const c = row.candidate;
  return {
    symbol: c.symbol || undefined,
    assetType: row.asset?.type,
    market: row.asset?.market,
    // 有标的：资产币种快照；无标的的现金流水：现金币种
    currency: row.asset?.currency || c.cashCurrency,
    action: c.action,
    quantity: c.quantity ?? undefined,
    price: c.price ?? undefined,
    splitRatio: c.splitRatio ?? undefined,
    fee: c.fee,
    date: c.date,
    sourceAccountId,
    source: {
      kind: 'import',
      format: preview.format,
      fileName: preview.file.name || undefined,
      rowNumber: row.rowNumber,
      rowNumberKind: row.rowNumberKind,
      externalId: c.externalId,
      importBatchId,
      rawHash: row.rawHash
    },
    dateKind: c.dateKind,
    timeZone: c.timeZone || undefined,
    timeZoneSource: c.timeZoneSource || undefined,
    settlementDate: c.settlementDate || undefined,
    settlementStatus: c.settlementStatus,
    cashAmount: c.cashAmount ?? undefined,
    cashCurrency: c.cashCurrency,
    cashAmountSource: c.cashAmountSource || undefined,
    cashFxRate: c.cashFxRate ?? undefined,
    feeSource: c.feeSource || undefined,
    grossAmount: c.grossAmount ?? undefined,
    pairGroupId: c.pairGroup || undefined,
    sequence: row.sequence,
    orderRank: row.orderRank ?? undefined
  };
}

/**
 * 确认导入：在 ImportBatch 锁内重算预览并核对 token / 指纹，然后整批写入第 1 批。
 */
async function commitImport(input) {
  if (!input || typeof input.previewToken !== 'string' || typeof input.ledgerFingerprint !== 'string') {
    throw businessError(400, 'PREVIEW_REQUIRED', 'previewToken and ledgerFingerprint are required; preview first');
  }
  validateInput(input);
  // TASK-099：先做一次只读预演，取得需要一并加锁的对端组合（暂存一端所在组合）；锁内重算后再核对
  const rehearsal = await computePreview(input);
  const lockPortfolioIds = rehearsal.transferPlan.lockPortfolioIds;
  return runAtomicCommit({
    portfolioId: input.portfolioId,
    extraLockPortfolioIds: lockPortfolioIds,
    extraLockKeys: [sourceLockKey(rehearsal.sourceKey)],
    async prepare() {
      const preview = await computePreview(input);
      if (preview.sourceKey !== rehearsal.sourceKey) {
        throw businessError(409, 'PREVIEW_STALE', '来源账户已变化，请重新预览并确认', { reason: 'INPUT_CHANGED' });
      }
      if (preview.transferPlan.lockPortfolioIds.some(id => !lockPortfolioIds.includes(id))) {
        throw businessError(409, 'PREVIEW_STALE', '划转对端已变化，请重新预览并确认', { reason: 'LEDGER_CHANGED' });
      }
      if (preview.previewToken !== input.previewToken) {
        throw businessError(409, 'PREVIEW_STALE', '导入内容或决议与预览不一致，请重新预览并确认', { reason: 'INPUT_CHANGED' });
      }
      if (preview.ledgerFingerprint !== input.ledgerFingerprint) {
        throw businessError(409, 'PREVIEW_STALE', '预览后账本已变化，请重新预览并确认', { reason: 'LEDGER_CHANGED' });
      }
      if (preview.blocking) {
        throw businessError(422, 'IMPORT_BLOCKED', '存在错误或未解决的待核对行，整批未写入', { blockingReasons: preview.blockingReasons });
      }
      return preview;
    },
    async ensureSource(preview) {
      return sourceAccounts.ensureSourceAccount(preview.resolvedSource, input.portfolioId);
    },
    buildDocuments(preview, ctx) {
      const batch = new Set(preview.batches[0].rowKeys);
      const rows = preview.rows.filter(row => batch.has(row.rowKey) && row.disposition === 'add');
      const docs = rows.map(row => ({
        rowKey: row.rowKey,
        doc: {
          portfolioId: input.portfolioId,
          ...importedFields(preview, row, ctx),
          ...(row.transferWrite ? transfers.transferFieldsOfRow(row, ctx) : {}),
          notes: row.candidate.notes || undefined,
          status: 'pending'
        }
      }));
      // TASK-099：暂存对端与本行同一次确认写入各自组合
      const partners = preview.transferPlan.partnerWrites
        .filter(write => batch.has(write.rowKey))
        .map(write => ({ rowKey: write.rowKey, counterpart: true, doc: transfers.partnerDocument(write, ctx) }));
      return [...docs, ...partners];
    },
    // TASK-099：确认时占用的暂存对端（条件更新 staged → consuming，防止同一端被两次配对）
    claimLegs(preview) {
      const batch = new Set(preview.batches[0].rowKeys);
      return preview.transferPlan.partnerWrites.filter(write => batch.has(write.rowKey)).map(write => write.leg._id);
    },
    // TASK-099：先到的一端写入暂存（不进账本）
    buildStagedLegs(preview, ctx) {
      const batch = new Set(preview.batches[0].rowKeys);
      return preview.rows
        .filter(row => batch.has(row.rowKey) && row.disposition === 'stage')
        .map(row => ({ rowKey: row.rowKey, doc: transfers.stagedLegDocument(row, preview, ctx) }));
    },
    // 更新（#95）：确认后改写目标旧流水；不覆盖手工备注（notes）与组合归属。
    buildUpdates(preview, ctx) {
      const batch = new Set(preview.batches[0].rowKeys);
      return preview.rows
        .filter(row => batch.has(row.rowKey) && row.disposition === 'update')
        .map(row => ({ rowKey: row.rowKey, transactionId: row.target._id, set: importedFields(preview, row, ctx) }));
    },
    summarize(preview, { importBatchId, sourceAccountId, written }) {
      const batch = new Set(preview.batches[0].rowKeys);
      const own = written.filter(item => !item.counterpart);
      const writtenByKey = new Map(own.filter(item => item.kind !== 'stage').map(item => [item.rowKey, String(item.transactionId)]));
      const stagedByKey = new Map(own.filter(item => item.kind === 'stage').map(item => [item.rowKey, String(item.transactionId)]));
      const counterpartByKey = new Map(written.filter(item => item.counterpart).map(item => [item.rowKey, String(item.transactionId)]));
      const rows = preview.rows.map(row => {
        const inBatch = batch.has(row.rowKey);
        const disposition = inBatch || !['add', 'update', 'stage'].includes(row.disposition) ? row.disposition : 'deferred';
        return {
          transferLegId: stagedByKey.get(row.rowKey) || null,
          counterpartTransactionId: counterpartByKey.get(row.rowKey) || null,
          rowKey: row.rowKey,
          rowNumber: row.rowNumber,
          rowNumberKind: row.rowNumberKind,
          disposition,
          code: row.code || null,
          reason: row.reason || null,
          transactionId: writtenByKey.get(row.rowKey) || null
        };
      });
      const deferred = rows.filter(row => row.disposition === 'deferred').length;
      return {
        importBatchId: String(importBatchId),
        sourceAccountId: String(sourceAccountId),
        added: own.filter(item => item.kind === 'add').length,
        updated: own.filter(item => item.kind === 'update').length,
        staged: own.filter(item => item.kind === 'stage').length,
        counterpartsWritten: written.filter(item => item.counterpart).length,
        skipped: preview.counts.skip,
        review: 0,
        deferred,
        remainingBatches: Math.max(preview.batches.length - 1, 0),
        rows
      };
    }
  });
}

module.exports = { commitImport };
