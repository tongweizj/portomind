// shared/models/taskSkip.js
//
// TASK-057（D-01）：防重跳过**事件**的独立载体（集合 taskskips）。
//
// 为什么不是 TaskRun.status='SKIPPED'：
//   - TaskRun 上的唯一索引 {taskName, runKey} 正是防重依据，跳过的成因就是该 key 已存在；
//     再插一条同 key 的 SKIPPED 会撞 11000；
//   - ALREADY_RUNNING 时把正在跑的 TaskRun 改成 SKIPPED 会摧毁其真实执行语义。
// 因此跳过记录独立存放，taskruns 契约与唯一索引零改动（D-01）。
//
// 本集合是事件流（一次跳过一条），不加唯一索引、不加 TTL（滚动/清理另行决定）。

const mongoose = require('mongoose');

const TaskSkipSchema = new mongoose.Schema({
  taskName: { type: String, required: true, trim: true },
  runKey: { type: String, required: true, trim: true },
  trigger: {
    type: String,
    enum: ['SCHEDULED', 'MANUAL'],
    default: 'SCHEDULED'
  },
  reason: {
    type: String,
    enum: ['ALREADY_RUNNING', 'DUPLICATE_RUN_KEY'],
    required: true
  },
  skippedAt: { type: Date, required: true, default: Date.now },
  // 仅 ALREADY_RUNNING 时有意义：当时持锁的 runKey
  activeRunKey: { type: String, trim: true }
}, { versionKey: false });

TaskSkipSchema.index({ taskName: 1, skippedAt: -1 });

module.exports = mongoose.model('TaskSkip', TaskSkipSchema);
