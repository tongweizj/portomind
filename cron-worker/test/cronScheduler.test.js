"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const { createCronScheduler } = require('../src/schedulers/cronScheduler');

test('createCronScheduler：缺参抛 TypeError', () => {
  assert.throws(() => createCronScheduler({}), /requires \{ envKey, defaultCron, taskName, run \}/);
  assert.throws(
    () => createCronScheduler({ envKey: 'A', defaultCron: '* * * * *', taskName: 'a' }),
    /requires \{ envKey, defaultCron, taskName, run \}/
  );
});

test('createCronScheduler：非法 cron 抛错', () => {
  const start = createCronScheduler({
    envKey: 'X_CRON',
    defaultCron: '0 0 * * *',
    taskName: 'x',
    run: async () => {}
  });
  assert.throws(() => start({ cronExpression: 'nope' }), /Invalid X_CRON/);
});

test('createCronScheduler：返回可停止的 job，且支持 run 覆盖', () => {
  const start = createCronScheduler({
    envKey: 'X_CRON',
    defaultCron: '0 0 1 1 *',
    taskName: 'x',
    run: async () => { throw new Error('should not be called'); }
  });
  const job = start({
    cronExpression: '0 0 1 1 *',
    run: async () => 'ok'
  });
  assert.ok(job && typeof job.stop === 'function');
  job.stop();
});

test('createCronScheduler：默认 cron 与 timezone 解析', () => {
  const start = createCronScheduler({
    envKey: 'X_CRON',
    defaultCron: '0 0 1 1 *',
    taskName: 'x',
    run: async () => {}
  });
  // 不传 cronExpression 时回退到 env 或 defaultCron；不抛错即视为通过
  const job = start({ timezone: 'America/Toronto' });
  job.stop();
});
