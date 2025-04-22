// server/test-price.js
const { getLatestPrice } = require('../services/priceService');

(async () => {
  const symbols = ['AAPL', 'TD.TO', '600519.SS', '005827.cn'];

  for (const symbol of symbols) {
    const result = await getLatestPrice(symbol);
    console.log(`📈 ${symbol}:`, result);
  }
})();
