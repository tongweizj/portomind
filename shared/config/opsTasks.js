// shared/config/opsTasks.js
//
// TASK-070：运维中心手动任务的可调运维参数与稳定锁键。
// 所有阈值集中在此，不散落在 server/cron-worker 任务代码中。
// 环境变量只影响运行参数，不改变 taskName/runKey 契约。

const MINUTE_MS = 60 * 1000;

function envMs(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const PROGRESS_THROTTLE_MS = envMs('OPS_PROGRESS_THROTTLE_MS', 1000);
const HISTORY_MIN_MARKET_DAYS = 3;
const DEFAULT_STALE_MS = 30 * MINUTE_MS;

const OPS_TASK_CONFIG = Object.freeze({
  priceIntegrity: Object.freeze({
    taskName: 'price-integrity-check',
    lockKey: 'ops:price-integrity-check',
    staleAfterMs: envMs('OPS_INTEGRITY_STALE_MS', DEFAULT_STALE_MS)
  }),
  priceSync: Object.freeze({
    taskName: 'daily-price-sync',
    lockKey: 'ops:daily-price-sync',
    staleAfterMs: envMs('OPS_PRICE_SYNC_STALE_MS', 60 * MINUTE_MS)
  }),
  assetBackfill: Object.freeze({
    taskName: 'asset-history-backfill',
    lockKeyPrefix: 'ops:asset-backfill:',
    staleAfterMs: envMs('OPS_BACKFILL_STALE_MS', DEFAULT_STALE_MS)
  }),
  assetBackfillBatch: Object.freeze({
    taskName: 'asset-history-backfill-batch',
    lockKey: 'ops:asset-backfill-batch',
    staleAfterMs: envMs('OPS_BATCH_BACKFILL_STALE_MS', 60 * MINUTE_MS)
  })
});

function staleAfterMsFor(taskName) {
  const match = Object.values(OPS_TASK_CONFIG).find((config) => config.taskName === taskName);
  return match ? match.staleAfterMs : DEFAULT_STALE_MS;
}

module.exports = {
  PROGRESS_THROTTLE_MS,
  HISTORY_MIN_MARKET_DAYS,
  DEFAULT_STALE_MS,
  OPS_TASK_CONFIG,
  staleAfterMsFor
};
