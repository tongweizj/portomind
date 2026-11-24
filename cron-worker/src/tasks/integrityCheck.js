#!/usr/bin/env node
// cron-worker/src/tasks/integrityCheck.js
//
// TASK-070：价格完整性检查的 cron-worker 薄壳。
// 调度/CLI 负责加载本进程 .env、建立 Mongo 连接与解析参数；
// 业务计算与 TaskRun 包装在 @portomind/shared/tasks/priceIntegrityCheck.js。
// taskName / runKey 契约保持不变。

require('../config/env');

const dayjs = require('dayjs');
const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const minimist = require('minimist');

const { taskLogger } = require('@portomind/shared/config/logger');
const { dateBounds } = require('@portomind/shared/utils/marketTime');
const { priceIntegrityCheck } = require('@portomind/shared/tasks/priceIntegrityCheck');
const historySync = require('./historySync.cjs');

async function repairAsset(symbol, ranges, repairFn = historySync) {
  const failures = [];
  for (const range of ranges) {
    try {
      await repairFn(dayjs.utc(range.from).toDate(), dayjs.utc(range.to).toDate(), { symbols: [symbol] });
    } catch (error) {
      failures.push({
        from: range.from,
        to: range.to,
        category: error.category || 'INTERNAL',
        message: error.message
      });
    }
  }
  return failures;
}

function resolveRepair(options = {}) {
  if (options.dryRun) return false;
  if (options.repair !== undefined) return Boolean(options.repair);
  return process.env.INTEGRITY_AUTO_REPAIR !== 'false';
}

/** cron-worker / CLI 入口：同步等待 tracked task 结束。 */
function integrityCheck(options = {}) {
  return priceIntegrityCheck({
    ...options,
    trigger: options.trigger || 'SCHEDULED',
    repair: resolveRepair(options),
    repairAsset
  });
}

async function runFromCommandLine() {
  const argv = minimist(process.argv.slice(2), { string: ['from', 'to', 'symbols'] });
  const symbols = argv.symbols
    ? String(argv.symbols).split(',').map((value) => value.trim()).filter(Boolean)
    : [];
  const from = argv.from || null;
  const to = argv.to || null;
  const dryRun = Boolean(argv['dry-run']);
  const repair = resolveRepair({ dryRun, repair: argv.repair });

  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  if (from) dateBounds(from);
  if (to) dateBounds(to);

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const summary = await integrityCheck({ trigger: 'MANUAL', symbols, from, to, repair, dryRun });
    if (summary.status === 'PARTIAL' || summary.status === 'FAILED') process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runFromCommandLine().catch((error) => {
    taskLogger.error('INTEGRITY_CHECK_COMMAND_FAILED', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  });
}

module.exports = integrityCheck;
