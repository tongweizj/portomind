// src/services/authSession.js
// TASK-058 U2：axios 拦截器（非 React）与会话 Provider（React）之间的最小事件桥。
// 拦截器只负责「发生了什么」，跳转与清缓存由 Provider 决定，避免 service 依赖路由。
let unauthorizedHandler = null;
let passwordChangeRequiredHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function setPasswordChangeRequiredHandler(handler) {
  passwordChangeRequiredHandler = handler;
}

/** 业务接口返回 401：会话已失效，需要清缓存并跳登录。 */
export function notifyUnauthorized() {
  if (unauthorizedHandler) unauthorizedHandler();
}

/** 业务接口返回 403 PASSWORD_CHANGE_REQUIRED：本地会话快照过期，需要重新拉取会话。 */
export function notifyPasswordChangeRequired() {
  if (passwordChangeRequiredHandler) passwordChangeRequiredHandler();
}
