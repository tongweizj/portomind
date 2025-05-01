// server/services/fetchers/yahooFetcher.js

const yahooFinance = require('yahoo-finance2').default;
const dayjs = require('dayjs');

/**
 * 实现 IFetcher 接口：Yahoo Finance 抓最新与历史价
 */
module.exports = {
  /**
   * 抓取最新价
   * @param {string} symbol — 带市场后缀，如 AAPL, BND.TO, 600519.SS
   */
  async fetchLatest(symbol) {
    const quote = await yahooFinance.quote(symbol);
    // 根据后缀决定 market
    const market = /\.TO$/.test(symbol) ? 'CA'
                 : /\.SS|\.SZ$/.test(symbol) ? 'CN'
                 : 'US';
    return {
      symbol:    quote.symbol,
      name:      quote.shortName,
      price:     quote.regularMarketPrice,
      currency:  quote.currency,
      market,
      timestamp: new Date()  // 实时抓取时间
    };
  },

  /**
   * 抓取历史数据
   * @param {string} symbol
   * @param {Date} from
   * @param {Date} to
   */
  async fetchHistory(symbol, from, to) {
    // yahoo-finance2 提供批量历史接口
    const result = await yahooFinance.historical(symbol, {
      period1: dayjs(from).unix(),
      period2: dayjs(to).unix(),
      interval: '1d'
    });
    return result.map(item => ({
      symbol,
      price: item.close,
      timestamp: new Date(item.date)
    }));
  }
};
