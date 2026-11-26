// 完整批次预览（代码审查 T5 自 index.js 拆出）：计算全部行的处置、阻塞原因、拆批与 previewToken / 账本指纹。
// 只读，不写库；确认（confirm.js）在导入锁内重算同一预览并核对。

const Portfolio = require('../../models/portfolio');
const { IMPORT_COMMIT_LIMIT, IMPORT_PREVIEW_LIMIT, IMPORT_DISPOSITIONS, IMPORT_TIME_ZONE_CHOICES } = require('../../constants/import.constants');
const standardCsv = require('./standardCsv');
const sourceAccounts = require('./sourceAccount.service');
const { skipCommittedRows, matchRows, applyResolutions } = require('./matching');
const transfers = require('./transfers');
const { pairRows, enforcePairIntegrity } = require('./pairing');
const { FX_PAIR_SPEC } = require('./fxPairSpec');
const { businessError, sha256, markError, markReview, markSkip } = require('./common');
const { PARSERS, decodeFile, applySymbolMap, validateInput } = require('./input');
const { resolveAssets, rawHashOf, applyCashDerivation, applyFeeResolution } = require('./candidates');
const { probeOf, validateLedger } = require('./ledger');
const { assignChronologicalSequence, planBatches, firstBatchProblem } = require('./batching');

function ledgerFingerprintOf({ portfolioId, sourceAccountId, ledger, matchedIds }) {
  const ledgerKeys = ledger.map(tx => `${tx._id}:${new Date(tx.updatedAt || 0).getTime()}`).sort();
  return sha256({ portfolioId: String(portfolioId), sourceAccountId: sourceAccountId ? String(sourceAccountId) : null, ledgerKeys, matched: [...matchedIds].sort() });
}

function publicCandidate(row) {
  if (!row.candidate) return null;
  const c = row.candidate;
  return {
    activityType: c.activityType,
    action: c.action,
    kind: c.kind,
    symbol: c.symbol || c.rawSymbol || null,
    // TASK-102：经代码映射替换前的报表代码
    mappedFrom: c.mappedFrom || null,
    date: c.date,
    dateKind: c.dateKind,
    timeZone: c.timeZone,
    timeZoneSource: c.timeZoneSource,
    localDate: c.localDate,
    localTime: c.localTime,
    settlementDate: c.settlementDate,
    settlementStatus: c.settlementStatus,
    quantity: c.quantity,
    price: c.price,
    splitRatio: c.splitRatio ?? null,
    grossAmount: c.grossAmount,
    fee: c.fee,
    feeSource: c.feeSource,
    cashAmount: c.cashAmount,
    cashCurrency: c.cashCurrency,
    cashAmountSource: c.cashAmountSource || null,
    // 跨币种成交的报表汇率（1 资产币种 = cashFxRate 现金币种）；同币种为 null
    cashFxRate: c.cashFxRate ?? null,
    // 券商净额与成交金额 ± 佣金的分币差异（保留，不改写净额）
    cashDifference: c.cashDifference ?? null,
    externalId: c.externalId,
    pairGroup: c.pairGroup,
    transferCost: c.transferCost ?? null,
    transferCostCurrency: c.transferCostCurrency ?? null,
    transferFxRate: c.transferFxRate ?? null,
    notes: c.notes
  };
}

/**
 * 多账户报表按账户拆分：按账号分组，用户选择一个账户（accountSelector = 哈希前缀，展示末 4 位）；
 * 其他账户的行跳过，未选择时全部跳过并要求选择。
 */
function selectFileAccount(rows, input) {
  const broker = input.sourceAccount?.broker || null;
  const accountGroups = new Map();
  for (const row of rows) {
    const number = row.candidate?.accountNumber;
    if (!number) continue;
    const hash = sourceAccounts.accountKeyHash(broker || 'other', number);
    const selector = hash.slice(0, 16);
    if (!accountGroups.has(selector)) accountGroups.set(selector, { selector, accountKeyLast4: sourceAccounts.last4(number), rowCount: 0, number });
    accountGroups.get(selector).rowCount += 1;
    row.accountSelector = selector;
  }
  const accounts = [...accountGroups.values()];
  let selectedAccount = null;
  let requiresAccountSelection = false;
  if (accounts.length === 1) selectedAccount = accounts[0];
  if (accounts.length > 1) {
    selectedAccount = accounts.find(item => item.selector === input.accountSelector) || null;
    requiresAccountSelection = !selectedAccount;
  }
  if (accounts.length && rows.some(row => row.candidate && !row.candidate.accountNumber)) {
    for (const row of rows) {
      if (row.disposition === 'pending' && !row.candidate.accountNumber) markError(row, 'MISSING_FIELD', '同一文件中其他行有账号，此行缺少账号（account_number）');
    }
  }
  for (const row of rows) {
    if (row.disposition === 'pending' && selectedAccount && row.accountSelector !== selectedAccount.selector) {
      markSkip(row, 'OTHER_SOURCE_ACCOUNT', `属于账户 …${accountGroups.get(row.accountSelector).accountKeyLast4}，请另行选择该账户导入`);
    }
    if (row.disposition === 'pending' && requiresAccountSelection) {
      markSkip(row, 'ACCOUNT_NOT_SELECTED', '多账户报表：请先选择要导入的来源账户');
    }
  }
  return { accounts, selectedAccount, requiresAccountSelection };
}

/**
 * 计算完整预览（只读，不写库）。返回内部结构，previewImport / commitImport 共用。
 */
async function computePreview(input) {
  const format = validateInput(input);
  const { portfolioId } = input;
  const portfolio = await Portfolio.findById(portfolioId).lean();
  if (!portfolio) throw businessError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found');

  const file = decodeFile(input.file, format);
  const parser = PARSERS[format];
  const parsedProbe = await parser(file.content, { defaultTimeZone: input.timeZone || undefined });
  if (parsedProbe.headers.length === 0) throw businessError(400, 'EMPTY_IMPORT_FILE', '文件为空或缺少表头');
  if (format !== 'standard' && input.mapping && Object.keys(input.mapping).length) {
    throw businessError(400, 'INVALID_MAPPING', `format ${format} does not accept a column mapping`);
  }
  const mappingError = format === 'standard' ? standardCsv.validateMapping(input.mapping, parsedProbe.headers.length) : null;
  if (mappingError) throw businessError(400, 'INVALID_MAPPING', mappingError);
  const parsed = input.mapping && format === 'standard' ? await parser(file.content, { mapping: input.mapping, defaultTimeZone: input.timeZone || undefined }) : parsedProbe;
  if (parsed.rows.length === 0) throw businessError(400, 'EMPTY_IMPORT_FILE', '文件没有数据行');
  if (parsed.rows.length > IMPORT_PREVIEW_LIMIT) {
    throw businessError(413, 'IMPORT_FILE_TOO_LARGE', `单个文件最多 ${IMPORT_PREVIEW_LIMIT} 行`);
  }
  const mappedColumns = new Set(Object.values(parsed.mapping));
  // 标的 / 数量 / 单价 / 金额按活动类型逐行校验（现金类文件可以没有数量单价列）；
  // 只有划转行的文件（TASK-099）不涉及现金，可以不映射币种列
  const onlyTransfers = parsed.rows.length > 0 && parsed.rows.every(row => row.candidate?.isTransfer);
  const missingColumns = parsed.missingColumns || ['activity_type', 'trade_date', ...(onlyTransfers ? [] : ['cash_currency'])]
    .filter(key => !mappedColumns.has(key));

  const resolutions = input.resolutions || {};
  const rows = parsed.rows.map((row, index) => ({
    ...row,
    sequence: index,
    disposition: row.error ? 'error' : 'pending',
    code: row.error?.code,
    reason: row.error?.reason
  }));
  assignChronologicalSequence(rows);

  // TASK-096：报表有成交时间但无时区 → 待用户确认北京 / 多伦多时区（文件级 timeZone），确认前不猜时刻。
  for (const row of rows) {
    if (row.disposition !== 'pending' || !row.candidate.needsTimeZone) continue;
    markReview(row, 'TIME_ZONE_UNCONFIRMED', '报表有成交时间但没有时区：请确认按北京或多伦多时间解读', ['timeZone', 'skip']);
  }
  const requiresTimeZone = rows.some(row => row.code === 'TIME_ZONE_UNCONFIRMED');

  const { accounts, selectedAccount, requiresAccountSelection } = selectFileAccount(rows, input);

  const resolvedSource = await sourceAccounts.resolveSourceAccount(input.sourceAccount, {
    fileAccountNumber: selectedAccount?.number
  });
  const sourceAccountId = resolvedSource.existing?._id || null;

  applySymbolMap(rows, input.symbolMap || {});
  await resolveAssets(rows);
  for (const row of rows) {
    if (row.disposition !== 'pending') continue;
    const resolution = resolutions[row.rowKey];
    applyFeeResolution(row, resolution);
    if (row.disposition === 'pending') {
      applyCashDerivation(row);
      row.rawHash = rawHashOf(row.candidate);
    }
  }
  for (const row of rows) {
    if (row.disposition === 'review' && row.code === 'FEE_UNKNOWN') row.rawHash = rawHashOf({ ...row.candidate, fee: null });
  }
  // 决定 8：已入账的报表行（来源账户 + 行号 + 内容）自动跳过，重新上传同一文件即续传下一批
  const committedKeys = await skipCommittedRows(rows, { portfolioId, sourceAccountId });
  // TASK-101：换汇两端配对（显式组号 / 用户指定 / 同账户同日唯一建议）；未配对端进入待核对
  pairRows(rows, FX_PAIR_SPEC, resolutions);
  // 划转行（TASK-099）不参与成交匹配，由 transfers.resolveTransfers 配对 / 暂存 / 核对承接成本
  for (const row of rows) {
    if (row.disposition === 'pending' && transfers.isTransferRow(row)) row.disposition = 'transfer';
  }
  const matchedIds = await matchRows(rows, { portfolioId, sourceAccountId });

  for (const row of rows) {
    if (row.disposition === 'pending') row.disposition = 'add';
  }
  // 用户对 review 行的显式决议：skip / add / update（#95）；同日顺序决议在 validateLedger 内处理（#96）
  applyResolutions(rows, resolutions);
  const transferPlan = await transfers.resolveTransfers(rows, {
    portfolioId, portfolioName: portfolio.name, sourceAccountId, resolutions, probeOf
  });
  const { ledger, positionsAfter } = await validateLedger(rows, portfolioId, resolutions, transferPlan.extraProbes);
  // 换汇两端要么都写入、要么都不写入（TASK-101）
  enforcePairIntegrity(rows, FX_PAIR_SPEC, resolutions);
  // 划转一端在本组合校验失败时，对端不得单独写入（整批因错误阻塞）
  for (const write of transferPlan.partnerWrites) {
    const row = rows.find(item => item.rowKey === write.rowKey);
    if (row.disposition !== 'add') write.dropped = true;
  }
  transferPlan.partnerWrites = transferPlan.partnerWrites.filter(write => !write.dropped);

  const counts = { ...Object.fromEntries(IMPORT_DISPOSITIONS.map(disposition => [disposition, 0])), total: rows.length };
  for (const row of rows) counts[row.disposition] += 1;
  const blockingReasons = [];
  if (missingColumns.length) blockingReasons.push({ code: 'MISSING_COLUMNS', reason: `未映射必需列：${missingColumns.join(', ')}` });
  if (requiresAccountSelection) blockingReasons.push({ code: 'ACCOUNT_SELECTION_REQUIRED', reason: '报表包含多个账户，请选择一个来源账户' });
  if (requiresTimeZone && rows.some(row => row.code === 'TIME_ZONE_UNCONFIRMED' && row.disposition === 'review')) {
    blockingReasons.push({ code: 'TIME_ZONE_REQUIRED', reason: '报表有成交时间但没有时区，请确认北京或多伦多时区' });
  }
  if (counts.error) blockingReasons.push({ code: 'ROW_ERRORS', reason: `${counts.error} 行存在错误` });
  if (counts.review) blockingReasons.push({ code: 'UNRESOLVED_REVIEW', reason: `${counts.review} 行待核对` });
  const batches = planBatches(rows);
  if (!blockingReasons.length) {
    const problem = firstBatchProblem(rows, batches, ledger, transferPlan.extraProbes);
    if (problem) blockingReasons.push({ code: 'FIRST_BATCH_INVALID', reason: problem });
  }
  if (!blockingReasons.length && counts.add + counts.update + counts.stage === 0) {
    blockingReasons.push({ code: 'NOTHING_TO_IMPORT', reason: '没有需要写入的流水' });
  }

  const sourceKey = sourceAccountId
    ? String(sourceAccountId)
    : `new:${resolvedSource.planned.broker}:${resolvedSource.planned.accountKeyHash || resolvedSource.planned.alias}`;
  const previewToken = sha256({
    portfolioId: String(portfolioId),
    format,
    sourceKey,
    alias: resolvedSource.planned.alias,
    rows: rows.map(row => [row.rowKey, row.disposition, row.code || null, row.rawHash || null, row.candidate?.notes || null, row.targetId || null, row.orderRank ?? null, row.pair?.groupId || null,
      row.transfer ? [row.pairKey || null, row.transfer.partner?.id || null, row.transfer.carryCost ?? null, row.transfer.fxRate ?? null] : null]),
    lockPortfolioIds: transferPlan.lockPortfolioIds
  });
  const ledgerFingerprint = ledgerFingerprintOf({
    portfolioId, sourceAccountId, ledger, matchedIds: [...committedKeys, ...matchedIds, ...transferPlan.fingerprintKeys]
  });

  return {
    format,
    file,
    portfolio,
    sourceKey,
    resolvedSource,
    rows,
    counts,
    batches,
    blocking: blockingReasons.length > 0,
    blockingReasons,
    previewToken,
    ledgerFingerprint,
    headers: parsed.headers,
    mapping: parsed.mapping,
    accounts,
    selectedAccount,
    requiresAccountSelection,
    requiresTimeZone,
    positionsAfter,
    transferPlan
  };
}

function toPreviewResponse(preview) {
  const source = preview.resolvedSource;
  return {
    previewToken: preview.previewToken,
    ledgerFingerprint: preview.ledgerFingerprint,
    target: { portfolioId: String(preview.portfolio._id), name: preview.portfolio.name, currency: preview.portfolio.currency },
    sourceAccount: {
      id: source.existing ? String(source.existing._id) : null,
      isNew: !source.existing,
      broker: source.planned.broker,
      alias: source.planned.alias,
      accountKeyLast4: source.planned.accountKeyLast4 || null
    },
    accounts: preview.accounts.map(({ selector, accountKeyLast4, rowCount }) => ({ selector, accountKeyLast4, rowCount })),
    accountSelector: preview.selectedAccount?.selector || null,
    requiresAccountSelection: preview.requiresAccountSelection,
    requiresTimeZone: preview.requiresTimeZone,
    timeZoneOptions: [...IMPORT_TIME_ZONE_CHOICES],
    fileName: preview.file.name,
    headers: preview.headers,
    mapping: preview.mapping,
    rows: preview.rows.map(row => ({
      rowKey: row.rowKey,
      rowNumber: row.rowNumber,
      rowNumberKind: row.rowNumberKind,
      fileLine: row.fileLine,
      disposition: row.disposition,
      code: row.code || null,
      reason: row.reason || null,
      options: row.options || [],
      resolved: Boolean(row.resolved),
      matches: row.matches || [],
      duplicateOf: row.duplicateOf || null,
      targetId: row.targetId || null,
      orderConflict: row.orderConflict || null,
      orderResolved: row.orderResolved || null,
      transfer: row.transfer || null,
      splitEffect: row.splitEffect || null,
      // TASK-101：成对流水的另一端与配对来源（explicit / user / suggested）；未配对时的可选另一端
      pair: row.pair || null,
      pairCandidates: row.pairCandidates || [],
      // TASK-102：待提供（SYMBOL_UNMAPPED）或已采用代码映射的行对应的 symbolMap 键
      symbolMapKey: row.symbolMapKey || null,
      candidate: publicCandidate(row)
    })),
    positionsAfter: preview.positionsAfter,
    counts: preview.counts,
    blocking: preview.blocking,
    blockingReasons: preview.blockingReasons,
    commitLimit: IMPORT_COMMIT_LIMIT,
    batches: preview.batches.map(({ index, count, firstRowNumber, lastRowNumber }) => ({ index, count, firstRowNumber, lastRowNumber })),
    requiresSplit: preview.batches.length > 1,
    // TASK-099：确认时一并写入的对端组合（暂存一端所在组合）
    counterpartPortfolioIds: preview.transferPlan.lockPortfolioIds
  };
}

async function previewImport(input) {
  return toPreviewResponse(await computePreview(input));
}

module.exports = { computePreview, toPreviewResponse, previewImport };
