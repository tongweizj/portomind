// server/controllers/cronStatus.controller.js
//
// TASK-054（FS C-02）：`GET /api/cron/status`。
// 只做参数校验 + 响应封装；派生逻辑全部在 shared/services/cronStatus.service.js（ExecPlan D-9）。
// 只读：本文件不得出现任何写操作（AC10）。

const cronStatusService = require('@portomind/shared/services/cronStatus.service');
const { isDateString } = require('@portomind/shared/utils/marketTime');
const { success, failure } = require('../utils/apiResponse');

const DETAIL_VALUES = new Set(['rebalance']);

function normalize(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

/**
 * GET /api/cron/status
 * Query:
 *   detail?      缺省/`rebalance`；其它非空值 → 400（ExecPlan D-14）
 *   date?        `YYYY-MM-DD`；非法 → 400（沿用 log.controller 的正则 + 回环校验）
 *   portfolioId? ObjectId；非法/不存在 → 200 + 空结果 + notes（不 500）
 */
exports.getStatus = async (req, res, next) => {
  try {
    const detail = normalize(req.query.detail);
    if (detail !== null && !DETAIL_VALUES.has(detail)) {
      return failure(req, res, 400, 'detail must be rebalance');
    }

    // date 只属于 detail 视图（API_CONTRACT）；主视图不校验、不消费 date，
    // 避免前端把 URL 里的旧 date 带进主视图时整块看板 400
    let date = null;
    if (detail === 'rebalance') {
      date = normalize(req.query.date);
      if (date !== null && !isDateString(date)) {
        return failure(req, res, 400, 'date must use YYYY-MM-DD format');
      }
    }

    const portfolioId = normalize(req.query.portfolioId);

    const data = await cronStatusService.getStatus({ detail, date, portfolioId });
    return success(res, data);
  } catch (err) {
    next(err);
  }
};
