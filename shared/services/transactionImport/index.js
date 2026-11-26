// 流水导入（TASK-094 / Spec #93）：完整批次预览 + 整批确认。
//
// 设计要点（见 docs/handbook/technical/API_CONTRACT.md「流水导入」）：
// - 无状态预览：确认请求重新携带文件、映射与决议，服务端重算预览；
//   previewToken（输入与处置摘要）不一致 → 输入已变；ledgerFingerprint（相关账本摘要）不一致 → 账本已变；
//   两者都返回 409 PREVIEW_STALE，用户须重新预览并确认。
// - 错误行或未决 review 行阻塞整批（422 IMPORT_BLOCKED），不写任何记录。
// - 每次确认最多写入 IMPORT_COMMIT_LIMIT 条来源流水；超出时只提交第 1 批，成对流水（pair_group）不拆开。
// - 单机 MongoDB 无多文档事务：ImportBatch 锁 + pending 写入 + 单语句翻转 committed + 故障补偿（commit.js）。
//
// 扩展点：PARSERS（#100 Wealthsimple / #102 Questrade）、matchRows（#95）、resolutions（#95–#99）。

const crypto = require('crypto');
const mongoose = require('mongoose');
const Portfolio = require('../../models/portfolio');
const Asset = require('../../models/asset');
const Transaction = require('../../models/transaction');
const { calculatePositions } = require('../transaction/positionCalculator');
const { visibleQuery } = require('../transaction/visibility');
const { toStorageSymbol, marketFromSuffix, normalizeSymbol } = require('../../utils/symbol');
const {
  IMPORT_FORMATS,
  IMPORT_COMMIT_LIMIT,
  IMPORT_PREVIEW_LIMIT
} = require('../../constants/import.constants');
const standardCsv = require('./standardCsv');
const sourceAccounts = require('./sourceAccount.service');
const { runAtomicCommit } = require('./commit');
const { matchRows, applyResolutions } = require('./matching');

function businessError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

// 格式 → 解析器。解析器契约：(text, { mapping, defaultTimeZone }) → { headers, mapping, rows }。
const PARSERS = {
  standard: standardCsv.parseStandardCsv
};

function decodeFile(file) {
  if (!file || typeof file !== 'object' || typeof file.content !== 'string') {
    throw businessError(400, 'INVALID_IMPORT_FILE', 'file.content must be a string');
  }
  const encoding = file.encoding || 'text';
  if (!['text', 'base64'].includes(encoding)) throw businessError(400, 'INVALID_IMPORT_FILE', 'file.encoding must be text or base64');
  const text = encoding === 'base64' ? Buffer.from(file.content, 'base64').toString('utf8') : file.content;
  const name = file.name === undefined ? '' : String(file.name).slice(0, 255);
  return { text, name };
}

function rowError(row, code, reason) {
  row.disposition = 'error';
  row.code = code;
  row.reason = reason;
}

async function resolveAssets(rows) {
  const storageSymbols = new Set();
  for (const row of rows) {
    if (row.disposition !== 'pending') continue;
    const { rawSymbol, market } = row.candidate;
    const effectiveMarket = market || marketFromSuffix(rawSymbol);
    if (!effectiveMarket) {
      rowError(row, 'MARKET_REQUIRED', `标的 ${rawSymbol} 无市场后缀，需填写 market`);
      continue;
    }
    if (market && marketFromSuffix(rawSymbol) && marketFromSuffix(rawSymbol) !== market) {
      rowError(row, 'MARKET_MISMATCH', `标的 ${rawSymbol} 的后缀与 market=${market} 不一致`);
      continue;
    }
    row.candidate.symbol = toStorageSymbol(normalizeSymbol(rawSymbol), effectiveMarket);
    storageSymbols.add(row.candidate.symbol);
  }
  const assets = storageSymbols.size
    ? await Asset.find({ symbol: { $in: [...storageSymbols] } }).lean()
    : [];
  const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));
  for (const row of rows) {
    if (row.disposition !== 'pending') continue;
    const asset = bySymbol.get(row.candidate.symbol);
    if (!asset) { rowError(row, 'ASSET_NOT_FOUND', `资产 ${row.candidate.symbol} 不存在，请先在资产管理中添加`); continue; }
    if (!asset.active) { rowError(row, 'ASSET_INACTIVE', `资产 ${row.candidate.symbol} 已停用`); continue; }
    if (asset.currency !== row.candidate.cashCurrency) {
      rowError(row, 'CURRENCY_MISMATCH', `成交币种 ${row.candidate.cashCurrency} 与资产币种 ${asset.currency} 不一致（跨币种成交暂不支持）`);
      continue;
    }
    row.asset = { type: asset.type, market: asset.market, currency: asset.currency };
  }
}

function rawHashOf(candidate) {
  return sha256([
    candidate.action, candidate.symbol, new Date(candidate.date).toISOString(), candidate.dateKind,
    candidate.quantity, candidate.price, candidate.fee, candidate.cashAmount, candidate.cashCurrency,
    candidate.externalId
  ]);
}

// 佣金未知：需用户补值（fee）或明确按零（confirmZeroFee）。决议后成为 user / confirmed_zero。
function applyFeeResolution(row, resolution) {
  if (row.candidate.fee !== null) return;
  if (resolution && resolution.confirmZeroFee === true) {
    row.candidate.fee = 0;
    row.candidate.feeSource = 'confirmed_zero';
    return;
  }
  if (resolution && resolution.fee !== undefined) {
    const fee = Number(resolution.fee);
    if (Number.isFinite(fee) && fee >= 0) {
      row.candidate.fee = fee;
      row.candidate.feeSource = 'user';
      return;
    }
  }
  row.disposition = 'review';
  row.code = 'FEE_UNKNOWN';
  row.reason = '佣金缺失且无法由现金净额推导：请补填佣金或确认按 0 处理';
  row.options = ['fee', 'confirmZeroFee', 'skip'];
}

// 超卖校验：按标的把新增 / 更新行逐条（时间正序）并入现有账本重放；失败行标错并剔除，继续校验后续行。
// 更新行（#95）以新值替换目标旧流水（沿用其 _id 以保持同刻排序）；标的被更正时同时校验旧标的移除后的账本。
async function validateLedger(rows, portfolioId) {
  const writes = rows.filter(row => row.disposition === 'add' || row.disposition === 'update');
  const symbols = [...new Set(writes.flatMap(row => (row.disposition === 'update'
    ? [row.candidate.symbol, row.target.symbol]
    : [row.candidate.symbol])))];
  const ledger = symbols.length
    ? await Transaction.find(visibleQuery({ portfolioId, symbol: { $in: symbols } })).lean()
    : [];
  for (const symbol of symbols) {
    let accepted = ledger.filter(tx => tx.symbol === symbol);
    const pendingRows = writes.filter(row => row.candidate.symbol === symbol || (row.disposition === 'update' && row.target.symbol === symbol))
      .sort((left, right) => new Date(left.candidate.date) - new Date(right.candidate.date) || left.sequence - right.sequence);
    for (const row of pendingRows) {
      if (row.disposition === 'error') continue;
      const probe = {
        ...row.candidate,
        ...row.asset,
        // 同一时刻：现有流水在前，新行按原行顺序（_id 以 ~ 开头排在 ObjectId 之后）
        _id: row.disposition === 'update' ? row.target._id : `~${String(row.sequence).padStart(6, '0')}`
      };
      const next = row.disposition === 'update'
        ? accepted.filter(tx => String(tx._id) !== String(row.target._id))
        : [...accepted];
      if (row.candidate.symbol === symbol) next.push(probe);
      try {
        calculatePositions(next);
        accepted = next;
      } catch (error) {
        if (error.code !== 'INSUFFICIENT_POSITION') throw error;
        rowError(row, 'INSUFFICIENT_POSITION', `${row.disposition === 'update' ? '更新后' : ''}卖出数量超过 ${symbol} 当时的可用持仓`);
      }
    }
  }
  return ledger;
}

// 拆批：按来源流水行计数，pair_group 相同的行留在同一批。
function planBatches(rows) {
  const writable = rows.filter(row => row.disposition === 'add' || row.disposition === 'update');
  const groups = [];
  const byPair = new Map();
  for (const row of writable) {
    const key = row.candidate.pairGroup;
    if (key && byPair.has(key)) { byPair.get(key).push(row); continue; }
    const group = [row];
    if (key) byPair.set(key, group);
    groups.push(group);
  }
  const batches = [];
  let current = [];
  for (const group of groups) {
    if (current.length + group.length > IMPORT_COMMIT_LIMIT && current.length) {
      batches.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) batches.push(current);
  return batches.map((batch, index) => ({
    index,
    count: batch.length,
    rowKeys: batch.map(row => row.rowKey),
    firstRowNumber: batch[0].rowNumber,
    lastRowNumber: batch.at(-1).rowNumber
  }));
}

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
    symbol: c.symbol || c.rawSymbol,
    date: c.date,
    dateKind: c.dateKind,
    timeZone: c.timeZone,
    settlementDate: c.settlementDate,
    quantity: c.quantity,
    price: c.price,
    grossAmount: c.grossAmount,
    fee: c.fee,
    feeSource: c.feeSource,
    cashAmount: c.cashAmount,
    cashCurrency: c.cashCurrency,
    externalId: c.externalId,
    pairGroup: c.pairGroup,
    notes: c.notes
  };
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw businessError(400, 'INVALID_BODY', 'request body must be an object');
  }
  if (!mongoose.Types.ObjectId.isValid(input.portfolioId)) {
    throw businessError(400, 'INVALID_PORTFOLIO_ID', 'Invalid or missing portfolioId');
  }
  const format = input.format || 'standard';
  if (!IMPORT_FORMATS.includes(format)) {
    throw businessError(400, 'UNSUPPORTED_FORMAT', `format must be one of: ${IMPORT_FORMATS.join(', ')}`);
  }
  if (input.resolutions !== undefined && (typeof input.resolutions !== 'object' || Array.isArray(input.resolutions) || input.resolutions === null)) {
    throw businessError(400, 'INVALID_RESOLUTIONS', 'resolutions must be an object keyed by rowKey');
  }
  if (input.timeZone !== undefined && input.timeZone !== null && input.timeZone !== '') {
    try { new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone }).format(); } catch {
      throw businessError(400, 'INVALID_TIME_ZONE', 'timeZone must be a valid IANA time zone');
    }
  }
  return format;
}

/**
 * 计算完整预览（只读，不写库）。返回内部结构，previewImport / commitImport 共用。
 */
async function computePreview(input) {
  const format = validateInput(input);
  const { portfolioId } = input;
  const portfolio = await Portfolio.findById(portfolioId).lean();
  if (!portfolio) throw businessError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found');

  const file = decodeFile(input.file);
  const parser = PARSERS[format];
  const parsedProbe = parser(file.text, { defaultTimeZone: input.timeZone || undefined });
  if (parsedProbe.headers.length === 0) throw businessError(400, 'EMPTY_IMPORT_FILE', '文件为空或缺少表头');
  const mappingError = standardCsv.validateMapping(input.mapping, parsedProbe.headers.length);
  if (mappingError) throw businessError(400, 'INVALID_MAPPING', mappingError);
  const parsed = input.mapping ? parser(file.text, { mapping: input.mapping, defaultTimeZone: input.timeZone || undefined }) : parsedProbe;
  if (parsed.rows.length === 0) throw businessError(400, 'EMPTY_IMPORT_FILE', '文件没有数据行');
  if (parsed.rows.length > IMPORT_PREVIEW_LIMIT) {
    throw businessError(413, 'IMPORT_FILE_TOO_LARGE', `单个文件最多 ${IMPORT_PREVIEW_LIMIT} 行`);
  }
  const mappedColumns = new Set(Object.values(parsed.mapping));
  const missingColumns = ['activity_type', 'trade_date', 'symbol', 'quantity', 'unit_price', 'cash_currency']
    .filter(key => !mappedColumns.has(key));

  const resolutions = input.resolutions || {};
  const rows = parsed.rows.map((row, index) => ({
    ...row,
    sequence: index,
    disposition: row.error ? 'error' : 'pending',
    code: row.error?.code,
    reason: row.error?.reason
  }));

  // 多账户报表按账户拆分：按账号分组，用户选择一个账户（accountSelector = 末 4 位 + 哈希前缀）。
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
      if (row.disposition === 'pending' && !row.candidate.accountNumber) rowError(row, 'MISSING_FIELD', '同一文件中其他行有账号，此行缺少账号（account_number）');
    }
  }
  for (const row of rows) {
    if (row.disposition === 'pending' && selectedAccount && row.accountSelector !== selectedAccount.selector) {
      row.disposition = 'skip';
      row.code = 'OTHER_SOURCE_ACCOUNT';
      row.reason = `属于账户 …${accountGroups.get(row.accountSelector).accountKeyLast4}，请另行选择该账户导入`;
    }
    if (row.disposition === 'pending' && requiresAccountSelection) {
      row.disposition = 'skip';
      row.code = 'ACCOUNT_NOT_SELECTED';
      row.reason = '多账户报表：请先选择要导入的来源账户';
    }
  }

  const resolvedSource = await sourceAccounts.resolveSourceAccount(input.sourceAccount, {
    fileAccountNumber: selectedAccount?.number
  });
  const sourceAccountId = resolvedSource.existing?._id || null;

  await resolveAssets(rows);
  for (const row of rows) {
    if (row.disposition !== 'pending') continue;
    const resolution = resolutions[row.rowKey];
    applyFeeResolution(row, resolution);
    if (row.disposition === 'pending') row.rawHash = rawHashOf(row.candidate);
  }
  for (const row of rows) {
    if (row.disposition === 'review' && row.code === 'FEE_UNKNOWN') row.rawHash = rawHashOf({ ...row.candidate, fee: null });
  }
  const matchedIds = await matchRows(rows, { portfolioId, sourceAccountId });

  for (const row of rows) {
    if (row.disposition === 'pending') row.disposition = 'add';
  }
  // 用户对 review 行的显式决议：skip / add / update（#95）
  applyResolutions(rows, resolutions);
  const ledger = await validateLedger(rows, portfolioId);

  const counts = { add: 0, update: 0, skip: 0, review: 0, error: 0, total: rows.length };
  for (const row of rows) counts[row.disposition] += 1;
  const blockingReasons = [];
  if (missingColumns.length) blockingReasons.push({ code: 'MISSING_COLUMNS', reason: `未映射必需列：${missingColumns.join(', ')}` });
  if (requiresAccountSelection) blockingReasons.push({ code: 'ACCOUNT_SELECTION_REQUIRED', reason: '报表包含多个账户，请选择一个来源账户' });
  if (counts.error) blockingReasons.push({ code: 'ROW_ERRORS', reason: `${counts.error} 行存在错误` });
  if (counts.review) blockingReasons.push({ code: 'UNRESOLVED_REVIEW', reason: `${counts.review} 行待核对` });
  const batches = planBatches(rows);
  if (!blockingReasons.length && counts.add + counts.update === 0) {
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
    rows: rows.map(row => [row.rowKey, row.disposition, row.code || null, row.rawHash || null, row.candidate?.notes || null, row.targetId || null])
  });
  const ledgerFingerprint = ledgerFingerprintOf({ portfolioId, sourceAccountId, ledger, matchedIds });

  return {
    format,
    file,
    portfolio,
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
    requiresAccountSelection
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
      candidate: publicCandidate(row)
    })),
    counts: preview.counts,
    blocking: preview.blocking,
    blockingReasons: preview.blockingReasons,
    commitLimit: IMPORT_COMMIT_LIMIT,
    batches: preview.batches.map(({ index, count, firstRowNumber, lastRowNumber }) => ({ index, count, firstRowNumber, lastRowNumber })),
    requiresSplit: preview.batches.length > 1
  };
}

async function previewImport(input) {
  return toPreviewResponse(await computePreview(input));
}

// 新增与更新共用的导入字段（来源追溯 + 规范化成交值）。
function importedFields(preview, row, { sourceAccountId, importBatchId }) {
  const c = row.candidate;
  return {
    symbol: c.symbol,
    assetType: row.asset.type,
    market: row.asset.market,
    currency: row.asset.currency,
    action: c.action,
    quantity: c.quantity,
    price: c.price,
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
    settlementDate: c.settlementDate || undefined,
    cashAmount: c.cashAmount ?? undefined,
    cashCurrency: c.cashCurrency,
    cashAmountSource: c.cashAmountSource || undefined,
    feeSource: c.feeSource,
    grossAmount: c.grossAmount,
    pairGroupId: c.pairGroup || undefined,
    sequence: row.sequence
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
  return runAtomicCommit({
    portfolioId: input.portfolioId,
    async prepare() {
      const preview = await computePreview(input);
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
      return rows.map(row => ({
        rowKey: row.rowKey,
        doc: {
          portfolioId: input.portfolioId,
          ...importedFields(preview, row, ctx),
          notes: row.candidate.notes || undefined,
          status: 'pending'
        }
      }));
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
      const writtenByKey = new Map(written.map(item => [item.rowKey, String(item.transactionId)]));
      const rows = preview.rows.map(row => {
        const inBatch = batch.has(row.rowKey);
        const disposition = inBatch || !['add', 'update'].includes(row.disposition) ? row.disposition : 'deferred';
        return {
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
        added: written.filter(item => item.kind !== 'update').length,
        updated: written.filter(item => item.kind === 'update').length,
        skipped: preview.counts.skip,
        review: 0,
        deferred,
        remainingBatches: Math.max(preview.batches.length - 1, 0),
        rows
      };
    }
  });
}

function describeStandardFormat() {
  return {
    columns: standardCsv.STANDARD_COLUMNS,
    activityTypes: Object.entries(standardCsv.ACTIVITY_RULES).map(([type, rule]) => ({
      type,
      supported: rule.supported,
      required: rule.required || []
    })),
    commitLimit: IMPORT_COMMIT_LIMIT,
    previewLimit: IMPORT_PREVIEW_LIMIT
  };
}

module.exports = {
  buildTemplate: standardCsv.buildTemplate,
  describeStandardFormat,
  previewImport,
  commitImport
};
