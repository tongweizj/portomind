// server/services/rebalance/index.js

/**
 * RebalanceEngine 子模块入口
 *
 * 本文件将各个子服务聚合导出，作为 RebalanceEngine 在应用中的统一访问接口。
 *
 * 各子模块来源：
 *   - thresholdChecker       从 thresholdChecker.js 中拆分而来（阈值检测逻辑）
 *   - suggestionGenerator    从 suggestionGenerator.js 中拆分而来（生成买卖建议）
 *   - costEstimator          从 costEstimator.js 中拆分而来（估算交易成本与税费）
 *   - recorder               从 recorder.js 中拆分而来（RebalanceRecord 操作与回溯）
 *   - scheduleManager        新增 scheduleManager.js（封装 node-cron 调度注册/注销）
 */

const thresholdChecker    = require('./thresholdChecker');
const suggestionGenerator = require('./suggestionGenerator');
const costEstimator       = require('./costEstimator');
const recorder            = require('./recorder');
const scheduleManager     = require('./scheduleManager');

module.exports = {
  thresholdChecker,
  suggestionGenerator,
  costEstimator,
  recorder,
  scheduleManager
};
