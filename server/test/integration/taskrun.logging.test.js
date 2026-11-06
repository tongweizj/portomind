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
const TaskSkip = require('@portomind/shared/models/taskSkip');
const { marketDate } = require('@portomind/shared/utils/marketTime');
const { runTrackedTask, normalizeCounts } = require('@portomind/shared/services/taskRunner');
const { paginateLogFile, parseLogQuery } = require('../../controllers/log.controller');
const { sanitizeLogValue, sanitizeUrl } = require('@portomind/shared/utils/logSanitizer');

const originalCreate = TaskRun.create;
const originalUpdateOne = TaskRun.updateOne;
const originalSkipCreate = TaskSkip.create;

test.afterEach(() => {
  TaskRun.create = originalCreate;
  TaskRun.updateOne = originalUpdateOne;
  TaskSkip.create = originalSkipCreate;
});

test('任务运行键同时提供进程内锁与数据库唯一键防重', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  TaskRun.create = async () => ({ _id: { toString: () => 'run-1' } });
  const skipEvents = [];
  TaskSkip.create = async (payload) => { skipEvents.push(payload); return { _id: { toString: () => `skip-${skipEvents.length}` } }; };
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
  assert.equal(duplicate.skipPersisted, true);
  assert.equal(skipEvents.length, 1);
  assert.equal(skipEvents[0].reason, 'ALREADY_RUNNING');
  assert.equal(skipEvents[0].activeRunKey, '2026-08-24');

  release();
  const completed = await first;
  assert.equal(completed.status, 'SUCCEEDED');

  TaskRun.create = async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); };
  const crossProcessDuplicate = await runTrackedTask({
    taskName: 'daily-price-sync', runKey: '2026-08-24', execute: async () => ({})
  });
  assert.equal(crossProcessDuplicate.reason, 'DUPLICATE_RUN_KEY');
  assert.equal(crossProcessDuplicate.skipPersisted, true);
  assert.equal(skipEvents.length, 2);
  assert.equal(skipEvents[1].reason, 'DUPLICATE_RUN_KEY');
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

test('result 只透传显式 result；顶层裸字段丢弃；skip 写失败不阻断且标记未持久化', async () => {
  TaskRun.create = async () => ({ _id: { toString: () => 'run-result' } });
  let persisted = null;
  TaskRun.updateOne = async (_filter, update) => { persisted = update.$set; return {}; };
  const summary = await runTrackedTask({
    taskName: 'test:057:result', runKey: 'test:057:run-1',
    execute: async () => ({ totalCount: 1, successCount: 1, failureCount: 0, ok: 1, gap: 2, result: { kept: { a: 1 } } })
  });
  assert.equal(summary.status, 'SUCCEEDED');
  assert.deepEqual(persisted.result, { kept: { a: 1 } });
  assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'ok'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'gap'), false);

  // AC7：result 合法但 failureCount>0 → 仍 PARTIAL（状态机未变）
  TaskRun.create = async () => ({ _id: { toString: () => 'run-partial' } });
  const partial = await runTrackedTask({
    taskName: 'test:057:partial', runKey: 'test:057:run-2',
    execute: async () => ({ totalCount: 1, successCount: 0, failureCount: 1, result: { kept: true } })
  });
  assert.equal(partial.status, 'PARTIAL');

  // AC5：TaskSkip 写失败只标记未持久化，不阻断跳过返回
  TaskSkip.create = async () => { throw new Error('skip store down'); };
  TaskRun.create = async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); };
  const skipped = await runTrackedTask({
    taskName: 'test:057:skip-fail', runKey: 'test:057:run-3', execute: async () => ({})
  });
  assert.equal(skipped.status, 'SKIPPED');
  assert.equal(skipped.reason, 'DUPLICATE_RUN_KEY');
  assert.equal(skipped.skipPersisted, false);
});

test('AC6 TaskRun 唯一索引与 TaskSkip 索引契约不变', () => {
  const taskRunIndexes = TaskRun.schema.indexes().map(([fields]) => fields);
  const uniqueIndex = TaskRun.schema.indexes().find(([fields]) => fields.taskName === 1 && fields.runKey === 1);
  assert.ok(taskRunIndexes.some((fields) => fields.taskName === 1 && fields.runKey === 1));
  assert.equal(uniqueIndex[1].unique, true);
  assert.equal(TaskRun.schema.path('status').enumValues.includes('SKIPPED'), false);
  const skipIndexes = TaskSkip.schema.indexes().map(([fields]) => fields);
  assert.ok(skipIndexes.some((fields) => fields.taskName === 1 && fields.skippedAt === -1));
});

test('AC2 normalizeCounts 只保留 4 个计数 + 显式 result，顶层裸字段不进入归一化结果', () => {
  const normalized = normalizeCounts({
    totalCount: 1, successCount: 1, failureCount: 0, failures: [],
    ok: 1, gap: 2, result: { kept: true }
  });
  assert.deepEqual(Object.keys(normalized).sort(), ['failureCount', 'failures', 'result', 'successCount', 'totalCount']);
  assert.equal(normalized.ok, undefined);
  assert.equal(normalized.gap, undefined);
});
