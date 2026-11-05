// client/src/components/CronStatus/priceDataState.js
//
// TASK-055（FS C-03）：价格同步「数据态」展示的**唯一**派生层。
//
// 边界（Task §3 / D-04 裁决）：
//   - 业务口径全部取服务端：expected / fetched / targetMarketDate / missing[] 原样使用；
//   - 唯一允许的换算是 fetched / expected → 展示百分比（本文件 computePercentage），钳制 0–100；
//   - 不读运行状态决定数据态；运行状态仅由卡片渲染为徽章；
//   - expected === 0 → 百分比 "—"、宽度 0，不是 0%；
//   - 无效字段 / null 不当 0，返回 invalid（异常态），不伪造绿色或完成度。
//
// 本文件只有一处百分比换算（见 computePercentage），供 AC6 的 grep 检测。

import { getStatusTone } from './statusTone';

const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_LEVELS = new Set(['ok', 'warn', 'bad', 'unknown']);

function isCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTargetDate(value) {
  return typeof value === 'string' && TARGET_DATE_PATTERN.test(value);
}

function deriveLevel(expected, fetched) {
  if (expected === 0) return 'unknown';
  if (fetched === 0) return 'bad';
  if (fetched < expected) return 'warn';
  return 'ok';
}

/**
 * 唯一展示换算：fetched / expected → 0–100；非法/无应采返回 null（绝不把 0/0 变成 NaN）。
 */
export function computePercentage(fetched, expected) {
  if (!isCount(fetched) || !isCount(expected) || expected <= 0) return null;
  const percent = (fetched / expected) * 100;
  return Math.min(100, Math.max(0, percent));
}

function invalidView() {
  return {
    mode: 'invalid',
    level: 'bad',
    tone: getStatusTone('bad'),
    targetText: '—',
    countsText: null,
    percent: null,
    percentText: '—',
    width: 0,
    missing: [],
    missingCount: 0,
    showMissingList: false,
    statusMessage: '数据异常',
    retryable: false
  };
}

/**
 * @param {{
 *   dataState?: object|null,
 *   dataStateLevel?: string,
 *   requestError?: any,
 * }} input
 */
export function getPriceView({ dataState = null, dataStateLevel = null, requestError = null } = {}) {
  if (requestError) {
    return {
      mode: 'request-error',
      level: 'bad',
      tone: getStatusTone('bad'),
      targetText: '—',
      countsText: null,
      percent: null,
      percentText: '—',
      width: 0,
      missing: [],
      missingCount: 0,
      showMissingList: false,
      statusMessage: '快照获取失败',
      retryable: true
    };
  }

  if (!dataState || typeof dataState !== 'object' || Array.isArray(dataState)) {
    return invalidView();
  }

  const expected = dataState.expected;
  const fetched = dataState.fetched;
  if (!isCount(expected) || !isCount(fetched)) {
    return invalidView();
  }

  const level = VALID_LEVELS.has(dataStateLevel)
    ? dataStateLevel
    : deriveLevel(expected, fetched);
  const tone = getStatusTone(level);
  const percent = computePercentage(fetched, expected);
  const missing = Array.isArray(dataState.missing) ? dataState.missing : [];

  let mode = 'complete';
  let statusMessage = '数据齐全';
  if (expected === 0) {
    mode = 'empty';
    statusMessage = '无应采资产';
  } else if (fetched === 0) {
    mode = 'all-missing';
    statusMessage = '疑似整体故障';
  } else if (fetched < expected) {
    mode = 'partial';
    statusMessage = '部分缺失';
  }

  return {
    mode,
    level,
    tone,
    targetText: isTargetDate(dataState.targetMarketDate) ? dataState.targetMarketDate : '—',
    countsText: `${fetched} / ${expected}`,
    percent,
    percentText: percent === null ? '—' : `${Math.round(percent)}%`,
    width: percent === null ? 0 : percent,
    missing,
    missingCount: missing.length,
    showMissingList: mode === 'partial' && missing.length > 0,
    statusMessage,
    retryable: false
  };
}
