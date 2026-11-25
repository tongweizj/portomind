// shared/tasks/assetHistoryBackfillBatch.js
//
// TASK-074：批量补缺失。复用单资产补采服务，父 TaskRun 串行驱动逐资产子 TaskRun，
// 父任务只聚合进度与结果；预览不写数据、不创建 TaskRun。

const { getAssetById } = require('../services/asset.service');
const { OPS_TASK_CONFIG } = require('../config/opsTasks');
const { startTrackedTask } = require('../services/taskRunner');
const {
  badRequest,
  startAssetHistoryBackfill,
  previewAssetBackfill,
  validateRangeOptions,
  resolveWindow
} = require('./assetHistoryBackfill');

const MAX_BATCH_ASSETS = 500;

function normalizeAssetIds(assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    throw badRequest('assetIds must be a non-empty array', 'INVALID_ASSET_IDS');
  }
  const ids = [...new Set(assetIds.map((id) => String(id)))];
  if (ids.length > MAX_BATCH_ASSETS) {
    throw badRequest(`assetIds cannot exceed ${MAX_BATCH_ASSETS}`, 'TOO_MANY_ASSETS');
  }
  return ids;
}

async function loadBatchAssets(assetIds, options = {}) {
  const ids = normalizeAssetIds(assetIds);
  const loadAsset = options.getAssetById || getAssetById;
  const assets = await Promise.all(ids.map(async (id) => {
    try {
      return { id, asset: await loadAsset(id) };
    } catch (error) {
      if (error.name === 'CastError') throw badRequest(`Invalid asset ID: ${id}`, 'INVALID_ASSET');
      throw error;
    }
  }));
  for (const { id, asset } of assets) {
    if (!asset) throw badRequest(`Asset not found: ${id}`, 'ASSET_NOT_FOUND');
  }
  return assets.map(({ asset }) => asset);
}

function skippedPreview(asset, error) {
  return {
    assetId: String(asset._id),
    symbol: asset.symbol,
    market: asset.market,
    status: 'skipped',
    from: null,
    to: null,
    expectedCount: null,
    missingCount: null,
    reason: error.code || 'INVALID_RANGE',
    message: error.message
  };
}

/** 预览：只读统计，不写库、不建 TaskRun。 */
async function previewBatchAssetHistoryBackfill(options = {}) {
  validateRangeOptions(options);
  const assets = await loadBatchAssets(options.assetIds, options);
  const results = [];
  let missingDateCount = 0;
  for (const asset of assets) {
    try {
      const preview = await previewAssetBackfill({
        ...options,
        assetId: String(asset._id),
        asset
      });
      missingDateCount += preview.missingCount;
      results.push({ ...preview, status: 'ready' });
    } catch (error) {
      if (error.status !== 400 || error.code === 'INVALID_YEAR') throw error;
      results.push(skippedPreview(asset, error));
    }
  }
  const ready = results.filter((item) => item.status === 'ready');
  // 未显式传区间时，用可预览资产的实际窗口回填，避免默认范围显示为空。
  const effectiveRange = (pick) => {
    const days = ready.map((item) => item[pick]).filter(Boolean).sort();
    if (days.length === 0) return null;
    return pick === 'from' ? days[0] : days[days.length - 1];
  };
  return {
    assetCount: assets.length,
    readyCount: ready.length,
    skippedCount: results.length - ready.length,
    missingDateCount,
    range: {
      from: options.from ?? effectiveRange('from'),
      to: options.to ?? effectiveRange('to'),
      year: options.year ?? null
    },
    assets: results
  };
}

function assetFailure(asset, category, message) {
  return { item: asset.symbol, category, message };
}

function childFailure(summary, asset) {
  const failures = Array.isArray(summary?.failures) ? summary.failures : [];
  const first = failures[0];
  if (first) {
    const reason = first.category || 'PARTIAL';
    return {
      reason,
      message: first.message || `${asset.symbol} backfill did not complete`
    };
  }
  const remaining = summary?.result?.missingAfterCount;
  return {
    reason: 'HISTORY_GAP',
    message: `${asset.symbol}: ${summary?.failureCount ?? 1} failure(s), ${remaining ?? '?'} day(s) remain`
  };
}

function buildAssetSummary(asset, status, summary, extra = {}) {
  const result = summary?.result || {};
  return {
    assetId: String(asset._id),
    symbol: asset.symbol,
    market: asset.market,
    status,
    runId: summary?.runId ?? null,
    from: result.from ?? null,
    to: result.to ?? null,
    missingBeforeCount: result.missingBeforeCount ?? null,
    missingAfterCount: result.missingAfterCount ?? null,
    fetchedCount: result.fetchedCount ?? null,
    ...extra
  };
}

async function runBatchAssetHistoryBackfill(assets, options = {}) {
  const startChild = options.startAssetHistoryBackfill || startAssetHistoryBackfill;
  const reportProgress = typeof options.reportProgress === 'function' ? options.reportProgress : () => {};
  const results = [];
  const failures = [];
  let completed = 0;
  await reportProgress(0, assets.length);

  for (const asset of assets) {
    try {
      const handle = await startChild({
        assetId: String(asset._id),
        asset,
        from: options.from,
        to: options.to,
        year: options.year,
        trigger: 'MANUAL'
      });
      if (!handle.ok) {
        const reason = handle.reason || 'ALREADY_RUNNING';
        results.push(buildAssetSummary(asset, 'skipped', null, { reason }));
        failures.push(assetFailure(asset, reason, `${asset.symbol} is already being backfilled`));
      } else {
        const summary = await handle.promise;
        const status = summary.status === 'SUCCEEDED' ? 'succeeded' : 'partial';
        if (status === 'succeeded') {
          results.push(buildAssetSummary(asset, status, summary));
        } else {
          const failure = childFailure(summary, asset);
          results.push(buildAssetSummary(asset, status, summary, failure));
          failures.push(assetFailure(asset, failure.reason, failure.message));
        }
      }
    } catch (error) {
      const status = error.status === 400 ? 'skipped' : 'failed';
      results.push(buildAssetSummary(asset, status, null, {
        reason: error.code || error.category || 'INTERNAL',
        message: error.message
      }));
      failures.push(assetFailure(asset, error.code || error.category || 'INTERNAL', error.message));
    }
    completed += 1;
    await reportProgress(completed, assets.length);
  }

  const successCount = results.filter((item) => item.status === 'succeeded').length;
  const failureCount = results.length - successCount;
  const sum = (field) => results.reduce((total, item) => (
    Number.isFinite(item[field]) ? total + item[field] : total
  ), 0);
  return {
    totalCount: results.length,
    successCount,
    failureCount,
    failures,
    result: {
      assetCount: results.length,
      successCount,
      failureCount,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      missingBeforeCount: sum('missingBeforeCount'),
      missingAfterCount: sum('missingAfterCount'),
      fetchedCount: sum('fetchedCount'),
      assets: results
    }
  };
}

function trackedOptions(options, assets, now) {
  return {
    taskName: OPS_TASK_CONFIG.assetBackfillBatch.taskName,
    runKey: options.runKey || `manual:${now.toISOString()}`,
    trigger: options.trigger || 'MANUAL',
    lockKey: OPS_TASK_CONFIG.assetBackfillBatch.lockKey,
    staleAfterMs: OPS_TASK_CONFIG.assetBackfillBatch.staleAfterMs,
    execute: async ({ reportProgress }) => runBatchAssetHistoryBackfill(assets, {
      ...options,
      reportProgress
    })
  };
}

async function startBatchAssetHistoryBackfill(options = {}) {
  validateRangeOptions(options);
  const assets = await loadBatchAssets(options.assetIds, options);
  if (assets.length === 0) throw badRequest('No assets selected', 'NO_ASSETS');
  const now = options.now || new Date();
  // 年份超过某个资产的目标市场年时，批量端点也返回 400，而不是静默跳过。
  for (const asset of assets) {
    try {
      resolveWindow(asset, { ...options, now });
    } catch (error) {
      if (error.code === 'INVALID_YEAR') throw error;
    }
  }
  return startTrackedTask(trackedOptions(options, assets, now));
}

module.exports = {
  previewBatchAssetHistoryBackfill,
  runBatchAssetHistoryBackfill,
  startBatchAssetHistoryBackfill
};
