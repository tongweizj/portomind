const { MARKET_DATA_ERROR, MarketDataError, classifyMarketDataError } = require('./errors');

const configuredTimeout = Number(process.env.MARKET_DATA_TIMEOUT_MS);
const MARKET_DATA_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 10000;

async function withMarketDataTimeout(provider, operation, timeoutMs = MARKET_DATA_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new MarketDataError(
          MARKET_DATA_ERROR.TIMEOUT,
          provider,
          `${provider} request timed out after ${timeoutMs}ms`
        )), timeoutMs);
      })
    ]);
  } catch (error) {
    throw classifyMarketDataError(error, provider);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { MARKET_DATA_TIMEOUT_MS, withMarketDataTimeout };
