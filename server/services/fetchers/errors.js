const MARKET_DATA_ERROR = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  UPSTREAM: 'UPSTREAM'
});

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
    this.cause = options.cause;
  }
}

function classifyMarketDataError(error, provider) {
  if (error instanceof MarketDataError) return error;
  const status = error.response?.status || error.status;
  const code = error.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || error.name === 'AbortError') {
    return new MarketDataError(MARKET_DATA_ERROR.TIMEOUT, provider, `${provider} request timed out`, { cause: error });
  }
  if (status === 429) {
    return new MarketDataError(MARKET_DATA_ERROR.RATE_LIMIT, provider, `${provider} rate limit exceeded`, { status, cause: error });
  }
  if (status === 404 || /not found|no data/i.test(error.message || '')) {
    return new MarketDataError(MARKET_DATA_ERROR.NOT_FOUND, provider, `${provider} symbol not found`, {
      status,
      retryable: false,
      cause: error
    });
  }
  return new MarketDataError(MARKET_DATA_ERROR.UPSTREAM, provider, `${provider} request failed`, {
    status,
    cause: error
  });
}

module.exports = { MARKET_DATA_ERROR, MarketDataError, classifyMarketDataError };
