#!/usr/bin/env node
// cron-worker/src/tasks/historySync.cjs
// 历史 K 线回补 CLI 薄壳：--from 必填、--to 可选（默认今天）；--symbols 指定逗号分隔列表。
// 业务实现在 @portomind/shared/tasks/historySync；本文件只负责 .env、连接、参数与退出码。

require('../config/env');

const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const minimist = require('minimist');
const dayjs = require('dayjs');
const { taskLogger } = require('@portomind/shared/config/logger');
const historySync = require('@portomind/shared/tasks/historySync');

if (require.main === module) {
  // string: 显式声明，避免 minimist 把 000191 之类数字符号强转为 191。
  const argv = minimist(process.argv.slice(2), { string: ['from', 'to', 'symbols'] });
  const from = argv.from ? dayjs(argv.from, 'YYYY-MM-DD') : null;
  const to = argv.to ? dayjs(argv.to, 'YYYY-MM-DD') : dayjs();
  const symbols = argv.symbols
    ? String(argv.symbols).split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const parsedConcurrency = Number(argv.concurrency);
  const concurrency = Number.isInteger(parsedConcurrency) && parsedConcurrency > 0
    ? parsedConcurrency
    : historySync.DEFAULT_CONCURRENCY;

  if (!from || !from.isValid()) {
    console.error('Error: 参数 --from 必须为 YYYY-MM-DD 格式');
    process.exit(1);
  }
  if (!to.isValid()) {
    console.error('Error: 参数 --to 必须为 YYYY-MM-DD 格式');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Error: 未配置 MONGO_URI 环境变量');
    process.exit(1);
  }

  mongoose.connect(mongoUri)
    .then(() => {
      taskLogger.info('MongoDB connected');
      return historySync(from.toDate(), to.toDate(), { symbols, concurrency });
    })
    .then(results => {
      const failureCount = results.filter(result => result.error).length;
      const successCount = results.length - failureCount;
      taskLogger.info(`historySync completed: ${successCount} succeeded, ${failureCount} failed`);
      if (failureCount > 0) process.exitCode = 1;
    })
    .then(() => mongoose.disconnect())
    .then(() => process.exit(process.exitCode || 0))
    .catch(err => {
      taskLogger.error(`historySync uncaught error: ${err.message}`, { stack: err.stack });
      mongoose.disconnect().finally(() => process.exit(1));
    });
}

module.exports = historySync;
module.exports.resolveItems = historySync.resolveItems;
