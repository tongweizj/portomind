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
  totalCount: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  failures: [{
    _id: false,
    item: String,
    category: String,
    provider: String,
    retryable: Boolean,
    message: String
  }]
}, { versionKey: false });

TaskRunSchema.index({ taskName: 1, runKey: 1 }, { unique: true });
TaskRunSchema.index({ startedAt: -1, taskName: 1 });

module.exports = mongoose.model('TaskRun', TaskRunSchema);
