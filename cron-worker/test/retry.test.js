"use strict";
const { test } = require('node:test');
const assert = require('node:assert');
const { fetchWithRetry } = require('../src/utils/retry');

test('成功时不重试', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => { calls += 1; return 'ok'; });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('非 retryable 错误立即抛出', async () => {
  let calls = 0;
  await assert.rejects(
    fetchWithRetry(async () => {
      calls += 1;
      const error = new Error('not retryable');
      error.retryable = false;
      throw error;
    }),
    /not retryable/
  );
  assert.equal(calls, 1);
});

test('retryable 错误重试后成功', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error('transient');
      error.retryable = true;
      throw error;
    }
    return 'recovered';
  }, { baseDelayMs: 5, maxDelayMs: 20 });
  assert.equal(result, 'recovered');
  assert.equal(calls, 3);
});

test('重试次数耗尽后抛出最后一次错误', async () => {
  let calls = 0;
  const error = () => {
    const e = new Error(`fail-${calls}`);
    e.retryable = true;
    return e;
  };
  await assert.rejects(
    fetchWithRetry(async () => { calls += 1; throw error(); }, {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5
    }),
    /fail-3/
  );
  assert.equal(calls, 3); // 1 次初始 + 2 次重试
});

test('onRetry 回调收到重试信息', async () => {
  let calls = 0;
  const retries = [];
  await assert.rejects(
    fetchWithRetry(async () => {
      calls += 1;
      const error = new Error('x');
      error.retryable = true;
      throw error;
    }, {
      maxRetries: 1,
      baseDelayMs: 1,
      maxDelayMs: 5,
      onRetry: info => retries.push(info)
    })
  );
  assert.equal(retries.length, 1);
  assert.equal(retries[0].attempt, 1);
  assert.equal(retries[0].maxRetries, 1);
  assert.ok(retries[0].waitMs >= 0);
});
