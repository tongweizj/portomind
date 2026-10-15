// server/test/integration/taskrun.logging.test.js
//
// 说明（TASK-005 统一调度器）：
// 本文件原名 scheduler.module.test.js。server 进程已不再注册任何 cron（调度全部由
// cron-worker 独占），因此原先针对 server/tasks/priceScheduler 的断言已迁至
// cron-worker/test/scheduler.test.js；price 同步的任务级断言由 cron-worker/test/dailySync.test.js
// 覆盖。这里保留与进程无关的部分：TaskRun 防重（@portomind/shared）、市场日期归一化与日志脱敏。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TaskRun = require('@portomind/shared/models/taskRun');
const { marketDate } = require('@portomind/shared/utils/marketTime');
const { runTrackedTask } = require('@portomind/shared/services/taskRunner');
const { paginateLogFile, parseLogQuery } = require('../../controllers/log.controller');
const { sanitizeLogValue, sanitizeUrl } = require('@portomind/shared/utils/logSanitizer');

const originalCreate = TaskRun.create;
const originalUpdateOne = TaskRun.updateOne;

test.afterEach(() => {
  TaskRun.create = originalCreate;
  TaskRun.updateOne = originalUpdateOne;
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
