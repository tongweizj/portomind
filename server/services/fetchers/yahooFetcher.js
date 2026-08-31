const yahooFinance = require('yahoo-finance2').default;
const { MARKET_DATA_ERROR, MarketDataError } = require('./errors');
const { withMarketDataTimeout } = require('./timeout');

const PROVIDER = 'YAHOO';

function marketForSymbol(symbol) {
  if (/\.TO$/i.test(symbol)) return 'CA';
  if (/\.HK$/i.test(symbol)) return 'HK';
  if (/\.SS$/i.test(symbol)) return 'CN-SH';
  if (/\.SZ$/i.test(symbol)) return 'CN-SZ';
  return 'US';
}

async function fetchLatest(symbol) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const quote = await yahooFinance.quote(symbol);
    if (!quote?.symbol || !Number.isFinite(quote.regularMarketPrice)) {
      throw new MarketDataError(
        MARKET_DATA_ERROR.INVALID_RESPONSE,
        PROVIDER,
        `Yahoo returned an invalid quote for ${symbol}`,
        { retryable: false }
      );
    }
    return {
      symbol: quote.symbol,
      name: quote.shortName || quote.longName || quote.symbol,
      price: quote.regularMarketPrice,
      currency: quote.currency,
      market: marketForSymbol(symbol),
      timestamp: new Date()
    };
  });
}

async function fetchHistory(symbol, from, to) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const result = await yahooFinance.historical(symbol, {
      period1: from,
      period2: to,
      interval: '1d'
    });
    if (!Array.isArray(result)) {
      throw new MarketDataError(
        MARKET_DATA_ERROR.INVALID_RESPONSE,
        PROVIDER,
        `Yahoo returned invalid history for ${symbol}`,
        { retryable: false }
      );
    }
    return result
      .filter(item => Number.isFinite(item.close) && item.date)
      .map(item => ({
        symbol,
        price: item.close,
        // 中午 UTC 可保留供应商给出的日历日期，存储层再规范为市场日边界。
        timestamp: new Date(`${new Date(item.date).toISOString().slice(0, 10)}T12:00:00.000Z`)
      }));
  });
}

module.exports = { fetchLatest, fetchHistory };
