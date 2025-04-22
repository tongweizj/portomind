const yahooFinance = require('yahoo-finance2').default;

function getMarketBySymbol(symbol) {
  if (symbol.endsWith('.SS') || symbol.endsWith('.SZ')) return 'CN';
  if (symbol.endsWith('.TO')) return 'CA';
  return 'US';
}

async function getYahooPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    return {
      symbol: quote.symbol,
      name: quote.shortName,
      price: quote.regularMarketPrice,
      currency: quote.currency,
      market: getMarketBySymbol(symbol),
      timestamp: new Date()
    };
  } catch (err) {
    console.error(`❌ Yahoo 查询失败：${symbol}`, err.message);
    return null;
  }
}

module.exports = { getYahooPrice };
