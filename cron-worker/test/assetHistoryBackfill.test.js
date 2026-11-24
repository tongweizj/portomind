'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const TaskRun = require('@portomind/shared/models/taskRun');
const {
  runAssetBackfill,
  resolveWindow,
  startAssetHistoryBackfill
} = require('@portomind/shared/tasks/assetHistoryBackfill');
const { dateBounds } = require('@portomind/shared/utils/marketTime');

const ASSET = {
  _id: 'asset-1', symbol: 'VOO.US', market: 'US',
  launchDate: new Date('2020-01-01T12:00:00Z')
};

test('resolveWindow 默认当前年份并裁到 launchDate / 目标市场日', () => {
  const window = resolveWindow(
    { ...ASSET, launchDate: new Date('2026-11-03T12:00:00Z') },
    { now: new Date('2026-11-24T15:00:00Z'), from: '2026-01-01', to: '2026-11-30' }
  );
  assert.deepEqual(window, { from: '2026-11-03', to: '2026-11-23' });
});

test('resolveWindow 支持 year，并把当年截止到目标市场日', () => {
  const window = resolveWindow(ASSET, {
    now: new Date('2026-11-24T15:00:00Z'), year: 2026
  });
  assert.deepEqual(window, { from: '2026-01-01', to: '2026-11-23' });
});

test('resolveWindow：无 launchDate / year+from / 区间倒置均为 400', () => {
  assert.throws(() => resolveWindow({ ...ASSET, launchDate: null }, {
    now: new Date('2026-11-24T15:00:00Z')
  }), (error) => error.status === 400 && error.code === 'ASSET_LAUNCH_DATE_REQUIRED');
  assert.throws(() => resolveWindow(ASSET, {
    now: new Date('2026-11-24T15:00:00Z'), year: 2026, from: '2026-01-01'
  }), (error) => error.status === 400 && error.code === 'INVALID_RANGE');
  assert.throws(() => resolveWindow(ASSET, {
    now: new Date('2026-11-24T15:00:00Z'), from: '2026-11-10', to: '2026-11-01'
  }), (error) => error.status === 400 && error.code === 'INVALID_RANGE');
});

test('runAssetBackfill 只对缺失区间调用 historySync，并回读剩余缺失', async () => {
  const calls = [];
  let counts = 0;
  const result = await runAssetBackfill(ASSET, '2026-11-01', '2026-11-05', {
    countAssetCoverage: async () => {
      counts += 1;
      return counts === 1
        ? { expectedCount: 3, actualCount: 1, missingCount: 2, missingDates: ['2026-11-02', '2026-11-03'] }
        : { expectedCount: 3, actualCount: 3, missingCount: 0, missingDates: [] };
    },
    historySync: async (from, to, options) => {
      calls.push({ from, to, options });
      return [{ symbol: 'VOO.US', count: 2 }];
    }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].from, dateBounds('2026-11-02').start);
  assert.deepEqual(calls[0].to, dateBounds('2026-11-03').end);
  assert.deepEqual(calls[0].options, { symbols: ['VOO.US'], concurrency: 1 });
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 0);
  assert.equal(result.result.missingBeforeCount, 2);
  assert.equal(result.result.missingAfterCount, 0);
  assert.equal(result.result.fetchedCount, 2);
  assert.deepEqual(result.result.requestedRanges, [{ from: '2026-11-02', to: '2026-11-03' }]);
});

test('runAssetBackfill 补采失败保留失败原因并标记剩余缺口', async () => {
  const result = await runAssetBackfill(ASSET, '2026-11-01', '2026-11-05', {
    countAssetCoverage: async () => ({
      expectedCount: 3, actualCount: 1, missingCount: 2,
      missingDates: ['2026-11-02', '2026-11-03']
    }),
    historySync: async () => { throw Object.assign(new Error('upstream down'), { category: 'UPSTREAM', retryable: true }); }
  });

  assert.equal(result.successCount, 0);
  assert.equal(result.failureCount, 2);
  assert.equal(result.result.missingAfterCount, 2);
  assert.equal(result.failures[0].item, 'VOO.US');
  assert.equal(result.failures[0].category, 'UPSTREAM');
  assert.equal(result.failures[1].category, 'HISTORY_GAP');
});

test('startAssetHistoryBackfill 使用按资产锁和可并行的 runKey', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  let created;
  t.mock.method(TaskRun, 'create', async (doc) => {
    created = doc;
    return { ...doc, _id: 'run-72' };
  });
  const updates = [];
  t.mock.method(TaskRun, 'updateOne', async (filter, update) => {
    updates.push(update);
    return { modifiedCount: 1 };
  });

  const handle = await startAssetHistoryBackfill({
    assetId: 'asset-1',
    from: '2026-11-01',
    to: '2026-11-05',
    now: new Date('2026-11-24T15:00:00Z'),
    getAssetById: async () => ASSET,
    countAssetCoverage: async () => ({
      expectedCount: 3, actualCount: 3, missingCount: 0, missingDates: []
    })
  });

  assert.equal(handle.ok, true);
  assert.equal(created.lockKey, 'ops:asset-backfill:asset-1');
  assert.match(created.runKey, /^manual:asset-1:/);
  const summary = await handle.promise;
  assert.equal(summary.status, 'SUCCEEDED');
  assert.equal(summary.result.missingAfterCount, 0);
  assert.equal(updates.at(-1).$unset.lockKey, 1);
});
