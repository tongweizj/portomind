"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const integrityCheck = require('../src/tasks/integrityCheck');
const {
  countAssetCoverage: countAsset,
  expectedTradingDates,
  groupMissingRanges,
  clipRepairRanges
} = require('@portomind/shared/services/priceCoverage.service');
const { expectedBucketCandidates } = require('@portomind/shared/services/marketDay.service');
const { runIntegrityReport: runIntegrityCheck } = require('@portomind/shared/tasks/priceIntegrityCheck');

test('expectedTradingDates：US 八月无节假日，工作日全开', () => {
  const dates = expectedTradingDates('US', '2024-08-01', '2024-08-31');
  assert.equal(dates.length, 22);
  assert.ok(!dates.includes('2024-08-03')); // 周六
  assert.ok(!dates.includes('2024-08-04')); // 周日
});

test('expectedTradingDates：US Memorial Day 闭市', () => {
  assert.deepEqual(expectedTradingDates('US', '2024-05-27', '2024-05-27'), []);
  const may = expectedTradingDates('US', '2024-05-01', '2024-05-31');
  assert.ok(!may.includes('2024-05-27'));
  assert.equal(may.length, 22);
});

test('expectedTradingDates：CN 与 CN-SH 归一化后一致', () => {
  assert.deepEqual(
    expectedTradingDates('CN', '2024-10-01', '2024-10-08'),
    expectedTradingDates('CN-SH', '2024-10-01', '2024-10-08')
  );
  assert.ok(!expectedTradingDates('CN', '2024-10-01', '2024-10-01').length); // 国庆闭市
});

test('expectedBucketCandidates：US/CA 当日；CN 可能跨前一日', () => {
  assert.deepEqual(expectedBucketCandidates('US', '2024-08-26'), ['2024-08-26']);
  assert.deepEqual(expectedBucketCandidates('CA', '2024-08-26'), ['2024-08-26']);
  assert.deepEqual(expectedBucketCandidates('CN-SH', '2026-08-24'), ['2026-08-23', '2026-08-24']);
});

test('countAsset：对比理论交易日与实际落库桶', async () => {
  const asset = { symbol: 'VOO', market: 'US' };
  const counted = await countAsset(
    asset,
    '2024-08-01',
    '2024-08-31',
    {
      expectedTradingDates: async () => ['2024-08-01', '2024-08-02', '2024-08-05'],
      storedBucketDates: async () => ['2024-08-01', '2024-08-02']
    }
  );
  assert.equal(counted.expectedCount, 3);
  assert.equal(counted.actualCount, 2);
  assert.equal(counted.missingCount, 1);
  assert.equal(counted.completenessRatio, 2 / 3);
});

test('countAsset：同时兼容历史前一日桶和当日净值桶', async () => {
  const asset = { symbol: '510300', market: 'CN-SH' };
  for (const storedDate of ['2026-08-23', '2026-08-24']) {
    const counted = await countAsset(
      asset,
      '2026-08-24',
      '2026-08-24',
      {
        expectedTradingDates: () => ['2026-08-24'],
        storedBucketDates: () => [storedDate]
      }
    );
    assert.equal(counted.missingCount, 0);
    assert.equal(counted.completenessRatio, 1);
  }
});

test('groupMissingRanges：按 mergeDays 合并缺失日期', () => {
  const dates = ['2026-08-01', '2026-08-02', '2026-08-05'];
  assert.deepEqual(groupMissingRanges(dates, 3), [{ from: '2026-08-01', to: '2026-08-05' }]);
  assert.deepEqual(groupMissingRanges(dates, 2), [
    { from: '2026-08-01', to: '2026-08-02' },
    { from: '2026-08-05', to: '2026-08-05' }
  ]);
  assert.deepEqual(groupMissingRanges([], 3), []);
});

test('clipRepairRanges：窗口内保留、跨窗口裁剪、窗口外延后', () => {
  const ranges = [
    { from: '2026-06-01', to: '2026-06-10' },  // 完全在窗口外 → 延后
    { from: '2026-07-20', to: '2026-08-01' },  // 跨窗口 → 裁剪
    { from: '2026-08-20', to: '2026-08-25' }   // 窗口内 → 保留
  ];
  const { repairable, deferred } = clipRepairRanges(ranges, '2026-08-25', 30); // 窗口 [2026-07-26, 08-25]
  assert.deepEqual(repairable, [
    { from: '2026-07-26', to: '2026-08-01' },
    { from: '2026-08-20', to: '2026-08-25' }
  ]);
  assert.deepEqual(deferred, [{ from: '2026-06-01', to: '2026-06-10' }]);
});

test('clipRepairRanges：非正窗口全部延后', () => {
  const ranges = [{ from: '2026-08-01', to: '2026-08-02' }];
  const { repairable, deferred } = clipRepairRanges(ranges, '2026-08-25', 0);
  assert.deepEqual(repairable, []);
  assert.deepEqual(deferred, ranges);
});

test('runIntegrityCheck：无 launchDate 跳过，缺口自动 repair', async () => {
  let repairCalls = 0;
  let recount = 0;
  const report = await runIntegrityCheck({
    repair: true,
    to: '2024-08-31', // 显式 to，使缺失日期落在默认修复窗口（最近 30 天）内
    getActiveAssets: async () => [
      { symbol: 'VOO', market: 'US', launchDate: new Date('2024-08-01T00:00:00Z') },
      { symbol: 'BND', market: 'US' } // 无 launchDate
    ],
    expectedTradingDates: () => ['2024-08-01', '2024-08-02', '2024-08-05'],
    storedBucketDates: async () => ['2024-08-01'],
    historySync: async () => { repairCalls += 1; return [{ symbol: 'VOO', count: 2 }]; },
    countAsset: async (asset, from, to) => {
      // 首次 1 条缺口；repair 后重查视为补齐
      recount += 1;
      const base = { expectedCount: 3, missingDates: ['2024-08-02', '2024-08-05'] };
      if (recount === 1) return { ...base, actualCount: 1, missingCount: 2, completenessRatio: 1 / 3 };
      return { ...base, actualCount: 3, missingCount: 0, completenessRatio: 1 };
    }
  });

  assert.equal(report.totalCount, 2);
  assert.equal(report.checkedCount, 1);
  assert.equal(report.skippedCount, 1);
  assert.equal(report.failureCount, 1);
  assert.equal(report.successCount, 0);
  assert.equal(repairCalls, 1);
  const voo = report.assets.find(a => a.symbol === 'VOO');
  assert.equal(voo.status, 'GAP');
  assert.equal(voo.repaired, true);
  assert.equal(voo.missing, 0);
  assert.equal(voo.ratio, 1);
  const skipped = report.assets.find(a => a.symbol === 'BND');
  assert.equal(skipped.status, 'SKIPPED_NO_LAUNCH_DATE');
});

test('runIntegrityCheck：超出修复窗口的缺口被延后，不触发补全', async () => {
  let repairCalls = 0;
  const report = await runIntegrityCheck({
    repair: true,
    to: '2026-08-25',
    repairMaxDays: 30, // 窗口 [2026-07-26, 2026-08-25]
    getActiveAssets: async () => [
      { symbol: 'VOO', market: 'US', launchDate: new Date('2024-08-01T00:00:00Z') }
    ],
    expectedTradingDates: () => ['2024-08-01', '2024-08-02', '2024-08-05'],
    storedBucketDates: () => ['2024-08-01'],
    historySync: async () => { repairCalls += 1; return [{ symbol: 'VOO', count: 2 }]; },
    countAsset: async () => ({ expectedCount: 3, actualCount: 1, missingCount: 2, missingDates: ['2024-08-02', '2024-08-05'], completenessRatio: 1 / 3 })
  });

  assert.equal(repairCalls, 0, '窗口外缺口不应触发补全');
  const voo = report.assets.find(a => a.symbol === 'VOO');
  assert.equal(voo.repaired, false);
  assert.equal(voo.repairDeferred, 1);
  assert.equal(voo.status, 'GAP');
});

test('runIntegrityCheck：dryRun 不执行补全并标记预览', async () => {
  let repairCalls = 0;
  const report = await runIntegrityCheck({
    dryRun: true,
    to: '2024-08-31',
    getActiveAssets: async () => [
      { symbol: 'VOO', market: 'US', launchDate: new Date('2024-08-01T00:00:00Z') }
    ],
    expectedTradingDates: () => ['2024-08-01', '2024-08-02', '2024-08-05'],
    storedBucketDates: () => ['2024-08-01'],
    historySync: async () => { repairCalls += 1; return []; }
  });

  assert.equal(report.dryRun, true);
  assert.equal(repairCalls, 0);
  assert.equal(report.failureCount, 1);
});

test('runIntegrityCheck：超过 maxRepairRanges 时截断并记录', async () => {
  let repairCalls = 0;
  const report = await runIntegrityCheck({
    repair: true,
    to: '2026-08-25',
    repairMaxDays: 3650,
    maxRepairRanges: 1,
    getActiveAssets: async () => [
      { symbol: 'VOO', market: 'US', launchDate: new Date('2024-08-01T00:00:00Z') }
    ],
    expectedTradingDates: () => ['2024-08-01', '2024-08-02', '2024-08-10', '2024-08-11'],
    storedBucketDates: () => [],
    historySync: async () => { repairCalls += 1; return [{ symbol: 'VOO', count: 1 }]; },
    countAsset: async () => ({
      expectedCount: 4, actualCount: 0, missingCount: 4,
      missingDates: ['2024-08-01', '2024-08-02', '2024-08-10', '2024-08-11'],
      completenessRatio: 0
    })
  });

  assert.equal(repairCalls, 1);
  const voo = report.assets.find(a => a.symbol === 'VOO');
  assert.equal(voo.repairTruncated, 1);
  assert.equal(voo.repairRanges, 1);
});

test('runIntegrityCheck：repair=false 时不调用 historySync', async () => {
  let repairCalls = 0;
  const report = await runIntegrityCheck({
    repair: false,
    getActiveAssets: async () => [
      { symbol: 'VOO', market: 'US', launchDate: new Date('2024-08-01T00:00:00Z') }
    ],
    expectedTradingDates: () => ['2024-08-01', '2024-08-02', '2024-08-05'],
    storedBucketDates: () => ['2024-08-01'],
    historySync: async () => { repairCalls += 1; return []; }
  });

  assert.equal(report.failureCount, 1);
  assert.equal(repairCalls, 0);
  assert.equal(report.failures[0].category, 'DATA_GAP');
});

test('runIntegrityCheck：全部完整时 successCount 正确', async () => {
  const report = await runIntegrityCheck({
    getActiveAssets: async () => [
      { symbol: 'VOO', market: 'US', launchDate: new Date('2024-08-01T00:00:00Z') },
      { symbol: 'XEQT.TO', market: 'CA', launchDate: new Date('2024-08-01T00:00:00Z') }
    ],
    expectedTradingDates: () => ['2024-08-01', '2024-08-02', '2024-08-05'],
    storedBucketDates: () => ['2024-08-01', '2024-08-02', '2024-08-05'],
    historySync: async () => []
  });

  assert.equal(report.totalCount, 2);
  assert.equal(report.successCount, 2);
  assert.equal(report.failureCount, 0);
  assert.equal(report.completenessRatio, 1);
  assert.equal(report.allSkipped, false);
});

test('TASK-073：有 launchDate 的旧键资产按派生键查价并报告 GAP', async () => {
  const keys = [];
  const report = await runIntegrityCheck({
    getActiveAssets: async () => [{ symbol: '001180.cn', market: 'CN-FUND', launchDate: new Date('2026-08-24T12:00:00Z') }],
    expectedTradingDates: () => ['2026-08-20', '2026-08-21', '2026-08-24'],
    storedBucketDates: (symbol) => { keys.push(symbol); return []; },
    to: '2026-08-24',
    dryRun: true
  });

  assert.deepEqual(keys, ['001180.CN']);
  assert.equal(report.checkedCount, 1);
  assert.equal(report.totals.missingCount, 3);
  assert.equal(report.assets[0].status, 'GAP');
});

test('TASK-070：result.assets 只持久化有界历史摘要，不含补采错误详情', async (t) => {
  const TaskRun = require('@portomind/shared/models/taskRun');
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => ({ _id: 'integrity-history-run' }));
  const update = t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));

  const run = await integrityCheck({
    trigger: 'MANUAL',
    repair: false,
    to: '2024-08-31',
    getActiveAssets: async () => [
      { _id: 'asset-1', symbol: 'VOO.US', market: 'US', launchDate: new Date('2024-08-01T12:00:00Z') }
    ],
    expectedTradingDates: () => ['2024-08-01', '2024-08-02', '2024-08-05'],
    storedBucketDates: () => ['2024-08-01']
  });

  assert.equal(run.status, 'PARTIAL');
  assert.deepEqual(run.result.assets, [{
    assetId: 'asset-1', symbol: 'VOO.US', market: 'US',
    launchDate: '2024-08-01T12:00:00.000Z', status: 'GAP',
    from: '2024-08-01', to: '2024-08-31',
    expected: 3, actual: 1, missing: 2, ratio: 1 / 3,
    missingRanges: [{ from: '2024-08-02', to: '2024-08-05' }],
    missingRangesTruncated: false
  }]);
  assert.deepEqual(run.result.gapAssets, [{ symbol: 'VOO.US', missingCount: 2 }]);
  assert.equal('repairFailures' in run.result.assets[0], false);
  assert.equal('repaired' in run.result.assets[0], false);
  const finalUpdate = update.mock.calls.find((call) => call.arguments[1].$set?.result);
  assert.deepEqual(finalUpdate.arguments[1].$set.result.assets, run.result.assets);
});

test('TASK-073：全部跳过持久化为 result 数据态，运行态仍为 SUCCEEDED', async (t) => {
  const TaskRun = require('@portomind/shared/models/taskRun');
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => ({ _id: 'integrity-run' }));
  const update = t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));
  const { taskLogger } = require('@portomind/shared/config/logger');
  const info = t.mock.method(taskLogger, 'info', () => {});
  const run = await integrityCheck({
    trigger: 'MANUAL',
    getActiveAssets: async () => [{ symbol: '001180.CN', market: 'CN-FUND' }],
    storedBucketDates: () => assert.fail('missing launchDate must skip price query')
  });

  assert.equal(run.status, 'SUCCEEDED');
  assert.equal(run.result.allSkipped, true);
  assert.equal(run.result.checkedCount, 0);
  assert.equal(run.result.skippedCount, 1);
  assert.equal(run.result.completenessRatio, null);
  const finalUpdate = update.mock.calls.find((call) => call.arguments[1].$set?.result);
  assert.equal(finalUpdate.arguments[1].$set.result.allSkipped, true);
  const end = info.mock.calls.find(call => call.arguments[0] === 'INTEGRITY_CHECK_END').arguments[1];
  assert.equal(end.allSkipped, true);
  assert.equal(end.completenessRatio, null);

  const empty = await integrityCheck({ trigger: 'MANUAL', getActiveAssets: async () => [] });
  assert.equal(empty.result.allSkipped, false);
});
