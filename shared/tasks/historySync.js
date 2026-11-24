// shared/tasks/historySync.js
//
// TASK-072：历史 K 线补采的业务实现；不加载 .env、不建立连接。
// cron-worker 的 CLI 与 server 的单资产补采共用这一份实现。
// from/to 为 Date；symbols 留空表示全部 active 资产。
// 用 p-limit 限制并发抓取（默认 3），单符号失败不中断其余。

const pLimit = require('p-limit').default || require('p-limit');
const { taskLogger } = require('../config/logger');
const { getActiveAssets, getAssetsBySymbols } = require('../services/asset.service');
const { fetchHistory } = require('../services/priceFetch.service');
const { saveHistory } = require('../services/priceStorage.service');
const { normalizeSymbol } = require('../utils/symbol');

const DEFAULT_CONCURRENCY = 3;

// 符号列表解析：优先用 DB 资产对象（启用 market 路由，如 CN-FUND → 天天基金），
// DB 中不存在的符号退化为原始 symbol 字符串（按 Symbol 特征推断路由）。
async function resolveItems({ symbols, loadAssets, loadBySymbols }) {
  if (symbols && symbols.length) {
    const rawSymbols = symbols.map(normalizeSymbol);
    const assets = await loadBySymbols(rawSymbols);
    const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));
    return rawSymbols.map(symbol => bySymbol.get(symbol) || symbol);
  }
  return (await loadAssets()).map(asset => ({ symbol: asset.symbol, market: asset.market }));
}

async function historySync(from, to, options = {}) {
  const loadAssets = options.getActiveAssets || getActiveAssets;
  const loadHistory = options.fetchHistory || fetchHistory;
  const persistHistory = options.saveHistory || saveHistory;
  const loadBySymbols = options.getAssetsBySymbols || getAssetsBySymbols;
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const limit = pLimit(concurrency);

  const items = await resolveItems({ symbols: options.symbols, loadAssets, loadBySymbols });

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

module.exports = historySync;
module.exports.historySync = historySync;
module.exports.resolveItems = resolveItems;
module.exports.DEFAULT_CONCURRENCY = DEFAULT_CONCURRENCY;
