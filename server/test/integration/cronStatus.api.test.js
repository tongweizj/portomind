// server/test/integration/cronStatus.api.test.js
//
// TASK-054 集成测试（AC1 / AC8）：起真实 Express app + fetch，模型静态方法用替身。
// 与既有 api-contract.test.js 同一套 HTTP 测试方式（app.listen(0) + fetch）。

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'portomind-cronstatus-api-logs');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { applyWorld } = require('../helpers/modelStubs');
const TaskRun = require('@portomind/shared/models/taskRun');
const TaskSkip = require('@portomind/shared/models/taskSkip');
const Asset = require('@portomind/shared/models/asset');

const TASK_NAMES = [
  'daily-price-sync',
  'price-integrity-check',
  'alert-evaluate',
  'fx-rate-sync',
  'rebalance-check'
];

let server;
let baseUrl;
let restore = () => {};
function useWorld(world) {
  restore();
  restore = applyWorld(world);
}

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

test.afterEach(() => {
  restore();
  restore = () => {};
});

async function request(pathname, options) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.headers || {}), cookie: authHeaders().cookie }
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const runDoc = (over = {}) => ({
  taskName: 'daily-price-sync',
  runKey: '2026-10-25',
  trigger: 'SCHEDULED',
  status: 'SUCCEEDED',
  startedAt: new Date('2026-10-25T07:00:00.000Z'),
  endedAt: new Date('2026-10-25T07:00:01.000Z'),
  durationMs: 1000,
  totalCount: 44,
  successCount: 0,
  failureCount: 0,
  failures: [],
  ...over
});
const latest = (taskName, over = {}) => ({ _id: taskName, doc: runDoc({ taskName, ...over }) });

/**
 * AC1：端点存在、5 个任务条目、运行态与数据态字段齐全、generatedAt 可解析
 */
test('A1 主视图返回 5 个任务条目且含运行态 + 数据态 + notes', async () => {
  useWorld({});

  const result = await request('/api/cron/status');

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  const data = result.body.data;
  assert.equal(data.tasks.length, 5);
  assert.deepEqual(data.tasks.map((entry) => entry.taskName), TASK_NAMES);
  assert.equal(data.assetCompleteness.contractReady, false);
  assert.equal(data.assetCompleteness.total, null);
  assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
  assert.equal(typeof data.timezone, 'string');
  assert.equal(typeof data.staleThresholdHours, 'number');
  for (const entry of data.tasks) {
    assert.ok('lastRun' in entry);
    assert.equal(typeof entry.stale, 'boolean');
    assert.equal(typeof entry.contractReady, 'boolean');
    assert.equal(typeof entry.dataState, 'object');
    assert.ok(['ok', 'warn', 'bad', 'unknown'].includes(entry.dataStateLevel));
    assert.ok(Array.isArray(entry.notes));
  }
});

test('TASK-076 仅鉴权手动检查可写 TaskRun，防重后读回快照且资产未改变', async (t) => {
  const assetId = '64b000000000000000000076';
  const docs = [{ _id: assetId, symbol: 'VOO.US', market: 'US', currency: 'USD', name: 'VOO', active: true }];
  const original = structuredClone(docs);
  const latestRuns = [];
  useWorld({ latestRuns });
  let allowRead;
  let readStarted;
  const entered = new Promise(resolve => { readStarted = resolve; });
  const gate = new Promise(resolve => { allowRead = resolve; });
  const findAssets = t.mock.method(Asset, 'find', filter => ({ select() { return this; }, async lean() {
    readStarted();
    await gate;
    return filter.active === true ? docs.filter(doc => doc.active) : docs.filter(doc => filter._id.$in.includes(doc._id));
  } }));
  t.mock.method(Asset, 'findByIdAndUpdate', async (id, data) => {
    assert.equal(id, assetId);
    return Object.assign(docs[0], data);
  });
  const start = t.mock.method(TaskRun, 'create', async row => ({ ...row, _id: 'run-076' }));
  t.mock.method(TaskRun, 'init', async () => TaskRun);
  t.mock.method(TaskRun, 'updateOne', async (_filter, update) => {
    latestRuns.push({ _id: 'asset-integrity-check', doc: update.$set });
    return { modifiedCount: 1 };
  });
  t.mock.method(TaskSkip, 'create', async () => ({ _id: 'skip-076' }));
  const url = '/api/asset-integrity/check';
  assert.equal((await fetch(baseUrl + url, { method: 'POST' })).status, 401);
  assert.equal((await request(url, { method: 'POST', body: '{"apply":true}' })).status, 400);
  const first = request(url, { method: 'POST', body: '{}' });
  await entered;
  try {
    const repeated = await request(url, { method: 'POST', body: '{}' });
    assert.equal(repeated.body.data.status, 'SKIPPED');
    assert.equal(repeated.body.data.reason, 'ALREADY_RUNNING');
  } finally {
    allowRead();
  }
  const result = (await first).body.data;
  assert.equal(start.mock.callCount(), 1);
  assert.equal(start.mock.calls[0].arguments[0].runKey, 'manual:active');
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.summary.launchDateMissing, 1);
  assert.deepEqual(docs, original);
  const snapshot = (await request('/api/cron/status')).body.data;
  assert.equal(snapshot.tasks.length, 5);
  assert.equal(snapshot.assetCompleteness.checkedAt, result.endedAt);
  assert.equal(snapshot.assetCompleteness.incomplete, 1);
  assert.equal(snapshot.assetCompleteness.incompleteAssets[0].assetId, assetId);
  assert.equal(result.summary.checkedAssetIds, undefined);
  const saved = await request(`/api/assets/${assetId}`, {
    method: 'PUT', body: JSON.stringify({ launchDate: '2020-01-01', active: false })
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.active, false);
  const refreshedStatus = (await request('/api/cron/status')).body.data;
  const refreshed = refreshedStatus.assetCompleteness;
  assert.equal(refreshed.checkedAt, result.endedAt);
  assert.equal(refreshed.total, 1);
  assert.equal(refreshed.launchDateMissing, 0);
  assert.equal(refreshed.priceEmpty3MarketDays, snapshot.assetCompleteness.priceEmpty3MarketDays);
  assert.deepEqual(refreshed.incompleteAssets[0].reasons, ['PRICE_EMPTY_3_MARKET_DAYS']);
  assert.equal(refreshedStatus.tasks[0].dataState.expected, 0);
  assert.deepEqual(findAssets.mock.calls.at(-1).arguments[0], { _id: { $in: [assetId] } });
  assert.equal(latestRuns[0].doc.result.launchDateMissing, 1);
  assert.equal(start.mock.callCount(), 1);
  const rechecked = (await request(url, { method: 'POST', body: '{}' })).body.data;
  assert.equal(rechecked.summary.launchDateMissing, 0);
  assert.equal(rechecked.summary.total, 0);
});

/**
 * AC1：有记录时 lastRun 字段完整；RUNNING 记录的 endedAt/durationMs 归一为 null（键存在）
 */
test('A2 有 taskrun 时 lastRun 字段完整，RUNNING 缺省字段归一为 null', async () => {
  const now = Date.now();
  useWorld({
    latestRuns: [
      latest('daily-price-sync', {
        status: 'RUNNING',
        startedAt: new Date(now - 60 * 60 * 1000),
        endedAt: null,
        durationMs: null,
        totalCount: 44
      })
    ]
  });

  const result = await request('/api/cron/status');
  assert.equal(result.status, 200);
  const lastRun = result.body.data.tasks[0].lastRun;

  for (const key of ['runKey', 'trigger', 'status', 'rawStatus', 'startedAt', 'endedAt', 'durationMs', 'totalCount', 'successCount', 'failureCount']) {
    assert.ok(key in lastRun, `lastRun.${key} 应存在`);
  }
  assert.equal(lastRun.status, 'RUNNING');
  assert.equal(lastRun.rawStatus, 'RUNNING');
  assert.equal(lastRun.endedAt, null);
  assert.equal(lastRun.durationMs, null);
});

/**
 * AC8：date 非法 → 400（含回环校验）
 */
test('A3 detail 的 date 非法返回 400', async () => {
  useWorld({});

  for (const badDate of ['2026-13-40', '../../etc/passwd', '2026-1-1']) {
    const result = await request(`/api/cron/status?detail=rebalance&date=${encodeURIComponent(badDate)}`);
    assert.equal(result.status, 400, `date=${badDate} 应返回 400`);
    assert.equal(result.body.success, false);
    assert.ok(result.body.traceId);
  }
});

/**
 * AC8：portfolioId 非法 → 200 + 空 rows + 明确 note（不 500）
 */
test('A4 portfolioId 非法返回 200 空结果与 PORTFOLIO_ID_INVALID', async () => {
  useWorld({});

  const result = await request('/api/cron/status?detail=rebalance&portfolioId=not-an-id');

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.data.rows, []);
  assert.ok(result.body.data.notes.some((note) => note.code === 'PORTFOLIO_ID_INVALID'));
});

/**
 * AC8：portfolioId 合法但不存在 → 200 + 空 rows + PORTFOLIO_NOT_FOUND（不 500）
 */
test('A5 portfolioId 合法但不存在返回 200 空结果与 PORTFOLIO_NOT_FOUND', async () => {
  useWorld({ portfolios: [] });

  const result = await request('/api/cron/status?detail=rebalance&date=2026-10-26&portfolioId=64b0000000000000000000ff');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.rows, []);
  assert.ok(result.body.data.notes.some((note) => note.code === 'PORTFOLIO_NOT_FOUND'));
});

/**
 * AC8 / D-8：detail 正常返回 summary + rows，且 rows 与主视图 perPortfolio 同构
 */
test('A6 detail 正常返回 summary/rows，且与主视图 perPortfolio 同构', async () => {
  const pid = '64b000000000000000000001';
  const startedAt = new Date('2026-10-26T04:00:00.000Z');
  useWorld({
    portfolios: [
      { _id: pid, name: 'A股-长钱组合', accountType: 'tiantian', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } }
    ],
    rebalanceRuns: [
      { _id: `rebalance-suggestions:${pid}`, doc: runDoc({ taskName: `rebalance-suggestions:${pid}`, startedAt }) }
    ]
  });

  const main = await request('/api/cron/status');
  const detail = await request('/api/cron/status?detail=rebalance&date=2026-10-26');

  assert.equal(detail.status, 200);
  const data = detail.body.data;
  assert.equal(data.date, '2026-10-26');
  assert.equal(typeof data.contractReady, 'boolean');
  for (const key of ['totalPortfolios', 'due', 'generated', 'failed', 'skipped']) {
    assert.ok(key in data.summary, `summary.${key} 应存在`);
  }
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].portfolioId, pid);

  const mainRow = main.body.data.tasks[4].dataState.perPortfolio[0];
  assert.deepEqual(Object.keys(data.rows[0]).sort(), Object.keys(mainRow).sort());
});

/**
 * AC9：空集合 HTTP 层不得出现任何伪造的 SUCCEEDED
 */
test('A7 空态 HTTP 层返回 200 且不含 SUCCEEDED', async () => {
  useWorld({});

  const result = await request('/api/cron/status');

  assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result.body.data).includes('SUCCEEDED'));
});

/**
 * AC8 / D-14：detail 非 rebalance → 400
 */
test('A8 detail 非 rebalance 返回 400', async () => {
  useWorld({});

  const result = await request('/api/cron/status?detail=foo');

  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});

/**
 * AC1（M-1 回归）：路由必须精确是 /api/cron/status，不能是 /api/cron
 */
test('A9 GET /api/cron 返回 404（路径精确性回归）', async () => {
  useWorld({});

  const result = await request('/api/cron');
  assert.equal(result.status, 404);
});

/**
 * AC8：detail 当日无分发记录 → 200 + rows 空 + NO_DISTRIBUTION_RECORD（契约代码必须真实触发）
 */
test('A10 detail 当日无分发记录返回 200 + NO_DISTRIBUTION_RECORD', async () => {
  useWorld({ portfolios: [] });

  const result = await request('/api/cron/status?detail=rebalance&date=2026-10-26');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.rows, []);
  assert.ok(result.body.data.notes.some((note) => note.code === 'NO_DISTRIBUTION_RECORD'));
});

/**
 * AC8 / API_CONTRACT：date 只属于 detail；主视图携带非法 date 不得 400（避免整块看板被拖垮）
 */
test('A11 主视图忽略 date 参数（非法值也不 400）', async () => {
  useWorld({});

  const result = await request('/api/cron/status?date=garbage');

  assert.equal(result.status, 200);
  assert.equal(result.body.data.tasks.length, 5);
});
