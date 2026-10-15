// cron-worker/test/rebalanceScheduler.test.js
//
// TASK-005（统一调度器）：再平衡调度的触发权已由 server 的 scheduleManager 迁到
// cron-worker 的单日分发器。本文件接手原先 server/test/integration/portfolio.archived.test.js
// 中「再平衡调度（CM-20 验收）」的三条断言，并补充到期规则与逐组合故障隔离。

"use strict";
const { test } = require('node:test');
const assert = require('node:assert');

const Portfolio = require('@portomind/shared/models/portfolio');
const TaskRun = require('@portomind/shared/models/taskRun');
const ThresholdChecker = require('@portomind/shared/services/rebalance/thresholdChecker');
const {
  runRebalanceCheck,
  isScheduleDue,
  DEFAULT_REBALANCE_CHECK_CRON
} = require('../src/schedulers/rebalanceScheduler');

const PID_A = '64b00000000000000000000a'; // 未归档
const PID_B = '64b00000000000000000000b'; // 已归档

// ───────────────────────── 到期规则（等价于迁移前的 cron 表达式）─────────────────────────

test('isScheduleDue：daily 每日 / weekly 仅周一 / monthly 仅每月 1 日', () => {
  const tz = 'America/Toronto';
  const monday = new Date('2026-10-19T14:00:00Z');       // 周一（多伦多 10:00）
  const tuesday = new Date('2026-10-20T14:00:00Z');      // 周二
  const firstOfMonth = new Date('2026-10-01T14:00:00Z'); // 10/1（周四）

  assert.equal(isScheduleDue('daily', tuesday, tz), true);
  assert.equal(isScheduleDue('weekly', monday, tz), true);
  assert.equal(isScheduleDue('weekly', tuesday, tz), false);
  assert.equal(isScheduleDue('monthly', firstOfMonth, tz), true);
  assert.equal(isScheduleDue('monthly', tuesday, tz), false);
  // 未知取值保守不执行
  assert.equal(isScheduleDue('unknown', monday, tz), false);
});

test('默认 cron 为每日 00:00（与迁移前 daily 表达式一致）', () => {
  assert.equal(DEFAULT_REBALANCE_CHECK_CRON, '0 0 * * *');
});

// ───────────────────────── 分发：查询过滤 + 归档组合跳过 ─────────────────────────

test('runRebalanceCheck：查询过滤 archived != true，归档组合不触发阈值检查', async (t) => {
  const findMock = t.mock.method(Portfolio, 'find', () => ({
    lean: async () => [
      { _id: PID_A, archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } },
      // 查询层本应过滤掉；放在返回值里验证循环的运行时守卫同样会跳过归档组合
      { _id: PID_B, archived: true, rebalanceSettings: { rebalanceSchedule: 'daily' } }
    ]
  }));
  t.mock.method(TaskRun, 'create', async () => ({ _id: { toString: () => 'taskrun-fake-id' } }));
  t.mock.method(TaskRun, 'updateOne', async () => ({}));
  const checkMock = t.mock.method(ThresholdChecker, 'checkThresholds', async () => ({
    needsRebalance: false
  }));

  const summary = await runRebalanceCheck();

  assert.equal(findMock.mock.callCount(), 1);
  assert.deepEqual(findMock.mock.calls[0].arguments[0], { archived: { $ne: true } });
  assert.equal(checkMock.mock.callCount(), 1, '仅未归档组合触发阈值检查');
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.dueCount, 1);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.failureCount, 0);
});

test('runRebalanceCheck：未到期组合（weekly 非周一）不执行', async (t) => {
  t.mock.method(Portfolio, 'find', () => ({
    lean: async () => [
      { _id: PID_A, archived: false, rebalanceSettings: { rebalanceSchedule: 'weekly' } }
    ]
  }));
  const checkMock = t.mock.method(ThresholdChecker, 'checkThresholds', async () => ({
    needsRebalance: false
  }));

  // 2026-10-20 为周二（多伦多时区）
  const summary = await runRebalanceCheck({ now: new Date('2026-10-20T14:00:00Z') });

  assert.equal(checkMock.mock.callCount(), 0);
  assert.equal(summary.dueCount, 0);
  assert.equal(summary.skippedCount, 1);
});

// ───────────────────────── 逐组合故障隔离 ─────────────────────────

test('runRebalanceCheck：单个组合失败不中断其余组合', async (t) => {
  t.mock.method(Portfolio, 'find', () => ({
    lean: async () => [
      { _id: PID_A, archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } },
      { _id: '64b00000000000000000000c', archived: false, rebalanceSettings: { rebalanceSchedule: 'daily' } }
    ]
  }));
  t.mock.method(TaskRun, 'create', async () => ({ _id: { toString: () => 'taskrun-fake-id' } }));
  t.mock.method(TaskRun, 'updateOne', async () => ({}));

  let calls = 0;
  t.mock.method(ThresholdChecker, 'checkThresholds', async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('boom'), { category: 'INTERNAL' });
    return { needsRebalance: false };
  });

  const summary = await runRebalanceCheck();

  assert.equal(calls, 2, '第二个组合仍被执行');
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.failures[0].message, 'boom');
});
