#!/usr/bin/env node
// cron-worker/src/tasks/historySync.cjs
// 历史 K 线回补：--from 必填、--to 可选（默认今天）；--symbols 指定逗号分隔列表，
// 留空则同步全部激活资产（传入资产对象以启用 market 路由）。
// 用 p-limit 限制并发抓取（默认 3），避免触发上游限流；单符号失败不中断其余。

require('../config/env');

const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const minimist = require('minimist');
const dayjs = require('dayjs');
const pLimit = require('p-limit').default || require('p-limit');
const { taskLogger } = require('../config/logger');
const { getActiveAssets } = require('../services/asset.service');
const { fetchHistory } = require('../services/priceFetch.service');
const { saveHistory } = require('../services/priceStorage.service');

const DEFAULT_CONCURRENCY = 3;

async function historySync(from, to, options = {}) {
  const loadAssets = options.getActiveAssets || getActiveAssets;
  const loadHistory = options.fetchHistory || fetchHistory;
  const persistHistory = options.saveHistory || saveHistory;
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const limit = pLimit(concurrency);

  const items = options.symbols && options.symbols.length
    ? options.symbols.map(symbol => String(symbol).trim().toUpperCase())
    : (await loadAssets()).map(asset => ({ symbol: asset.symbol, market: asset.market }));

  if (items.length === 0) {
    taskLogger.warn('HISTORY_SYNC_EMPTY', { reason: 'no symbols and no active assets' });
    return [];
  }

  const symbolOf = item => (typeof item === 'string' ? item : item.symbol);
  taskLogger.info('HISTORY_SYNC_START', {
    count: items.length,
    concurrency,
    from: from.toISOString(),
    to: to.toISOString()
  });

  const results = await Promise.all(items.map(item =>
    limit(async () => {
      const symbol = symbolOf(item);
      try {
        const records = await loadHistory(item, from, to);
        await persistHistory(records);
        taskLogger.info('HISTORY_SYNC_ASSET_SUCCEEDED', { symbol, count: records.length });
        return { symbol, count: records.length };
      } catch (error) {
        const failure = {
          category: error.category || 'INTERNAL',
          provider: error.provider,
          retryable: Boolean(error.retryable),
          message: error.message
        };
        taskLogger.error('HISTORY_SYNC_ASSET_FAILED', { symbol, ...failure });
        return { symbol, error: failure };
      }
    })
  ));

  const failureCount = results.filter(result => result.error).length;
  taskLogger.info('HISTORY_SYNC_END', { total: results.length, failureCount });
  return results;
}

if (require.main === module) {
  const argv = minimist(process.argv.slice(2));
  const from = argv.from ? dayjs(argv.from, 'YYYY-MM-DD') : null;
  const to = argv.to ? dayjs(argv.to, 'YYYY-MM-DD') : dayjs();
  const symbols = argv.symbols
    ? String(argv.symbols).split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const parsedConcurrency = Number(argv.concurrency);
  const concurrency = Number.isInteger(parsedConcurrency) && parsedConcurrency > 0
    ? parsedConcurrency
    : DEFAULT_CONCURRENCY;

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
