// shared/services/taskRuns.service.js
//
// TASK-070：TaskRun 的只读投影与历史完整度来源。
// 只读 TaskRun；不触发任务、不修改状态、不保存原始价格序列。

const TaskRun = require('../models/taskRun');
const { OPS_TASK_CONFIG } = require('../config/opsTasks');
const { isStaleRun, normalizeProgress } = require('./taskRunner');

const INTEGRITY_TASK_NAME = OPS_TASK_CONFIG.priceIntegrity.taskName;

function runIdOf(doc) {
  return doc && doc._id !== undefined && doc._id !== null ? String(doc._id) : null;
}

/** TaskRun 的 HTTP 投影；不返回 lockKey，不暴露原始价格序列。 */
function serializeTaskRun(doc, { now = new Date(), staleAfterMs = OPS_TASK_CONFIG.priceIntegrity.staleAfterMs } = {}) {
  if (!doc) return null;
  return {
    runId: runIdOf(doc),
    taskName: doc.taskName ?? null,
    runKey: doc.runKey ?? null,
    trigger: doc.trigger ?? null,
    status: doc.status ?? null,
    stale: isStaleRun(doc, staleAfterMs, now),
    startedAt: doc.startedAt ?? null,
    endedAt: doc.endedAt ?? null,
    durationMs: Number.isFinite(doc.durationMs) ? doc.durationMs : null,
    progress: normalizeProgress(doc.progress),
    counts: {
      totalCount: Number.isFinite(doc.totalCount) ? doc.totalCount : 0,
      successCount: Number.isFinite(doc.successCount) ? doc.successCount : 0,
      failureCount: Number.isFinite(doc.failureCount) ? doc.failureCount : 0
    },
    failures: Array.isArray(doc.failures) ? doc.failures : [],
    result: doc.result && typeof doc.result === 'object' ? doc.result : null
  };
}

async function getTaskRunById(id) {
  return TaskRun.findById(id).lean();
}

/**
 * 最近一次可用于历史完整度的检查运行：
 * SUCCEEDED/PARTIAL（缺口会让任务成为 PARTIAL），且已结束并带 result.assets。
 */
async function findLatestUsableIntegrityRun() {
  return TaskRun.findOne({
    taskName: INTEGRITY_TASK_NAME,
    status: { $in: ['SUCCEEDED', 'PARTIAL'] },
    endedAt: { $ne: null },
    'result.assets': { $type: 'array' }
  }).sort({ startedAt: -1 }).lean();
}

function historyEntriesByAsset(run) {
  const assets = run?.result?.assets;
  if (!Array.isArray(assets)) return new Map();
  const entries = new Map();
  for (const entry of assets) {
    if (!entry || typeof entry !== 'object' || entry.assetId === undefined || entry.assetId === null) continue;
    entries.set(String(entry.assetId), entry);
  }
  return entries;
}

module.exports = {
  INTEGRITY_TASK_NAME,
  serializeTaskRun,
  getTaskRunById,
  findLatestUsableIntegrityRun,
  historyEntriesByAsset
};
