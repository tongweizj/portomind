'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const TaskRun = require('@portomind/shared/models/taskRun');
const {
  previewBatchAssetHistoryBackfill,
  runBatchAssetHistoryBackfill,
  startBatchAssetHistoryBackfill
} = require('@portomind/shared/tasks/assetHistoryBackfillBatch');

const ASSETS = [
  { _id: 'a1', symbol: 'VOO.US', market: 'US', launchDate: new Date('2020-01-01T12:00:00Z') },
  { _id: 'a2', symbol: 'VTI.US', market: 'US', launchDate: new Date('2020-01-01T12:00:00Z') },
  { _id: 'a3', symbol: '000191.CN', market: 'CN-FUND', launchDate: null }
];

function loader() {
  return async (id) => ASSETS.find((asset) => asset._id === id) || null;
}

test('previewBatchAssetHistoryBackfill 汇总缺失日期且不写库', async () => {
  const preview = await previewBatchAssetHistoryBackfill({
    assetIds: ['a1', 'a2', 'a3'],
    from: '2026-11-01',
    to: '2026-11-05',
    now: new Date('2026-11-24T15:00:00Z'),
    getAssetById: loader(),
    countAssetCoverage: async (asset) => ({
      expectedCount: 5,
      actualCount: asset._id === 'a1' ? 3 : 4,
      missingCount: asset._id === 'a1' ? 2 : 1,
      missingDates: asset._id === 'a1'
        ? ['2026-11-02', '2026-11-03']
        : ['2026-11-04']
    })
  });

  assert.equal(preview.assetCount, 3);
  assert.equal(preview.readyCount, 2);
  assert.equal(preview.skippedCount, 1);
  assert.equal(preview.missingDateCount, 3);
  assert.deepEqual(preview.assets.map((asset) => asset.status), ['ready', 'ready', 'skipped']);
  assert.equal(preview.assets[2].reason, 'ASSET_LAUNCH_DATE_REQUIRED');
});

test('runBatchAssetHistoryBackfill 逐资产复用子任务并保留部分失败', async () => {
  const calls = [];
  const progress = [];
  const startChild = async (options) => {
    calls.push(options.assetId);
    if (options.assetId === 'a2') {
      return { ok: true, promise: Promise.resolve({
        status: 'PARTIAL',
        failureCount: 1,
        result: { from: '2026-11-01', to: '2026-11-05', missingBeforeCount: 2, missingAfterCount: 1, fetchedCount: 1 }
      }) };
    }
    if (options.assetId === 'a3') return { ok: false, reason: 'ALREADY_RUNNING' };
    return { ok: true, promise: Promise.resolve({
      status: 'SUCCEEDED',
      failureCount: 0,
      result: { from: '2026-11-01', to: '2026-11-05', missingBeforeCount: 2, missingAfterCount: 0, fetchedCount: 2 }
    }) };
  };

  const summary = await runBatchAssetHistoryBackfill(ASSETS, {
    startAssetHistoryBackfill: startChild,
    from: '2026-11-01',
    to: '2026-11-05',
    reportProgress: (completed, total) => progress.push([completed, total])
  });

  assert.deepEqual(calls, ['a1', 'a2', 'a3']);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 2);
  assert.equal(summary.result.missingAfterCount, 1);
  assert.equal(summary.result.fetchedCount, 3);
  assert.deepEqual(summary.result.assets.map((asset) => asset.status), ['succeeded', 'partial', 'skipped']);
  assert.deepEqual(progress.at(-1), [3, 3]);
});

test('startBatchAssetHistoryBackfill 使用批量锁并创建父 TaskRun', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  let created;
  t.mock.method(TaskRun, 'create', async (doc) => {
    created = doc;
    return { ...doc, _id: 'batch-run' };
  });
  const updates = [];
  t.mock.method(TaskRun, 'updateOne', async (filter, update) => {
    updates.push(update);
    return { modifiedCount: 1 };
  });

  const handle = await startBatchAssetHistoryBackfill({
    assetIds: ['a1', 'a2'],
    from: '2026-11-01',
    to: '2026-11-05',
    now: new Date('2026-11-24T15:00:00Z'),
    getAssetById: loader(),
    startAssetHistoryBackfill: async (options) => ({
      ok: true,
      promise: Promise.resolve({
        status: 'SUCCEEDED',
        failureCount: 0,
        result: { from: options.from, to: options.to, missingBeforeCount: 0, missingAfterCount: 0, fetchedCount: 0 }
      })
    })
  });

  assert.equal(handle.ok, true);
  assert.equal(created.lockKey, 'ops:asset-backfill-batch');
  assert.match(created.runKey, /^manual:/);
  const summary = await handle.promise;
  assert.equal(summary.status, 'SUCCEEDED');
  assert.equal(summary.result.assetCount, 2);
  assert.equal(updates.at(-1).$unset.lockKey, 1);
});
