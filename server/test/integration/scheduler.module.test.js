const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cron = require('node-cron');
const TaskRun = require('../../models/taskRun');
const { DEFAULT_PRICE_SYNC_CRON, startPriceScheduler } = require('../../tasks/priceScheduler');
const { syncActiveAssetPrices, marketDate } = require('../../tasks/dailySync');
const { runTrackedTask } = require('../../services/taskRunner');
const { paginateLogFile, parseLogQuery } = require('../../controllers/log.controller');
const { sanitizeLogValue, sanitizeUrl } = require('../../utils/logSanitizer');

const originalSchedule = cron.schedule;
const originalCreate = TaskRun.create;
const originalUpdateOne = TaskRun.updateOne;

test.afterEach(() => {
  cron.schedule = originalSchedule;
  TaskRun.create = originalCreate;
  TaskRun.updateOne = originalUpdateOne;
});

test('价格 cron 每天 03:00 只触发一次且使用统一时区', () => {
  let captured;
  cron.schedule = (expression, callback, options) => {
    captured = { expression, callback, options };
    return { stop() {} };
  };
  startPriceScheduler({ timezone: 'America/Toronto', dailySync: async () => {} });
  assert.equal(DEFAULT_PRICE_SYNC_CRON, '0 3 * * *');
  assert.equal(captured.expression, '0 3 * * *');
  assert.equal(captured.options.timezone, 'America/Toronto');
});

test('价格同步隔离单资产失败并返回完整计数', async () => {
  const saved = [];
  const result = await syncActiveAssetPrices({
    getActiveAssets: async () => [{ symbol: 'VTI' }, { symbol: 'FAIL' }, { symbol: 'BND.TO' }],
    fetchLatest: async symbol => {
      if (symbol === 'FAIL') throw Object.assign(new Error('provider timeout'), {
        category: 'TIMEOUT', provider: 'TEST', retryable: true
      });
      return { symbol, price: 100, timestamp: new Date('2026-08-24T12:00:00Z') };
    },
    saveLatest: async record => { saved.push(record.symbol); }
  });

  assert.deepEqual(saved, ['VTI', 'BND.TO']);
  assert.deepEqual(
    { totalCount: result.totalCount, successCount: result.successCount, failureCount: result.failureCount },
    { totalCount: 3, successCount: 2, failureCount: 1 }
  );
  assert.equal(result.failures[0].item, 'FAIL');
});

test('任务运行键同时提供进程内锁与数据库唯一键防重', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  TaskRun.create = async () => ({ _id: { toString: () => 'run-1' } });
  TaskRun.updateOne = async () => ({});

  const first = runTrackedTask({
    taskName: 'daily-price-sync', runKey: '2026-08-24',
    execute: async () => { await gate; return { totalCount: 1, successCount: 1 }; }
  });
  const duplicate = await runTrackedTask({
    taskName: 'daily-price-sync', runKey: '2026-08-24', execute: async () => ({})
  });
  assert.equal(duplicate.status, 'SKIPPED');
  assert.equal(duplicate.reason, 'ALREADY_RUNNING');

  release();
  const completed = await first;
  assert.equal(completed.status, 'SUCCEEDED');

  TaskRun.create = async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); };
  const crossProcessDuplicate = await runTrackedTask({
    taskName: 'daily-price-sync', runKey: '2026-08-24', execute: async () => ({})
  });
  assert.equal(crossProcessDuplicate.reason, 'DUPLICATE_RUN_KEY');
});

test('市场日期、历史日志日期过滤和日志脱敏行为明确', async () => {
  assert.equal(marketDate(new Date('2026-08-25T02:00:00Z'), 'America/Toronto'), '2026-08-24');
  assert.deepEqual(parseLogQuery({ date: '2026-08-01', level: 'all' }), {
    date: '2026-08-01', level: 'all'
  });
  assert.throws(() => parseLogQuery({ date: '../../etc/passwd' }), /YYYY-MM-DD/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portomind-log-test-'));
  const file = path.join(dir, 'task-2026-08-01.log');
  fs.writeFileSync(file, [
    JSON.stringify({ timestamp: '2026-08-01 03:00:00', level: 'info', message: 'TASK_START' }),
    JSON.stringify({ timestamp: '2026-08-01 03:00:01', level: 'error', message: 'failed' })
  ].join('\n'));
  const page = await paginateLogFile(file, 'all', 1, 20);
  assert.equal(page.total, 2);
  fs.rmSync(dir, { recursive: true, force: true });

  assert.match(sanitizeUrl('/api?a=1&access_token=secret'), /access_token=%5BREDACTED%5D/);
  assert.deepEqual(sanitizeLogValue({ authorization: 'Bearer secret', nested: { MONGO_URI: 'mongodb://secret' } }), {
    authorization: '[REDACTED]', nested: { MONGO_URI: '[REDACTED]' }
  });
});
