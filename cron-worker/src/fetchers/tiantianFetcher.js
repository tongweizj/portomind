// cron-worker/src/fetchers/tiantianFetcher.js
// 通过天天基金（东方财富基金平台）公开接口抓取场外基金（CN-FUND）的单位净值。
// 实时估算接口 fundgz.1234567.com.cn 在部分网络环境不可达（返回 404 页），
// 统一改用 api.fund.eastmoney.com/f10/lsjz 的「最近一期已发布单位净值」作为最新价，
// 与历史净值同源，避免估算与净值口径不一致。

const axios = require('axios');
const dayjs = require('dayjs');
const { MARKET_DATA_ERROR, MarketDataError } = require('./errors');
const { MARKET_DATA_TIMEOUT_MS, withMarketDataTimeout } = require('./timeout');

const PROVIDER = 'TIANTIAN';
const LSJZ_URL = 'https://api.fund.eastmoney.com/f10/lsjz';
const HEADERS = {
  Referer: 'https://fund.eastmoney.com/',
  'User-Agent': 'Portomind/1.0'
};

// 拉取指定页的净值列表（按净值日期倒序）。pageSize=1 即最近一期单位净值。
async function fetchNavPage(symbol, params, http) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const response = await http.get(LSJZ_URL, {
      params: { fundCode: symbol, ...params },
      headers: { ...HEADERS, Referer: `https://fund.eastmoney.com/${symbol}.html` },
      timeout: MARKET_DATA_TIMEOUT_MS
    });
    const list = response.data && response.data.Data && response.data.Data.LSJZList;
    if (!Array.isArray(list)) {
      throw new MarketDataError(
        MARKET_DATA_ERROR.INVALID_RESPONSE,
        PROVIDER,
        `Tiantian returned invalid history for ${symbol}`,
        { retryable: false }
      );
    }
    return { list, totalCount: Number(response.data.TotalCount ?? list.length) };
  });
}

// 将 LSJZList 条目规整为 { symbol, price, timestamp }（净值日期按 T12:00:00Z 归桶，与其它 fetcher 一致）。
function toRecord(symbol, item) {
  const date = item && item.FSRQ;
  const price = Number(item && item.DWJZ);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price)) return null;
  return { symbol, price, timestamp: new Date(`${date}T12:00:00.000Z`) };
}

// 最新净值：不传日期区间取最近一期已发布单位净值；查无净值视为证券不存在。
async function fetchLatest(symbol, http = axios) {
  const { list } = await fetchNavPage(symbol, { pageIndex: 1, pageSize: 1 }, http);
  const record = list.length ? toRecord(symbol, list[0]) : null;
  if (!record) {
    throw new MarketDataError(
      MARKET_DATA_ERROR.NOT_FOUND,
      PROVIDER,
      `Tiantian symbol not found: ${symbol}`,
      { retryable: false }
    );
  }
  return {
    symbol,
    price: record.price,
    currency: 'CNY',
    market: 'CN-FUND',
    timestamp: record.timestamp
  };
}

// 历史净值：按日期区间分页拉取单位净值。
// 注意：lsjz 接口服务端把 pageSize 硬性截断为 20（传 200 也只返回 20 条），
// 分页步长必须按实际返回的 20 计算，否则 TotalCount 大于 20 时只会取到第一页。
const NAV_PAGE_SIZE = 20;

async function fetchHistory(symbol, from, to, http = axios) {
  const fromString = dayjs(from).format('YYYY-MM-DD');
  const toString = dayjs(to).format('YYYY-MM-DD');
  const records = [];
  const pageSize = NAV_PAGE_SIZE;
  let page = 1;
  let totalCount = 1;

  while ((page - 1) * pageSize < totalCount) {
    const { list, totalCount: total } = await fetchNavPage(symbol, {
      pageIndex: page,
      pageSize,
      startDate: fromString,
      endDate: toString
    }, http);
    totalCount = total;
    for (const item of list) {
      const record = toRecord(symbol, item);
      if (record) records.push(record);
    }
    if (list.length === 0) break;
    page += 1;
  }
  return records;
}

module.exports = { fetchLatest, fetchHistory };
