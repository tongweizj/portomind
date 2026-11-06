// client/src/components/CronStatus/taskDataViews.js
//
// TASK-063：五卡真实数据的**唯一展示派生层**（镜像 055 的 priceDataState 模式）。
//
// 规则：
//   - 业务数值只读 API 信封；缺失/非法一律 "—"/UNKNOWN，禁止用 0 兜底；
//   - 配色只经 statusTone；不读 lastRun.status 填绿；
//   - 四卡逐卡派生 + 总览判定都在这里，组件只负责渲染；
//   - 价格卡派生仍由 055 的 getPriceView 负责，本文件不重复实现。

import { getStatusTone } from './statusTone';
import { BOARD_SLOTS, UNKNOWN_TEXT, formatNumber, formatTimestamp } from './unknownValue';

const VALID_LEVELS = new Set(['ok', 'warn', 'bad', 'unknown']);

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeNumber(value) {
  const num = finiteNumber(value);
  return num !== null && num >= 0 ? num : null;
}

function displayNumber(value) {
  const num = nonNegativeNumber(value);
  return num === null ? '—' : formatNumber(num);
}

function normalizeLevel(value) {
  return VALID_LEVELS.has(value) ? value : 'unknown';
}

function lastSkipText(task) {
  const skip = task && task.lastSkip && typeof task.lastSkip === 'object' ? task.lastSkip : null;
  if (!skip) return null;
  const when = formatTimestamp(skip.skippedAt);
  const reason = typeof skip.reason === 'string' && skip.reason.length > 0 ? skip.reason : UNKNOWN_TEXT;
  if (when === '—' && reason === UNKNOWN_TEXT) return null;
  return `最近跳过 ${when} · ${reason}`;
}

function noteMessages(task) {
  if (!task || !Array.isArray(task.notes)) return [];
  return task.notes
    .filter((note) => note && typeof note === 'object' && typeof note.message === 'string')
    .map((note) => note.message)
    .slice(0, 2);
}

/**
 * 所有任务卡共用的基础视图。任务信封缺失/坏格式时降级，不抛错。
 */
export function buildBaseView(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return {
      present: false,
      level: 'unknown',
      contractReady: false,
      stale: false,
      lastRun: null,
      lastSkipText: null,
      runStateText: UNKNOWN_TEXT,
      lastRunText: '—',
      statusMessage: '暂无运行记录',
      empty: 'missing',
      details: [],
      notes: [],
      keyMetricText: '—',
      anomalyText: '—',
      anomalyCount: null,
      ratio: null
    };
  }

  const lastRun = task.lastRun && typeof task.lastRun === 'object' ? task.lastRun : null;
  const contractReady = task.contractReady === true;
  const stale = task.stale === true;
  const rawLevel = normalizeLevel(task.dataStateLevel);
  const level = contractReady ? rawLevel : 'unknown';
  const runState = lastRun && typeof lastRun.status === 'string' ? lastRun.status : null;
  const runStateText = stale ? '超时未完成' : (runState || UNKNOWN_TEXT);

  let empty = null;
  if (!lastRun) empty = 'no-run';
  else if (!contractReady) empty = 'contract';

  return {
    present: true,
    level,
    contractReady,
    stale,
    lastRun,
    lastSkipText: lastSkipText(task),
    runStateText,
    lastRunText: lastRun ? formatTimestamp(lastRun.startedAt) : '—',
    statusMessage: empty === 'no-run'
      ? '暂无运行记录'
      : (empty === 'contract' ? '结果契约未就绪' : null),
    empty,
    details: [],
    notes: noteMessages(task),
    keyMetricText: '—',
    anomalyText: '—',
    anomalyCount: null,
    ratio: null
  };
}

export function buildUnavailableView({ message = '快照获取失败', level = 'bad' } = {}) {
  return {
    present: false,
    level: normalizeLevel(level),
    contractReady: false,
    stale: false,
    lastRun: null,
    lastSkipText: null,
    runStateText: '不可用',
    lastRunText: '—',
    statusMessage: message,
    empty: 'request-error',
    details: [],
    notes: [],
    keyMetricText: '—',
    anomalyText: '—',
    anomalyCount: null,
    ratio: null
  };
}

export function buildLoadingView() {
  return {
    present: false,
    level: 'unknown',
    contractReady: false,
    stale: false,
    lastRun: null,
    lastSkipText: null,
    runStateText: '加载中',
    lastRunText: '—',
    statusMessage: '加载中…',
    empty: 'loading',
    details: [],
    notes: [],
    keyMetricText: '—',
    anomalyText: '—',
    anomalyCount: null,
    ratio: null
  };
}

function invalidView(base, message = '数据格式异常') {
  return {
    ...base,
    level: 'bad',
    empty: 'invalid',
    statusMessage: message,
    anomalyText: '—'
  };
}

export function buildIntegrityView(task) {
  const base = buildBaseView(task);
  if (!base.present || base.empty || !base.contractReady) return base;

  const data = task.dataState && typeof task.dataState === 'object' ? task.dataState : {};
  const expected = nonNegativeNumber(data.expectedCount);
  const actual = nonNegativeNumber(data.actualCount);
  const missing = nonNegativeNumber(data.missingCount);
  const skipped = nonNegativeNumber(data.skippedNoLaunchDate);
  if (expected === null || actual === null || missing === null) return invalidView(base);
  const gapAssets = Array.isArray(data.gapAssets)
    ? data.gapAssets.filter((item) => item && typeof item === 'object')
    : [];

  const gapSummary = gapAssets.length > 0
    ? gapAssets.slice(0, 3)
      .map((item) => `${item.symbol ?? '—'} 缺 ${displayNumber(item.missingCount)}`)
      .join('；')
    : '暂无缺口';

  return {
    ...base,
    empty: expected === 0 ? 'zero' : base.empty,
    keyMetricText: `缺口 ${displayNumber(missing)}`,
    anomalyText: displayNumber(missing),
    anomalyCount: missing,
    statusMessage: missing === null
      ? '缺口未知'
      : (missing === 0 ? '数据齐全' : `缺 ${displayNumber(missing)} 项`),
    details: [
      { label: '应采 / 实际', value: `${displayNumber(expected)} / ${displayNumber(actual)}` },
      { label: '缺口', value: displayNumber(missing) },
      { label: '跳过（无 launchDate）', value: displayNumber(skipped) },
      { label: '缺口资产', value: gapSummary }
    ]
  };
}

export function buildAlertView(task) {
  const base = buildBaseView(task);
  if (!base.present || base.empty || !base.contractReady) return base;

  const data = task.dataState && typeof task.dataState === 'object' ? task.dataState : {};
  const evaluated = nonNegativeNumber(data.evaluated);
  const created = nonNegativeNumber(data.created);
  const archived = nonNegativeNumber(data.archived);
  const failed = nonNegativeNumber(data.failed);

  if (evaluated === null || created === null || archived === null || failed === null) {
    return invalidView(base);
  }

  const zeroHit = created === 0 && failed === 0;

  return {
    ...base,
    keyMetricText: `评估 ${displayNumber(evaluated)}`,
    anomalyText: displayNumber(failed),
    anomalyCount: failed,
    statusMessage: zeroHit
      ? '零命中属正常'
      : (failed !== null && failed > 0 ? `失败 ${displayNumber(failed)} 条` : '已完成'),
    details: [
      { label: '评估', value: displayNumber(evaluated) },
      { label: '新建', value: displayNumber(created) },
      { label: '归档', value: displayNumber(archived) },
      { label: '失败', value: displayNumber(failed) }
    ]
  };
}

export function buildFxView(task) {
  const base = buildBaseView(task);
  if (!base.present || base.empty || !base.contractReady) return base;

  const data = task.dataState && typeof task.dataState === 'object' ? task.dataState : {};
  const currencies = data.currencies && typeof data.currencies === 'object' && !Array.isArray(data.currencies)
    ? data.currencies
    : null;

  if (!currencies) return invalidView(base);

  const details = [];
  let failures = 0;
  if (currencies) {
    for (const [currency, observation] of Object.entries(currencies)) {
      if (!observation || typeof observation !== 'object') {
        details.push({ label: currency, value: '未知' });
        continue;
      }
      const rate = finiteNumber(observation.rateToCny);
      if (observation.ok === true && rate !== null && rate > 0) {
        details.push({ label: currency, value: `${rate}（本次写入成功）` });
      } else if (observation.ok === false) {
        failures += 1;
        details.push({ label: currency, value: '同步失败' });
      } else if (rate !== null && rate > 0) {
        details.push({ label: currency, value: `${rate}（仅观测，不证明同步成功）` });
      } else {
        details.push({ label: currency, value: '未知' });
      }
    }
  }

  return {
    ...base,
    keyMetricText: `币种 ${displayNumber(data.fxCount)}`,
    anomalyText: failures > 0 ? String(failures) : '—',
    anomalyCount: failures > 0 ? failures : null,
    statusMessage: '同步成功不证明汇率方向正确',
    details,
    notes: [
      ...base.notes,
      '同步成功不证明汇率方向正确（汇率方向缺陷归 TASK-051）'
    ].slice(0, 3)
  };
}

export function buildRebalanceView(task) {
  const base = buildBaseView(task);
  if (!base.present || base.empty || !base.contractReady) {
    return {
      ...base,
      statusMessage: base.present ? '无父结果，未到期未知' : base.statusMessage
    };
  }

  const data = task.dataState && typeof task.dataState === 'object' ? task.dataState : {};
  const due = nonNegativeNumber(data.due);
  const total = nonNegativeNumber(data.totalPortfolios);
  const generated = nonNegativeNumber(data.generatedCount);
  const skipped = nonNegativeNumber(data.skippedCount);
  if (due === null) return invalidView(base);
  const rows = Array.isArray(data.perPortfolio) ? data.perPortfolio : [];

  let notExceeded = 0;
  let failed = 0;
  const failureReasons = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (row.needsRebalance === false) notExceeded += 1;
    const rowFailures = Array.isArray(row.failures) ? row.failures : [];
    if (row.status === 'FAILED' || rowFailures.length > 0) {
      failed += 1;
      const reason = row.failureReason
        || (rowFailures[0] && rowFailures[0].message)
        || rowFailures[0]?.category
        || '失败';
      failureReasons.push(`${row.portfolioId ?? '—'}：${reason}`);
    }
  }

  return {
    ...base,
    keyMetricText: due === null ? '到期 —' : `到期 ${displayNumber(due)}`,
    anomalyText: failed > 0 ? String(failed) : '—',
    anomalyCount: failed > 0 ? failed : null,
    statusMessage: due === null
      ? '到期未知'
      : (failed > 0 ? `失败 ${failed} 个组合` : `到期 ${displayNumber(due)} · 生成 ${displayNumber(generated)}`),
    details: [
      { label: '到期 / 总组合', value: `${displayNumber(due)} / ${displayNumber(total)}` },
      { label: '生成建议', value: displayNumber(generated) },
      { label: '未超阈', value: displayNumber(notExceeded) },
      { label: '失败', value: displayNumber(failed) },
      { label: '跳过', value: displayNumber(skipped) }
    ],
    notes: failureReasons.length > 0
      ? [...base.notes, ...failureReasons.slice(0, 2)]
      : base.notes
  };
}

/**
 * 总览判定（AC1/AC5）：
 *   bad > warn > 数据未就绪（unknown/缺项/契约未就绪）> 全部正常。
 * 只有五项 dataStateLevel 全 ok、全部 contractReady、无 stale 且无缺项，才「全部正常」。
 */
export function buildOverview(entries, { requestError = null, hasSnapshot = false, isLoading = false, generatedAt = null } = {}) {
  const safeEntries = BOARD_SLOTS.map((_slot, index) => entries[index] || null);
  const levels = safeEntries.map((entry) => (entry && entry.present ? normalizeLevel(entry.level) : 'unknown'));

  if (isLoading && !hasSnapshot) {
    return {
      overallState: '加载中',
      overallLevel: 'unknown',
      levels: levels.map(() => 'unknown'),
      snapshotAt: '—',
      staleNote: null
    };
  }

  if (requestError && !hasSnapshot) {
    return {
      overallState: '快照获取失败',
      overallLevel: 'bad',
      levels: levels.map(() => 'bad'),
      snapshotAt: '—',
      staleNote: null
    };
  }

  if (requestError && hasSnapshot) {
    const when = generatedAt ? formatTimestamp(generatedAt) : '—';
    return {
      overallState: '刷新失败 · 数据过时',
      overallLevel: 'warn',
      levels,
      snapshotAt: generatedAt || '—',
      staleNote: `数据为 ${when} 时快照，刷新失败`
    };
  }

  const allPresent = safeEntries.every((entry) => Boolean(entry && entry.present));
  const allRun = safeEntries.every((entry) => Boolean(entry && entry.hasRun));
  const hasBad = levels.includes('bad');
  const hasWarn = levels.includes('warn') || safeEntries.some((entry) => entry && entry.stale);
  const hasUnknown = levels.includes('unknown')
    || !allRun
    || safeEntries.some((entry) => !entry || !entry.present || !entry.contractReady);

  let overallLevel = 'unknown';
  let overallState = '数据未就绪';
  if (hasBad) {
    overallLevel = 'bad';
    overallState = '失败';
  } else if (hasWarn) {
    overallLevel = 'warn';
    overallState = '需关注';
  } else if (allPresent && allRun && !hasUnknown && levels.every((level) => level === 'ok')) {
    overallLevel = 'ok';
    overallState = '全部正常';
  }

  return {
    overallState,
    overallLevel,
    levels,
    snapshotAt: generatedAt || '—',
    staleNote: null
  };
}

export { getStatusTone };
