// 预览账本校验（代码审查 T5 自 index.js 拆出）：同日顺序核对（#96）、超卖 / 拆股重放（#94 / #98）、
// 确认后持仓预演。只读，不写库。

const Transaction = require('../../models/transaction');
const {
  calculatePositions,
  compareTransactions,
  replayLedger,
  localTradeDay,
  PREVIEW_BATCH_KEY
} = require('../transaction/positionCalculator');
const { visibleQuery } = require('../transaction/visibility');
const { isCashAction } = require('../../constants/transaction.constants');
const { markError } = require('./common');

const ORDER_CHOICES = ['before', 'after'];

// 重放中可归因到具体行的账本错误：超卖（#94）与拆股前提不成立（#98）
const SPLIT_ERRORS = ['SPLIT_NO_POSITION', 'SPLIT_RATIO_CONFLICT'];

const LEDGER_ERRORS = ['INSUFFICIENT_POSITION', ...SPLIT_ERRORS];

const STATE_EPSILON = 1e-9;

// 行的交易日（报表日历日）：仅日期行即报表日期，带时刻行按其时区（缺省 MARKET_TIMEZONE）取当地日。
function tradeDayKey(candidate) {
  return candidate.localDate || localTradeDay(candidate);
}

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
    day: attempt(transactions.filter(tx => localTradeDay(tx) <= day))
  };
}

function sameOutcome(left, right) {
  if (left.full !== right.full) return false;
  if (left.day.error || right.day.error) return left.day.error === right.day.error;
  return ['quantity', 'remainingCost', 'realizedPnl']
    .every(key => Math.abs(left.day[key] - right.day[key]) < STATE_EPSILON);
}

/**
 * 同日顺序核对（TASK-096 / AC-11）。对每个标的、每个当地交易日（代码审查 S5：不是 UTC 日）：
 * - 有已入账流水且新旧之间存在非「双方都带时刻」的组合 → 新行整体相对已入账流水的先后不确定（跨报表）；
 * - 只有新行且同日混合带时刻与仅日期 → 仅日期行相对带时刻行的先后不确定（混合精度）。
 * 同报表仅日期的同日成交按原行顺序（sequence），不视为不确定。
 * 不确定且「之前 / 之后」两种顺序的超卖、剩余成本或已实现盈亏结果不同 → 行标 review ORDER_AMBIGUOUS，
 * 用户以 resolutions[rowKey].order = 'before' | 'after' 确认；确认结果写入 orderRank 持久化，
 * 预览、确认后重放与后续编辑共用 compareTransactions，保证顺序一致。
 */
function checkSameDayOrder(symbol, existing, newRows, resolutions) {
  const days = [...new Set(newRows.map(row => tradeDayKey(row.candidate)))].sort();
  for (const day of days) {
    const dayNew = newRows.filter(row => tradeDayKey(row.candidate) === day);
    const dayExisting = existing.filter(tx => localTradeDay(tx) === day);
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
async function validateLedger(rows, portfolioId, resolutions = {}, extraProbes = []) {
  // 现金类流水（TASK-097）不影响持仓，不参与同日顺序核对与超卖重放
  const writes = rows.filter(row => (row.disposition === 'add' || row.disposition === 'update') && !isCashAction(row.candidate.action));
  const symbols = [...new Set(writes.flatMap(row => (row.disposition === 'update'
    ? [row.candidate.symbol, row.target.symbol]
    : [row.candidate.symbol])))];
  const ledger = symbols.length
    ? await Transaction.find(visibleQuery({ portfolioId, symbol: { $in: symbols } })).lean()
    : [];
  for (const row of writes) {
    if (row.disposition === 'update' && localTradeDay(row.target) === tradeDayKey(row.candidate)) {
      row.orderRank = row.target.orderRank;
    }
  }
  for (const symbol of symbols) {
    // extraProbes：本次确认一并写入本组合的暂存对端（TASK-099），视同已有流水参与校验
    const existing = [...ledger, ...extraProbes].filter(tx => tx.symbol === symbol);
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
          markError(row, error.code, `写入此行会使之后的拆股失去依据：${error.message}`);
          continue;
        }
        markError(row, 'INSUFFICIENT_POSITION', `${row.disposition === 'update' ? '更新后' : ''}卖出数量超过 ${symbol} 当时的可用持仓`);
      }
    }
  }
  return { ledger, positionsAfter: positionsAfterOf([...ledger, ...extraProbes], rows, symbols) };
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

module.exports = { LEDGER_ERRORS, tradeDayKey, probeOf, validateLedger };
