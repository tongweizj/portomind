// cron-worker/test/scheduler.test.js
//
// TASK-005（统一调度器）验收：cron-worker 单进程注册**全部 5 类**定时任务。
// 原先 server 侧的「价格 cron 默认表达式 + 统一时区」断言由本文件接手。

"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const cron = require('node-cron');

const { startSchedulers } = require('../src/tasks/scheduler');
const { DEFAULT_PRICE_SYNC_CRON } = require('../src/schedulers/priceScheduler');
const { DEFAULT_HEALTH_CHECK_CRON } = require('../src/schedulers/healthScheduler');
const { DEFAULT_ALERT_EVAL_CRON } = require('../src/schedulers/alertScheduler');
const { DEFAULT_FX_SYNC_CRON } = require('../src/schedulers/fxScheduler');
const { DEFAULT_REBALANCE_CHECK_CRON } = require('../src/schedulers/rebalanceScheduler');

test('单一调度器：5 类定时任务的默认 cron 表达式固定', () => {
  assert.equal(DEFAULT_PRICE_SYNC_CRON, '0 3 * * *');       // 价格同步
  assert.equal(DEFAULT_HEALTH_CHECK_CRON, '30 3 * * *');    // 完整性检查（价格之后半小时）
  assert.equal(DEFAULT_ALERT_EVAL_CRON, '0 4 * * *');       // 提醒评估
  assert.equal(DEFAULT_FX_SYNC_CRON, '30 9 * * *');         // 汇率同步（央行中间价公布后）
  assert.equal(DEFAULT_REBALANCE_CHECK_CRON, '0 0 * * *');  // 再平衡分发
});

test('startSchedulers：一次注册全部 5 个调度器，且使用统一时区', async (t) => {
  const created = [];
  t.mock.method(cron, 'schedule', (expression, callback, options) => {
    created.push({ expression, options });
    return { stop() {} };
  });
  const previousTz = process.env.SCHEDULER_TIMEZONE;
  process.env.SCHEDULER_TIMEZONE = 'America/Toronto';

  try {
    const scheduler = await startSchedulers();

    assert.equal(scheduler.enabled, true);
    assert.equal(created.length, 5);
    assert.equal(scheduler.jobs.length, 5);
    assert.deepEqual(
      created.map(item => item.expression).sort(),
      ['0 0 * * *', '0 3 * * *', '0 4 * * *', '30 3 * * *', '30 9 * * *'].sort()
    );
    for (const item of created) {
      assert.equal(item.options.timezone, 'America/Toronto');
    }
    scheduler.stop();
  } finally {
    if (previousTz === undefined) delete process.env.SCHEDULER_TIMEZONE;
    else process.env.SCHEDULER_TIMEZONE = previousTz;
  }
});

test('startSchedulers：SCHEDULER_ENABLED=false 时不注册任何调度器', async (t) => {
  let called = 0;
  t.mock.method(cron, 'schedule', () => { called += 1; return { stop() {} }; });
  process.env.SCHEDULER_ENABLED = 'false';

  try {
    const scheduler = await startSchedulers();
    assert.equal(scheduler.enabled, false);
    assert.equal(called, 0);
    assert.deepEqual(scheduler.jobs, []);
  } finally {
    delete process.env.SCHEDULER_ENABLED;
  }
});
