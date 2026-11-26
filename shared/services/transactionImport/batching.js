// 拆批（代码审查 T5 自 index.js 拆出）：时间正序编号、按 500 条来源流水拆批（成对不拆）、第 1 批单独成立校验（S2）。

const { replayLedger } = require('../transaction/positionCalculator');
const { isCashAction } = require('../../constants/transaction.constants');
const { IMPORT_COMMIT_LIMIT } = require('../../constants/import.constants');
const { LEDGER_ERRORS, tradeDayKey, probeOf } = require('./ledger');

/**
 * 时间正序编号（代码审查 S2 / #96）：sequence = 按交易日排序后的位置，供拆批与同一时刻重放使用。
 * 报表整体为新 → 旧（首个有日期的行晚于最后一个）时先翻转，同日行因此仍按「旧 → 新」的原报表先后；
 * 排序稳定，不改变预览展示的行顺序。无日期的行（解析错误）排在最后。
 */
function assignChronologicalSequence(rows) {
  const dayOf = row => (row.candidate?.date ? tradeDayKey(row.candidate) : null);
  const dated = rows.filter(dayOf);
  const descending = dated.length > 1 && dayOf(dated[0]) > dayOf(dated.at(-1));
  const fileOrder = descending ? [...rows].reverse() : [...rows];
  const keyed = fileOrder.map((row, index) => ({ row, index, day: dayOf(row) || '9999-99-99' }));
  keyed.sort((left, right) => (left.day === right.day ? left.index - right.index : (left.day < right.day ? -1 : 1)));
  keyed.forEach(({ row }, sequence) => { row.sequence = sequence; });
}

/**
 * 拆批：按来源流水行计数，按时间正序（sequence）切分；pair_group 相同的行留在同一批，
 * 整组排在组内最晚一端的位置（较早一端随之推后，不会把依赖后续行的一端提前进上一批）。
 */
function planBatches(rows) {
  // stage（TASK-099 暂存一端）也是来源流水，计入批次
  const writable = rows.filter(row => ['add', 'update', 'stage'].includes(row.disposition))
    .sort((left, right) => left.sequence - right.sequence);
  const groups = [];
  const byPair = new Map();
  for (const row of writable) {
    const key = row.pairKey || row.candidate.pairGroup;
    if (key && byPair.has(key)) { byPair.get(key).push(row); continue; }
    const group = [row];
    if (key) byPair.set(key, group);
    groups.push(group);
  }
  const position = group => Math.max(...group.map(row => row.sequence));
  groups.sort((left, right) => position(left) - position(right));
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

/**
 * 确认只写第 1 批（代码审查 S2）：第 1 批必须单独成立——现有账本 + 第 1 批的新增 / 更新（含同组合暂存对端）
 * 按同一规则重放不超卖、拆股有据。不成立时返回原因（整批阻塞），不写入半个账本。
 */
function firstBatchProblem(rows, batches, ledger, extraProbes) {
  if (batches.length <= 1) return null;
  const batch = new Set(batches[0].rowKeys);
  const writes = rows.filter(row => batch.has(row.rowKey) && (row.disposition === 'add' || row.disposition === 'update') &&
    !isCashAction(row.candidate.action));
  const replaced = new Set(writes.filter(row => row.disposition === 'update').map(row => String(row.target._id)));
  const list = [
    ...ledger.filter(tx => !replaced.has(String(tx._id))),
    ...extraProbes.filter(probe => batch.has(probe.importRowKey)),
    ...writes.map(row => (row.disposition === 'update' ? { ...probeOf(row), _id: row.target._id } : probeOf(row)))
  ];
  try {
    replayLedger(list);
    return null;
  } catch (error) {
    if (!LEDGER_ERRORS.includes(error.code)) throw error;
    return `第 1 批（${batches[0].count} 条）单独入账时账本不成立（${error.message}）：成对流水被整组推迟到后续批次，而第 1 批中有行依赖它。请把报表按日期拆成较小的文件分别导入`;
  }
}

module.exports = { assignChronologicalSequence, planBatches, firstBatchProblem };
