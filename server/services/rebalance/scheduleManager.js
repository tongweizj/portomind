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
const AlertCenterService  = require('../alertCenter.service');
const { taskLogger }      = require('../../config/logger');
const { runTrackedTask }  = require('../taskRunner');

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
  const settings  = portfolio.rebalanceSettings || {};
  const schedule  = settings.rebalanceSchedule || 'daily';
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
      const periodKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
      await runTrackedTask({
        taskName: `rebalance-suggestions:${pid}`,
        runKey: `${schedule}:${periodKey}`,
        trigger: 'SCHEDULED',
        execute: async () => {
          const { needsRebalance } = await ThresholdChecker.checkThresholds(pid);
          if (!needsRebalance) return { totalCount: 1, successCount: 1, failureCount: 0 };

          const result = await SuggestionGenerator.getSuggestions(pid, {
            feeModel: settings.feeModel || {},
            cashBudget: 0,
            mode: 'AUTO'
          });
          await AlertCenterService.notify({
            portfolioId: pid,
            record: { _id: result.recordId, timestamp: new Date() },
            suggestions: result.suggestions
          });
          return { totalCount: 1, successCount: 1, failureCount: 0 };
        }
      });
    } catch (err) {
      taskLogger.error('REBALANCE_SCHEDULER_FAILED', { portfolioId: pid, message: err.message });
    }
  }, {
    scheduled: true,    // 脚本启动后立即生效
    timezone: process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto'
  });

  taskMap.set(pid, job);
}

/**
 * 初始化：为所有组合按当前数据库配置注册任务
 */
async function initSchedules() {
  const portfolios = await Portfolio.find().lean();
  for (const p of portfolios) {
    try {
      await scheduleJobForPortfolio(p);
    } catch (error) {
      taskLogger.error('REBALANCE_SCHEDULE_REGISTRATION_FAILED', {
        portfolioId: p._id?.toString(),
        message: error.message
      });
    }
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

function cancelAllSchedules() {
  for (const job of taskMap.values()) job.stop();
  taskMap.clear();
}

module.exports = {
  scheduleJobForPortfolio,
  cancelSchedule,
  initSchedules,
  cancelAllSchedules
};
