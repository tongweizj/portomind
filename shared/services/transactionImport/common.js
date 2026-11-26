// 流水导入各模块共用的小工具（代码审查 T2：此前在 index / commit / transfers / matching / pairing 各有一份）。
// - businessError：带 HTTP status / code（/ details）的业务错误，由 server 统一归一；
// - sha256：字符串原样、其他值 JSON 序列化后取摘要（previewToken、rawHash、划转组号共用）；
// - markError / markReview / markSkip：设置预览行的处置（disposition）与原因，处置取值见 IMPORT_DISPOSITIONS。

const crypto = require('crypto');

function businessError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function markError(row, code, reason) {
  row.disposition = 'error';
  row.code = code;
  row.reason = reason;
}

function markReview(row, code, reason, options) {
  row.disposition = 'review';
  row.code = code;
  row.reason = reason;
  row.options = options;
}

function markSkip(row, code, reason) {
  row.disposition = 'skip';
  row.code = code;
  row.reason = reason;
}

module.exports = { businessError, sha256, markError, markReview, markSkip };
