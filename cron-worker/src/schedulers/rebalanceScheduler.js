// cron-worker/src/schedulers/rebalanceScheduler.js
//
// 再平衡分发器（TASK-005 重构）：
//
// 迁移前，server 侧的 services/rebalance/scheduleManager.js 会为**每个组合**按
// rebalanceSettings.rebalanceSchedule 单独注册一个 node-cron 任务，并在组合新增/改动时
// 由 API 进程动态注册或注销。
//
// 调度迁移到独立 worker 进程后，API 进程不再持有调度，也就无法把「组合改动」实时同步给
// 调度器。因此这里改为**单一日分发**：每日 00:00（REBALANCE_CHECK_CRON）读取全部未归档组合，
// 按各自的 rebalanceSchedule 判断当日是否到期（daily=每日 / weekly=周一 / monthly=每月 1 日），
// 到期者执行「阈值检查 → 生成建议 → 提醒中心 notify」。
//
// 为什么用分发器而不是继续按组合注册 cron：
//   - 组合的新建 / 设置改动 / 归档会在下一个交易日自动纳入或剔除，无需跨进程重同步；
//   - runKey 语义与迁移前完全一致（`${schedule}:${当日日期}`），taskruns 历史不断代；
//   - 组合数量增长时不会为每个组合常驻一个 cron 任务。
//
// 不变量：AUTO 再平衡**只生成建议 + 提醒，永不自动交易**（执行仍只由 MANUAL 端点触发）。

const { createCronScheduler, resolveTimezone } = require('./cronScheduler');
const { taskLogger } = require('@portomind/shared/config/logger');
const { runTrackedTask } = require('@portomind/shared/services/taskRunner');
const Portfolio = require('@portomind/shared/models/portfolio');
const ThresholdChecker = require('@portomind/shared/services/rebalance/thresholdChecker');
const SuggestionGenerator = require('@portomind/shared/services/rebalance/suggestionGenerator');
const AlertCenterService = require('@portomind/shared/services/alertCenter.service');
const { marketDate } = require('@portomind/shared/utils/marketTime');

// 默认每日 00:00（与迁移前 scheduleManager 的 cronExpressions.daily 一致）
const DEFAULT_REBALANCE_CHECK_CRON = '0 0 * * *';

// 到期规则：与迁移前的 cron 表达式等价
//   daily   '0 0 * * *'  每日
//   weekly  '0 0 * * 1'  每周一
//   monthly '0 0 1 * *'  每月 1 日
const SCHEDULE_DUE_RULES = Object.freeze({
  daily: () => true,
  weekly: (weekday) => weekday === 'Mon',
  monthly: (_weekday, dayOfMonth) => dayOfMonth === 1
});

function weekdayInZone(date, timezone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
}

// schedule 为未知取值时返回 false（保守：不执行、不中断整批）
function isScheduleDue(schedule, now = new Date(), timezone = resolveTimezone()) {
  const rule = SCHEDULE_DUE_RULES[schedule];
  if (!rule) return false;
  const dayOfMonth = Number(marketDate(now, timezone).slice(8, 10));
  return rule(weekdayInZone(now, timezone), dayOfMonth);
}

// 执行一轮分发。返回汇总计数，便于测试与观测。
async function runRebalanceCheck({ now = new Date(), timezone = resolveTimezone() } = {}) {
  const portfolios = await Portfolio.find({ archived: { $ne: true } }).lean();
  const summary = {
    taskName: 'rebalance-check',
    totalCount: portfolios.length,
    dueCount: 0,
    skippedCount: 0,
    failureCount: 0,
    failures: []
  };

  const periodKey = marketDate(now, timezone);

  for (const portfolio of portfolios) {
    // 防御性二次检查：查询与执行之间数据可能变化，归档组合一律不执行（CM-20）
    if (portfolio.archived === true) {
      summary.skippedCount += 1;
      taskLogger.info('REBALANCE_SCHEDULE_SKIPPED_ARCHIVED', { portfolioId: String(portfolio._id) });
      continue;
    }

    const pid = String(portfolio._id);
    const settings = portfolio.rebalanceSettings || {};
    const schedule = settings.rebalanceSchedule || 'daily';

    if (!isScheduleDue(schedule, now, timezone)) {
      summary.skippedCount += 1;
      continue;
    }
    summary.dueCount += 1;

    try {
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
    } catch (error) {
      // 逐组合故障隔离：单个组合失败不中断其余组合
      summary.failureCount += 1;
      summary.failures.push({ item: pid, category: error.category || 'INTERNAL', message: error.message });
      taskLogger.error('REBALANCE_SCHEDULER_FAILED', { portfolioId: pid, message: error.message });
    }
  }

  taskLogger.info('REBALANCE_CHECK_DONE', {
    totalCount: summary.totalCount,
    dueCount: summary.dueCount,
    skippedCount: summary.skippedCount,
    failureCount: summary.failureCount
  });
  return summary;
}

const startRebalanceScheduler = createCronScheduler({
  envKey: 'REBALANCE_CHECK_CRON',
  defaultCron: DEFAULT_REBALANCE_CHECK_CRON,
  taskName: 'rebalance-check',
  run: () => runRebalanceCheck()
});

module.exports = {
  DEFAULT_REBALANCE_CHECK_CRON,
  startRebalanceScheduler,
  runRebalanceCheck,
  isScheduleDue,
  SCHEDULE_DUE_RULES
};
