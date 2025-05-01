// server/services/priceFetch.service.js
const tiantianFetcher = require('./fetchers/tiantianFetcher');
const yahooFetcher   = require('./fetchers/yahooFetcher');

// 调度服务
/**
 * 根据 symbol 分发到对应抓取器
 */
function chooseFetcher(symbol) {
  return symbol.endsWith('.cn') ? tiantianFetcher : yahooFetcher;
}

exports.fetchLatest = async function(symbol) {
  const fetcher = chooseFetcher(symbol);
  // 对于 toqu.cn 这类，需要剥离后缀
  const pureSymbol = symbol.replace(/\.cn$/, '');
  return fetcher.fetchLatest(pureSymbol);
};

exports.fetchHistory = async function(symbol, from, to) {
  const fetcher = symbol.endsWith('.cn')
    ? tiantianFetcher
    : yahooFetcher;
  const pureSymbol = symbol.replace(/\.cn$/, '');
  console.log("pureSymbol: ",pureSymbol)
  return fetcher.fetchHistory(pureSymbol, from, to);
};
