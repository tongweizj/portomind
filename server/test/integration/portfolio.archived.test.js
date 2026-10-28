const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-portfolio-archived-test-logs';

const Portfolio = require('@portomind/shared/models/portfolio');
const { computeSummary } = require('@portomind/shared/services/portfolio/summary');

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
//
// 说明（TASK-005 统一调度器）：再平衡的**调度触发权**已迁至 cron-worker
// （src/schedulers/rebalanceScheduler.js，单日分发器）；server 侧不再有 scheduleManager。
// 原先针对 scheduleManager.initSchedules / scheduleJobForPortfolio 的三条断言已移至
// cron-worker/test/rebalanceScheduler.test.js（连同「归档组合不执行」的运行时守卫断言）。

// ───────────────────────── 列表汇总过滤 ─────────────────────────

test('computeSummary：默认过滤 archived != true', async (t) => {
  const filters = [];
  t.mock.method(Portfolio, 'find', (filter) => {
    filters.push(filter);
    return { sort: () => ({ lean: async () => [] }) };
  });
  // summary 现聚合未读提醒数（CM-12），stub 掉无 MongoDB 的 aggregate
  const AlertEvent = require('@portomind/shared/models/alertEvent');
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
  const AlertEvent = require('@portomind/shared/models/alertEvent');
  t.mock.method(AlertEvent, 'aggregate', async () => []);

  await computeSummary({ includeArchived: true });

  assert.deepEqual(filters[0], {});
});

// ───────────────────────── HTTP 契约 ─────────────────────────

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const PortfolioService = require('@portomind/shared/services/portfolio');
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
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: authHeaders().cookie } });
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
