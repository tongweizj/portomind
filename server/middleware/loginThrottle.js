// server/middleware/loginThrottle.js
//
// TASK-058（U1-R8）：登录失败限速（内存计数，单实例部署）。
// 规则：同 ip + username 在 15 分钟窗口内连续失败 5 次 → 锁定 15 分钟；成功登录清零。
//
// 反滥用约束（Reviewer MAJOR-1）：
//   - 1–4 次失败的条目也会随窗口过期被清理（不会永久驻留）；
//   - 每次写入前做一次有界清扫，并对 Map 大小设硬上限，防止公开登录端点被注入无限 key；
//   - 所有时间参数可注入（便于单测覆盖窗口/锁定/清扫）。
//
// 多实例部署时需改为 Mongo 计数（ExecPlan §4.5 / R6，已登记为后续）。

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 5000;

const failures = new Map();

function keyOf(ip, username) {
  return `${ip || 'unknown'}|${String(username || '').trim().toLowerCase()}`;
}

function isExpired(entry, now) {
  if (!entry) return true;
  if (entry.lockedUntil) return entry.lockedUntil <= now;
  return now - entry.firstAt > WINDOW_MS;
}

/** 有界清扫：仅在达到上限时执行，避免每次请求 O(n)；不得驱逐仍在生效的锁定条目 */
function sweep(now) {
  if (failures.size < MAX_ENTRIES) return;
  for (const [key, entry] of failures) {
    if (isExpired(entry, now)) failures.delete(key);
  }
  if (failures.size >= MAX_ENTRIES) {
    const candidates = [...failures.entries()]
      .filter(([, entry]) => !(entry.lockedUntil > now)) // 保护活跃锁定，防止洪泛冲掉受害者的锁
      .sort((a, b) => a[1].firstAt - b[1].firstAt);
    const removeCount = Math.ceil(candidates.length / 4);
    for (let index = 0; index < removeCount; index += 1) failures.delete(candidates[index][0]);
  }
}

/** 返回锁定截止时间戳（0 = 未锁定）；过期条目顺手清理 */
function lockedUntil(key, now = Date.now()) {
  const entry = failures.get(key);
  if (!entry) return 0;
  if (isExpired(entry, now)) {
    failures.delete(key);
    return 0;
  }
  return entry.lockedUntil > now ? entry.lockedUntil : 0;
}

function recordFailure(key, now = Date.now()) {
  sweep(now);
  let entry = failures.get(key);
  if (!entry || isExpired(entry, now)) {
    entry = { count: 0, firstAt: now, lockedUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCK_MS;
  failures.set(key, entry);
  return entry;
}

function reset(key) {
  failures.delete(key);
}

/** 仅测试使用：清空计数，避免用例间互相污染 */
function resetAll() {
  failures.clear();
}

/** 仅测试使用：当前条目数（验证有界清扫） */
function size() {
  return failures.size;
}

module.exports = {
  MAX_ATTEMPTS,
  WINDOW_MS,
  LOCK_MS,
  MAX_ENTRIES,
  keyOf,
  lockedUntil,
  recordFailure,
  reset,
  resetAll,
  size
};
