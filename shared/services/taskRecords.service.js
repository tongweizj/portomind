// shared/services/taskRecords.service.js
//
// TASK-075：运维中心「采集记录」。只读 TaskRun（及 TaskSkip 跳过事件）的列表投影，
// 服务端筛选与分页；不读取、不替代服务器原始日志，不修改任何运行状态。

const TaskRun = require('../models/taskRun');
const TaskSkip = require('../models/taskSkip');
const { OPS_TASK_CONFIG } = require('../config/opsTasks');
const { dateBounds } = require('../utils/marketTime');

const RECORD_TASK_NAMES = Object.freeze([
  OPS_TASK_CONFIG.priceSync.taskName,
  OPS_TASK_CONFIG.assetBackfill.taskName,
  OPS_TASK_CONFIG.assetBackfillBatch.taskName,
  OPS_TASK_CONFIG.priceIntegrity.taskName
]);

const DEFAULT_PAGE_SIZE = 20;

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/** ObjectId / 字符串 id 统一为字符串；缺失为 null。 */
function stringOrNull(value) {
  return value !== undefined && value !== null ? String(value) : null;
}

function taskNameMatch(taskName) {
  return { $in: taskName ? [taskName] : [...RECORD_TASK_NAMES] };
}

// 列表只需要 result 的范围摘要；逐资产数组留给详情读取，避免整页搬运大 result。
const RUN_PROJECTION = Object.freeze({
  _id: 1,
  kind: { $literal: 'run' },
  taskName: 1,
  runKey: 1,
  trigger: 1,
  status: 1,
  startedAt: 1,
  endedAt: 1,
  durationMs: 1,
  totalCount: 1,
  successCount: 1,
  failureCount: 1,
  scope: {
    marketGroup: { $ifNull: ['$result.marketGroup', null] },
    assetId: { $ifNull: ['$result.assetId', null] },
    symbol: { $ifNull: ['$result.symbol', null] },
    assetCount: {
      $ifNull: [
        '$result.assetCount',
        { $cond: [{ $isArray: '$result.assets' }, { $size: '$result.assets' }, null] }
      ]
    },
    from: {
      $ifNull: ['$result.from', { $ifNull: [{ $min: '$result.assets.from' }, { $min: '$result.assets.priceDate' }] }]
    },
    to: {
      $ifNull: ['$result.to', { $ifNull: [{ $max: '$result.assets.to' }, { $max: '$result.assets.priceDate' }] }]
    }
  }
});

/** 时间筛选按 MARKET_TIMEZONE 的自然日解释；to 含当日。 */
function dateRange(from, to) {
  const range = {};
  if (from) range.$gte = dateBounds(from).start;
  if (to) range.$lt = dateBounds(to).end;
  return Object.keys(range).length > 0 ? range : null;
}

function buildRunMatch({ taskName, assetId, from, to }) {
  const match = { taskName: taskNameMatch(taskName) };
  if (assetId) {
    // 单资产补采把资产记在 result.assetId；其余任务记在 result.assets[].assetId（均为字符串）。
    match.$or = [{ 'result.assetId': assetId }, { 'result.assets.assetId': assetId }];
  }
  const range = dateRange(from, to);
  if (range) match.startedAt = range;
  return match;
}

const SKIP_PROJECTION = Object.freeze({
  _id: 1,
  kind: { $literal: 'skip' },
  taskName: 1,
  runKey: 1,
  trigger: 1,
  reason: 1,
  activeRunKey: 1,
  startedAt: '$skippedAt'
});

function buildSkipMatch({ taskName, from, to }) {
  const match = { taskName: taskNameMatch(taskName) };
  const range = dateRange(from, to);
  if (range) match.skippedAt = range;
  return match;
}

function buildRecordsPipeline({ page, pageSize, ...filters }) {
  const stages = [
    { $match: buildRunMatch(filters) },
    { $project: RUN_PROJECTION }
  ];
  // 跳过事件不关联资产；按资产筛选时不并入，避免把无关事件算进该资产的记录。
  if (!filters.assetId) {
    stages.push({
      $unionWith: {
        coll: TaskSkip.collection.name,
        pipeline: [{ $match: buildSkipMatch(filters) }, { $project: SKIP_PROJECTION }]
      }
    });
  }
  return [
    ...stages,
    { $sort: { startedAt: -1, _id: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        total: [{ $count: 'count' }]
      }
    }
  ];
}

function serializeSkip(row) {
  return {
    kind: 'skip',
    skipId: stringOrNull(row._id),
    runId: null,
    taskName: row.taskName ?? null,
    runKey: row.runKey ?? null,
    trigger: row.trigger ?? null,
    status: 'SKIPPED',
    reason: row.reason ?? null,
    activeRunKey: row.activeRunKey ?? null,
    startedAt: row.startedAt ?? null,
    endedAt: null,
    durationMs: null,
    counts: null,
    scope: null
  };
}

function serializeRecord(row) {
  if (row.kind === 'skip') return serializeSkip(row);
  const scope = row.scope || {};
  return {
    kind: 'run',
    runId: stringOrNull(row._id),
    taskName: row.taskName ?? null,
    runKey: row.runKey ?? null,
    trigger: row.trigger ?? null,
    status: row.status ?? null,
    startedAt: row.startedAt ?? null,
    endedAt: row.endedAt ?? null,
    durationMs: finiteOr(row.durationMs, null),
    counts: {
      totalCount: finiteOr(row.totalCount, 0),
      successCount: finiteOr(row.successCount, 0),
      failureCount: finiteOr(row.failureCount, 0)
    },
    scope: {
      marketGroup: scope.marketGroup ?? null,
      assetId: stringOrNull(scope.assetId),
      symbol: scope.symbol ?? null,
      assetCount: finiteOr(scope.assetCount, null),
      from: scope.from ?? null,
      to: scope.to ?? null
    }
  };
}

async function listTaskRecords({ page = 1, pageSize = DEFAULT_PAGE_SIZE, taskName, assetId, from, to } = {}) {
  const [facet] = await TaskRun.aggregate(buildRecordsPipeline({ page, pageSize, taskName, assetId, from, to }));
  const items = Array.isArray(facet?.items) ? facet.items : [];
  const total = Number(facet?.total?.[0]?.count) || 0;
  return { data: items.map(serializeRecord), total };
}

// ── run 详情：四类任务的逐资产明细归一 ──
// status 统一为 succeeded | partial | failed | skipped；未知取值记 unknown，不猜成成功。

const SYNC_STATUS = Object.freeze({ fetched: 'succeeded', skipped: 'skipped', failed: 'failed' });
const INTEGRITY_STATUS = Object.freeze({
  OK: 'succeeded',
  GAP: 'partial',
  ERROR: 'failed',
  SKIPPED_NO_LAUNCH_DATE: 'skipped',
  INSUFFICIENT_SAMPLE: 'skipped'
});
const RUN_STATUS = Object.freeze({ SUCCEEDED: 'succeeded', PARTIAL: 'partial', FAILED: 'failed' });
const BATCH_STATUSES = new Set(['succeeded', 'partial', 'failed', 'skipped']);

function assetRow(entry, overrides) {
  return {
    assetId: stringOrNull(entry.assetId),
    symbol: entry.symbol ?? null,
    market: entry.market ?? null,
    status: 'unknown',
    reason: null,
    message: null,
    from: entry.from ?? null,
    to: entry.to ?? null,
    priceDate: null,
    missingCount: null,
    missingRanges: Array.isArray(entry.missingRanges) ? entry.missingRanges : [],
    missingRangesTruncated: entry.missingRangesTruncated === true,
    childRunId: null,
    ...overrides
  };
}

function failuresOf(doc) {
  return Array.isArray(doc.failures) ? doc.failures.filter((failure) => failure && typeof failure === 'object') : [];
}

/** 失败项的 item 是资产 symbol；按 symbol 合并同一资产的全部失败文案。 */
function failureMessagesBySymbol(doc) {
  const messages = new Map();
  for (const failure of failuresOf(doc)) {
    if (!failure.item || !failure.message) continue;
    messages.set(failure.item, [...(messages.get(failure.item) || []), failure.message]);
  }
  return messages;
}

function joinMessages(messages) {
  return messages && messages.length > 0 ? messages.join('；') : null;
}

function entriesOf(result) {
  return Array.isArray(result.assets) ? result.assets.filter((entry) => entry && typeof entry === 'object') : [];
}

const ASSET_RESULT_BUILDERS = Object.freeze({
  [OPS_TASK_CONFIG.priceSync.taskName]: (doc) => {
    const messages = failureMessagesBySymbol(doc);
    return entriesOf(doc.result).map((entry) => assetRow(entry, {
      status: SYNC_STATUS[entry.status] || 'unknown',
      reason: entry.reason ?? null,
      message: joinMessages(messages.get(entry.symbol)),
      priceDate: entry.priceDate ?? null
    }));
  },
  [OPS_TASK_CONFIG.priceIntegrity.taskName]: (doc) => {
    const messages = failureMessagesBySymbol(doc);
    return entriesOf(doc.result).map((entry) => {
      const status = INTEGRITY_STATUS[entry.status] || 'unknown';
      return assetRow(entry, {
        status,
        reason: status === 'succeeded' ? null : (entry.status ?? null),
        // 只给失败行并入错误文案；GAP 的 failures 文案与缺失计数重复，不再叠加。
        message: status === 'failed' ? joinMessages(messages.get(entry.symbol)) : null,
        missingCount: finiteOr(entry.missing, null)
      });
    });
  },
  [OPS_TASK_CONFIG.assetBackfill.taskName]: (doc) => {
    // 单资产补采的失败项都属于该资产：保留全部文案，原因取首个分类。
    const failures = failuresOf(doc);
    return [assetRow(doc.result, {
      status: RUN_STATUS[doc.status] || 'unknown',
      reason: failures[0]?.category ?? null,
      message: joinMessages(failures.map((failure) => failure.message).filter(Boolean)),
      missingCount: finiteOr(doc.result.missingAfterCount, null)
    })];
  },
  [OPS_TASK_CONFIG.assetBackfillBatch.taskName]: (doc) => entriesOf(doc.result).map((entry) => assetRow(entry, {
    status: BATCH_STATUSES.has(entry.status) ? entry.status : 'unknown',
    reason: entry.reason ?? null,
    message: entry.message ?? null,
    missingCount: finiteOr(entry.missingAfterCount, null),
    // 批量父任务的 assets[] 不带缺失区间，区间在子任务 childRunId 的详情里。
    missingRanges: [],
    missingRangesTruncated: false,
    childRunId: stringOrNull(entry.runId)
  }))
});

/**
 * 逐资产明细。result 缺失（运行中、旧记录或任务异常）时返回 null，
 * 读侧显示「暂无明细」，不当成「0 个资产 / 全部正常」。
 */
function buildAssetResults(doc) {
  const build = ASSET_RESULT_BUILDERS[doc?.taskName];
  if (!build || !doc.result || typeof doc.result !== 'object') return null;
  return build(doc);
}

module.exports = {
  RECORD_TASK_NAMES,
  DEFAULT_PAGE_SIZE,
  buildAssetResults,
  listTaskRecords
};
