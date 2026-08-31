const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-portfolio-archived-test-logs';

const Portfolio = require('../../models/portfolio');
const TaskRun = require('../../models/taskRun');
const scheduleManager = require('../../services/rebalance/scheduleManager');
const ThresholdChecker = require('../../services/rebalance/thresholdChecker');
const cron = require('node-cron');
const { computeSummary } = require('../../services/portfolio/summary');

// ───────────────────────── Model 默认值 ─────────────────────────

test('Portfolio model：archived 默认 false（存量组合按未归档处理）', () => {
  const doc = new Portfolio({ name: '默认组合' });
  const error = doc.validateSync();
  assert.equal(error, undefined);
  assert.equal(doc.archived, false);
});

test('Portfolio model：archived 可显式设为 true', () => {
  const doc = new Portfolio({ name: '归档组合', archived: true });
  doc.validateSync();
  assert.equal(doc.archived, true);
});

// ───────────────────────── 再平衡调度（CM-20 验收）─────────────────────────

const PID_A = '64b00000000000000000000a'; // 未归档
const PID_B = '64b00000000000000000000b'; // 已归档

test('initSchedules：查询过滤 archived != true，仅注册未归档组合', async (t) => {
  const findMock = t.mock.method(Portfolio, 'find', () => ({
    lean: async () => [
      { _id: PID_A, archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } },
      // 查询层本应过滤掉；放在返回值里验证循环不会为归档组合注册
      { _id: PID_B, archived: true, rebalanceSettings: { rebalanceSchedule: 'daily' } }
    ]
  }));
  const cronMock = t.mock.method(cron, 'schedule', () => ({ stop: () => {} }));

  await scheduleManager.initSchedules();

  assert.equal(findMock.mock.callCount(), 1);
  assert.deepEqual(findMock.mock.calls[0].arguments[0], { archived: { $ne: true } });
  // 仅 PID_A 注册（PID_B 依赖运行时守卫兜底，见下一条）
  assert.equal(cronMock.mock.callCount(), 1);
  scheduleManager.cancelAllSchedules();
});

test('cron 回调运行时守卫：注册后归档的组合跳过执行', async (t) => {
  let cronCallback = null;
  t.mock.method(cron, 'schedule', (expr, callback) => {
    cronCallback = callback;
    return { stop: () => {} };
  });
  // 执行时数据库中该组合已归档
  t.mock.method(Portfolio, 'findById', () => ({
    select: () => ({ lean: async () => ({ _id: PID_B, archived: true }) })
  }));
  const checkMock = t.mock.method(ThresholdChecker, 'checkThresholds', async () => ({
    needsRebalance: true
  }));

  await scheduleManager.scheduleJobForPortfolio({
    _id: PID_B,
    archived: true,
    rebalanceSettings: { rebalanceSchedule: 'daily' }
  });
  assert.ok(cronCallback, 'cron 任务已注册');

  await cronCallback();

  assert.equal(checkMock.mock.callCount(), 0, '已归档组合不触发阈值检查');
  scheduleManager.cancelAllSchedules();
});

test('cron 回调运行时守卫：未归档组合正常执行阈值检查', async (t) => {
  let cronCallback = null;
  t.mock.method(cron, 'schedule', (expr, callback) => {
    cronCallback = callback;
    return { stop: () => {} };
  });
  // runTrackedTask 依赖 TaskRun（MongoDB）；mock 掉使 execute 正常执行
  t.mock.method(TaskRun, 'create', async () => ({ _id: { toString: () => 'taskrun-fake-id' } }));
  t.mock.method(TaskRun, 'updateOne', async () => ({}));
  t.mock.method(Portfolio, 'findById', () => ({
    select: () => ({ lean: async () => ({ _id: PID_A, archived: false }) })
  }));
  const checkMock = t.mock.method(ThresholdChecker, 'checkThresholds', async () => ({
    needsRebalance: false
  }));

  await scheduleManager.scheduleJobForPortfolio({
    _id: PID_A,
    archived: false,
    rebalanceSettings: { rebalanceSchedule: 'daily' }
  });
  await cronCallback();

  assert.equal(checkMock.mock.callCount(), 1);
  scheduleManager.cancelAllSchedules();
});

// ───────────────────────── 列表汇总过滤 ─────────────────────────

test('computeSummary：默认过滤 archived != true', async (t) => {
  const filters = [];
  t.mock.method(Portfolio, 'find', (filter) => {
    filters.push(filter);
    return { sort: () => ({ lean: async () => [] }) };
  });
  // summary 现聚合未读提醒数（CM-12），stub 掉无 MongoDB 的 aggregate
  const AlertEvent = require('../../models/alertEvent');
  t.mock.method(AlertEvent, 'aggregate', async () => []);

  const result = await computeSummary();

  assert.deepEqual(result, []);
  assert.deepEqual(filters[0], { archived: { $ne: true } });
});

test('computeSummary：includeArchived=true 时不过滤', async (t) => {
  const filters = [];
  t.mock.method(Portfolio, 'find', (filter) => {
    filters.push(filter);
    return { sort: () => ({ lean: async () => [] }) };
  });
  const AlertEvent = require('../../models/alertEvent');
  t.mock.method(AlertEvent, 'aggregate', async () => []);

  await computeSummary({ includeArchived: true });

  assert.deepEqual(filters[0], {});
});

// ───────────────────────── HTTP 契约 ─────────────────────────

const app = require('../../app');
const PortfolioService = require('../../services/portfolio');
let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

test('GET /api/portfolios/summary 默认 includeArchived=false', async () => {
  const calls = [];
  PortfolioService.computeSummary = async (options) => { calls.push(options); return []; };

  const result = await request('/api/portfolios/summary');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(calls[0], { includeArchived: false });
});

test('GET /api/portfolios/summary?includeArchived=true 透传给服务层', async () => {
  const calls = [];
  PortfolioService.computeSummary = async (options) => { calls.push(options); return []; };

  const result = await request('/api/portfolios/summary?includeArchived=true');
  assert.equal(result.status, 200);
  assert.deepEqual(calls[0], { includeArchived: true });
});

test('GET /api/portfolios/summary?includeArchived=other 视为 false', async () => {
  const calls = [];
  PortfolioService.computeSummary = async (options) => { calls.push(options); return []; };

  await request('/api/portfolios/summary?includeArchived=yes');
  assert.deepEqual(calls[0], { includeArchived: false });
});
