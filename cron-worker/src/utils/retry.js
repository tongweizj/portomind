// cron-worker/src/utils/retry.js
// 通用指数退避（Exponential Backoff）重试函数：仅当错误满足 error.retryable === true 时自动重试。

function isRetryable(error) {
  return Boolean(error && error.retryable === true);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 指数退避 + 全量抖动（full jitter），避免多个任务同时重试造成上游雪崩。
function backoffDelay(attempt, { baseDelayMs, maxDelayMs, factor }) {
  const exponential = baseDelayMs * (factor ** (attempt - 1));
  const capped = Math.min(exponential, maxDelayMs);
  return Math.round(Math.random() * capped);
}

// 首次调用 fn 后，若抛错且满足 shouldRetry 则重试，最多 maxRetries 次（默认 3 次）。
async function fetchWithRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 10000,
    factor = 2,
    shouldRetry = isRetryable,
    onRetry
  } = options;

  if (typeof fn !== 'function') throw new TypeError('fn must be a function');

  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt > maxRetries || !shouldRetry(error)) throw error;
      const waitMs = backoffDelay(attempt, { baseDelayMs, maxDelayMs, factor });
      if (typeof onRetry === 'function') onRetry({ error, attempt, maxRetries, waitMs });
      await delay(waitMs);
    }
  }
  throw lastError;
}

module.exports = { fetchWithRetry, isRetryable, backoffDelay };
