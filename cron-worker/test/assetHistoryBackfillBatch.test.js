'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const TaskRun = require('@portomind/shared/models/taskRun');
const {
  previewBatchAssetHistoryBackfill,
  resolveBatchStatus,
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
    historySync: async () => assert.fail('preview must not write price history'),
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

test('previewBatchAssetHistoryBackfill 对超出目标市场年的 year 返回 INVALID_YEAR', async () => {
  await assert.rejects(
    previewBatchAssetHistoryBackfill({
      assetIds: ['a1'],
      year: 2026,
      now: new Date('2026-01-01T02:00:00Z'),
      getAssetById: loader()
    }),
    (error) => error.status === 400 && error.code === 'INVALID_YEAR'
  );
});

test('previewBatchAssetHistoryBackfill 未传区间时回填当前市场年有效窗口', async () => {
  const preview = await previewBatchAssetHistoryBackfill({
    assetIds: ['a1'],
    now: new Date('2026-11-24T15:00:00Z'),
    getAssetById: loader(),
    countAssetCoverage: async () => ({ expectedCount: 0, actualCount: 0, missingCount: 0, missingDates: [] })
  });
  assert.deepEqual(preview.range, { from: '2026-01-01', to: '2026-11-23', year: null });
});

test('previewBatchAssetHistoryBackfill 支持 year 参数并回显年份', async () => {
  const preview = await previewBatchAssetHistoryBackfill({
    assetIds: ['a1'],
    year: 2025,
    now: new Date('2026-11-24T15:00:00Z'),
    getAssetById: loader(),
    countAssetCoverage: async () => ({ expectedCount: 0, actualCount: 0, missingCount: 0, missingDates: [] })
  });
  assert.equal(preview.range.year, 2025);
  assert.equal(preview.range.from, '2025-01-01');
  assert.equal(preview.range.to, '2025-12-31');
});

test('批量资产上限 500：恰好 500 可预览，501 返回 TOO_MANY_ASSETS', async () => {
  const many = (count) => Array.from({ length: count }, (_, index) => `a-${index}`);
  const preview = await previewBatchAssetHistoryBackfill({
    assetIds: many(500),
    from: '2026-11-01',
    to: '2026-11-05',
    now: new Date('2026-11-24T15:00:00Z'),
    getAssetById: async (id) => ({ _id: id, symbol: `${id}.US`, market: 'US', launchDate: new Date('2020-01-01T12:00:00Z') }),
    countAssetCoverage: async () => ({ expectedCount: 0, actualCount: 0, missingCount: 0, missingDates: [] })
  });
  assert.equal(preview.assetCount, 500);
  assert.equal(preview.readyCount, 500);

  await assert.rejects(
    previewBatchAssetHistoryBackfill({ assetIds: many(501), getAssetById: async () => null }),
    (error) => error.status === 400 && error.code === 'TOO_MANY_ASSETS'
  );
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
        failures: [{ item: 'VTI.US', category: 'UPSTREAM', provider: 'YAHOO', message: 'quote unavailable' }],
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
  assert.equal(summary.result.assets[1].reason, 'UPSTREAM');
  assert.equal(summary.result.assets[1].message, 'quote unavailable');
  // 父任务失败项透传子任务真实原因，而不是合成文案。
  assert.equal(summary.failures[0].category, 'UPSTREAM');
  assert.equal(summary.failures[0].message, 'quote unavailable');
  assert.equal(summary.result.allFailed, false);
  assert.deepEqual(progress.at(-1), [3, 3]);
});

test('runBatchAssetHistoryBackfill 全部资产失败时标记 allFailed', async () => {
  const startChild = async () => ({
    ok: true,
    promise: Promise.resolve({
      status: 'PARTIAL',
      failureCount: 1,
      failures: [{ item: 'VTI.US', category: 'UPSTREAM', provider: 'YAHOO', message: 'quote unavailable' }],
      result: { from: '2026-11-01', to: '2026-11-05', missingBeforeCount: 2, missingAfterCount: 2, fetchedCount: 0 }
    })
  });

  const summary = await runBatchAssetHistoryBackfill(ASSETS, {
    startAssetHistoryBackfill: startChild,
    from: '2026-11-01',
    to: '2026-11-05'
  });

  assert.equal(summary.successCount, 0);
  assert.equal(summary.failureCount, 3);
  assert.equal(summary.result.allFailed, true);
});

test('runBatchAssetHistoryBackfill 失败与跳过混合、全部跳过、空批次都不算 allFailed', async () => {
  const failing = async () => { throw Object.assign(new Error('db down'), { category: 'INTERNAL' }); };
  const busy = async () => ({ ok: false, reason: 'ALREADY_RUNNING' });
  const invalid = async () => { throw Object.assign(new Error('bad range'), { status: 400, code: 'INVALID_RANGE' }); };

  // a1 失败，a2 跳过（已在运行），a3 跳过（400）：无成功但含跳过 → 不算全部失败。
  const children = { a1: failing, a2: busy, a3: invalid };
  const mixed = await runBatchAssetHistoryBackfill(ASSETS, {
    startAssetHistoryBackfill: (options) => children[options.assetId](options)
  });
  assert.deepEqual(mixed.result.assets.map((item) => item.status), ['failed', 'skipped', 'skipped']);
  assert.equal(mixed.successCount, 0);
  assert.equal(mixed.failureCount, 3);
  assert.equal(mixed.result.allFailed, false);
  assert.equal(resolveBatchStatus(mixed), 'PARTIAL');

  const allSkipped = await runBatchAssetHistoryBackfill(ASSETS, { startAssetHistoryBackfill: busy });
  assert.equal(allSkipped.result.skippedCount, 3);
  assert.equal(allSkipped.result.allFailed, false);
  assert.equal(resolveBatchStatus(allSkipped), 'PARTIAL');

  const allThrown = await runBatchAssetHistoryBackfill(ASSETS, { startAssetHistoryBackfill: failing });
  assert.equal(allThrown.result.allFailed, true);
  assert.equal(resolveBatchStatus(allThrown), 'FAILED');

  const empty = await runBatchAssetHistoryBackfill([], { startAssetHistoryBackfill: failing });
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.result.allFailed, false);
  assert.equal(resolveBatchStatus(empty), 'SUCCEEDED');
});

test('resolveBatchStatus：全部成功 SUCCEEDED，部分失败 PARTIAL，全部失败 FAILED', () => {
  assert.equal(resolveBatchStatus({ failureCount: 0, result: { allFailed: false } }), 'SUCCEEDED');
  assert.equal(resolveBatchStatus({ failureCount: 1, result: { allFailed: false } }), 'PARTIAL');
  assert.equal(resolveBatchStatus({ failureCount: 3, result: { allFailed: true } }), 'FAILED');
});

test('startBatchAssetHistoryBackfill 全部资产失败时父任务为 FAILED 并保留逐资产结果', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: 'batch-failed' }));
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
    startAssetHistoryBackfill: async () => ({
      ok: true,
      promise: Promise.resolve({
        status: 'PARTIAL',
        failureCount: 1,
        failures: [{ item: 'x', category: 'UPSTREAM', message: 'quote unavailable' }],
        result: { from: '2026-11-01', to: '2026-11-05', missingBeforeCount: 2, missingAfterCount: 2, fetchedCount: 0 }
      })
    })
  });

  const summary = await handle.promise;
  assert.equal(summary.status, 'FAILED');
  assert.equal(summary.successCount, 0);
  assert.equal(summary.failureCount, 2);
  assert.equal(summary.result.allFailed, true);
  assert.equal(summary.failures[0].category, 'UPSTREAM');
  const final = updates.at(-1);
  assert.equal(final.$set.status, 'FAILED');
  assert.equal(final.$set.result.assets.length, 2);
  assert.equal(final.$unset.lockKey, 1);
});

test('startBatchAssetHistoryBackfill 遇到部分失败时父任务为 PARTIAL', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: 'batch-partial' }));
  t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));

  const handle = await startBatchAssetHistoryBackfill({
    assetIds: ['a1', 'a2'],
    from: '2026-11-01',
    to: '2026-11-05',
    now: new Date('2026-11-24T15:00:00Z'),
    getAssetById: loader(),
    // a1 成功、a2 子任务 PARTIAL：有成功也有失败 → 父任务 PARTIAL（全部失败见下方 FAILED 用例）。
    startAssetHistoryBackfill: async (options) => ({
      ok: true,
      promise: Promise.resolve(options.assetId === 'a1'
        ? {
            status: 'SUCCEEDED',
            failureCount: 0,
            result: { from: '2026-11-01', to: '2026-11-05', missingBeforeCount: 1, missingAfterCount: 0, fetchedCount: 1 }
          }
        : {
            status: 'PARTIAL',
            failureCount: 1,
            result: { from: '2026-11-01', to: '2026-11-05', missingBeforeCount: 2, missingAfterCount: 1, fetchedCount: 1 }
          })
    })
  });

  const summary = await handle.promise;
  assert.equal(summary.status, 'PARTIAL');
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.result.allFailed, false);
  assert.deepEqual(summary.result.assets.map((item) => item.status), ['succeeded', 'partial']);
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
