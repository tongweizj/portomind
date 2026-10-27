// shared/constants/cronStatus.constants.js
//
// TASK-054（FS C-02）`GET /api/cron/status` 的配置常量。
// 归属约定（ExecPlan D-4）：僵尸阈值常量由「先落地者」建立，TASK-057 若先落地则复用本文件、
// 只补缺失项，不得新建第二份。实施前先 grep：STALE_FACTOR / STALE_THRESHOLD / cronStatus。

// 5 个落库任务名（顺序即对外 tasks[] 顺序；与 §4.3 冻结表一致）
const CRON_TASK_NAMES = Object.freeze([
  'daily-price-sync',
  'price-integrity-check',
  'alert-evaluate',
  'fx-rate-sync',
  'rebalance-check'
]);

// 逐任务周期（小时）。当前 5 个 cron 全为「每天一次」，故全 24；
// 结构上支持逐任务不同值，避免将来改周期时改逻辑。
const TASK_PERIOD_HOURS = Object.freeze({
  'daily-price-sync': 24,
  'price-integrity-check': 24,
  'alert-evaluate': 24,
  'fx-rate-sync': 24,
  'rebalance-check': 24
});

// AC7：「2 × 周期」视为僵尸 RUNNING（当前 5 个任务均为 24h → 48h）
const STALE_FACTOR = 2;

// 目标日回退上限：CN 春节/国庆长假 ≤ 9 天，留余量防死循环
const PRICE_TARGET_MAX_LOOKBACK_DAYS = 15;

// 价格同步的每日同步时点（与 PRICE_SYNC_CRON 默认 '0 3 * * *' 对齐）。
// ⚠️ 运维若修改 PRICE_SYNC_CRON，必须同步修改这两个常量（ExecPlan §4.6 / SERVER.md）。
const PRICE_SYNC_DUE_HOUR = 3;
const PRICE_SYNC_DUE_MINUTE = 0;

// 再平衡：父任务（TASK-057 才会产生）与逐组合子任务前缀
const REBALANCE_PARENT_TASK = 'rebalance-check';
const REBALANCE_CHILD_PREFIX = 'rebalance-suggestions:';

// 某任务的僵尸阈值（小时），阈值不写进 controller（AC7 原文）
function staleThresholdHours(taskName) {
  const period = TASK_PERIOD_HOURS[taskName] ?? 24;
  return period * STALE_FACTOR;
}

module.exports = {
  CRON_TASK_NAMES,
  TASK_PERIOD_HOURS,
  STALE_FACTOR,
  PRICE_TARGET_MAX_LOOKBACK_DAYS,
  PRICE_SYNC_DUE_HOUR,
  PRICE_SYNC_DUE_MINUTE,
  REBALANCE_PARENT_TASK,
  REBALANCE_CHILD_PREFIX,
  staleThresholdHours
};
