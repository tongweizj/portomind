#!/usr/bin/env node
// server/scripts/verify-taskrun-lock.cjs
//
// TASK-070：在**隔离临时库**验证 TaskRun lockKey 部分唯一索引、旧数据兼容与
// 过期锁回收。绝不连接 server/.env 指向的业务库本身。
//
// 运行：node server/scripts/verify-taskrun-lock.cjs

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
mongoose.set('strictQuery', true);

const TaskRun = require('@portomind/shared/models/taskRun');
const TaskSkip = require('@portomind/shared/models/taskSkip');
const { startTrackedTask } = require('@portomind/shared/services/taskRunner');

const TEMP_DB = 'portomind_taskrun_lock_verify';
const SOURCE_DB = 'portomind_dev';
const LOCK_KEY = 'ops:verify-lock';
const STALE_MS = 30 * 60 * 1000;

function tempUriFrom(uri) {
  const parsed = new URL(uri);
  const source = parsed.pathname.replace(/^\//, '');
  if (source !== SOURCE_DB) {
    throw new Error(`拒绝执行：源库必须是 ${SOURCE_DB}，实际为 "${source || '(empty)'}"`);
  }
  parsed.pathname = `/${TEMP_DB}`;
  return parsed.toString();
}

async function assertIndexes() {
  const indexes = await TaskRun.collection.indexes();
  const lockIndex = indexes.find((index) => index.name === 'taskrun_active_lock_unique');
  if (!lockIndex) throw new Error('缺少 taskrun_active_lock_unique 索引');
  if (lockIndex.unique !== true) throw new Error('lock 索引非 unique');
  if (!lockIndex.partialFilterExpression) throw new Error('lock 索引缺少 partialFilterExpression');
  return lockIndex;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  const tempUri = tempUriFrom(process.env.MONGO_URI);

  await mongoose.connect(tempUri);
  const dbName = mongoose.connection.db.databaseName;
  if (dbName !== TEMP_DB) throw new Error(`连接库名不是临时库：${dbName}`);

  try {
    await mongoose.connection.dropDatabase();
    const serverInfo = await mongoose.connection.db.admin().serverInfo();
    console.log(`PASS 使用隔离临时库 ${dbName}（MongoDB ${serverInfo.version}）`);

    await TaskRun.syncIndexes();
    const index = await assertIndexes();
    console.log(`PASS 部分唯一索引已创建：${index.name}`);

    // 旧格式记录：无 lockKey / progress，必须可读。
    const legacy = await TaskRun.create({
      taskName: 'legacy-task', runKey: 'legacy-key', trigger: 'SCHEDULED',
      status: 'SUCCEEDED', startedAt: new Date('2026-01-01T00:00:00Z')
    });
    const legacyRead = await TaskRun.findById(legacy._id).lean();
    if (legacyRead.lockKey !== undefined || legacyRead.progress !== undefined) {
      throw new Error('旧记录兼容失败：不应自动生成 lockKey/progress');
    }
    console.log('PASS 旧 TaskRun（无 lockKey/progress）可读且未被改写');

    // 活跃锁必须互斥。
    const first = await TaskRun.create({
      taskName: 'lock-task', runKey: 'lock-1', trigger: 'MANUAL',
      status: 'RUNNING', startedAt: new Date(), lockKey: LOCK_KEY
    });
    let duplicateBlocked = false;
    try {
      await TaskRun.create({
        taskName: 'lock-task', runKey: 'lock-2', trigger: 'MANUAL',
        status: 'RUNNING', startedAt: new Date(), lockKey: LOCK_KEY
      });
    } catch (error) {
      duplicateBlocked = error.code === 11000;
    }
    if (!duplicateBlocked) throw new Error('相同 lockKey 的活跃任务未被唯一索引阻止');
    console.log('PASS 相同 lockKey 的 RUNNING 任务被唯一索引阻止');

    // 终态不占锁。
    await TaskRun.updateOne({ _id: first._id }, { $set: { status: 'SUCCEEDED', endedAt: new Date() } });
    const afterTerminal = await TaskRun.create({
      taskName: 'lock-task', runKey: 'lock-3', trigger: 'MANUAL',
      status: 'RUNNING', startedAt: new Date(), lockKey: LOCK_KEY
    });
    console.log('PASS 终态任务不阻止同一 lockKey 的新运行');

    // 过期活跃任务由 startTrackedTask 回收。
    const stale = await TaskRun.create({
      taskName: 'price-integrity-check', runKey: 'manual:stale', trigger: 'MANUAL',
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      lockKey: 'ops:price-integrity-check',
      progress: { completed: 1, total: 10, updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
    });
    const handle = await startTrackedTask({
      taskName: 'price-integrity-check',
      runKey: 'manual:fresh',
      trigger: 'MANUAL',
      lockKey: 'ops:price-integrity-check',
      staleAfterMs: STALE_MS,
      progressThrottleMs: 0,
      execute: async ({ reportProgress }) => {
        reportProgress(1, 1);
        return { totalCount: 1, successCount: 1, failureCount: 0, result: { ok: true } };
      }
    });
    if (!handle.ok) throw new Error(`stale 回收失败：${handle.reason}`);
    await handle.promise;
    const recovered = await TaskRun.findById(stale._id).lean();
    if (recovered.status !== 'FAILED' || !/^interrupted:/.test(recovered.runKey) || recovered.lockKey !== undefined) {
      throw new Error('stale 旧运行未被正确回收');
    }
    const fresh = await TaskRun.findById(handle.runId).lean();
    if (fresh.status !== 'SUCCEEDED' || fresh.lockKey !== undefined || fresh.progress?.completed !== 1) {
      throw new Error('新运行终态或 progress 不正确');
    }
    console.log('PASS 过期锁被回收，新任务运行成功且终态释放 lockKey');

    // 活跃未过期锁冲突。
    const active = await TaskRun.create({
      taskName: 'price-integrity-check', runKey: 'manual:active', trigger: 'MANUAL',
      status: 'RUNNING', startedAt: new Date(),
      lockKey: 'ops:price-integrity-check',
      progress: { completed: 0, total: 1, updatedAt: new Date() }
    });
    const conflict = await startTrackedTask({
      taskName: 'price-integrity-check', runKey: 'manual:conflict', trigger: 'MANUAL',
      lockKey: 'ops:price-integrity-check', staleAfterMs: STALE_MS,
      execute: async () => { throw new Error('冲突时不得执行'); }
    });
    if (conflict.ok || conflict.reason !== 'ALREADY_RUNNING' || conflict.activeRun.runId !== String(active._id)) {
      throw new Error('活跃锁冲突未返回 ALREADY_RUNNING/activeRun');
    }
    const skip = await TaskSkip.findOne({ taskName: 'price-integrity-check', reason: 'ALREADY_RUNNING' }).lean();
    if (!skip) throw new Error('冲突未写 TaskSkip');
    console.log('PASS 活跃冲突返回 409 所需信息并写 TaskSkip');

    // 新索引已存在后再次读取旧记录。
    if (!(await TaskRun.exists({ _id: legacy._id }))) throw new Error('旧记录在索引创建后丢失');
    console.log('PASS 索引创建后历史 TaskRun 仍存在');

    console.log('\n===== TASK-070 TaskRun lock 隔离验证：全部 PASS =====');
  } finally {
    const currentDb = mongoose.connection.db && mongoose.connection.db.databaseName;
    if (currentDb === TEMP_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`CLEAN 已删除临时库 ${TEMP_DB}`);
    }
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error('FAIL', error && error.message ? error.message : error);
  process.exitCode = 1;
  try { await mongoose.disconnect(); } catch (_) { /* noop */ }
});
