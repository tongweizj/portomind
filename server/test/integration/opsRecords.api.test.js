// server/test/integration/opsRecords.api.test.js
//
// TASK-075：采集记录。GET /api/ops-center/task-runs（列表：筛选、分页、TaskSkip 合并）
// 与 GET /api/ops-center/task-runs/:id 的逐资产明细。
// 起真实 Express + 认证闸门；TaskRun.aggregate / findById 用替身，不连接 MongoDB。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-ops-records-api-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const TaskRun = require('@portomind/shared/models/taskRun');
const {
  installAdminSession,
  uninstallSessionStub,
  setSessionUser,
  authHeaders,
  ADMIN_USER,
  MEMBER_USER
} = require('../helpers/auth');

const RUN_ID = '64b000000000000000000075';
let server;
let baseUrl;

test.before(async () => {
  installAdminSession();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  uninstallSessionStub();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.afterEach(() => setSessionUser(ADMIN_USER));

async function request(pathname, { authenticated = true } = {}) {
  const headers = authenticated ? { cookie: authHeaders().cookie } : {};
  const response = await fetch(`${baseUrl}${pathname}`, { headers });
  return { status: response.status, body: await response.json() };
}

/** TaskRun.aggregate 替身：记录管道，返回 $facet 形状的一页结果。 */
function stubAggregate(t, rows, total = rows.length) {
  const pipelines = [];
  t.mock.method(TaskRun, 'aggregate', async (pipeline) => {
    pipelines.push(pipeline);
    return [{ items: rows, total: total > 0 ? [{ count: total }] : [] }];
  });
  return pipelines;
}

const SYNC_ROW = {
  _id: RUN_ID,
  kind: 'run',
  taskName: 'daily-price-sync',
  runKey: 'manual:2026-11-24T15:00:00.000Z',
  trigger: 'MANUAL',
  status: 'PARTIAL',
  startedAt: new Date('2026-11-24T15:00:00.000Z'),
  endedAt: new Date('2026-11-24T15:00:30.000Z'),
  durationMs: 30000,
  totalCount: 3,
  successCount: 2,
  failureCount: 1,
  scope: { marketGroup: 'US_CA', assetId: null, symbol: null, assetCount: 3, from: '2026-11-24', to: '2026-11-24' }
};

test('采集记录列表返回 200 + 服务端分页，行含时间/类型/范围/状态/计数/耗时', async (t) => {
  stubAggregate(t, [SYNC_ROW], 41);

  const result = await request('/api/ops-center/task-runs?page=3&pageSize=20');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.pagination, { page: 3, pageSize: 20, total: 41 });
  const [row] = result.body.data;
  assert.equal(row.kind, 'run');
  assert.equal(row.runId, RUN_ID);
  assert.equal(row.taskName, 'daily-price-sync');
  assert.equal(row.status, 'PARTIAL');
  assert.equal(row.startedAt, '2026-11-24T15:00:00.000Z');
  assert.equal(row.durationMs, 30000);
  assert.deepEqual(row.counts, { totalCount: 3, successCount: 2, failureCount: 1 });
  assert.deepEqual(row.scope, {
    marketGroup: 'US_CA', assetId: null, symbol: null, assetCount: 3, from: '2026-11-24', to: '2026-11-24'
  });
  assert.equal('lockKey' in row, false);
});

test('采集记录筛选：操作类型、资产、时间（按 MARKET_TIMEZONE 日界）进入服务端查询', async (t) => {
  const pipelines = stubAggregate(t, []);
  const assetId = '64b0000000000000000000a1';

  const result = await request(
    `/api/ops-center/task-runs?taskName=asset-history-backfill&assetId=${assetId}&from=2026-11-01&to=2026-11-24`
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, []);
  assert.equal(result.body.pagination.total, 0);

  const match = pipelines[0][0].$match;
  assert.deepEqual(match.taskName, { $in: ['asset-history-backfill'] });
  // 单资产补采把资产记在 result.assetId；其余任务记在 result.assets[].assetId。
  assert.deepEqual(match.$or, [{ 'result.assetId': assetId }, { 'result.assets.assetId': assetId }]);
  // America/Toronto：11-01 当日 00:00 为 EDT（UTC-4），11-25 00:00 为 EST（UTC-5）。
  assert.deepEqual(match.startedAt, {
    $gte: new Date('2026-11-01T04:00:00.000Z'),
    $lt: new Date('2026-11-25T05:00:00.000Z')
  });
});

test('采集记录非法筛选返回 400，未登录返回 401', async (t) => {
  const aggregate = stubAggregate(t, []);
  for (const query of [
    'taskName=alert-evaluate',
    'assetId=not-an-id',
    'from=2026-13-01',
    'to=20261124',
    'from=2026-11-24&to=2026-11-01',
    'page=0',
    'pageSize=101'
  ]) {
    const result = await request(`/api/ops-center/task-runs?${query}`);
    assert.equal(result.status, 400, query);
    assert.equal(result.body.success, false, query);
  }
  assert.equal(aggregate.length, 0);

  const anonymous = await request('/api/ops-center/task-runs', { authenticated: false });
  assert.equal(anonymous.status, 401);
});

test('采集记录合并 TaskSkip 跳过事件；按资产筛选时不含跳过事件', async (t) => {
  const skipRow = {
    _id: '64b0000000000000000000s1',
    kind: 'skip',
    taskName: 'asset-history-backfill-batch',
    runKey: 'manual:2026-11-24T16:00:00.000Z',
    trigger: 'MANUAL',
    reason: 'ALREADY_RUNNING',
    activeRunKey: 'manual:2026-11-24T15:59:00.000Z',
    startedAt: new Date('2026-11-24T16:00:00.000Z')
  };
  const pipelines = stubAggregate(t, [skipRow, SYNC_ROW], 2);

  const result = await request('/api/ops-center/task-runs?taskName=asset-history-backfill-batch&from=2026-11-24');
  assert.equal(result.status, 200);
  const [skip, run] = result.body.data;
  assert.deepEqual(skip, {
    kind: 'skip',
    skipId: '64b0000000000000000000s1',
    runId: null,
    taskName: 'asset-history-backfill-batch',
    runKey: 'manual:2026-11-24T16:00:00.000Z',
    trigger: 'MANUAL',
    status: 'SKIPPED',
    reason: 'ALREADY_RUNNING',
    activeRunKey: 'manual:2026-11-24T15:59:00.000Z',
    startedAt: '2026-11-24T16:00:00.000Z',
    endedAt: null,
    durationMs: null,
    counts: null,
    scope: null
  });
  assert.equal(run.kind, 'run');

  const union = pipelines[0].find((stage) => stage.$unionWith)?.$unionWith;
  assert.equal(union.coll, 'taskskips');
  const skipMatch = union.pipeline[0].$match;
  assert.deepEqual(skipMatch.taskName, { $in: ['asset-history-backfill-batch'] });
  assert.deepEqual(skipMatch.skippedAt, { $gte: new Date('2026-11-24T05:00:00.000Z') });

  await request('/api/ops-center/task-runs?assetId=64b0000000000000000000a1');
  assert.equal(pipelines[1].some((stage) => stage.$unionWith), false);
});

function stubRun(t, doc) {
  t.mock.method(TaskRun, 'findById', () => ({ lean: async () => ({ _id: RUN_ID, trigger: 'MANUAL', ...doc }) }));
}

async function assetResultsOf(t, doc) {
  stubRun(t, doc);
  const result = await request(`/api/ops-center/task-runs/${RUN_ID}`);
  assert.equal(result.status, 200);
  return result.body.data.assetResults;
}

const BASE_ROW = Object.freeze({
  assetId: null, symbol: null, market: null, status: null, reason: null, message: null,
  from: null, to: null, priceDate: null, missingCount: null, missingRanges: [],
  missingRangesTruncated: false, childRunId: null
});

test('run 详情：今日同步逐资产明细（成功/休市跳过/失败原因并入 failures[] 的 message）', async (t) => {
  const rows = await assetResultsOf(t, {
    taskName: 'daily-price-sync', status: 'PARTIAL', startedAt: new Date(),
    failures: [{ item: 'VTI.US', category: 'UPSTREAM', provider: 'YAHOO', message: 'quote unavailable' }],
    result: {
      skippedCount: 1,
      assets: [
        { assetId: 'a1', symbol: 'VOO.US', market: 'US', status: 'fetched', priceDate: '2026-11-24' },
        { assetId: 'a2', symbol: '0700.HK', market: 'HK', status: 'skipped', priceDate: null, reason: 'MARKET_CLOSED' },
        { assetId: 'a3', symbol: 'VTI.US', market: 'US', status: 'failed', priceDate: null, reason: 'UPSTREAM' }
      ]
    }
  });
  assert.deepEqual(rows, [
    { ...BASE_ROW, assetId: 'a1', symbol: 'VOO.US', market: 'US', status: 'succeeded', priceDate: '2026-11-24' },
    { ...BASE_ROW, assetId: 'a2', symbol: '0700.HK', market: 'HK', status: 'skipped', reason: 'MARKET_CLOSED' },
    { ...BASE_ROW, assetId: 'a3', symbol: 'VTI.US', market: 'US', status: 'failed', reason: 'UPSTREAM', message: 'quote unavailable' }
  ]);
});

test('run 详情：完整性检查逐资产明细（缺口区间可读、未检查归为跳过）', async (t) => {
  const rows = await assetResultsOf(t, {
    taskName: 'price-integrity-check', status: 'PARTIAL', startedAt: new Date(),
    failures: [{ item: 'ERR.US', category: 'INTERNAL', message: 'coverage query timed out' }],
    result: {
      assets: [
        { assetId: 'a1', symbol: 'VOO.US', market: 'US', status: 'OK', from: '2026-01-02', to: '2026-11-24', missing: 0, missingRanges: [] },
        {
          assetId: 'a2', symbol: 'VTI.US', market: 'US', status: 'GAP', from: '2026-01-02', to: '2026-11-24', missing: 3,
          missingRanges: [{ from: '2026-03-02', to: '2026-03-04' }], missingRangesTruncated: true
        },
        { assetId: 'a3', symbol: 'NEW.US', market: 'US', status: 'INSUFFICIENT_SAMPLE', from: null, to: null, missing: null },
        { assetId: 'a4', symbol: 'ERR.US', market: 'US', status: 'ERROR' }
      ]
    }
  });
  assert.deepEqual(rows, [
    { ...BASE_ROW, assetId: 'a1', symbol: 'VOO.US', market: 'US', status: 'succeeded', from: '2026-01-02', to: '2026-11-24', missingCount: 0 },
    {
      ...BASE_ROW, assetId: 'a2', symbol: 'VTI.US', market: 'US', status: 'partial', reason: 'GAP',
      from: '2026-01-02', to: '2026-11-24', missingCount: 3,
      missingRanges: [{ from: '2026-03-02', to: '2026-03-04' }], missingRangesTruncated: true
    },
    { ...BASE_ROW, assetId: 'a3', symbol: 'NEW.US', market: 'US', status: 'skipped', reason: 'INSUFFICIENT_SAMPLE' },
    { ...BASE_ROW, assetId: 'a4', symbol: 'ERR.US', market: 'US', status: 'failed', reason: 'ERROR', message: 'coverage query timed out' }
  ]);
});

test('run 详情：单资产补采归一为一行，保留全部失败原因', async (t) => {
  const rows = await assetResultsOf(t, {
    taskName: 'asset-history-backfill', status: 'PARTIAL', startedAt: new Date(),
    failures: [
      { item: 'VOO.US', category: 'UPSTREAM', message: 'range 2026-05-01~2026-05-02 fetch failed' },
      { item: 'VOO.US', category: 'HISTORY_GAP', message: 'missing 2/10 trading days after backfill' }
    ],
    result: {
      assetId: 'a1', symbol: 'VOO.US', market: 'US', from: '2026-01-01', to: '2026-11-20',
      missingBeforeCount: 3, missingAfterCount: 2, fetchedCount: 1,
      missingRanges: [{ from: '2026-05-01', to: '2026-05-02' }], missingRangesTruncated: false
    }
  });
  assert.deepEqual(rows, [{
    ...BASE_ROW, assetId: 'a1', symbol: 'VOO.US', market: 'US', status: 'partial',
    reason: 'UPSTREAM', message: 'range 2026-05-01~2026-05-02 fetch failed；missing 2/10 trading days after backfill',
    from: '2026-01-01', to: '2026-11-20', missingCount: 2,
    missingRanges: [{ from: '2026-05-01', to: '2026-05-02' }]
  }]);
});

test('run 详情：批量补缺失逐资产明细带子任务 runId；result 缺失时为 null 而非空列表', async (t) => {
  const rows = await assetResultsOf(t, {
    taskName: 'asset-history-backfill-batch', status: 'PARTIAL', startedAt: new Date(),
    result: {
      assetCount: 2,
      assets: [
        { assetId: 'a1', symbol: 'VOO.US', market: 'US', status: 'succeeded', runId: 'c1', from: '2026-11-01', to: '2026-11-05', missingAfterCount: 0 },
        {
          assetId: 'a2', symbol: 'VTI.US', market: 'US', status: 'skipped', runId: null, from: null, to: null,
          missingAfterCount: null, reason: 'ALREADY_RUNNING', message: 'VTI.US is already being backfilled'
        }
      ]
    }
  });
  assert.deepEqual(rows, [
    { ...BASE_ROW, assetId: 'a1', symbol: 'VOO.US', market: 'US', status: 'succeeded', from: '2026-11-01', to: '2026-11-05', missingCount: 0, childRunId: 'c1' },
    {
      ...BASE_ROW, assetId: 'a2', symbol: 'VTI.US', market: 'US', status: 'skipped',
      reason: 'ALREADY_RUNNING', message: 'VTI.US is already being backfilled'
    }
  ]);

  const running = await assetResultsOf(t, {
    taskName: 'asset-history-backfill-batch', status: 'RUNNING', startedAt: new Date()
  });
  assert.equal(running, null);
});

test('member 可读取采集记录列表（服务端仅要求登录）', async (t) => {
  setSessionUser(MEMBER_USER);
  stubAggregate(t, [SYNC_ROW]);
  const result = await request('/api/ops-center/task-runs');
  assert.equal(result.status, 200);
  assert.equal(result.body.data[0].runId, RUN_ID);
});
