"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const dailySync = require('../src/tasks/dailySync');
const { syncActiveAssetPrices, marketDate } = dailySync;
const { startDailySync } = require('@portomind/shared/tasks/dailySync');
const TaskRun = require('@portomind/shared/models/taskRun');
const { dateBounds, canonicalDayTimestamp } = require('@portomind/shared/utils/marketTime');
const tiantian = require('@portomind/shared/fetchers/tiantianFetcher');
const { classifyMarketDataError } = require('@portomind/shared/fetchers/errors');
const { fetchWithRetry } = require('@portomind/shared/utils/retry');
const { taskLogger } = require('@portomind/shared/config/logger');

test('syncActiveAssetPrices 区分开市/休市/失败三类资产', async () => {
  const assets = [
    { symbol: 'VOO', market: 'US' },
    { symbol: 'XEQT.TO', market: 'CA' },
    { symbol: '510300', market: 'CN-SH' }
  ];
  const deps = {
    getActiveAssets: async () => assets,
    isMarketOpenToday: market => market !== 'CA', // 仅 CA 休市
    fetchLatest: async asset => {
      if (asset.symbol === '510300') {
        const error = new Error('upstream boom');
        error.category = 'UPSTREAM';
        error.retryable = true;
        throw error;
      }
      return { symbol: asset.symbol, price: 1, currency: 'USD', market: asset.market, timestamp: new Date() };
    },
    saveLatest: async record => record
  };

  const summary = await syncActiveAssetPrices(deps);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.successCount, 1); // VOO
  assert.equal(summary.skippedCount, 1); // XEQT.TO（CA 休市）
  assert.equal(summary.failureCount, 1); // 510300
  assert.equal(summary.failures[0].item, '510300');
  assert.equal(summary.failures[0].category, 'UPSTREAM');
  assert.equal(summary.failures[0].retryable, true);
  assert.deepEqual(summary.assets.map(asset => asset.status), ['fetched', 'skipped', 'failed']);
  assert.match(summary.assets[0].priceDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(summary.assets[1].reason, 'MARKET_CLOSED');
  assert.equal(summary.assets[2].reason, 'UPSTREAM');
});

test('startDailySync 立即返回 runId，result.assets 与 progress 落库', async (t) => {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async (doc) => ({ ...doc, _id: 'run-71' }));
  const updates = [];
  t.mock.method(TaskRun, 'updateOne', async (filter, update) => {
    updates.push({ filter, update });
    return { modifiedCount: 1 };
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const handle = await startDailySync({
    trigger: 'MANUAL',
    now: new Date('2026-11-24T15:00:00Z'),
    dependencies: {
      getActiveAssets: async () => [{ _id: 'asset-1', symbol: 'VOO.US', market: 'US' }],
      isMarketOpenToday: () => true,
      fetchLatest: async (asset) => {
        await gate;
        return { ...asset, price: 100, timestamp: new Date('2026-11-24T15:00:00Z') };
      },
      saveLatest: async () => {}
    }
  });

  assert.equal(handle.ok, true);
  assert.equal(handle.runId, 'run-71');
  assert.equal(handle.status, 'RUNNING');
  assert.ok(updates.some(({ update }) => update.$set?.progress?.total === 1));

  release();
  const summary = await handle.promise;
  assert.equal(summary.status, 'SUCCEEDED');
  assert.deepEqual(summary.result.assets, [{
    assetId: 'asset-1', symbol: 'VOO.US', market: 'US',
    status: 'fetched', priceDate: '2026-11-24'
  }]);
  assert.equal(updates.at(-1).update.$unset.lockKey, 1);
});

test('marketDate 按 SCHEDULER_TIMEZONE 归一化', () => {
  assert.equal(marketDate(new Date('2026-08-25T02:00:00Z'), 'America/Toronto'), '2026-08-24');
  assert.equal(marketDate(new Date('2026-08-25T12:00:00Z'), 'America/Toronto'), '2026-08-25');
});

test('同日两组使用独立 runKey 并顺序入锁，手动入口继续全量处理', async (t) => {
  const now = new Date('2026-11-13T17:00:00Z');
  const runs = [];
  const saved = [];
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async row => {
    runs.push(row);
    return { _id: row.runKey };
  });
  t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));
  const dependencies = {
    getActiveAssets: async () => ['CN-SH', 'CN-SZ', 'CN-FUND', 'HK', 'US', 'CA'].map(market => ({ symbol: market, market })),
    isMarketOpenToday: () => true,
    fetchLatest: async asset => ({ ...asset, timestamp: now }),
    saveLatest: async (data, batch) => saved.push([data.market, batch.runKey])
  };
  const day = marketDate(now);
  const [cn, usCa] = await Promise.all([
    dailySync({ marketGroup: 'CN', now, dependencies }),
    dailySync({ marketGroup: 'US_CA', now, dependencies })
  ]);
  const manual = await dailySync({ trigger: 'MANUAL', now, dependencies });
  assert.deepEqual(runs.map(({ taskName, runKey }) => [taskName, runKey]), [
    ['daily-price-sync', `${day}:CN`], ['daily-price-sync', `${day}:US_CA`],
    ['daily-price-sync', `manual:${now.toISOString()}`]
  ]);
  assert.deepEqual([cn.successCount, usCa.successCount, manual.successCount], [4, 2, 6]);
  assert.deepEqual(saved.slice(0, 6).map(([market]) => market), ['CN-SH', 'CN-SZ', 'CN-FUND', 'HK', 'US', 'CA']);
  assert.deepEqual([cn.result.marketGroup, usCa.result.marketGroup, manual.result.marketGroup], ['CN', 'US_CA', undefined]);
});

test('CN 周五 ET 中午采集实际 FSRQ 解析结果，夏冬令均写当日桶', async () => {
  const cases = [
    ['2026-08-21', '2026-08-20', '2026-08-21T16:00:00Z', '2026-08-22'],
    ['2026-11-13', '2026-11-12', '2026-11-13T17:00:00Z', '2026-11-14']
  ];
  for (const [day, priorDay, noonEt, shanghaiDay] of cases) {
    assert.equal(marketDate(new Date(noonEt), 'America/Toronto'), day);
    assert.equal(marketDate(new Date(noonEt), 'Asia/Shanghai'), shanghaiDay);
    const prices = new Map([[dateBounds(priorDay).start.toISOString(), 1.1]]);
    const result = await syncActiveAssetPrices({
      getActiveAssets: async () => [{ symbol: '001180.CN', market: 'CN-FUND' }],
      fetchLatest: () => tiantian.fetchLatest('001180', {
        get: async () => ({ data: { Data: { LSJZList: [{ FSRQ: day, DWJZ: '1.2' }] } } })
      }),
      saveLatest: async record => prices.set(canonicalDayTimestamp(record.timestamp).toISOString(), record.price)
    }, { marketGroup: 'CN', scheduledDay: day });
    assert.equal(result.successCount, 1);
    assert.equal(prices.get(dateBounds(day).start.toISOString()), 1.2);
    assert.equal(prices.get(dateBounds(priorDay).start.toISOString()), 1.1);
  }
  assert.equal(canonicalDayTimestamp('2026-11-13T15:00:00Z').toISOString(), dateBounds('2026-11-13').start.toISOString());
});

test('CN 定时批次收到前一日净值时保留旧桶并记录资产失败', async (t) => {
  const now = new Date('2026-11-13T17:00:00Z');
  const day = '2026-11-13';
  const priorDay = '2026-11-12';
  const priorBucket = dateBounds(priorDay).start.toISOString();
  const prices = new Map([[priorBucket, 1.10]]);
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => ({ _id: 'test-run' }));
  const updateRun = t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));
  const dependencies = {
    getActiveAssets: async () => [{ symbol: '001180.CN', market: 'CN-FUND' }],
    isMarketOpenToday: () => true,
    fetchLatest: () => tiantian.fetchLatest('001180', {
      get: async () => ({ data: { Data: { LSJZList: [{ FSRQ: priorDay, DWJZ: '1.25' }] } } })
    }),
    saveLatest: async record => prices.set(canonicalDayTimestamp(record.timestamp).toISOString(), record.price)
  };
  const result = await dailySync({ marketGroup: 'CN', now, dependencies });
  assert.deepEqual([...prices], [[priorBucket, 1.10]]);
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCount, 1);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.failures[0].item, '001180.CN');
  assert.equal(result.failures[0].category, 'UPSTREAM');
  assert.equal(result.failures[0].provider, 'TIANTIAN');
  assert.match(result.failures[0].message, new RegExp(`${day}.*${priorDay}`));
  const terminal = updateRun.mock.calls.find(call => call.arguments[1].$set?.status === 'PARTIAL');
  assert.ok(terminal, '应写入 PARTIAL 终态');

  const manual = await dailySync({ trigger: 'MANUAL', now, dependencies });
  assert.equal(manual.successCount, 1);
  assert.deepEqual([...prices], [[priorBucket, 1.25]]);
});

test('同源连续 3 次耗尽重试后熔断，保留有限脱敏报文且其它源继续', async () => {
  const assets = Array.from({ length: 44 }, (_, i) => ({ symbol: `US${i}.US`, market: 'US' }));
  assets.push({ symbol: '001180.CN', market: 'CN-FUND' });
  let requests = 0;
  const result = await syncActiveAssetPrices({
    getActiveAssets: async () => assets,
    isMarketOpenToday: () => true,
    fetchLatest: asset => asset.market === 'CN-FUND'
      ? Promise.resolve({ ...asset, price: 1.25 })
      : fetchWithRetry(async () => {
        requests += 1;
        throw classifyMarketDataError({ response: { status: 503, data: { message: 'outage', token: 'private' } } }, 'YAHOO');
      }, { baseDelayMs: 0 }),
    saveLatest: async () => {}
  });
  assert.equal(requests, 12); // 3 个标的各 4 次，原链路全失败将请求 44 × 4 次。
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 44);
  assert.deepEqual(result.circuitOpened, ['YAHOO']);
  const persisted = new TaskRun({ failures: result.failures }).toObject();
  assert.equal(persisted.failures[0].status, 503);
  assert.deepEqual(JSON.parse(persisted.failures[0].responseBody), { message: 'outage', token: '[REDACTED]' });
  assert.equal(persisted.failures[3].category, 'CIRCUIT_OPEN');
  assert.equal(persisted.failures[3].responseBody, undefined);
});

test('NOT_FOUND 与已恢复的请求打断熔断计数，写入失败不会熔断行情源', async () => {
  const statuses = [503, 503, 404, 503, 503, 200, 503, 503, 200];
  let requests = 0;
  const result = await syncActiveAssetPrices({
    getActiveAssets: async () => statuses.map((_, i) => ({ symbol: `US${i}.US`, market: 'US' })),
    isMarketOpenToday: () => true,
    fetchLatest: async asset => {
      const status = statuses[requests++];
      if (status !== 200) throw classifyMarketDataError({ response: { status } }, 'YAHOO');
      return asset;
    },
    saveLatest: async () => { throw Object.assign(new Error('storage failure'), { retryable: true }); }
  });
  assert.equal(requests, statuses.length);
  assert.equal(result.circuitOpened, undefined);
  assert.equal(result.failures[2].category, 'NOT_FOUND');
});

async function assertDiagnosticsRedacted(t, bodies) {
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'create', async () => ({ _id: 'redaction-test' }));
  const update = t.mock.method(TaskRun, 'updateOne', async () => ({ modifiedCount: 1 }));
  const info = t.mock.method(taskLogger, 'info', () => {});
  const error = t.mock.method(taskLogger, 'error', () => {});
  await dailySync({ trigger: 'MANUAL', dependencies: {
    getActiveAssets: async () => bodies.map((_, i) => ({ symbol: `US${i}.US`, market: 'US' })),
    isMarketOpenToday: () => true,
    fetchLatest: async asset => {
      const index = Number(asset.symbol[2]);
      throw classifyMarketDataError({ response: { status: 503, data: bodies[index] } }, 'YAHOO');
    }
  } });
  const stored = update.mock.calls.find(call => call.arguments[1].$set?.failures).arguments[1].$set.failures;
  assert.equal(stored.length, bodies.length);
  const logged = info.mock.calls.find(call => call.arguments[0] === 'TASK_END').arguments[1].failures;
  assert.deepEqual(logged, stored);
  assert.deepEqual(error.mock.calls.map(call => call.arguments[1]), stored);
  for (const failure of stored) {
    assert.equal(failure.status, 503);
    assert.match(failure.responseBody, /\[REDACTED\]/);
  }
  assert.ok(stored.every(({ responseBody }) => !responseBody.includes('FAKE_')), 'Credential canaries must be absent');
  return stored;
}

test('TASK-074：上游嵌套描述和原始文本中的 URL 查询值不会进入任务记录或任务日志', async (t) => {
  const stored = await assertDiagnosticsRedacted(t, [
    { description: 'Quote unavailable at https://feed.example/quotes?key=FAKE_QUERY',
      details: ['Try /status?%61ccess_token=FAKE_ENCODED&key=FAKE_DUPLICATE'] },
    'Quote unavailable: (https://feed.example/status?signature=FAKE_SIGNATURE#details)'
  ]);
  for (const { responseBody } of stored) assert.match(responseBody, /Quote unavailable/);
});

test('TASK-074：普通上游文本中的令牌赋值不会进入任务记录或任务日志', async (t) => {
  const stored = await assertDiagnosticsRedacted(t, [
    'Quote unavailable: access_token=FAKE_ACCESS',
    { description: 'Quote unavailable: "refresh_token": "FAKE_REFRESH with spaces"', code: 'QUOTES_UNAVAILABLE' },
    { details: ["Quote unavailable: 'Refresh-Token' = 'FAKE_HYPHENATED'", 'Quote unavailable: AccessToken=FAKE_CAMEL'] }
  ]);
  assert.equal(stored[0].responseBody, '[REDACTED]');
  assert.deepEqual(JSON.parse(stored[1].responseBody), { description: '[REDACTED]', code: 'QUOTES_UNAVAILABLE' });
  assert.deepEqual(JSON.parse(stored[2].responseBody), { details: ['[REDACTED]', '[REDACTED]'] });
});
