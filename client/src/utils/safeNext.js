// src/utils/safeNext.js
// TASK-058 U2：登录回跳参数净化（FS §4.5 / TASK-060 A-02 / N-2）。
// `next` 是不可信输入：必须是站内路径，且不得自我嵌套；协议相对 URL（`//host`）在浏览器里
// 等价于外站，必须与反斜杠变体一并拒绝，否则形成开放重定向。
function hasControlOrBackslash(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || value[index] === '\\') return true;
  }
  return false;
}

export function safeNext(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (hasControlOrBackslash(value)) return null;
  if (value.includes('next=')) return null;
  if (value === '/login' || value.startsWith('/login?') || value === '/login/') return null;
  return value;
}

/** 生成登录页地址；非法/缺失的 next 一律退化为 `/login`。 */
export function buildLoginPath(next) {
  const target = safeNext(next);
  return target ? `/login?next=${encodeURIComponent(target)}` : '/login';
}
