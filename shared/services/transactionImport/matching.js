// 重复成交识别与更正（TASK-095 / Spec #93 AC-03）。
//
// 匹配范围：目标组合 + 同一来源账户 + 同一买卖方向（action）。
// 1. 有原成交编号：按编号匹配（跨组合查询，以便发现「已入账到其他组合」）。
// 2. 无编号且有时刻：时间戳、标的、数量、成交金额（grossAmount，不含佣金）四项一致即同一成交；
//    仅成交金额不同 → 列出旧流水候选并暂停（AMOUNT_CHANGED），由用户决定更新或新增。
// 3. 无编号且仅有日期：同日同标的同方向的旧流水均为候选，进入人工核对（DATE_ONLY_MATCH）。
// 4. 缺来源账户的旧账（手动录入 / 早期导入）：同日同标的同方向即候选，进入人工核对（LEGACY_CANDIDATE）。
// 唯一且内容一致 → 跳过；多条内容一致 → 待核对（MULTIPLE_CANDIDATES）；
// 有差异 → 展示新旧值，用户确认 update 后才改写旧流水（保留手工备注）。
// 一致匹配按一对一认领：同文件两笔一致的成交不会同时「跳过」到同一条旧流水。
//
// 现金流水（TASK-097：div_cash / tax / interest / cash_in / cash_out / fee）：有编号同上；
// 无编号时，同来源账户、同日、同类型、同币种、同金额（有标的的分红另比标的）的旧流水或同文件前行
// 一律进入人工核对（CASH_DUPLICATE / CASH_DUPLICATE_IN_FILE），即使完全一致也不自动跳过——
// 同额利息、同额划转可能真实重复发生。

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const Transaction = require('../../models/transaction');
const Portfolio = require('../../models/portfolio');
const { visibleQuery } = require('../transaction/visibility');
const { CASH_ACTIONS, isCashAction } = require('../../constants/transaction.constants');
const { markReview, markSkip } = require('./common');

dayjs.extend(utc);
dayjs.extend(timezone);

const EPSILON = 1e-9;

// 参与「内容一致」判断与差异展示的字段；notes 是手工备注，不参与也不被更新覆盖。
const DIFF_FIELDS = Object.freeze([
  'symbol', 'date', 'dateKind', 'quantity', 'price', 'splitRatio', 'grossAmount', 'fee',
  'cashAmount', 'cashCurrency', 'settlementDate', 'externalId'
]);

function fieldOf(source, field, isTransaction) {
  if (field === 'externalId') return isTransaction ? source.source?.externalId : source.externalId;
  if (field === 'dateKind') return source.dateKind || 'date';
  return source[field];
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).getTime();
  return value;
}

function sameValue(left, right) {
  const a = normalizeValue(left);
  const b = normalizeValue(right);
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  return a === b;
}

/** 旧流水 → 新候选的逐字段差异（只列不同的字段）。 */
function diffOf(transaction, candidate) {
  const diff = [];
  for (const field of DIFF_FIELDS) {
    const before = fieldOf(transaction, field, true);
    const after = fieldOf(candidate, field, false);
    if (!sameValue(before, after)) diff.push({ field, before: before ?? null, after: after ?? null });
  }
  return diff;
}

/** 交易日（用于仅日期精度的比较）：有时区按该时区取日历日，否则按存储的 UTC 日。 */
function dayKeyOf(source) {
  const date = new Date(source.date);
  if (Number.isNaN(date.getTime())) return null;
  if (source.timeZone) return dayjs(date).tz(source.timeZone).format('YYYY-MM-DD');
  return date.toISOString().slice(0, 10);
}

function summaryOf(tx) {
  return {
    action: tx.action,
    symbol: tx.symbol,
    date: tx.date,
    dateKind: tx.dateKind || 'date',
    quantity: tx.quantity,
    price: tx.price,
    grossAmount: tx.grossAmount ?? null,
    fee: tx.fee,
    cashAmount: tx.cashAmount ?? null,
    cashCurrency: tx.cashCurrency ?? null,
    externalId: tx.source?.externalId ?? null,
    notes: tx.notes || null
  };
}

function setReview(row, code, reason, options, candidates, describe) {
  markReview(row, code, reason, options);
  row.matchTargets = candidates;
  row.matches = candidates.map(tx => describe(tx, row));
}

function setSkip(row, tx, reason) {
  markSkip(row, 'ALREADY_IMPORTED', reason);
  row.matches = [{ id: String(tx._id), portfolioId: String(tx.portfolioId) }];
}

/** 无编号现金流水的重复判定键：日 + 类型 + 币种 + 金额（现金分红另加标的）。 */
function sameCashActivity(left, right) {
  if (left.action !== right.action || dayKeyOf(left) !== dayKeyOf(right)) return false;
  if ((left.cashCurrency || null) !== (right.cashCurrency || null)) return false;
  if (left.cashAmount == null || right.cashAmount == null || !sameValue(left.cashAmount, right.cashAmount)) return false;
  if (left.action === 'div_cash' && (left.symbol || right.symbol) && left.symbol !== right.symbol) return false;
  return true;
}

/**
 * 已入账报表行的续传识别（Human 决定 8 / 代码审查 S7）：同一来源账户 + 同一行号（及行号类型）+ 同一内容（rawHash）
 * 的本组合已入账流水即「这一行已导入」，自动跳过——超过 500 行的报表重新上传同一文件即可继续写入下一批。
 * 已入账到其他组合的同一行不在此跳过，仍按 matchRows 的外部编号规则展示原组合。
 * 须在配对与成交匹配之前调用；被认领的旧流水记入 row.claimedId，matchRows 不再让其他行认领。
 * 返回参与识别的旧流水快照键（计入账本指纹）。
 */
async function skipCommittedRows(rows, { portfolioId, sourceAccountId }) {
  if (!sourceAccountId) return [];
  const pending = rows.filter(row => row.disposition === 'pending' && row.rawHash);
  if (!pending.length) return [];
  const committed = await Transaction.find(visibleQuery({
    portfolioId, sourceAccountId, 'source.rawHash': { $in: [...new Set(pending.map(row => row.rawHash))] }
  })).lean();
  const byIdentity = new Map(committed.map(tx => [
    `${tx.source?.rowNumberKind || ''}|${tx.source?.rowNumber}|${tx.source?.rawHash}`, tx
  ]));
  for (const row of pending) {
    const tx = byIdentity.get(`${row.rowNumberKind || ''}|${row.rowNumber}|${row.rawHash}`);
    if (!tx) continue;
    setSkip(row, tx, `同一来源账户已入账本报表第 ${row.rowNumber} 行（内容一致）`);
    row.claimedId = String(tx._id);
  }
  return committed.map(tx => `${tx._id}:${new Date(tx.updatedAt || 0).getTime()}`);
}

/**
 * 对 disposition === 'pending' 的行执行匹配；返回参与匹配的旧流水快照键（计入账本指纹）。
 */
async function matchRows(rows, { portfolioId, sourceAccountId }) {
  const active = rows.filter(row => row.disposition === 'pending');

  // 同文件、同方向的重复原成交编号：一致跳过；不一致展示与首行的差异并暂停。
  const seenExternal = new Map();
  for (const row of active) {
    const id = row.candidate.externalId;
    if (!id) continue;
    const key = `${row.candidate.action}|${id}`;
    const first = seenExternal.get(key);
    if (!first) { seenExternal.set(key, row); continue; }
    if (first.rawHash === row.rawHash) {
      row.disposition = 'skip';
      row.code = 'DUPLICATE_IN_FILE';
      row.reason = `与第 ${first.rowNumber} 行内容一致的重复成交编号`;
    } else {
      markReview(row, 'EXTERNAL_ID_CONFLICT_IN_FILE', `原成交编号 ${id} 与第 ${first.rowNumber} 行重复但内容不同：确认为不同成交可新增，否则跳过`, ['skip', 'add']);
      row.duplicateOf = {
        rowKey: first.rowKey,
        rowNumber: first.rowNumber,
        diff: diffOf({ ...first.candidate, source: { externalId: first.candidate.externalId } }, row.candidate)
      };
    }
  }

  // 同文件无编号现金流水：与前面同日同类型同币种同金额的行重复 → 人工核对（可能是真实的两笔）
  const cashSeen = [];
  for (const row of active) {
    if (row.disposition !== 'pending' || row.candidate.externalId || !isCashAction(row.candidate.action)) continue;
    const first = cashSeen.find(other => sameCashActivity(other.candidate, row.candidate));
    if (!first) { cashSeen.push(row); continue; }
    markReview(row, 'CASH_DUPLICATE_IN_FILE', `无编号现金流水与第 ${first.rowNumber} 行同日、同类型、同币种、同金额：确认为另一笔可新增，否则跳过`, ['skip', 'add']);
    row.duplicateOf = { rowKey: first.rowKey, rowNumber: first.rowNumber, diff: [] };
  }

  const pending = active.filter(row => row.disposition === 'pending');
  if (!pending.length) return [];
  const symbols = [...new Set(pending.map(row => row.candidate.symbol).filter(Boolean))];
  const hasCashWithoutId = pending.some(row => !row.candidate.externalId && isCashAction(row.candidate.action));
  const externalIds = [...new Set(pending.map(row => row.candidate.externalId).filter(Boolean))];
  const [byExternal, sameSource, legacy, sameSourceCash] = await Promise.all([
    sourceAccountId && externalIds.length
      ? Transaction.find(visibleQuery({ sourceAccountId, 'source.externalId': { $in: externalIds } })).lean()
      : [],
    sourceAccountId
      ? Transaction.find(visibleQuery({ portfolioId, sourceAccountId, symbol: { $in: symbols } })).lean()
      : [],
    symbols.length
      ? Transaction.find(visibleQuery({ portfolioId, sourceAccountId: { $exists: false }, symbol: { $in: symbols } })).lean()
      : [],
    sourceAccountId && hasCashWithoutId
      ? Transaction.find(visibleQuery({ portfolioId, sourceAccountId, action: { $in: [...CASH_ACTIONS] } })).lean()
      : []
  ]);

  const otherPortfolioIds = [...new Set(byExternal.map(tx => String(tx.portfolioId)).filter(id => id !== String(portfolioId)))];
  const portfolioNames = new Map();
  if (otherPortfolioIds.length) {
    const others = await Portfolio.find({ _id: { $in: otherPortfolioIds } }).lean();
    for (const item of others) portfolioNames.set(String(item._id), item.name);
  }
  const describe = (tx, row) => ({
    id: String(tx._id),
    portfolioId: String(tx.portfolioId),
    portfolioName: portfolioNames.get(String(tx.portfolioId)) || null,
    transaction: summaryOf(tx),
    diff: diffOf(tx, row.candidate)
  });

  // 续传识别（skipCommittedRows）已认领的旧流水不再参与一对一认领
  const claimed = new Set(rows.map(row => row.claimedId).filter(Boolean));
  const identical = (tx, row) => diffOf(tx, row.candidate).length === 0;
  // 唯一一条内容一致的旧流水 → 认领并跳过；多条内容一致 → 无法确定是哪一条，待核对（代码审查 S4）。
  // 返回 true 表示本行已处置（跳过或待核对）。
  const claimIdentical = (row, pool, reason, options = ['update', 'add', 'skip']) => {
    const hits = pool.filter(tx => !claimed.has(String(tx._id)) && identical(tx, row));
    if (!hits.length) return false;
    if (hits.length > 1) {
      setReview(row, 'MULTIPLE_CANDIDATES', `有 ${hits.length} 条内容一致的旧流水，无法确定对应哪一条：请跳过、新增或指定更新对象`, options, hits, describe);
      return true;
    }
    claimed.add(String(hits[0]._id));
    setSkip(row, hits[0], reason);
    return true;
  };
  const unclaimed = tx => !claimed.has(String(tx._id));
  const inPortfolio = tx => String(tx.portfolioId) === String(portfolioId);

  for (const row of pending) {
    const c = row.candidate;
    const sameSide = tx => tx.action === c.action;

    if (c.externalId) {
      const sameId = byExternal.filter(tx => sameSide(tx) && tx.source?.externalId === c.externalId);
      const here = sameId.filter(inPortfolio);
      if (here.length) {
        if (claimIdentical(row, here, '同一原成交编号已入账且内容一致', ['update', 'skip'])) continue;
        const open = here.filter(unclaimed);
        if (open.length === 1) {
          setReview(row, 'EXTERNAL_ID_CHANGED', '同一原成交编号已入账但内容不同：核对新旧值后可更新旧流水（保留手工备注）或跳过', ['update', 'skip'], open, describe);
        } else {
          setReview(row, 'MULTIPLE_CANDIDATES', '同一原成交编号匹配到多条旧流水：请指定更新对象或跳过', ['update', 'skip'], open.length ? open : here, describe);
        }
        continue;
      }
      if (sameId.length) {
        const names = [...new Set(sameId.map(tx => portfolioNames.get(String(tx.portfolioId)) || String(tx.portfolioId)))];
        setReview(row, 'EXTERNAL_ID_OTHER_PORTFOLIO', `同一原成交编号已入账到其他组合（${names.join('、')}），可选择跳过`, ['skip'], sameId, describe);
        continue;
      }
    } else if (isCashAction(c.action)) {
      // 无编号现金流水：同来源账户同日同类型同币种同金额 → 人工核对（不自动跳过）
      const hits = sameSourceCash.filter(tx => unclaimed(tx) && sameCashActivity(tx, c));
      if (hits.length) {
        setReview(row, 'CASH_DUPLICATE', '无编号现金流水：同一来源账户同日已有同类型、同币种、同金额的流水，请核对后跳过或新增', ['skip', 'add'], hits, describe);
        continue;
      }
      if (!c.symbol) continue;
    } else if (sourceAccountId) {
      const pool = sameSource.filter(tx => sameSide(tx) && tx.symbol === c.symbol);
      if (c.dateKind === 'datetime') {
        const sameKey = pool.filter(tx => tx.dateKind === 'datetime' && sameValue(tx.date, c.date) && sameValue(tx.quantity, c.quantity));
        const full = sameKey.filter(tx => sameValue(tx.grossAmount, c.grossAmount));
        if (claimIdentical(row, full, '同一来源账户已入账时间、标的、数量与成交金额一致的成交')) continue;
        const openFull = full.filter(unclaimed);
        if (openFull.length === 1) {
          setReview(row, 'TRADE_CHANGED', '匹配到同一成交但其他字段不同：核对新旧值后可更新（保留手工备注）或跳过', ['update', 'skip'], openFull, describe);
          continue;
        }
        if (openFull.length > 1) {
          setReview(row, 'MULTIPLE_CANDIDATES', '匹配到多条旧流水：请指定更新对象、新增或跳过', ['update', 'add', 'skip'], openFull, describe);
          continue;
        }
        const amountChanged = sameKey.filter(unclaimed);
        if (amountChanged.length) {
          setReview(row, 'AMOUNT_CHANGED', '时间、标的、数量一致但成交金额不同：请决定更新旧流水或新增', ['update', 'add', 'skip'], amountChanged, describe);
          continue;
        }
      }
      const day = dayKeyOf(c);
      // 仅日期精度（新行或旧行任一方无时刻）时，同日同标的同方向即为候选。
      const sameDay = pool.filter(tx => unclaimed(tx) && dayKeyOf(tx) === day && (c.dateKind !== 'datetime' || tx.dateKind !== 'datetime'));
      if (c.dateKind !== 'datetime' && claimIdentical(row, sameDay, '同一来源账户已入账内容一致的流水')) continue;
      if (sameDay.length) {
        setReview(row, 'DATE_ONLY_MATCH', '仅有日期、无原成交编号：同日存在同标的同方向的旧流水，请核对后跳过、新增或指定更新对象', ['update', 'add', 'skip'], sameDay, describe);
        continue;
      }
    }

    // 缺来源账户的旧账：无法确认是否同一成交，同日同标的同方向一律人工核对。
    const day = dayKeyOf(c);
    const legacyHits = legacy.filter(tx => unclaimed(tx) && sameSide(tx) && tx.symbol === c.symbol && dayKeyOf(tx) === day);
    if (legacyHits.length) {
      setReview(row, 'LEGACY_CANDIDATE', '同日存在缺来源账户的旧流水（手动录入或早期导入）：请核对后跳过、新增或指定更新对象', ['update', 'add', 'skip'], legacyHits, describe);
    }
  }

  return [...byExternal, ...sameSource, ...legacy, ...sameSourceCash].map(tx => `${tx._id}:${new Date(tx.updatedAt || 0).getTime()}`);
}

/**
 * 把用户决议应用到 review 行：skip / add / update（update 需指定候选中的 targetId；唯一候选时可省略）。
 * 不合法的决议保持 review 并说明原因，不会静默生效。
 */
function applyResolutions(rows, resolutions = {}) {
  const takenTargets = new Map();
  for (const row of rows) {
    if (row.disposition !== 'review') continue;
    const resolution = resolutions[row.rowKey];
    const action = resolution?.action;
    if (!action || !(row.options || []).includes(action)) continue;
    if (action === 'skip') {
      row.disposition = 'skip';
      row.resolved = true;
      continue;
    }
    if (action === 'add') {
      row.disposition = 'add';
      row.resolved = true;
      continue;
    }
    const targets = row.matchTargets || [];
    const targetId = resolution.targetId ? String(resolution.targetId) : (targets.length === 1 ? String(targets[0]._id) : null);
    const target = targets.find(tx => String(tx._id) === targetId);
    if (!target) {
      row.reason = `${row.reason}（更新须指定候选旧流水之一）`;
      continue;
    }
    if (takenTargets.has(targetId)) {
      row.reason = `${row.reason}（该旧流水已被第 ${takenTargets.get(targetId)} 行指定更新）`;
      continue;
    }
    takenTargets.set(targetId, row.rowNumber);
    row.disposition = 'update';
    row.resolved = true;
    row.target = target;
    row.targetId = targetId;
  }
}

module.exports = { skipCommittedRows, matchRows, applyResolutions, diffOf, DIFF_FIELDS };
