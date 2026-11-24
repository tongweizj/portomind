const mongoose = require('mongoose');

const TaskRunSchema = new mongoose.Schema({
  taskName: { type: String, required: true, trim: true },
  runKey: { type: String, required: true, trim: true },
  trigger: {
    type: String,
    enum: ['SCHEDULED', 'MANUAL'],
    default: 'SCHEDULED'
  },
  status: {
    type: String,
    enum: ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'],
    default: 'RUNNING'
  },
  startedAt: { type: Date, required: true },
  endedAt: Date,
  durationMs: Number,
  // TASK-070：跨进程互斥的活跃任务锁；终态运行时释放（不进入 HTTP 契约）。
  lockKey: { type: String, trim: true, default: undefined },
  // TASK-070：运行中可读进度；旧记录无该字段。
  progress: {
    completed: Number,
    total: Number,
    updatedAt: Date
  },
  totalCount: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  failures: [{
    _id: false,
    item: String,
    category: String,
    provider: String,
    retryable: Boolean,
    message: String,
    status: Number,
    responseBody: String
  }],
  result: { type: mongoose.Schema.Types.Mixed }
}, { versionKey: false });

TaskRunSchema.index({ taskName: 1, runKey: 1 }, { unique: true });
TaskRunSchema.index({ startedAt: -1, taskName: 1 });
// 仅活跃且带 lockKey 的记录参与唯一约束；终态任务不永久占锁。
TaskRunSchema.index(
  { lockKey: 1 },
  {
    unique: true,
    name: 'taskrun_active_lock_unique',
    partialFilterExpression: { status: 'RUNNING', lockKey: { $type: 'string' } }
  }
);

module.exports = mongoose.model('TaskRun', TaskRunSchema);
