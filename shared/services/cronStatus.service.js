// shared/services/cronStatus.service.js
//
// TASK-054（FS C-02）：`GET /api/cron/status` 的**唯一派生实现**（ExecPlan D-9）。
// 分层：controller 只做参数校验与响应封装；本文件负责 6 次只读查询 + 全部派生。
// 契约：ExecPlan §4.3（冻结）。要点：
//   - 只读：本文件不含任何写操作（不创建、不更新、不删除、不批量写）
//   - null ≠ 0：result 缺失时数据态数值一律 null（占位 display 由前端决定）
//   - D-16 有效目标日：目标日 = 最近一个「同步时点已过且开市」交易日之前的最近开市日，
//     周末/休市日/每日 03:00 前不把「尚未到采集时点」的交易日算作缺口
//   - D-20 符号匹配一律精确（asset.symbol === Price.symbol，写入时均已 uppercase）
//   - OD-5 dataStateLevel 只由数据态决定，运行态 status 不参与

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const mongoose = require('mongoose');

const TaskRun = require('../models/taskRun');
const Asset = require('../models/asset');
const Price = require('../models/price');
const Portfolio = require('../models/portfolio');
const FxRate = require('../models/fxRate');

const { isMarketOpenToday } = require('./calendar.service');
const { MARKET_TIMEZONE, dateBounds, marketDate } = require('../utils/marketTime');
const {
  CRON_TASK_NAMES,
  PRICE_TARGET_MAX_LOOKBACK_DAYS,
  PRICE_SYNC_DUE_HOUR,
  PRICE_SYNC_DUE_MINUTE,
  REBALANCE_PARENT_TASK,
  REBALANCE_CHILD_PREFIX,
  staleThresholdHours
} = require('../constants/cronStatus.constants');

dayjs.extend(utc);
dayjs.extend(timezone);

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

const NOTE_PRIORITY = [
  'CONTRACT_NOT_READY',
  'NO_TASK_RUN',
  'NO_OPEN_DAY',
  'EXPECTED_ZERO',
  'TARGET_LAGGED',
  'SYMBOL_FORMAT_MISMATCH',
  'UNSUPPORTED_MARKET',
  'DETAIL_NOT_REBALANCE',
  'PORTFOLIO_ID_INVALID',
  'PORTFOLIO_NOT_FOUND',
  'PORTFOLIO_ARCHIVED',
  'NO_DISTRIBUTION_RECORD'
];

function note(code, message) {
  return { code, message };
}

function sortNotes(notes) {
  return [...notes].sort(
    (a, b) => NOTE_PRIORITY.indexOf(a.code) - NOTE_PRIORITY.indexOf(b.code)
  );
}

function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// 脏数据护栏：把任意可解析值转成合法 Date，非法则 null（不得让接口 500）
function safeDate(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveTimezone() {
  return process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto';
}

function marketOf(asset) {
  return String(asset.market || '').trim().toUpperCase();
}

// T12:00:00Z 构造候选日：对 UTC−4…+8 的所有市场都落在同一日历日（ExecPlan D-12）
function isMarketOpenOn(market, dateStr) {
  return isMarketOpenToday(market, new Date(`${dateStr}T12:00:00.000Z`));
}

function syncInstantOf(dateStr, tz) {
  const hour = String(PRICE_SYNC_DUE_HOUR).padStart(2, '0');
  const minute = String(PRICE_SYNC_DUE_MINUTE).padStart(2, '0');
  return dayjs.tz(`${dateStr} ${hour}:${minute}:00`, tz);
}

// 从 dateStr 前一天起逐日回退，找最近开市日（不含 dateStr 本身）
function lastOpenDayBefore(market, dateStr, tz) {
  let cursor = dayjs.tz(dateStr, tz).subtract(1, 'day');
  for (let i = 0; i < PRICE_TARGET_MAX_LOOKBACK_DAYS; i += 1) {
    const candidate = cursor.format('YYYY-MM-DD');
    if (isMarketOpenOn(market, candidate)) return candidate;
    cursor = cursor.subtract(1, 'day');
  }
  return null;
}

/**
 * D-16：某市场本次同步「应已覆盖」的交易日。
 * dEff = 最近一个「开市 且 今日 03:00 同步时点已过」的交易日；
 * target = dEff 之前最近的交易日（因为 03:00 的同步写入的是前一交易日的数据）。
 */
function pickTargetInfo(market, now, tz) {
  const todayStr = marketDate(now, tz);
  const calendarPrevOpenDay = lastOpenDayBefore(market, todayStr, tz);
  let todayOpen = false;
  try {
    todayOpen = isMarketOpenOn(market, todayStr);
  } catch (error) {
    todayOpen = false;
  }
  const syncPassed = !dayjs(now).isBefore(syncInstantOf(todayStr, tz));
  const effectiveSyncDay = todayOpen && syncPassed ? todayStr : calendarPrevOpenDay;
  const targetMarketDate = effectiveSyncDay
    ? lastOpenDayBefore(market, effectiveSyncDay, tz)
    : null;
  return { todayStr, effectiveSyncDay, targetMarketDate, calendarPrevOpenDay };
}

// ---------------------------------------------------------------------------
// 运行态（Q1）
// ---------------------------------------------------------------------------

function loadLatestRuns() {
  return TaskRun.aggregate([
    { $match: { taskName: { $in: CRON_TASK_NAMES } } },
    { $sort: { startedAt: -1 } },
    { $group: { _id: '$taskName', doc: { $first: '$$ROOT' } } }
  ]);
}

function buildRunSummary(doc, taskName, now) {
  if (!doc) return { lastRun: null, stale: false };

  const rawStatus = doc.status || null;
  const startedAt = safeDate(doc.startedAt);
  const endedAt = safeDate(doc.endedAt);
  const thresholdMs = staleThresholdHours(taskName) * 60 * 60 * 1000;
  const stale = rawStatus === 'RUNNING'
    && startedAt !== null
    && startedAt.getTime() < now.getTime() - thresholdMs;

  return {
    stale,
    lastRun: {
      runKey: doc.runKey ?? null,
      trigger: doc.trigger ?? null,
      status: stale ? 'STALE' : rawStatus,
      rawStatus,
      startedAt: startedAt ? startedAt.toISOString() : null,
      endedAt: endedAt ? endedAt.toISOString() : null,
      durationMs: numOrNull(doc.durationMs),
      totalCount: numOrNull(doc.totalCount) ?? 0,
      successCount: numOrNull(doc.successCount) ?? 0,
      failureCount: numOrNull(doc.failureCount) ?? 0
    }
  };
}

// ---------------------------------------------------------------------------
// ① 价格同步数据态（AC2 / D-16 / D-17 / D-20）
// ---------------------------------------------------------------------------

async function buildPriceDataState({ now, tz, assets }) {
  const marketNames = [...new Set(assets.map(marketOf))].filter(Boolean);
  const supportedMarkets = [];
  const unsupportedMarkets = [];

  for (const market of marketNames) {
    try {
      isMarketOpenOn(market, marketDate(now, tz));
      supportedMarkets.push(market);
    } catch (error) {
      unsupportedMarkets.push(market);
    }
  }

  const infos = supportedMarkets.map((market) => ({
    market,
    ...pickTargetInfo(market, now, tz)
  }));

  const targetDates = [...new Set(infos.map((info) => info.targetMarketDate).filter(Boolean))];
  const buckets = targetDates.map((date) => ({ date, ...dateBounds(date) }));
  const symbolsByDate = new Map(buckets.map((bucket) => [bucket.date, new Set()]));

  if (buckets.length > 0) {
    const rows = await Price.find({
      $or: buckets.map((bucket) => ({ timestamp: { $gte: bucket.start, $lt: bucket.end } }))
    }).select('symbol timestamp').lean();

    for (const row of rows || []) {
      const ts = new Date(row.timestamp).getTime();
      const bucket = buckets.find(
        (item) => ts >= item.start.getTime() && ts < item.end.getTime()
      );
      if (bucket) {
        symbolsByDate.get(bucket.date).add(String(row.symbol || '').trim().toUpperCase());
      }
    }
  }

  const byMarket = {};
  const notListed = [];
  const missing = [];
  const notes = [];
  let totalExpected = 0;
  let totalFetched = 0;

  for (const info of infos) {
    const { market, targetMarketDate, calendarPrevOpenDay } = info;
    const marketAssets = assets.filter((asset) => marketOf(asset) === market);
    const missingAssets = [];
    let expected = 0;
    let fetched = 0;

    if (targetMarketDate) {
      const listed = [];
      for (const asset of marketAssets) {
        const launchAt = safeDate(asset.launchDate);
        if (launchAt) {
          const launchDateStr = marketDate(launchAt, MARKET_TIMEZONE);
          if (launchDateStr > targetMarketDate) {
            notListed.push({
              symbol: asset.symbol,
              name: asset.name ?? null,
              market,
              launchDate: launchDateStr
            });
            continue;
          }
        }
        listed.push(asset);
      }

      const priceSymbols = symbolsByDate.get(targetMarketDate) || new Set();
      expected = listed.length;
      for (const asset of listed) {
        const symbol = String(asset.symbol || '').trim().toUpperCase();
        if (priceSymbols.has(symbol)) {
          fetched += 1;
        } else {
          missingAssets.push({ symbol: asset.symbol, name: asset.name ?? null, market });
        }
      }
    } else {
      notes.push(note('NO_OPEN_DAY', `${market} 在 ${PRICE_TARGET_MAX_LOOKBACK_DAYS} 天内未找到交易日`));
    }

    byMarket[market] = { targetMarketDate, calendarPrevOpenDay, expected, fetched };
    totalExpected += expected;
    totalFetched += fetched;
    missing.push(...missingAssets);
  }

  const targetMarketDate = targetDates.length > 0
    ? targetDates.slice().sort().slice(-1)[0]
    : null;
  const calendarDates = infos.map((info) => info.calendarPrevOpenDay).filter(Boolean).sort();
  const calendarPrevOpenDay = calendarDates.length > 0
    ? calendarDates[calendarDates.length - 1]
    : null;

  const lagged = infos.filter(
    (info) => info.targetMarketDate && info.calendarPrevOpenDay
      && info.targetMarketDate !== info.calendarPrevOpenDay
  );
  if (lagged.length > 0) {
    const pairs = lagged
      .map((info) => `${info.market}: 目标 ${info.targetMarketDate} / 日历上一开市日 ${info.calendarPrevOpenDay}`)
      .join('；');
    notes.push(note('TARGET_LAGGED', `${pairs}（日历上一开市日的价将在下次 03:00 同步采集）`));
  }
  if (unsupportedMarkets.length > 0) {
    notes.push(note('UNSUPPORTED_MARKET', `无法识别市场的资产已排除：${unsupportedMarkets.join(', ')}`));
  }
  if (totalExpected === 0) {
    notes.push(note('EXPECTED_ZERO', '目标日应采资产数为 0（无 active 资产或全部未上市），不视为"已采齐"'));
  }

  let dayPriceSymbolCount = null;
  if (totalFetched === 0 && totalExpected > 0 && buckets.length > 0) {
    const distinctSymbols = await Price.distinct('symbol', {
      $or: buckets.map((bucket) => ({ timestamp: { $gte: bucket.start, $lt: bucket.end } }))
    });
    dayPriceSymbolCount = Array.isArray(distinctSymbols) ? distinctSymbols.length : 0;
    if (dayPriceSymbolCount > 0) {
      notes.push(note(
        'SYMBOL_FORMAT_MISMATCH',
        `目标日库内有价 symbol ${dayPriceSymbolCount} 个，但无一与 asset.symbol 精确匹配，先怀疑代码写法不一致`
      ));
    }
  }

  let dataStateLevel = 'unknown';
  if (targetMarketDate && totalExpected > 0) {
    if (totalFetched === 0) dataStateLevel = 'bad';
    else if (totalFetched < totalExpected) dataStateLevel = 'warn';
    else dataStateLevel = 'ok';
  }

  return {
    contractReady: true, // 价格数据态不依赖 taskruns.result，恒可得
    dataStateLevel,
    notes: sortNotes(notes),
    dataState: {
      targetMarketDate,
      calendarPrevOpenDay,
      expected: totalExpected,
      fetched: totalFetched,
      missing,
      byMarket,
      notListed,
      unsupportedMarkets,
      dayPriceSymbolCount
    }
  };
}

// ---------------------------------------------------------------------------
// ② 完整性检查数据态（AC3 / D-21 适配器）
// ---------------------------------------------------------------------------

function buildIntegrityDataState(doc) {
  const result = doc && doc.result ? doc.result : null;
  if (!result) {
    return {
      contractReady: false,
      dataStateLevel: 'unknown',
      notes: [note('CONTRACT_NOT_READY', 'taskruns.result 缺失（等 TASK-057/C-05 落地），完整性数值不可得')],
      dataState: {
        expectedCount: null,
        actualCount: null,
        missingCount: null,
        completenessRatio: null,
        skippedNoLaunchDate: null,
        gapAssets: []
      }
    };
  }

  const totals = result.totals && typeof result.totals === 'object' ? result.totals : {};
  let expectedCount = numOrNull(totals.expectedCount ?? result.expectedCount);
  let actualCount = numOrNull(totals.actualCount ?? result.actualCount);
  let missingCount = numOrNull(totals.missingCount ?? result.missingCount);

  // FS §4.3 / C-05 旧名兼容：{ok, gap}
  if (expectedCount === null && (result.ok !== undefined || result.gap !== undefined)) {
    actualCount = numOrNull(result.ok) ?? 0;
    missingCount = numOrNull(result.gap) ?? 0;
    expectedCount = actualCount + missingCount;
  }

  const completenessRatio = expectedCount !== null && expectedCount > 0 && actualCount !== null
    ? actualCount / expectedCount
    : null;
  const skippedNoLaunchDate = numOrNull(result.skippedCount ?? result.skippedNoLaunchDate);

  let gapAssets = [];
  if (Array.isArray(result.gapAssets)) {
    gapAssets = result.gapAssets
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        symbol: item.symbol ?? null,
        missingCount: numOrNull(item.missingCount)
      }));
  } else if (Array.isArray(result.assets)) {
    gapAssets = result.assets
      .filter((item) => item && typeof item === 'object')
      .filter((item) => (numOrNull(item.missingCount) ?? 0) > 0)
      .map((item) => ({ symbol: item.symbol ?? null, missingCount: numOrNull(item.missingCount) }));
  }

  const contractReady = expectedCount !== null && actualCount !== null && missingCount !== null;
  let dataStateLevel = 'unknown';
  if (contractReady) {
    if (missingCount === 0) dataStateLevel = 'ok';
    else if (expectedCount > 0 && missingCount >= expectedCount) dataStateLevel = 'bad';
    else dataStateLevel = 'warn';
  }

  return {
    contractReady,
    dataStateLevel,
    notes: contractReady ? [] : [note('CONTRACT_NOT_READY', 'taskruns.result 缺少完整性计数字段')],
    dataState: {
      expectedCount,
      actualCount,
      missingCount,
      completenessRatio,
      skippedNoLaunchDate,
      gapAssets
    }
  };
}

// ---------------------------------------------------------------------------
// ③ 提醒评估数据态（AC4 / D-21）
// ---------------------------------------------------------------------------

function buildAlertsDataState(doc) {
  const result = doc && doc.result ? doc.result : null;
  if (!result) {
    return {
      contractReady: false,
      dataStateLevel: 'unknown',
      notes: [note('CONTRACT_NOT_READY', 'taskruns.result 缺失（等 TASK-057/C-05 落地），提醒计数不可得')],
      dataState: { evaluated: null, created: null, archived: null, failed: null }
    };
  }

  const dataState = {
    evaluated: numOrNull(result.evaluated),
    // created 是"命中并新建"；旧名 alertsFired 仅作回退
    created: numOrNull(result.created ?? result.alertsFired),
    archived: numOrNull(result.archived),
    failed: numOrNull(result.failed)
  };
  const contractReady = Object.values(dataState).every((value) => value !== null);

  let dataStateLevel = 'unknown';
  if (contractReady) dataStateLevel = dataState.failed > 0 ? 'bad' : 'ok';

  return {
    contractReady,
    dataStateLevel,
    notes: contractReady ? [] : [note('CONTRACT_NOT_READY', 'taskruns.result 缺少提醒计数字段')],
    dataState
  };
}

// ---------------------------------------------------------------------------
// ④ 汇率同步数据态（AC5 / D-18）
// ---------------------------------------------------------------------------

async function loadFxCount(tz) {
  const rows = await FxRate.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: tz } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: -1 } },
    { $limit: 1 }
  ]);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return numOrNull(rows[0].count);
}

function normalizeCurrencies(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const normalized = {};
  for (const [currency, value] of Object.entries(raw)) {
    if (value && typeof value === 'object') {
      normalized[currency] = {
        ok: value.ok === true,
        rateToCny: numOrNull(value.rateToCny)
      };
    } else {
      normalized[currency] = {
        ok: value === true || value === 'ok',
        rateToCny: numOrNull(value)
      };
    }
  }
  return normalized;
}

function buildFxDataState(doc, fxCountFromCollection) {
  const result = doc && doc.result ? doc.result : null;
  let currencies = null;
  let fxCount = fxCountFromCollection;

  if (result) {
    if (result.currencies && typeof result.currencies === 'object') {
      currencies = normalizeCurrencies(result.currencies);
    } else if (result.rates && typeof result.rates === 'object') {
      currencies = normalizeCurrencies(result.rates);
    }
    if (result.fxCount !== undefined && result.fxCount !== null) {
      fxCount = numOrNull(result.fxCount);
    }
  }

  const contractReady = currencies !== null;
  let dataStateLevel = 'unknown';
  if (contractReady) {
    const entries = Object.values(currencies);
    const okCount = entries.filter((item) => item.ok).length;
    if (entries.length > 0 && okCount === entries.length) dataStateLevel = 'ok';
    else if (okCount === 0) dataStateLevel = 'bad';
    else dataStateLevel = 'warn';
  }

  return {
    contractReady,
    dataStateLevel,
    // 降级必须带解释（ExecPlan §4.7：4 项 contractReady=false → notes:[CONTRACT_NOT_READY]）
    notes: contractReady
      ? []
      : [note(
        'CONTRACT_NOT_READY',
        result
          ? 'taskruns.result 缺少 currencies/rates 字段（等 TASK-057/C-05 冻结形态）；fxCount 仅表示最新汇率日的记录数'
          : 'taskruns.result 缺失（等 TASK-057/C-05 落地），汇率币种明细不可得；fxCount 仅表示最新汇率日的记录数'
      )],
    dataState: { fxCount, currencies }
  };
}

// ---------------------------------------------------------------------------
// ⑤ 再平衡分发数据态（AC6 / D-8）
// ---------------------------------------------------------------------------

function loadRebalanceRuns(dateRange) {
  const match = {
    $or: [
      { taskName: REBALANCE_PARENT_TASK },
      { taskName: { $regex: `^${REBALANCE_CHILD_PREFIX}` } }
    ]
  };
  if (dateRange) {
    match.startedAt = { $gte: dateRange.start, $lt: dateRange.end };
  }
  return TaskRun.aggregate([
    { $match: match },
    { $sort: { startedAt: -1 } },
    { $group: { _id: '$taskName', doc: { $first: '$$ROOT' } } }
  ]);
}

function buildRebalanceRows({ runs = [], portfolios = [], tz, date = null }) {
  const parentDoc = runs.find((item) => item._id === REBALANCE_PARENT_TASK)?.doc || null;
  const children = new Map();
  for (const item of runs) {
    const taskName = String(item._id || '');
    if (taskName.startsWith(REBALANCE_CHILD_PREFIX)) {
      children.set(taskName.slice(REBALANCE_CHILD_PREFIX.length), item.doc || null);
    }
  }

  const parentResult = parentDoc && parentDoc.result ? parentDoc.result : null;
  const perPortfolio = parentResult && Array.isArray(parentResult.perPortfolio)
    ? parentResult.perPortfolio
    : null;
  const contractReady = Array.isArray(perPortfolio);
  // result 为 Mixed 且未经校验：逐项过滤 null/非对象，避免一条脏数据把整个端点打成 500
  const resultByPortfolio = new Map(
    (perPortfolio || [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => [String(item.portfolioId), item])
  );

  const rows = portfolios.map((portfolio) => {
    const portfolioId = String(portfolio._id);
    const child = children.get(portfolioId) || null;
    const result = contractReady ? resultByPortfolio.get(portfolioId) || null : null;
    return {
      portfolioId,
      portfolioName: portfolio.name ?? null,
      accountType: portfolio.accountType ?? 'other',
      schedule: portfolio.rebalanceSettings?.rebalanceSchedule ?? null,
      archived: portfolio.archived === true,
      due: result ? result.due === true : null,
      needsRebalance: result && typeof result.needsRebalance === 'boolean'
        ? result.needsRebalance
        : null,
      suggestionsCount: result ? numOrNull(result.suggestionsCount) : null,
      recordId: result && result.recordId !== undefined && result.recordId !== null
        ? String(result.recordId)
        : null,
      runStatus: child ? child.status ?? null : null,
      failures: child && Array.isArray(child.failures)
        ? child.failures
          .filter((failure) => failure && typeof failure === 'object')
          .map((failure) => ({
            item: failure.item ?? null,
            category: failure.category ?? null,
            message: failure.message ?? null
          }))
        : []
    };
  });

  const failures = rows.flatMap((row) => row.failures.map((failure) => ({
    portfolioId: row.portfolioId,
    ...failure
  })));

  const childDates = [...children.values()]
    .map((child) => (child ? safeDate(child.startedAt) : null))
    .filter(Boolean)
    .map((startedAt) => marketDate(startedAt, tz))
    .sort();
  const perPortfolioDate = date || (childDates.length > 0 ? childDates[childDates.length - 1] : null);

  return {
    rows,
    failures,
    parentResult,
    contractReady,
    perPortfolioDate,
    due: contractReady ? rows.filter((row) => row.due === true).length : null,
    generatedCount: contractReady
      ? rows.filter((row) => (row.suggestionsCount ?? 0) > 0).length
      : null,
    totalPortfolios: parentResult ? numOrNull(parentResult.totalPortfolios) : null,
    skippedCount: parentResult ? numOrNull(parentResult.skippedCount) : null
  };
}

function rebalanceLevel({ contractReady, due, generatedCount, failures }) {
  if (!contractReady) return 'unknown';
  if (due > 0 && generatedCount < due) return 'bad';
  if (failures.length > 0) return 'warn';
  return 'ok';
}

async function buildRebalanceState({ tz }) {
  const runs = await loadRebalanceRuns(null);
  const portfolioDocs = await Portfolio.find({ archived: { $ne: true } })
    .select('name accountType archived rebalanceSettings.rebalanceSchedule')
    .lean();
  const portfolios = (portfolioDocs || []).filter((portfolio) => portfolio.archived !== true);
  const built = buildRebalanceRows({ runs, portfolios, tz, date: null });
  const notes = built.contractReady
    ? []
    : [note('CONTRACT_NOT_READY', '父任务 rebalance-check 的 result 缺失（等 TASK-057/C-05 落地），到期/生成数不可得')];

  return {
    contractReady: built.contractReady,
    dataStateLevel: rebalanceLevel(built),
    notes,
    dataState: {
      perPortfolioDate: built.perPortfolioDate,
      due: built.due,
      totalPortfolios: built.totalPortfolios,
      skippedCount: built.skippedCount,
      generatedCount: built.generatedCount,
      perPortfolio: built.rows,
      failures: built.failures
    }
  };
}

// ---------------------------------------------------------------------------
// 详情视图（AC8）
// ---------------------------------------------------------------------------

function emptySummary() {
  return { totalPortfolios: null, due: null, generated: null, failed: 0, skipped: null };
}

async function getRebalanceDetail({ now, tz, date, portfolioId }) {
  const generatedAt = new Date(now).toISOString();

  if (portfolioId && !mongoose.isValidObjectId(portfolioId)) {
    return {
      date: date || marketDate(now, tz),
      contractReady: false,
      generatedAt,
      summary: emptySummary(),
      rows: [],
      notes: [note('PORTFOLIO_ID_INVALID', `portfolioId 不是合法的 ObjectId：${portfolioId}`)]
    };
  }

  let effectiveDate = date || null;
  if (!effectiveDate) {
    const recentRuns = await loadRebalanceRuns(null);
    const parent = recentRuns.find((item) => item._id === REBALANCE_PARENT_TASK)?.doc || null;
    const childDates = recentRuns
      .filter((item) => String(item._id || '').startsWith(REBALANCE_CHILD_PREFIX))
      .map((item) => {
        const startedAt = item.doc ? safeDate(item.doc.startedAt) : null;
        return startedAt ? marketDate(startedAt, tz) : null;
      })
      .filter(Boolean)
      .sort();
    const parentStartedAt = parent ? safeDate(parent.startedAt) : null;
    if (parentStartedAt) effectiveDate = marketDate(parentStartedAt, tz);
    else if (childDates.length > 0) effectiveDate = childDates[childDates.length - 1];
    else effectiveDate = marketDate(now, tz);
  }

  const runs = await loadRebalanceRuns(dateBounds(effectiveDate));
  const portfolioDocs = await Portfolio.find({})
    .select('name accountType archived rebalanceSettings.rebalanceSchedule')
    .lean();
  const allPortfolios = portfolioDocs || [];

  const notes = [];
  let selected;
  if (portfolioId) {
    const matched = allPortfolios.find((portfolio) => String(portfolio._id) === String(portfolioId));
    if (!matched) {
      return {
        date: effectiveDate,
        contractReady: false,
        generatedAt,
        summary: emptySummary(),
        rows: [],
        notes: [note('PORTFOLIO_NOT_FOUND', `组合不存在：${portfolioId}`)]
      };
    }
    selected = [matched];
    if (matched.archived === true) {
      notes.push(note('PORTFOLIO_ARCHIVED', '该组合已归档，仅展示历史分发记录'));
    }
  } else {
    selected = allPortfolios.filter((portfolio) => portfolio.archived !== true);
  }

  const hasRuns = runs.length > 0;
  const built = buildRebalanceRows({ runs, portfolios: selected, tz, date: effectiveDate });
  const rows = hasRuns ? built.rows : [];

  if (!built.contractReady) {
    notes.push(note('CONTRACT_NOT_READY', '父任务 rebalance-check 的 result 缺失（等 TASK-057/C-05 落地）'));
  }
  if (!hasRuns) {
    notes.push(note('NO_DISTRIBUTION_RECORD', `该日无再平衡分发记录：${effectiveDate}`));
  }

  const summary = {
    totalPortfolios: built.totalPortfolios,
    due: built.contractReady ? rows.filter((row) => row.due === true).length : null,
    generated: built.contractReady
      ? rows.filter((row) => (row.suggestionsCount ?? 0) > 0).length
      : null,
    failed: rows.filter((row) => row.runStatus === 'FAILED').length,
    skipped: built.skippedCount
  };

  return {
    date: effectiveDate,
    contractReady: built.contractReady,
    generatedAt,
    summary,
    rows,
    notes: sortNotes(notes)
  };
}

// ---------------------------------------------------------------------------
// 对外编排
// ---------------------------------------------------------------------------

function buildResultTaskEntry({ taskName, doc, now, built }) {
  const { lastRun, stale } = buildRunSummary(doc, taskName, now);
  return {
    taskName,
    lastRun,
    stale,
    contractReady: built.contractReady,
    dataState: built.dataState,
    dataStateLevel: built.dataStateLevel,
    notes: sortNotes(built.notes)
  };
}

/**
 * GET /api/cron/status 的唯一入口。
 * @param {object} options
 * @param {Date} [options.now]           可注入的当前时间（测试用）
 * @param {string|null} [options.detail] 目前只接受 'rebalance'
 * @param {string|null} [options.date]   已由 controller 校验过的 YYYY-MM-DD
 * @param {string|null} [options.portfolioId]
 */
async function getStatus({ now = new Date(), detail = null, date = null, portfolioId = null } = {}) {
  const tz = resolveTimezone();
  const current = now instanceof Date ? now : new Date(now);

  if (detail === 'rebalance') {
    return getRebalanceDetail({ now: current, tz, date, portfolioId });
  }

  const latestRuns = await loadLatestRuns();
  const runByTask = new Map(
    (latestRuns || []).map((item) => [String(item._id), item.doc || null])
  );

  const assets = await Asset.find({ active: true })
    .select('symbol name market launchDate')
    .lean();

  const priceState = await buildPriceDataState({ now: current, tz, assets: assets || [] });
  const fxCount = await loadFxCount(tz);

  const priceEntry = {
    taskName: 'daily-price-sync',
    ...buildRunSummary(runByTask.get('daily-price-sync') || null, 'daily-price-sync', current),
    contractReady: priceState.contractReady,
    dataState: priceState.dataState,
    dataStateLevel: priceState.dataStateLevel,
    notes: sortNotes(priceState.notes)
  };

  const integrity = buildIntegrityDataState(runByTask.get('price-integrity-check') || null);
  const alerts = buildAlertsDataState(runByTask.get('alert-evaluate') || null);
  const fx = buildFxDataState(runByTask.get('fx-rate-sync') || null, fxCount);
  const rebalance = await buildRebalanceState({ tz });

  return {
    generatedAt: current.toISOString(),
    timezone: tz,
    staleThresholdHours: staleThresholdHours('daily-price-sync'),
    tasks: [
      priceEntry,
      buildResultTaskEntry({ taskName: 'price-integrity-check', doc: runByTask.get('price-integrity-check') || null, now: current, built: integrity }),
      buildResultTaskEntry({ taskName: 'alert-evaluate', doc: runByTask.get('alert-evaluate') || null, now: current, built: alerts }),
      buildResultTaskEntry({ taskName: 'fx-rate-sync', doc: runByTask.get('fx-rate-sync') || null, now: current, built: fx }),
      buildResultTaskEntry({ taskName: 'rebalance-check', doc: runByTask.get('rebalance-check') || null, now: current, built: rebalance })
    ]
  };
}

module.exports = { getStatus };
