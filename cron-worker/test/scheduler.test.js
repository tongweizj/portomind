// cron-worker/test/scheduler.test.js
//
// cron-worker 单进程注册全部 5 类定时任务，共 6 个 cron。
// 原先 server 侧的「价格 cron 默认表达式 + 统一时区」断言由本文件接手。

"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const cron = require('node-cron');

const { startSchedulers } = require('../src/tasks/scheduler');
const {
  DEFAULT_PRICE_SYNC_CRON, DEFAULT_PRICE_SYNC_CN_CRON, startPriceScheduler, startCnPriceScheduler
} = require('../src/schedulers/priceScheduler');
const { DEFAULT_HEALTH_CHECK_CRON } = require('../src/schedulers/healthScheduler');
const { DEFAULT_ALERT_EVAL_CRON } = require('../src/schedulers/alertScheduler');
const { DEFAULT_FX_SYNC_CRON } = require('../src/schedulers/fxScheduler');
const { DEFAULT_REBALANCE_CHECK_CRON } = require('../src/schedulers/rebalanceScheduler');

test('单一调度器：5 类定时任务的默认 cron 表达式固定', () => {
  assert.equal(DEFAULT_PRICE_SYNC_CRON, '0 3 * * *');       // 价格同步
  assert.equal(DEFAULT_PRICE_SYNC_CN_CRON, '0 12 * * *');   // CN 价格同步
  assert.equal(DEFAULT_HEALTH_CHECK_CRON, '30 3 * * *');    // 完整性检查（价格之后半小时）
  assert.equal(DEFAULT_ALERT_EVAL_CRON, '0 4 * * *');       // 提醒评估
  assert.equal(DEFAULT_FX_SYNC_CRON, '30 9 * * *');         // 汇率同步（央行中间价公布后）
  assert.equal(DEFAULT_REBALANCE_CHECK_CRON, '0 0 * * *');  // 再平衡分发
});

test('startSchedulers：一次注册全部 6 个 cron，且使用统一时区', async (t) => {
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
    assert.equal(created.length, 6);
    assert.equal(scheduler.jobs.length, 6);
    assert.deepEqual(
      created.map(item => item.expression).sort(),
      ['0 0 * * *', '0 3 * * *', '0 12 * * *', '0 4 * * *', '30 3 * * *', '30 9 * * *'].sort()
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

test('价格 cron 使用分组配置与回调，并兼容旧 US/CA 配置', async (t) => {
  const jobs = [];
  const calls = [];
  t.mock.method(cron, 'schedule', (expression, callback) => {
    jobs.push({ expression, callback });
    return { stop() {} };
  });
  const modulePath = require.resolve('@portomind/shared/tasks/dailySync');
  const original = require(modulePath);
  const keys = ['PRICE_SYNC_CRON', 'PRICE_SYNC_CN_CRON', 'PRICE_SYNC_US_CA_CRON'];
  const previous = keys.map(key => process.env[key]);
  t.after(() => {
    require.cache[modulePath].exports = original;
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  });
  require.cache[modulePath].exports = async options => calls.push(options);
  process.env.PRICE_SYNC_CRON = '15 3 * * *';
  delete process.env.PRICE_SYNC_US_CA_CRON;
  startPriceScheduler();
  process.env.PRICE_SYNC_US_CA_CRON = '20 3 * * *';
  process.env.PRICE_SYNC_CN_CRON = '10 12 * * *';
  startPriceScheduler();
  startCnPriceScheduler();
  assert.deepEqual(jobs.map(job => job.expression), ['15 3 * * *', '20 3 * * *', '10 12 * * *']);
  await jobs[1].callback();
  await jobs[2].callback();
  assert.deepEqual(calls, [
    { trigger: 'SCHEDULED', marketGroup: 'US_CA' }, { trigger: 'SCHEDULED', marketGroup: 'CN' }
  ]);
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

test('startSchedulers：CN 配置无效时停止已注册的 US/CA cron', async (t) => {
  let stopped = 0;
  const schedule = t.mock.method(cron, 'schedule', () => ({ stop() { stopped += 1; } }));
  const previous = process.env.PRICE_SYNC_CN_CRON;
  process.env.PRICE_SYNC_CN_CRON = 'invalid';
  try {
    await assert.rejects(startSchedulers(), /Invalid PRICE_SYNC_CN_CRON/);
    assert.equal(schedule.mock.callCount(), 1);
    assert.equal(stopped, 1);
  } finally {
    if (previous === undefined) delete process.env.PRICE_SYNC_CN_CRON;
    else process.env.PRICE_SYNC_CN_CRON = previous;
  }
});
