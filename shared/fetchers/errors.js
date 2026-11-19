// 行情错误规范化：统一 category / provider / retryable 字段。
// 本文件是全仓唯一实现（server 与 cron-worker 共用），不存在需要同步的第二份拷贝。

const { redactSensitiveAssignments, sanitizeLogValue } = require('../utils/logSanitizer');
const RESPONSE_LIMIT = 4096;

const MARKET_DATA_ERROR = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  UPSTREAM: 'UPSTREAM',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN'
});

function sanitizeResponseText(text) {
  // 供应商可自定义查询参数名。任何字符串中的查询串都整体移除。
  const safe = text.replace(/\?[^\s"'<>]+/g, '?[REDACTED]')
    .replace(/(\b[a-z][a-z\d+.-]*:\/\/)[^\s"'<>/?#]*@/gi, '$1[REDACTED]@')
    .replace(/\b(?:bearer|basic)\s+[^\s"',;]+/gi, '[REDACTED]');
  return redactSensitiveAssignments(safe);
}

function responseExcerpt(body) {
  if (body === undefined || body === null) return undefined;
  try {
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* 上游也可返回非 JSON 文本。 */ }
    }
    const sanitized = sanitizeLogValue(body, sanitizeResponseText);
    const text = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
    return text?.slice(0, RESPONSE_LIMIT);
  } catch {
    return undefined;
  }
}

class MarketDataError extends Error {
  constructor(category, provider, message, options = {}) {
    super(message);
    this.name = 'MarketDataError';
    this.category = category;
    this.provider = provider;
    this.retryable = options.retryable ?? [
      MARKET_DATA_ERROR.TIMEOUT,
      MARKET_DATA_ERROR.RATE_LIMIT,
      MARKET_DATA_ERROR.UPSTREAM
    ].includes(category);
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.cause = options.cause;
  }
}

function classifyMarketDataError(error, provider) {
  if (error instanceof MarketDataError) return error;
  const status = error.response?.status || error.status;
  const diagnostics = { status, responseBody: responseExcerpt(error.response?.data), cause: error };
  const code = error.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || error.name === 'AbortError') {
    return new MarketDataError(MARKET_DATA_ERROR.TIMEOUT, provider, `${provider} request timed out`, diagnostics);
  }
  if (status === 429) {
    return new MarketDataError(MARKET_DATA_ERROR.RATE_LIMIT, provider, `${provider} rate limit exceeded`, diagnostics);
  }
  if (status === 404 || /not found|no data/i.test(error.message || '')) {
    return new MarketDataError(MARKET_DATA_ERROR.NOT_FOUND, provider, `${provider} symbol not found`, {
      ...diagnostics, retryable: false
    });
  }
  return new MarketDataError(MARKET_DATA_ERROR.UPSTREAM, provider, `${provider} request failed`, diagnostics);
}

module.exports = { MARKET_DATA_ERROR, MarketDataError, classifyMarketDataError };
