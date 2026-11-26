// 成对流水配对（TASK-101 换汇）。
// #99 证券划转另有暂存 / 跨文件 / 跨组合配对（transfers.js），只复用这里的 mutualUniquePairs（互为唯一候选）规则。
//
// 配对来源（row.pair.source）：
// - explicit：两行填写同一组号（pair_group）。组内必须恰好两端且两端相容，否则按行报错 / 待核对；
// - user：用户以 resolutions[rowKey].pairWith = <另一端 rowKey> 指定（一端指定即可，另一端不得指向别处）；
// - suggested：未填组号也未指定的两端，在同一配对范围（spec.bucketOf，换汇为同账户同日）内
//   互为唯一相容候选时提出配对建议；预览展示建议，用户确认导入即采纳。
// 范围内有多种可能 → 待核对 <P>_PAIR_AMBIGUOUS（列出 pairCandidates，由用户 pairWith 指定）；
// 无任何相容候选 → 待核对 <P>_UNPAIRED。未配对的一端永不单独入账（待核对阻塞整批，或由用户跳过）。
//
// 共同入账：配对后两端 candidate.pairGroup 相同，拆批（planBatches）不拆开、同批 pending→committed 一次翻转；
// enforcePairIntegrity 在全部决议之后保证两端要么都写入、要么都不写入。

const crypto = require('crypto');
const { markError, markReview } = require('./common');

/**
 * @typedef {object} PairSpec
 * @property {string} prefix 待核对 code 前缀，如 'FX'
 * @property {string} label 展示名，如 '换汇'
 * @property {(row) => boolean} isLeg 是否是需要成对入账的流水
 * @property {(left, right) => boolean} compatible 两端能否组成一对（候选行之间对称）
 * @property {(row) => string} bucketOf 建议配对的范围键（同范围内唯一相容才建议）
 */

function generatedGroupId(spec, left, right) {
  const [a, b] = [left, right].sort((x, y) => (x.rowKey < y.rowKey ? -1 : 1));
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify([spec.prefix, a.rowKey, a.rawHash || null, b.rowKey, b.rawHash || null]))
    .digest('hex');
  return `${spec.prefix.toLowerCase()}-${digest.slice(0, 16)}`;
}

function link(left, right, groupId, source) {
  for (const [row, partner] of [[left, right], [right, left]]) {
    row.pair = { groupId, source, partnerRowKey: partner.rowKey, partnerRowNumber: partner.rowNumber };
    row.candidate.pairGroup = groupId;
  }
}

function summarizeLeg(row) {
  return {
    rowKey: row.rowKey,
    rowNumber: row.rowNumber,
    date: row.candidate.localDate || null,
    cashAmount: row.candidate.cashAmount ?? null,
    cashCurrency: row.candidate.cashCurrency || null
  };
}

function reviewPair(row, code, reason, candidates = []) {
  markReview(row, code, reason, candidates.length ? ['pairWith', 'skip'] : ['skip']);
  row.pairCandidates = candidates.map(summarizeLeg);
}


/**
 * 互为唯一候选的配对（换汇建议配对与 #99 证券划转自动配对共用）：
 * a 的候选只有 b，且 b 的候选只有 a，才配成一对；不按先后贪心认领。
 * @param {Array} items 待配对的一端
 * @param {(item) => Array} candidatesOf 一端的相容候选（可包含 items 之外的一端，如服务端暂存的划转一端）
 * @param {(item) => string} idOf 一端的唯一键
 * @returns {{ pairs: Array<[object, object]>, options: Map<string, Array> }} options 为 items 各自的候选
 */
function mutualUniquePairs(items, candidatesOf, idOf) {
  const options = new Map(items.map(item => [idOf(item), candidatesOf(item)]));
  const optionsOf = item => options.get(idOf(item)) || candidatesOf(item);
  const taken = new Set();
  const pairs = [];
  for (const item of items) {
    const mine = options.get(idOf(item));
    if (taken.has(idOf(item)) || mine.length !== 1) continue;
    const other = mine[0];
    const theirs = optionsOf(other);
    if (taken.has(idOf(other)) || theirs.length !== 1 || idOf(theirs[0]) !== idOf(item)) continue;
    pairs.push([item, other]);
    taken.add(idOf(item));
    taken.add(idOf(other));
  }
  return { pairs, options };
}

/**
 * 在 disposition === 'pending' 的成对流水之间配对（就地修改行）。须在 rawHash 计算之后、重复匹配之前调用。
 * @param {Array} rows 预览行（文件顺序）
 * @param {PairSpec} spec
 * @param {object} resolutions 用户决议（读取 pairWith）
 */
function pairRows(rows, spec, resolutions = {}) {
  const legs = rows.filter(row => row.disposition === 'pending' && row.candidate && spec.isLeg(row));
  const { prefix, label } = spec;

  // 1. 显式组号
  const byGroup = new Map();
  for (const row of legs) {
    const key = row.candidate.pairGroup;
    if (!key) continue;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(row);
  }
  // 组号也可能被同文件其他类型的行（错误行等）占用：只按成对流水计数
  for (const [groupId, members] of byGroup) {
    if (members.length === 2 && spec.compatible(members[0], members[1])) {
      link(members[0], members[1], groupId, 'explicit');
    } else if (members.length === 1) {
      reviewPair(members[0], `${prefix}_PAIR_INCOMPLETE`, `${label}组号 ${groupId} 只有一端：另一端缺失或有错误，单端不入账（可跳过）`);
    } else {
      const reason = members.length > 2
        ? `${label}组号 ${groupId} 有 ${members.length} 行，每组只能有两端`
        : `${label}组号 ${groupId} 的两端不相容（须为不同币种、一出一入）`;
      for (const row of members) markError(row, `${prefix}_PAIR_INVALID`, reason);
    }
  }

  const free = legs.filter(row => !row.candidate.pairGroup && row.disposition === 'pending');
  const freeKeys = new Set(free.map(row => row.rowKey));
  const byKey = new Map(free.map(row => [row.rowKey, row]));
  const paired = new Set();

  // 2. 用户指定
  const rejected = new Map();
  for (const row of free) {
    const target = resolutions[row.rowKey]?.pairWith;
    if (target === undefined || target === null || paired.has(row.rowKey)) continue;
    const other = byKey.get(String(target));
    const otherChoice = other ? resolutions[other.rowKey]?.pairWith : undefined;
    if (!other || other === row || !freeKeys.has(other.rowKey) || paired.has(other.rowKey)) {
      rejected.set(row.rowKey, '指定的另一端不存在或已配对');
    } else if (!spec.compatible(row, other)) {
      rejected.set(row.rowKey, '指定的两端不相容（须为不同币种、一出一入）');
    } else if (otherChoice !== undefined && otherChoice !== null && String(otherChoice) !== row.rowKey) {
      rejected.set(row.rowKey, '两端的配对指定不一致');
    } else {
      link(row, other, generatedGroupId(spec, row, other), 'user');
      paired.add(row.rowKey);
      paired.add(other.rowKey);
    }
  }

  // 3. 同范围内互为唯一相容候选 → 建议配对；否则待核对
  const remaining = free.filter(row => !paired.has(row.rowKey));
  const candidatesOf = row => remaining.filter(other => other !== row &&
    spec.bucketOf(other) === spec.bucketOf(row) && spec.compatible(row, other));
  const { pairs, options } = mutualUniquePairs(remaining, candidatesOf, row => row.rowKey);
  for (const [row, other] of pairs) {
    link(row, other, generatedGroupId(spec, row, other), 'suggested');
    paired.add(row.rowKey);
    paired.add(other.rowKey);
  }
  for (const row of remaining) {
    if (paired.has(row.rowKey)) continue;
    const sameScope = options.get(row.rowKey);
    const note = rejected.has(row.rowKey) ? `（${rejected.get(row.rowKey)}）` : '';
    if (sameScope.length) {
      reviewPair(row, `${prefix}_PAIR_AMBIGUOUS`, `同账户同日有多种可能的${label}配对：请指定另一端${note}`, sameScope);
    } else {
      // 同范围无候选：列出全文件其余未配对的相容端供用户跨日指定
      const anywhere = remaining.filter(other => other !== row && !paired.has(other.rowKey) && spec.compatible(row, other));
      reviewPair(row, `${prefix}_UNPAIRED`, `未找到可配对的${label}另一端：单端不入账，请指定另一端或跳过${note}`, anywhere);
    }
  }
}

/**
 * 全部决议之后：已配对的两端须同时写入。一端被跳过而另一端仍要写入 → 写入端改为待核对（只能跳过）。
 * 一端仍为错误 / 待核对时整批已阻塞，不另处理。
 */
function enforcePairIntegrity(rows, spec, resolutions = {}) {
  const writable = row => row.disposition === 'add' || row.disposition === 'update';
  const byKey = new Map(rows.map(row => [row.rowKey, row]));
  for (const row of rows) {
    if (!row.pair || !writable(row)) continue;
    const partner = byKey.get(row.pair.partnerRowKey);
    if (!partner || partner.disposition !== 'skip') continue;
    if (resolutions[row.rowKey]?.action === 'skip') {
      row.disposition = 'skip';
      row.code = `${spec.prefix}_PARTNER_SKIPPED`;
      row.reason = `${spec.label}另一端（第 ${partner.rowNumber} 行）已跳过，本端一并跳过`;
      row.resolved = true;
      continue;
    }
    markReview(row, `${spec.prefix}_PARTNER_SKIPPED`, `${spec.label}另一端（第 ${partner.rowNumber} 行）不入账，单端不能入账：请一并跳过`, ['skip']);
  }
}

module.exports = { pairRows, enforcePairIntegrity, mutualUniquePairs };
