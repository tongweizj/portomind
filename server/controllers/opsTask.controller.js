// server/controllers/opsTask.controller.js
//
// TASK-070：运维中心 task-run 读取与手动 integrity-check 触发。
// 协议层只做参数/状态码/响应包装；业务与 TaskRun 生命周期在 shared。

const mongoose = require('mongoose');
const { startPriceIntegrityCheck } = require('@portomind/shared/tasks/priceIntegrityCheck');
const {
  getTaskRunById,
  serializeTaskRun
} = require('@portomind/shared/services/taskRuns.service');
const { staleAfterMsFor } = require('@portomind/shared/config/opsTasks');
const { success, failure } = require('../utils/apiResponse');

function hasUnexpectedBody(body) {
  if (body === undefined || body === null) return false;
  return typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0;
}

exports.startIntegrityCheck = async (req, res, next) => {
  if (hasUnexpectedBody(req.body)) {
    return failure(req, res, 400, 'integrity-check accepts an empty request body');
  }
  try {
    const handle = await startPriceIntegrityCheck({ trigger: 'MANUAL', repair: false });
    if (!handle.ok) {
      return failure(
        req, res, 409, `${handle.taskName} is already running`,
        { activeRun: handle.activeRun },
        { code: 'TASK_ALREADY_RUNNING' }
      );
    }
    // 后台执行已由 taskRunner 内部兜住 rejection；这里只返回启动句柄。
    return success(res, {
      runId: handle.runId,
      taskName: handle.taskName,
      runKey: handle.runKey,
      status: handle.status,
      startedAt: handle.startedAt
    }, { status: 202 });
  } catch (error) {
    return next(error);
  }
};

exports.getTaskRun = async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return failure(req, res, 400, 'Invalid task run ID');
  }
  try {
    const doc = await getTaskRunById(req.params.id);
    if (!doc) return failure(req, res, 404, 'Task run not found');
    return success(res, serializeTaskRun(doc, {
      staleAfterMs: staleAfterMsFor(doc.taskName)
    }));
  } catch (error) {
    return next(error);
  }
};
