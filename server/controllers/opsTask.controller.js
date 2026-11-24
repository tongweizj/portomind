// server/controllers/opsTask.controller.js
//
// TASK-070：运维中心 task-run 读取与手动 integrity-check 触发。
// TASK-071：手动 daily-price-sync 触发。
// TASK-072：单资产历史补采（同步等待 200 + 摘要）。
// 协议层只做参数/状态码/响应包装；业务与 TaskRun 生命周期在 shared。

const mongoose = require('mongoose');
const { startPriceIntegrityCheck } = require('@portomind/shared/tasks/priceIntegrityCheck');
const { startDailySync } = require('@portomind/shared/tasks/dailySync');
const {
  startAssetHistoryBackfill: startAssetHistoryBackfillTask
} = require('@portomind/shared/tasks/assetHistoryBackfill');
const {
  getTaskRunById,
  serializeTaskRun
} = require('@portomind/shared/services/taskRuns.service');
const { staleAfterMsFor } = require('@portomind/shared/config/opsTasks');
const { success, failure } = require('../utils/apiResponse');

function hasUnexpectedBody(body) {
  if (body === undefined || body === null) return false;
  return typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0;
}

function parseMarketGroupBody(body) {
  if (body === undefined || body === null) return { ok: true, marketGroup: undefined };
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'price-sync accepts a JSON object with optional marketGroup' };
  }
  const keys = Object.keys(body);
  if (keys.some((key) => key !== 'marketGroup')) {
    return { ok: false, message: 'price-sync only accepts the marketGroup field' };
  }
  // 市场组取值由 shared 的 assertMarketGroup 统一校验，避免在此复制 PRICE_SYNC_GROUPS。
  return { ok: true, marketGroup: body.marketGroup };
}

function parseBackfillBody(body) {
  if (body === undefined || body === null) return { ok: true, value: {} };
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'price-backfill accepts a JSON object' };
  }
  const allowed = new Set(['from', 'to', 'year']);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { ok: false, message: 'price-backfill only accepts from, to or year' };
  }
  return { ok: true, value: body };
}

function backfillResponse(summary) {
  const result = summary.result || {};
  return {
    runId: summary.runId,
    status: summary.status,
    assetId: result.assetId ?? null,
    symbol: result.symbol ?? null,
    market: result.market ?? null,
    from: result.from ?? null,
    to: result.to ?? null,
    expectedCount: result.expectedCount ?? null,
    missingBeforeCount: result.missingBeforeCount ?? null,
    missingAfterCount: result.missingAfterCount ?? null,
    fetchedCount: result.fetchedCount ?? null,
    failures: Array.isArray(summary.failures) ? summary.failures : []
  };
}

function acceptedRun(res, handle) {
  return success(res, {
    runId: handle.runId,
    taskName: handle.taskName,
    runKey: handle.runKey,
    status: handle.status,
    startedAt: handle.startedAt
  }, { status: 202 });
}

function conflictRun(req, res, handle) {
  return failure(
    req, res, 409, `${handle.taskName} is already running`,
    { activeRun: handle.activeRun },
    { code: 'TASK_ALREADY_RUNNING' }
  );
}

exports.startIntegrityCheck = async (req, res, next) => {
  if (hasUnexpectedBody(req.body)) {
    return failure(req, res, 400, 'integrity-check accepts an empty request body');
  }
  try {
    const handle = await startPriceIntegrityCheck({ trigger: 'MANUAL', repair: false });
    if (!handle.ok) return conflictRun(req, res, handle);
    // 后台执行已由 taskRunner 内部兜住 rejection；这里只返回启动句柄。
    return acceptedRun(res, handle);
  } catch (error) {
    return next(error);
  }
};

exports.startPriceSync = async (req, res, next) => {
  const parsed = parseMarketGroupBody(req.body);
  if (!parsed.ok) return failure(req, res, 400, parsed.message);
  try {
    const handle = await startDailySync({
      trigger: 'MANUAL',
      marketGroup: parsed.marketGroup
    });
    if (!handle.ok) return conflictRun(req, res, handle);
    return acceptedRun(res, handle);
  } catch (error) {
    if (error instanceof RangeError) return failure(req, res, 400, error.message);
    return next(error);
  }
};

exports.startAssetHistoryBackfill = async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return failure(req, res, 400, 'Invalid asset ID');
  }
  const parsed = parseBackfillBody(req.body);
  if (!parsed.ok) return failure(req, res, 400, parsed.message);
  try {
    const handle = await startAssetHistoryBackfillTask({
      assetId: req.params.id,
      from: parsed.value.from,
      to: parsed.value.to,
      year: parsed.value.year,
      trigger: 'MANUAL'
    });
    if (!handle.ok) return conflictRun(req, res, handle);
    const summary = await handle.promise;
    return success(res, backfillResponse(summary));
  } catch (error) {
    if (error.status === 400) return failure(req, res, 400, error.message);
    if (error.status === 404) return failure(req, res, 404, error.message);
    return next(error);
  }
};

exports.getTaskRun = async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return failure(req, res, 400, 'Invalid task run ID');
  }
  try {
    const doc = await getTaskRunById(req.params.id);
    if (!doc) return failure(req, res, 404, 'Task run not found');
    return success(res, serializeTaskRun(doc, {
      staleAfterMs: staleAfterMsFor(doc.taskName)
    }));
  } catch (error) {
    return next(error);
  }
};
