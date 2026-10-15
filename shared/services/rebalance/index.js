// server/services/rebalance/index.js

/**
 * RebalanceEngine 子模块入口
 *
 * 本文件将各个子服务聚合导出，作为 RebalanceEngine 在应用中的统一访问接口。
 *
 * 各子模块来源：
 *   - thresholdChecker       阈值检测逻辑
 *   - suggestionGenerator    生成买卖建议
 *   - costEstimator          估算交易成本与税费
 *   - recorder               RebalanceRecord 操作与回溯
 *
 * 说明：原本的 scheduleManager（node-cron 注册/注销）已随 TASK-005（统一调度器）
 * 迁出本包——调度触发权由 cron-worker 的 src/schedulers/rebalanceScheduler.js 独占，
 * 本包只提供业务引擎，不注册任何定时任务。
 */

const thresholdChecker    = require('./thresholdChecker');
const suggestionGenerator = require('./suggestionGenerator');
const costEstimator       = require('./costEstimator');
const recorder            = require('./recorder');

module.exports = {
  thresholdChecker,
  suggestionGenerator,
  costEstimator,
  recorder
};
