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
const {
  calculatePositions,
  compareTransactions,
  replayLedger,
  replayDayKey,
  PREVIEW_BATCH_KEY
} = require('../transaction/positionCalculator');
const { visibleQuery } = require('../transaction/visibility');
const { toStorageSymbol, marketFromSuffix, normalizeSymbol } = require('../../utils/symbol');
const { isCashAction } = require('../../constants/transaction.constants');
const {
  IMPORT_FORMATS,
  IMPORT_COMMIT_LIMIT,
  IMPORT_PREVIEW_LIMIT,
  IMPORT_TIME_ZONE_CHOICES
} = require('../../constants/import.constants');
const standardCsv = require('./standardCsv');
const wealthsimpleCsv = require('./wealthsimpleCsv');
const sourceAccounts = require('./sourceAccount.service');
const { runAtomicCommit } = require('./commit');
const { matchRows, applyResolutions } = require('./matching');
const { pairRows, enforcePairIntegrity } = require('./pairing');
const { FX_PAIR_SPEC } = require('./fxPairSpec');

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

// 格式 → 解析器。解析器契约：(text, { mapping, defaultTimeZone }) → { headers, mapping, rows, missingColumns? }。
// rows 必须按时间正序（旧 → 新）输出（#96：sequence 即同时刻重放顺序）。
// 原格式解析器（非 standard）自带列识别，不接受手动列映射，并自行报告缺失的原报表列（missingColumns）。
const PARSERS = {
  standard: standardCsv.parseStandardCsv,
  wealthsimple: wealthsimpleCsv.parseWealthsimpleCsv
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
    // 无标的的现金流水（利息、划转、独立费用等）：不解析资产，币种即现金币种
    if (!rawSymbol && row.candidate.kind === 'cash') {
      row.candidate.symbol = null;
      row.asset = null;
      continue;
    }
    // 原格式报表的裸代码（无后缀、无市场列，#100）：在候选市场的已有资产中唯一解析，见下方
    if (!market && !marketFromSuffix(rawSymbol) && row.candidate.marketCandidates) {
      row.candidate.symbolOptions = row.candidate.marketCandidates
        .map(candidateMarket => toStorageSymbol(normalizeSymbol(rawSymbol), candidateMarket));
      row.candidate.symbolOptions.forEach(symbol => storageSymbols.add(symbol));
      continue;
    }
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
    if (row.disposition !== 'pending' || !row.candidate.symbolOptions) continue;
    const found = row.candidate.symbolOptions.filter(symbol => bySymbol.has(symbol));
    if (found.length === 1) { row.candidate.symbol = found[0]; continue; }
    if (found.length > 1) {
      rowError(row, 'MARKET_AMBIGUOUS', `标的 ${row.candidate.rawSymbol} 在多个市场都有资产（${found.join(' / ')}），报表无法区分`);
    } else {
      rowError(row, 'ASSET_NOT_FOUND', `资产 ${row.candidate.symbolOptions.join(' 或 ')} 不存在，请先在资产管理中添加`);
    }
  }
  for (const row of rows) {
    if (row.disposition !== 'pending' || !row.candidate.symbol) continue;
    const asset = bySymbol.get(row.candidate.symbol);
    if (!asset) { rowError(row, 'ASSET_NOT_FOUND', `资产 ${row.candidate.symbol} 不存在，请先在资产管理中添加`); continue; }
    if (!asset.active) { rowError(row, 'ASSET_INACTIVE', `资产 ${row.candidate.symbol} 已停用`); continue; }
    // 现金类流水保留实际现金币种（可与资产币种不同，如美股分红以 CAD 入账）；
    // 影响持仓成本的跨币种成交：报表给出汇率时（#100 Wealthsimple 描述中的 FX Rate）把单价 / 佣金换回资产币种，
    // 现金净额仍为现金币种；报表没有汇率则不猜，报错。
    // 拆股行（TASK-098）可不填币种；填写时须与资产币种一致（拆股不做汇率换算）。
    if (row.candidate.kind !== 'cash' && (row.candidate.action !== 'split' || row.candidate.cashCurrency) &&
        asset.currency !== row.candidate.cashCurrency) {
      if (!row.candidate.reportFxRate || row.candidate.action === 'split') {
        rowError(row, 'CURRENCY_MISMATCH', `成交币种 ${row.candidate.cashCurrency} 与资产币种 ${asset.currency} 不一致，且报表未给出汇率（跨币种成交需要报表汇率）`);
        continue;
      }
      standardCsv.convertTradeToAssetCurrency(row.candidate, row.candidate.reportFxRate);
    }
    row.asset = { type: asset.type, market: asset.market, currency: asset.currency };
  }
}

function rawHashOf(candidate) {
  return sha256([
    candidate.action, candidate.symbol, new Date(candidate.date).toISOString(), candidate.dateKind,
    candidate.quantity, candidate.price, candidate.fee, candidate.cashAmount, candidate.cashCurrency,
    candidate.externalId, candidate.splitRatio ?? null
  ]);
}

// 佣金确定（券商 / 推算 / 补值 / 确认按零）后，缺券商净额的成交行按数量 × 单价 ± 佣金推算净额。
function applyCashDerivation(row) {
  standardCsv.deriveCashAmount(row.candidate);
  row.candidate.cashDifference = standardCsv.cashDifferenceOf(row.candidate);
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

const ORDER_CHOICES = ['before', 'after'];
// 重放中可归因到具体行的账本错误：超卖（#94）与拆股前提不成立（#98）
const SPLIT_ERRORS = ['SPLIT_NO_POSITION', 'SPLIT_RATIO_CONFLICT'];
const LEDGER_ERRORS = ['INSUFFICIENT_POSITION', ...SPLIT_ERRORS];
const STATE_EPSILON = 1e-9;

function probeOf(row) {
  // 同一时刻：预览行排在全部已入账流水之后（与确认后「本批次最新」一致），批内按原行顺序
  return {
    ...row.candidate,
    ...row.asset,
    sequence: row.sequence,
    orderRank: row.orderRank,
    source: { importBatchId: PREVIEW_BATCH_KEY },
    _id: `~${String(row.sequence).padStart(6, '0')}`
  };
}

// 单个情景的结果：全账本是否超卖 + 当日收盘时该标的的数量 / 剩余成本 / 已实现盈亏。
function outcomeOf(transactions, symbol, day) {
  const attempt = list => {
    try {
      const position = replayLedger(list).get(symbol) || { quantity: 0, remainingCost: 0, realizedPnl: 0 };
      return { quantity: position.quantity, remainingCost: position.remainingCost, realizedPnl: position.realizedPnl };
    } catch (error) {
      if (!LEDGER_ERRORS.includes(error.code)) throw error;
      return { error: error.code };
    }
  };
  return {
    full: attempt(transactions).error || null,
    day: attempt(transactions.filter(tx => replayDayKey(tx.date) <= day))
  };
}

function sameOutcome(left, right) {
  if (left.full !== right.full) return false;
  if (left.day.error || right.day.error) return left.day.error === right.day.error;
  return ['quantity', 'remainingCost', 'realizedPnl']
    .every(key => Math.abs(left.day[key] - right.day[key]) < STATE_EPSILON);
}

/**
 * 同日顺序核对（TASK-096 / AC-11）。对每个标的、每个 UTC 交易日：
 * - 有已入账流水且新旧之间存在非「双方都带时刻」的组合 → 新行整体相对已入账流水的先后不确定（跨报表）；
 * - 只有新行且同日混合带时刻与仅日期 → 仅日期行相对带时刻行的先后不确定（混合精度）。
 * 同报表仅日期的同日成交按原行顺序（sequence），不视为不确定。
 * 不确定且「之前 / 之后」两种顺序的超卖、剩余成本或已实现盈亏结果不同 → 行标 review ORDER_AMBIGUOUS，
 * 用户以 resolutions[rowKey].order = 'before' | 'after' 确认；确认结果写入 orderRank 持久化，
 * 预览、确认后重放与后续编辑共用 compareTransactions，保证顺序一致。
 */
function checkSameDayOrder(symbol, existing, newRows, resolutions) {
  const days = [...new Set(newRows.map(row => replayDayKey(row.candidate.date)))].sort();
  for (const day of days) {
    const dayNew = newRows.filter(row => replayDayKey(row.candidate.date) === day);
    const dayExisting = existing.filter(tx => replayDayKey(tx.date) === day);
    let floating = [];
    let anchors = [];
    if (dayExisting.length) {
      const allTimed = dayExisting.every(tx => tx.dateKind === 'datetime') &&
        dayNew.every(row => row.candidate.dateKind === 'datetime');
      if (!allTimed) { floating = dayNew; anchors = dayExisting; }
    } else {
      const dateOnly = dayNew.filter(row => row.candidate.dateKind !== 'datetime');
      const timed = dayNew.filter(row => row.candidate.dateKind === 'datetime');
      if (dateOnly.length && timed.length) { floating = dateOnly; anchors = timed.map(probeOf); }
    }
    if (!floating.length) continue;

    const anchorRanks = anchors.map(item => Number(item.orderRank) || 0);
    const rankFor = choice => (choice === 'before' ? Math.min(...anchorRanks) - 1 : Math.max(...anchorRanks) + 1);
    const answers = [...new Set(floating.map(row => resolutions[row.rowKey]?.order).filter(Boolean))];
    if (answers.length === 1 && ORDER_CHOICES.includes(answers[0])) {
      for (const row of floating) { row.orderRank = rankFor(answers[0]); row.orderResolved = answers[0]; }
      continue;
    }

    const scenario = choice => {
      const floatingKeys = new Set(floating.map(row => row.rowKey));
      const probes = newRows.map(row => (floatingKeys.has(row.rowKey) ? { ...probeOf(row), orderRank: rankFor(choice) } : probeOf(row)));
      return outcomeOf([...existing, ...probes], symbol, day);
    };
    if (sameOutcome(scenario('before'), scenario('after'))) continue;

    const conflict = {
      day,
      kind: dayExisting.length ? 'cross_report' : 'mixed_precision',
      existing: dayExisting.map(tx => ({
        id: String(tx._id), action: tx.action, quantity: tx.quantity, price: tx.price,
        date: tx.date, dateKind: tx.dateKind || null
      })),
      rowKeys: floating.map(row => row.rowKey)
    };
    for (const row of floating) {
      row.disposition = 'review';
      row.code = 'ORDER_AMBIGUOUS';
      row.reason = answers.length > 1
        ? '同日顺序决议不一致：请对本组各行选择同一顺序'
        : (dayExisting.length
          ? `${day} 已有其他报表或手动录入的同日流水，顺序不同会改变超卖、持仓成本或已实现盈亏：请确认本报表这些成交发生在已有流水之前还是之后`
          : `${day} 同时有带时刻与仅日期的成交，顺序不同会改变超卖、持仓成本或已实现盈亏：请确认仅日期成交发生在带时刻成交之前还是之后`);
      row.options = ['order', 'skip'];
      row.orderConflict = conflict;
      if (resolutions[row.rowKey]?.action === 'skip') {
        row.disposition = 'skip';
        row.resolved = true;
      }
    }
  }
}

// 超卖校验：按标的先核对同日顺序（新增行），再把新增 / 更新行按重放顺序逐条并入现有账本；失败行标错并剔除，继续校验后续行。
// 更新行（#95）以新值替换目标旧流水；标的被更正时同时校验旧标的移除后的账本。
// 更新写入后归属本次导入批次并带新 sequence（importedFields），预览探针与之一致；同一交易日内沿用目标已确认的 orderRank。
async function validateLedger(rows, portfolioId, resolutions = {}) {
  // 现金类流水（TASK-097）不影响持仓，不参与同日顺序核对与超卖重放
  const writes = rows.filter(row => (row.disposition === 'add' || row.disposition === 'update') && !isCashAction(row.candidate.action));
  const symbols = [...new Set(writes.flatMap(row => (row.disposition === 'update'
    ? [row.candidate.symbol, row.target.symbol]
    : [row.candidate.symbol])))];
  const ledger = symbols.length
    ? await Transaction.find(visibleQuery({ portfolioId, symbol: { $in: symbols } })).lean()
    : [];
  for (const row of writes) {
    if (row.disposition === 'update' && replayDayKey(row.target.date) === replayDayKey(row.candidate.date)) {
      row.orderRank = row.target.orderRank;
    }
  }
  for (const symbol of symbols) {
    const existing = ledger.filter(tx => tx.symbol === symbol);
    const addRows = writes.filter(row => row.disposition === 'add' && row.candidate.symbol === symbol);
    // 更新行替换的目标不作为同日顺序的锚点
    const updatedIds = new Set(writes.filter(row => row.disposition === 'update').map(row => String(row.target._id)));
    checkSameDayOrder(symbol, existing.filter(tx => !updatedIds.has(String(tx._id))), addRows, resolutions);

    let accepted = [...existing];
    const ordered = writes
      .filter(row => row.candidate.symbol === symbol || (row.disposition === 'update' && row.target.symbol === symbol))
      .map(row => ({ row, probe: row.disposition === 'update' ? { ...probeOf(row), _id: row.target._id } : probeOf(row) }))
      .sort((left, right) => compareTransactions(left.probe, right.probe));
    for (const { row, probe } of ordered) {
      if (row.disposition === 'error' || row.disposition === 'skip') continue;
      const next = row.disposition === 'update'
        ? accepted.filter(tx => String(tx._id) !== String(row.target._id))
        : [...accepted];
      if (row.candidate.symbol === symbol) next.push(probe);
      try {
        calculatePositions(next);
        accepted = next;
        if (row.candidate.action === 'split' && row.candidate.symbol === symbol) row.splitEffect = splitEffectOf(accepted, probe, symbol);
      } catch (error) {
        if (!LEDGER_ERRORS.includes(error.code)) throw error;
        // 顺序待确认的行：超卖与否取决于用户确认的顺序，保持 review，不另报错
        if (row.disposition === 'review') continue;
        if (SPLIT_ERRORS.includes(error.code) && row.candidate.action === 'split' && row.candidate.symbol === symbol) {
          // TASK-098：拆股前提不成立（无拆股前持仓 / 比例与份额变动冲突）→ 暂停入账等待核对，只可跳过或修正文件后重新预览
          holdSplit(row, error, resolutions);
          continue;
        }
        if (SPLIT_ERRORS.includes(error.code)) {
          rowError(row, error.code, `写入此行会使之后的拆股失去依据：${error.message}`);
          continue;
        }
        rowError(row, 'INSUFFICIENT_POSITION', `${row.disposition === 'update' ? '更新后' : ''}卖出数量超过 ${symbol} 当时的可用持仓`);
      }
    }
  }
  return { ledger, positionsAfter: positionsAfterOf(ledger, rows, symbols) };
}

function holdSplit(row, error, resolutions) {
  row.disposition = 'review';
  row.code = error.code;
  row.reason = error.code === 'SPLIT_NO_POSITION'
    ? `${error.message}：请核对是否缺少更早的买入或划转流水，补齐后重新预览，或跳过此行`
    : `${error.message}：请核对拆股比例与份额变动，修正后重新预览，或跳过此行`;
  row.options = ['skip'];
  if (resolutions[row.rowKey]?.action === 'skip') {
    row.disposition = 'skip';
    row.resolved = true;
  }
}

// 拆股前后对照（预览展示）：拆股前份额 / 单位成本 → 拆股后份额 / 单位成本，总成本不变。
function splitEffectOf(accepted, probe, symbol) {
  const before = replayLedger(accepted.filter(tx => tx !== probe && compareTransactions(tx, probe) < 0)).get(symbol);
  const after = replayLedger(accepted.filter(tx => tx === probe || compareTransactions(tx, probe) < 0)).get(symbol);
  return {
    quantityBefore: before.quantity,
    quantityAfter: after.quantity,
    remainingCost: after.remainingCost,
    avgCostBefore: before.remainingCost / before.quantity,
    avgCostAfter: after.remainingCost / after.quantity
  };
}

/**
 * 确认后的持仓结果预演（TASK-098 / AC-07）：现有账本 + 本次新增 / 更新行按同一重放规则计算，
 * 与确认后持仓回读口径一致。仅含本次涉及的标的（已清仓的也列出，便于核对已实现盈亏）；无法重放时为 null。
 */
function positionsAfterOf(ledger, rows, symbols) {
  const writes = rows.filter(row => row.disposition === 'add' || row.disposition === 'update');
  const replaced = new Set(writes.filter(row => row.disposition === 'update').map(row => String(row.target._id)));
  const list = [
    ...ledger.filter(tx => !replaced.has(String(tx._id))),
    ...writes.map(row => (row.disposition === 'update' ? { ...probeOf(row), _id: row.target._id } : probeOf(row)))
  ];
  let positions;
  try {
    positions = replayLedger(list);
  } catch (error) {
    if (!LEDGER_ERRORS.includes(error.code)) throw error;
    return null;
  }
  return symbols.filter(symbol => positions.has(symbol)).map(symbol => {
    const position = positions.get(symbol);
    return {
      symbol,
      currency: position.currency,
      quantity: position.quantity,
      remainingCost: position.remainingCost,
      avgCost: position.quantity > STATE_EPSILON ? position.remainingCost / position.quantity : null,
      realizedPnl: position.realizedPnl
    };
  });
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
    kind: c.kind,
    symbol: c.symbol || c.rawSymbol || null,
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
  // TASK-096：页面确认的时区只允许北京 / 多伦多（报表自带 time_zone 列不受此限制）
  if (input.timeZone !== undefined && input.timeZone !== null && input.timeZone !== '' &&
      !IMPORT_TIME_ZONE_CHOICES.includes(input.timeZone)) {
    throw businessError(400, 'INVALID_TIME_ZONE', `timeZone must be one of: ${IMPORT_TIME_ZONE_CHOICES.join(', ')}`);
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
  if (format !== 'standard' && input.mapping && Object.keys(input.mapping).length) {
    throw businessError(400, 'INVALID_MAPPING', `format ${format} does not accept a column mapping`);
  }
  const mappingError = format === 'standard' ? standardCsv.validateMapping(input.mapping, parsedProbe.headers.length) : null;
  if (mappingError) throw businessError(400, 'INVALID_MAPPING', mappingError);
  const parsed = input.mapping && format === 'standard' ? parser(file.text, { mapping: input.mapping, defaultTimeZone: input.timeZone || undefined }) : parsedProbe;
  if (parsed.rows.length === 0) throw businessError(400, 'EMPTY_IMPORT_FILE', '文件没有数据行');
  if (parsed.rows.length > IMPORT_PREVIEW_LIMIT) {
    throw businessError(413, 'IMPORT_FILE_TOO_LARGE', `单个文件最多 ${IMPORT_PREVIEW_LIMIT} 行`);
  }
  const mappedColumns = new Set(Object.values(parsed.mapping));
  // 标的 / 数量 / 单价 / 金额按活动类型逐行校验（现金类文件可以没有数量单价列）
  const missingColumns = parsed.missingColumns || ['activity_type', 'trade_date', 'cash_currency']
    .filter(key => !mappedColumns.has(key));

  const resolutions = input.resolutions || {};
  const rows = parsed.rows.map((row, index) => ({
    ...row,
    sequence: index,
    disposition: row.error ? 'error' : 'pending',
    code: row.error?.code,
    reason: row.error?.reason
  }));

  // TASK-096：报表有成交时间但无时区 → 待用户确认北京 / 多伦多时区（文件级 timeZone），确认前不猜时刻。
  for (const row of rows) {
    if (row.disposition !== 'pending' || !row.candidate.needsTimeZone) continue;
    row.disposition = 'review';
    row.code = 'TIME_ZONE_UNCONFIRMED';
    row.reason = '报表有成交时间但没有时区：请确认按北京或多伦多时间解读';
    row.options = ['timeZone', 'skip'];
  }
  const requiresTimeZone = rows.some(row => row.code === 'TIME_ZONE_UNCONFIRMED');

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
    if (row.disposition === 'pending') {
      applyCashDerivation(row);
      row.rawHash = rawHashOf(row.candidate);
    }
  }
  for (const row of rows) {
    if (row.disposition === 'review' && row.code === 'FEE_UNKNOWN') row.rawHash = rawHashOf({ ...row.candidate, fee: null });
  }
  // TASK-101：换汇两端配对（显式组号 / 用户指定 / 同账户同日唯一建议）；未配对端进入待核对
  pairRows(rows, FX_PAIR_SPEC, resolutions);
  const matchedIds = await matchRows(rows, { portfolioId, sourceAccountId });

  for (const row of rows) {
    if (row.disposition === 'pending') row.disposition = 'add';
  }
  // 用户对 review 行的显式决议：skip / add / update（#95）；同日顺序决议在 validateLedger 内处理（#96）
  applyResolutions(rows, resolutions);
  const { ledger, positionsAfter } = await validateLedger(rows, portfolioId, resolutions);
  // 两端要么都写入、要么都不写入
  enforcePairIntegrity(rows, FX_PAIR_SPEC, resolutions);

  const counts = { add: 0, update: 0, skip: 0, review: 0, error: 0, total: rows.length };
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
    rows: rows.map(row => [row.rowKey, row.disposition, row.code || null, row.rawHash || null, row.candidate?.notes || null, row.targetId || null, row.orderRank ?? null, row.pair?.groupId || null])
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
    requiresAccountSelection,
    requiresTimeZone,
    positionsAfter
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
      splitEffect: row.splitEffect || null,
      // TASK-101：成对流水的另一端与配对来源（explicit / user / suggested）；未配对时的可选另一端
      pair: row.pair || null,
      pairCandidates: row.pairCandidates || [],
      candidate: publicCandidate(row)
    })),
    positionsAfter: preview.positionsAfter,
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
