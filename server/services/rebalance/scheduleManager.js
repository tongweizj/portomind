// server/services/rebalance/scheduleManager.js

/**
 * Rebalance 调度管理器
 * - 使用 node-cron 定时触发 autoRebalance 任务
 * - 支持动态注册（scheduleJobForPortfolio）与注销（cancelSchedule）
 */

const cron                = require('node-cron');
const Portfolio           = require('../../models/portfolio');
const ThresholdChecker    = require('./thresholdChecker');
const SuggestionGenerator = require('./suggestionGenerator');
const CostEstimator       = require('./costEstimator');
const Recorder            = require('./recorder');
const AlertCenterService  = require('../alertCenterService');

// 保存每个 portfolio 对应的 cron 任务实例
const taskMap = new Map();

// cron 表达式映射（可根据需要调整执行时间）
const cronExpressions = {
  daily:   '0 0 * * *',   // 每天 00:00
  weekly:  '0 0 * * 1',   // 每周一 00:00
  monthly: '0 0 1 * *'    // 每月 1 号 00:00
};

/**
 * 为单个组合注册自动再平衡任务
 * @param {Object} portfolio - Mongoose 文档，包含 _id 与 rebalanceSettings.rebalanceSchedule
 */
async function scheduleJobForPortfolio(portfolio) {
  const pid       = portfolio._id.toString();
  const schedule  = portfolio.rebalanceSettings.rebalanceSchedule;
  const expr      = cronExpressions[schedule];

  if (!expr) {
    throw new Error(`Unknown schedule "${schedule}" for portfolio ${pid}`);
  }

  // 如果已注册，先停止老任务
  if (taskMap.has(pid)) {
    taskMap.get(pid).stop();
  }

  // 定义并启动新任务
  const job = cron.schedule(expr, async () => {
    try {
      // 1. 阈值检测
      const { needsRebalance, triggeredThresholds } =
        await ThresholdChecker.checkThresholds(pid);
      if (!needsRebalance) return;

      // 2. 读取最新持仓，并生成建议
      const positions   = await require('../portfolio/positionTracker').aggregate(pid);
      let suggestions   = await SuggestionGenerator.generateSuggestions(
        pid, positions, triggeredThresholds
      );

      // 3. 预估成本（来自组合的费率模型或全局配置）
      const feeModel    = portfolio.rebalanceSettings.feeModel || {};
      suggestions       = CostEstimator.estimateCost(suggestions, feeModel);

      // 4. 记录并通知
      const record      = await Recorder.createRecord(pid, 'AUTO', suggestions);
      await Recorder.updateStatus(record._id, 'PENDING');
      AlertCenterService.notify(pid, record);

    } catch (err) {
      // 任务内部异常，打印日志但不影响下次调度
      console.error(`[autoRebalance:${pid}] error:`, err);
    }
  }, {
    scheduled: true,    // 脚本启动后立即生效
    timezone:  'America/Toronto'
  });

  taskMap.set(pid, job);
}

/**
 * 初始化：为所有组合按当前数据库配置注册任务
 */
async function initSchedules() {
  const portfolios = await Portfolio.find().lean();
  for (const p of portfolios) {
    await scheduleJobForPortfolio(p);
  }
}

/**
 * 注销某个组合的调度任务
 * @param {String} portfolioId
 */
function cancelSchedule(portfolioId) {
  const job = taskMap.get(portfolioId);
  if (job) {
    job.stop();
    taskMap.delete(portfolioId);
  }
}

module.exports = {
  scheduleJobForPortfolio,
  cancelSchedule,
  initSchedules
};
