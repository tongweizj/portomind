"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const { DEFAULT_HEALTH_CHECK_CRON, startHealthScheduler } = require('../src/schedulers/healthScheduler');

test('healthScheduler：默认 cron 晚于价格同步', () => {
  assert.equal(DEFAULT_HEALTH_CHECK_CRON, '30 3 * * *');
});

test('healthScheduler：非法 cron 抛错', () => {
  assert.throws(() => startHealthScheduler({ cronExpression: 'not-a-cron' }), /Invalid HEALTH_CHECK_CRON/);
});

test('healthScheduler：合法配置返回可停止的 job', () => {
  const job = startHealthScheduler({
    cronExpression: '0 0 1 1 *', // 每年 1 月 1 日，避免测试期触发
    run: async () => ({})
  });
  assert.ok(job && typeof job.stop === 'function');
  job.stop();
});
