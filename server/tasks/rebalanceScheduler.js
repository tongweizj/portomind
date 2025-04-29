// server/tasks/rebalanceScheduler.js

/**
 * 定时任务调度：自动再平衡
 * 使用 cron.schedule 定时触发，再平衡检查逻辑
 * 采用 CommonJS 风格，无需修改 package.json
 */

//#!/usr/bin/env node
require('dotenv').config();

const mongoose         = require('mongoose');
const cron             = require('node-cron');
const ThresholdChecker = require('../services/rebalanceEngine/thresholdChecker');
const portfolioService = require('../services/portfolioService');
const SuggestionGen    = require('../services/rebalanceEngine/suggestionGenerator');
const CostEstimator    = require('../services/rebalanceEngine/costEstimator');
const Recorder         = require('../services/rebalanceEngine/recorder');
const AlertCenter      = require('../services/alertCenterService');
const Portfolio        = require('../models/portfolio');

(async function() {
  // 1. 连接 MongoDB
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  // 2. 读取所有组合及其调度配置
  const portfolios = await Portfolio.find({}).lean();
  const cronMap = {
    daily:   '*/1 * * * *',    // 每日 00:00
    weekly:  '*/1 * * * 1',    // 每周一 00:00
    monthly: '*/1 * * * *'     // 每月 1 号 00:00
  };
//   const cronMap = {
//     daily:   '0 0 * * *',    // 每日 00:00
//     weekly:  '0 0 * * 1',    // 每周一 00:00
//     monthly: '0 0 1 * *'     // 每月 1 号 00:00
//   };
  // 3. 为每个组合注册 cron 任务
  portfolios.forEach(p => {
    const pid      = p._id.toString();
    const schedule = cronMap[p.rebalanceSchedule] || cronMap.daily;

    cron.schedule(schedule, async () => {
      try {
        // 3.1 阈值检测
        console.log(`[Scheduler] 执行再平衡检查：组合 ${pid} @ ${new Date().toISOString()}`);
        const { needsRebalance, triggeredThresholds } = await ThresholdChecker.checkThresholds(pid);
        console.log(`[Scheduler] 检测结果:`, needsRebalance, triggeredThresholds);
        if (!needsRebalance) return;

        // 3.2 聚合持仓 & 建议生成
        const positions  = await portfolioService.positionTracker.aggregate(pid);
        let suggestions = SuggestionGen.generateSuggestions(pid, positions, triggeredThresholds);

        // 3.3 交易成本预估
        const feeModel = {}; // TODO: 从 portfolio 或系统配置读取
        suggestions = CostEstimator.estimateCost(suggestions, feeModel);

        // 3.4 创建记录并通知
        const record = await Recorder.createRecord(pid, 'AUTO', suggestions);
        await Recorder.updateStatus(record._id, 'PENDING');
        AlertCenter.notify({ portfolioId: pid, record, suggestions });
      } catch (err) {
        console.error(`自动再平衡任务执行失败 [${pid}]:`, err);
      }
    });
  });

  console.log('⚙️  cron jobs for autoRebalance scheduled.');
})();
