// server/middleware/requireJson.js
//
// TASK-058（U1）：FS §8「CSRF：SameSite=Lax + 仅接受 application/json」的落点。
// 只对带请求体的写操作生效；GET/HEAD 与无 body 请求放行。
// 配合 app.js 不挂 bodyParser.urlencoded，浏览器表单（跨站）无法提交认证/管理请求。

const { failure } = require('../utils/apiResponse');

module.exports = function requireJson(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.is('application/json')) return next();
  return failure(req, res, 415, '仅接受 application/json', undefined, { code: 'UNSUPPORTED_MEDIA_TYPE' });
};
