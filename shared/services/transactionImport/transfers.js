// 跨账户及跨组合证券划转（TASK-099 / Spec #93 AC-07、AC-09、AC-10）。
//
// Human 决定（2026-11-25）：先到的一端在服务端暂存（TransferLeg，status=staged），不进任何账本；
// 另一端在后续导入中到达时自动配对，两端在同一次确认中写入各自组合（app 级整批提交，commit.js）。
//
// 预览流程（resolveTransfers）：
// 1. 显式跳过 / 重复识别：同组合同来源账户同内容已入账 → skip ALREADY_IMPORTED；已暂存 → skip TRANSFER_ALREADY_STAGED。
// 2. 配对：候选 = 同文件反方向的划转行 + 服务端已暂存的反方向一端。
//    两端都有 pair_group → 组号一致即候选；否则数量一致且成交日相差 ≤ TRANSFER_PAIR_WINDOW_DAYS 天。
//    唯一候选 → 自动配对；多个 → review TRANSFER_PAIR_AMBIGUOUS（resolutions[rowKey].pairWith 指定）；
//    没有候选 → stage TRANSFER_AWAITING_COUNTERPART（确认时暂存，不阻塞整批）。
// 3. 核对：两端份额必须一致（TRANSFER_QUANTITY_MISMATCH）；转出端按其组合账本重放取得转出前移动平均成本
//    （持仓不足 → TRANSFER_INSUFFICIENT_POSITION）。
// 4. 承接成本（转入资产原币种）：用户补填 transferCost > 报表 transfer_cost > 同币种承接转出成本
//    > 换算依据（fxRate：1 单位转出币种折合转入币种，用户补填优先于报表）× 转出成本。
//    跨币种且成本与换算依据均缺 → review TRANSFER_COST_REQUIRED，补充其中一项后继续核对。
//    这里的换算只用于记录用户 / 报表给出的承接成本依据，不引用汇率表，不产生跨币种合计（规则 10）。
// 5. 转出端不产生买卖盈亏；转入端以 carryCost 进入移动平均成本（positionCalculator）。

const crypto = require('crypto');
const mongoose = require('mongoose');
const Transaction = require('../../models/transaction');
const TransferLeg = require('../../models/transferLeg');
const Portfolio = require('../../models/portfolio');
const SourceAccount = require('../../models/sourceAccount');
const { replayLedger, PREVIEW_BATCH_KEY } = require('../transaction/positionCalculator');
const { visibleQuery } = require('../transaction/visibility');
const { TRANSFER_PAIR_WINDOW_DAYS } = require('../../constants/import.constants');

const EPSILON = 1e-9;
const DAY_MS = 24 * 60 * 60 * 1000;

function businessError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function rowError(row, code, reason) {
  row.disposition = 'error';
  row.code = code;
  row.reason = reason;
}

function setReview(row, code, reason, options) {
  row.disposition = 'review';
  row.code = code;
  row.reason = reason;
  row.options = options;
}

const isTransferRow = row => Boolean(row.candidate?.isTransfer);

// 统一的一端视图：本文件行（kind=row）或服务端暂存的一端（kind=staged）。
function legOfRow(row, ctx) {
  const c = row.candidate;
  return {
    kind: 'row',
    id: row.rowKey,
    row,
    direction: c.direction,
    portfolioId: String(ctx.portfolioId),
    sourceAccountId: ctx.sourceAccountId ? String(ctx.sourceAccountId) : null,
    symbol: c.symbol,
    currency: row.asset.currency,
    quantity: c.quantity,
    date: c.date,
    pairGroup: c.pairGroup,
    transferCost: c.transferCost,
    transferCostCurrency: c.transferCostCurrency,
    transferFxRate: c.transferFxRate,
    sequence: row.sequence,
    rowNumber: row.rowNumber
  };
}

function legOfStaged(leg) {
  return {
    kind: 'staged',
    id: String(leg._id),
    leg,
    direction: leg.direction,
    portfolioId: String(leg.portfolioId),
    sourceAccountId: leg.sourceAccountId ? String(leg.sourceAccountId) : null,
    symbol: leg.symbol,
    currency: leg.currency,
    quantity: leg.quantity,
    date: leg.date,
    pairGroup: leg.pairGroup || null,
    transferCost: leg.transferCost ?? null,
    transferCostCurrency: leg.transferCostCurrency || null,
    transferFxRate: leg.transferFxRate ?? null,
    sequence: leg.sequence,
    rowNumber: leg.source?.rowNumber ?? null
  };
}

function compatible(left, right) {
  if (left.direction === right.direction) return false;
  if (left.pairGroup && right.pairGroup) return left.pairGroup === right.pairGroup;
  if (Math.abs(left.quantity - right.quantity) > EPSILON * Math.max(1, left.quantity)) return false;
  return Math.abs(new Date(left.date).getTime() - new Date(right.date).getTime()) <= TRANSFER_PAIR_WINDOW_DAYS * DAY_MS;
}

function legSummary(leg, names) {
  return {
    kind: leg.kind,
    id: leg.id,
    rowKey: leg.kind === 'row' ? leg.id : null,
    legId: leg.kind === 'staged' ? leg.id : null,
    direction: leg.direction,
    portfolioId: leg.portfolioId,
    portfolioName: names.portfolios.get(leg.portfolioId) || null,
    sourceAccountId: leg.sourceAccountId,
    sourceAccountAlias: leg.sourceAccountId ? names.accounts.get(leg.sourceAccountId) || null : null,
    symbol: leg.symbol,
    currency: leg.currency,
    quantity: leg.quantity,
    date: leg.date,
    rowNumber: leg.rowNumber,
    pairGroup: leg.pairGroup
  };
}

// 写入后的探针（与 index.js probeOf 一致：预览批次键排在全部已入账流水之后）。
function probeOfLeg(leg, extra = {}) {
  const base = leg.kind === 'row'
    ? { ...leg.row.candidate, ...leg.row.asset, sequence: leg.row.sequence, orderRank: leg.row.orderRank }
    : { ...leg.leg, sequence: leg.leg.sequence };
  return {
    ...base,
    portfolioId: leg.portfolioId,
    action: leg.direction === 'out' ? 'transfer_out' : 'transfer_in',
    quantity: leg.quantity,
    source: { importBatchId: PREVIEW_BATCH_KEY },
    _id: `~${leg.kind}-${leg.id}`,
    ...extra
  };
}

/** 转出端在其组合账本中的转出前移动平均成本 × 份额；持仓不足返回 error。 */
function removedCostOf(ledger, probe) {
  let removedCost = null;
  try {
    replayLedger([...ledger, probe], {
      onApply(tx, effect) { if (tx === probe) removedCost = effect.removedCost; }
    });
  } catch (error) {
    if (error.code !== 'INSUFFICIENT_POSITION') throw error;
    return { error: error.code };
  }
  return { removedCost };
}

function positiveNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : NaN;
}

/**
 * 预览阶段的划转处理。行在调用前 disposition === 'transfer'（已解析标的、算好 rawHash，未参与成交匹配）。
 * @param {object[]} rows 全部预览行（非划转行只读，用于转出成本重放）
 * @param {object} ctx { portfolioId, sourceAccountId, resolutions, probeOf }
 * @returns {{ fingerprintKeys: string[], lockPortfolioIds: string[], extraProbes: object[], partnerWrites: object[] }}
 */
async function resolveTransfers(rows, ctx) {
  const { portfolioId, sourceAccountId, resolutions = {} } = ctx;
  const transfers = rows.filter(row => row.disposition === 'transfer');
  const result = { fingerprintKeys: [], lockPortfolioIds: [], extraProbes: [], partnerWrites: [] };
  if (!transfers.length) return result;

  for (const row of transfers) {
    if (resolutions[row.rowKey]?.action === 'skip') {
      row.disposition = 'skip';
      row.code = 'TRANSFER_SKIPPED';
      row.reason = '用户选择跳过此划转行';
      row.resolved = true;
    }
  }

  const staged = await TransferLeg.find({ status: 'staged' }).lean();
  result.fingerprintKeys.push(...staged.map(leg => `leg:${leg._id}:${new Date(leg.updatedAt || 0).getTime()}`));

  // 重复识别：同组合同来源账户同内容（rawHash）已入账或已暂存
  if (sourceAccountId) {
    const hashes = transfers.filter(row => row.disposition === 'transfer').map(row => row.rawHash);
    const existing = hashes.length
      ? await Transaction.find(visibleQuery({ portfolioId, sourceAccountId, 'source.rawHash': { $in: hashes } })).lean()
      : [];
    result.fingerprintKeys.push(...existing.map(tx => `${tx._id}:${new Date(tx.updatedAt || 0).getTime()}`));
    for (const row of transfers) {
      if (row.disposition !== 'transfer') continue;
      const done = existing.find(tx => tx.action === row.candidate.action && tx.source?.rawHash === row.rawHash);
      if (done) {
        row.disposition = 'skip';
        row.code = 'ALREADY_IMPORTED';
        row.reason = '同一来源账户已入账内容一致的划转';
        row.matches = [{ id: String(done._id), portfolioId: String(done.portfolioId) }];
        continue;
      }
      const kept = staged.find(leg => String(leg.portfolioId) === String(portfolioId) &&
        String(leg.sourceAccountId) === String(sourceAccountId) && leg.source?.rawHash === row.rawHash);
      if (kept) {
        row.disposition = 'skip';
        row.code = 'TRANSFER_ALREADY_STAGED';
        row.reason = '该划转一端已暂存待核对，等待另一端到达';
        row.transfer = { direction: row.candidate.direction, stagedLegId: String(kept._id) };
      }
    }
  }

  const active = transfers.filter(row => row.disposition === 'transfer');
  const rowLegs = new Map(active.map(row => [row.rowKey, legOfRow(row, ctx)]));
  const stagedLegs = staged.map(legOfStaged);

  // 名称（预览展示对端组合与来源账户别名）
  const portfolioIds = [...new Set(stagedLegs.map(leg => leg.portfolioId))];
  const accountIds = [...new Set(stagedLegs.map(leg => leg.sourceAccountId).filter(Boolean))];
  const [portfolios, accounts] = await Promise.all([
    portfolioIds.length ? Portfolio.find({ _id: { $in: portfolioIds } }).lean() : [],
    accountIds.length ? SourceAccount.find({ _id: { $in: accountIds } }).lean() : []
  ]);
  const names = {
    portfolios: new Map([...portfolios.map(item => [String(item._id), item.name]), [String(portfolioId), ctx.portfolioName || null]]),
    accounts: new Map(accounts.map(item => [String(item._id), item.alias]))
  };

  // 配对
  const pairedWith = new Map();
  const claimedStaged = new Set();
  for (const row of active) {
    if (pairedWith.has(row.rowKey)) continue;
    const self = rowLegs.get(row.rowKey);
    const candidates = [
      ...active.filter(other => other !== row && !pairedWith.has(other.rowKey)).map(other => rowLegs.get(other.rowKey)),
      ...stagedLegs.filter(leg => !claimedStaged.has(leg.id))
    ].filter(leg => compatible(self, leg));
    const wanted = resolutions[row.rowKey]?.pairWith;
    let partner = null;
    if (wanted) {
      partner = candidates.find(leg => leg.id === String(wanted)) || null;
      if (!partner) {
        setReview(row, 'TRANSFER_PAIR_AMBIGUOUS', '指定的配对对象不在候选之内，请重新选择', ['pairWith', 'skip']);
        row.transfer = { direction: self.direction, candidates: candidates.map(leg => legSummary(leg, names)) };
        continue;
      }
    } else if (candidates.length === 1) {
      partner = candidates[0];
    } else if (candidates.length > 1) {
      setReview(row, 'TRANSFER_PAIR_AMBIGUOUS', `有 ${candidates.length} 个可配对的另一端：请指定配对对象`, ['pairWith', 'skip']);
      row.transfer = { direction: self.direction, candidates: candidates.map(leg => legSummary(leg, names)) };
      continue;
    }
    if (!partner) continue;
    pairedWith.set(row.rowKey, partner);
    if (partner.kind === 'row') pairedWith.set(partner.id, self);
    else claimedStaged.add(partner.id);
  }

  // 账本缓存（组合 + 标的）
  const ledgerCache = new Map();
  const ledgerOf = async (pid, symbol) => {
    const key = `${pid}|${symbol}`;
    if (!ledgerCache.has(key)) {
      const list = await Transaction.find(visibleQuery({ portfolioId: pid, symbol })).lean();
      if (pid !== String(portfolioId)) {
        result.fingerprintKeys.push(...list.map(tx => `${tx._id}:${new Date(tx.updatedAt || 0).getTime()}`));
      }
      ledgerCache.set(key, list);
    }
    return ledgerCache.get(key);
  };
  // 本组合本次新增 / 更新的非划转行也参与转出成本重放
  const currentProbes = symbol => rows
    .filter(row => (row.disposition === 'add' || row.disposition === 'update') && !isTransferRow(row) && row.candidate.symbol === symbol)
    .map(ctx.probeOf);
  const partnerProbesIn = new Map();

  const settled = new Set();
  for (const row of active) {
    if (row.disposition !== 'transfer' || settled.has(row.rowKey)) continue;
    const partner = pairedWith.get(row.rowKey);
    const self = rowLegs.get(row.rowKey);
    if (!partner) {
      row.disposition = 'stage';
      row.code = 'TRANSFER_AWAITING_COUNTERPART';
      row.reason = `${self.direction === 'out' ? '转出' : '转入'}端先到：确认后暂存待核对（两边账本均不变），另一端导入后自动配对并共同确认`;
      row.transfer = { direction: self.direction, partner: null };
      continue;
    }
    const pairRows = partner.kind === 'row' ? [row, partner.row] : [row];
    pairRows.forEach(item => settled.add(item.rowKey));
    const out = self.direction === 'out' ? self : partner;
    const inn = self.direction === 'in' ? self : partner;
    const pairKey = self.pairGroup || partner.pairGroup ||
      `xfer-${sha256([out.kind === 'row' ? out.row.rawHash : out.id, inn.kind === 'row' ? inn.row.rawHash : inn.id]).slice(0, 16)}`;
    const fail = (code, reason) => pairRows.forEach(item => {
      rowError(item, code, reason);
      item.transfer = { direction: rowLegs.get(item.rowKey).direction, partner: legSummary(item === row ? partner : self, names) };
    });

    if (Math.abs(out.quantity - inn.quantity) > EPSILON * Math.max(1, out.quantity)) {
      fail('TRANSFER_QUANTITY_MISMATCH', `转出 ${out.quantity} 与转入 ${inn.quantity} 份额不一致`);
      continue;
    }

    const ledger = await ledgerOf(out.portfolioId, out.symbol);
    const context = [
      ...ledger,
      ...(out.portfolioId === String(portfolioId) ? currentProbes(out.symbol) : []),
      ...(partnerProbesIn.get(`${out.portfolioId}|${out.symbol}`) || [])
    ];
    const outProbe = probeOfLeg(out);
    const removal = removedCostOf(context, outProbe);
    if (removal.error) {
      fail('TRANSFER_INSUFFICIENT_POSITION', `转出端（${names.portfolios.get(out.portfolioId) || out.portfolioId}）在转出日的可用持仓不足 ${out.quantity}`);
      continue;
    }
    const removedCost = removal.removedCost;
    const outCurrency = out.currency;
    const inCurrency = inn.currency;

    // 承接成本：决议可写在本对任一行上
    const resolution = pairRows.map(item => resolutions[item.rowKey]).find(item => item && (item.transferCost !== undefined || item.fxRate !== undefined)) || {};
    const userCost = positiveNumber(resolution.transferCost);
    const userFx = positiveNumber(resolution.fxRate);
    let carryCost = null;
    let carryCostSource = null;
    let fxRate = null;
    if (Number.isNaN(userCost) || Number.isNaN(userFx)) {
      fail('TRANSFER_COST_INVALID', '补填的承接成本或换算依据必须大于 0');
      continue;
    }
    if (userCost !== null) {
      carryCost = userCost; carryCostSource = 'user';
    } else if (inn.transferCost !== null && inn.transferCost !== undefined) {
      if (inn.transferCostCurrency && inn.transferCostCurrency !== inCurrency) {
        fail('TRANSFER_COST_CURRENCY', `划转成本币种 ${inn.transferCostCurrency} 须与转入资产币种 ${inCurrency} 一致`);
        continue;
      }
      carryCost = inn.transferCost; carryCostSource = 'report';
    } else if (outCurrency === inCurrency) {
      carryCost = removedCost; carryCostSource = 'carried';
    } else if (userFx !== null || positiveNumber(inn.transferFxRate)) {
      fxRate = userFx !== null ? userFx : Number(inn.transferFxRate);
      carryCost = removedCost * fxRate; carryCostSource = 'fx';
    }

    const transferInfo = item => ({
      direction: rowLegs.get(item.rowKey).direction,
      pairKey,
      partner: legSummary(item === row ? partner : self, names),
      removedCost,
      removedCostCurrency: outCurrency,
      carryCost,
      carryCostCurrency: inCurrency,
      carryCostSource,
      fxRate,
      crossCurrency: outCurrency !== inCurrency
    });

    if (carryCost === null) {
      pairRows.forEach(item => {
        setReview(item, 'TRANSFER_COST_REQUIRED',
          `跨币种划转（${outCurrency} → ${inCurrency}）缺少转入成本与换算依据：请补充转入成本（${inCurrency}）或换算依据（1 ${outCurrency} = ? ${inCurrency}）其中一项`,
          ['transferCost', 'fxRate', 'skip']);
        item.transfer = transferInfo(item);
      });
      continue;
    }
    if (!(carryCost > 0) || !(removedCost > 0)) {
      fail('TRANSFER_COST_INVALID', '承接成本必须大于 0');
      continue;
    }

    // 落定：本文件行写入候选值；暂存对端生成伴随写入
    const outPrice = removedCost / out.quantity;
    const inPrice = carryCost / inn.quantity;
    const counterpartOf = leg => (leg === out ? inn : out);
    for (const item of pairRows) {
      const leg = rowLegs.get(item.rowKey);
      const counterpart = counterpartOf(leg);
      item.disposition = 'add';
      item.code = item.code || null;
      item.pairKey = pairKey;
      item.candidate.price = leg.direction === 'out' ? outPrice : inPrice;
      if (leg.direction === 'in') {
        item.candidate.carryCost = carryCost;
        item.candidate.carryCostCurrency = inCurrency;
        item.candidate.carryCostSource = carryCostSource;
        item.candidate.transferFxRate = fxRate ?? undefined;
      }
      item.transferWrite = {
        direction: leg.direction,
        counterpartPortfolioId: counterpart.portfolioId,
        counterpartSourceAccountId: counterpart.kind === 'row' ? null : counterpart.sourceAccountId,
        stagedLegId: null
      };
      item.transfer = transferInfo(item);
    }
    if (partner.kind === 'staged') {
      const isIn = partner.direction === 'in';
      const write = {
        rowKey: row.rowKey,
        leg: partner.leg,
        pairKey,
        price: isIn ? inPrice : outPrice,
        carry: isIn ? { carryCost, carryCostCurrency: inCurrency, carryCostSource, transferFxRate: fxRate ?? undefined } : {},
        counterpartPortfolioId: String(portfolioId)
      };
      result.partnerWrites.push(write);
      const probe = probeOfLeg(partner, { price: write.price, ...write.carry });
      const key = `${partner.portfolioId}|${partner.symbol}`;
      partnerProbesIn.set(key, [...(partnerProbesIn.get(key) || []), probe]);
      if (partner.portfolioId === String(portfolioId)) result.extraProbes.push(probe);
      else if (!result.lockPortfolioIds.includes(partner.portfolioId)) result.lockPortfolioIds.push(partner.portfolioId);
    }
  }

  // 暂存对端写入组合（非本组合）的账本校验：对端写入后该组合整本账仍须可重放（不超卖）
  for (const write of result.partnerWrites) {
    const pid = String(write.leg.portfolioId);
    if (pid === String(portfolioId)) continue;
    const key = `${pid}|${write.leg.symbol}`;
    try {
      replayLedger([...(await ledgerOf(pid, write.leg.symbol)), ...(partnerProbesIn.get(key) || [])]);
    } catch (error) {
      if (error.code !== 'INSUFFICIENT_POSITION' && error.code !== 'INVALID_CARRY_COST') throw error;
      const row = rows.find(item => item.rowKey === write.rowKey);
      rowError(row, 'TRANSFER_INSUFFICIENT_POSITION', `对端组合（${names.portfolios.get(pid) || pid}）写入划转后持仓不足`);
    }
  }
  result.lockPortfolioIds.sort();
  return result;
}

// ── 确认阶段的文档构造（commit.js 调用）──

function transferFieldsOfRow(row, ctx) {
  const write = row.transferWrite;
  return {
    pairGroupId: row.pairKey,
    carryCost: row.candidate.carryCost ?? undefined,
    carryCostCurrency: row.candidate.carryCostCurrency ?? undefined,
    carryCostSource: row.candidate.carryCostSource ?? undefined,
    transferFxRate: row.candidate.transferFxRate ?? undefined,
    transfer: {
      direction: write.direction,
      counterpartPortfolioId: write.counterpartPortfolioId,
      // 同文件配对：两端同一来源账户
      counterpartSourceAccountId: write.counterpartSourceAccountId || ctx.sourceAccountId
    }
  };
}

function partnerDocument(write, ctx) {
  const leg = write.leg;
  return {
    portfolioId: leg.portfolioId,
    symbol: leg.symbol,
    assetType: leg.assetType,
    market: leg.market,
    currency: leg.currency,
    action: leg.direction === 'out' ? 'transfer_out' : 'transfer_in',
    quantity: leg.quantity,
    price: write.price,
    fee: 0,
    date: leg.date,
    notes: leg.notes || undefined,
    sourceAccountId: leg.sourceAccountId || undefined,
    source: {
      kind: 'import',
      format: leg.source?.format,
      fileName: leg.source?.fileName || undefined,
      rowNumber: leg.source?.rowNumber,
      rowNumberKind: leg.source?.rowNumberKind,
      externalId: leg.source?.externalId ?? null,
      importBatchId: ctx.importBatchId,
      rawHash: leg.source?.rawHash
    },
    dateKind: leg.dateKind,
    timeZone: leg.timeZone || undefined,
    timeZoneSource: leg.timeZoneSource || undefined,
    settlementDate: leg.settlementDate || undefined,
    settlementStatus: leg.settlementStatus,
    feeSource: 'broker',
    sequence: leg.sequence,
    pairGroupId: write.pairKey,
    ...write.carry,
    transfer: {
      direction: leg.direction,
      counterpartPortfolioId: write.counterpartPortfolioId,
      counterpartSourceAccountId: ctx.sourceAccountId,
      stagedLegId: leg._id
    },
    status: 'pending'
  };
}

function stagedLegDocument(row, preview, ctx) {
  const c = row.candidate;
  return {
    portfolioId: preview.portfolio._id,
    sourceAccountId: ctx.sourceAccountId,
    direction: c.direction,
    symbol: c.symbol,
    assetType: row.asset.type,
    market: row.asset.market,
    currency: row.asset.currency,
    quantity: c.quantity,
    date: c.date,
    dateKind: c.dateKind,
    timeZone: c.timeZone || undefined,
    timeZoneSource: c.timeZoneSource || undefined,
    settlementDate: c.settlementDate || undefined,
    settlementStatus: c.settlementStatus,
    pairGroup: c.pairGroup || undefined,
    transferCost: c.transferCost ?? undefined,
    transferCostCurrency: c.transferCostCurrency || undefined,
    transferFxRate: c.transferFxRate ?? undefined,
    sequence: row.sequence,
    notes: c.notes || undefined,
    source: {
      format: preview.format,
      fileName: preview.file.name || undefined,
      rowNumber: row.rowNumber,
      rowNumberKind: row.rowNumberKind,
      externalId: c.externalId,
      rawHash: row.rawHash
    },
    status: 'pending',
    stagedBatchId: ctx.importBatchId
  };
}

// ── 暂存一端的查询与放弃 ──

function publicLeg(leg, names = new Map()) {
  return {
    id: String(leg._id),
    portfolioId: String(leg.portfolioId),
    portfolioName: names.get(String(leg.portfolioId)) || null,
    sourceAccountId: leg.sourceAccountId ? String(leg.sourceAccountId) : null,
    direction: leg.direction,
    symbol: leg.symbol,
    currency: leg.currency,
    quantity: leg.quantity,
    date: leg.date,
    dateKind: leg.dateKind || 'date',
    pairGroup: leg.pairGroup || null,
    transferCost: leg.transferCost ?? null,
    transferCostCurrency: leg.transferCostCurrency || null,
    transferFxRate: leg.transferFxRate ?? null,
    rowNumber: leg.source?.rowNumber ?? null,
    rowNumberKind: leg.source?.rowNumberKind || null,
    fileName: leg.source?.fileName || null,
    status: leg.status,
    createdAt: leg.createdAt
  };
}

async function listStagedTransfers({ portfolioId } = {}) {
  const filter = { status: 'staged' };
  if (portfolioId !== undefined && portfolioId !== '') {
    if (!mongoose.Types.ObjectId.isValid(portfolioId)) throw businessError(400, 'INVALID_PORTFOLIO_ID', 'Invalid portfolioId');
    filter.portfolioId = portfolioId;
  }
  const legs = await TransferLeg.find(filter).sort({ date: 1 }).lean();
  const ids = [...new Set(legs.map(leg => String(leg.portfolioId)))];
  const portfolios = ids.length ? await Portfolio.find({ _id: { $in: ids } }).lean() : [];
  const names = new Map(portfolios.map(item => [String(item._id), item.name]));
  return legs.map(leg => publicLeg(leg, names));
}

/** 放弃暂存的一端（之后需重新提供该端的报表行）。只能放弃仍处于 staged 的一端。 */
async function discardStagedTransfer(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw businessError(400, 'INVALID_TRANSFER_LEG_ID', 'Invalid transfer leg id');
  const outcome = await TransferLeg.updateOne({ _id: id, status: 'staged' }, { $set: { status: 'discarded' } });
  if (!outcome.matchedCount) throw businessError(404, 'TRANSFER_LEG_NOT_FOUND', '暂存的划转一端不存在或已入账');
  return { id: String(id), status: 'discarded' };
}

module.exports = {
  isTransferRow,
  resolveTransfers,
  transferFieldsOfRow,
  partnerDocument,
  stagedLegDocument,
  listStagedTransfers,
  discardStagedTransfer
};
