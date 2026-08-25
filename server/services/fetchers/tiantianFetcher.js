const axios = require('axios');
const dayjs = require('dayjs');
const { MARKET_DATA_ERROR, MarketDataError } = require('./errors');
const { MARKET_DATA_TIMEOUT_MS, withMarketDataTimeout } = require('./timeout');

const PROVIDER = 'TIANTIAN';
const HEADERS = {
  Referer: 'https://fund.eastmoney.com/',
  'User-Agent': 'Portomind/1.0'
};

async function fetchLatest(symbol) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const response = await axios.get(`https://fundgz.1234567.com.cn/js/${symbol}.js`, {
      headers: HEADERS,
      timeout: MARKET_DATA_TIMEOUT_MS
    });
    const match = String(response.data).match(/jsonpgz\((.*)\)/);
    if (!match) {
      throw new MarketDataError(
        MARKET_DATA_ERROR.INVALID_RESPONSE,
        PROVIDER,
        `Tiantian returned an invalid quote for ${symbol}`,
        { retryable: false }
      );
    }
    let json;
    try {
      json = JSON.parse(match[1]);
    } catch (cause) {
      throw new MarketDataError(
        MARKET_DATA_ERROR.INVALID_RESPONSE,
        PROVIDER,
        `Tiantian returned malformed JSON for ${symbol}`,
        { retryable: false, cause }
      );
    }
    const price = Number(json.gsz);
    if (!Number.isFinite(price)) {
      throw new MarketDataError(
        MARKET_DATA_ERROR.INVALID_RESPONSE,
        PROVIDER,
        `Tiantian returned an invalid price for ${symbol}`,
        { retryable: false }
      );
    }
    return {
      symbol,
      name: json.name,
      price,
      currency: 'CNY',
      market: 'CN-FUND',
      timestamp: json.gztime ? new Date(json.gztime) : new Date()
    };
  });
}

async function fetchHistory(symbol, from, to) {
  return withMarketDataTimeout(PROVIDER, async () => {
    const fromString = dayjs(from).format('YYYY-MM-DD');
    const toString = dayjs(to).format('YYYY-MM-DD');
    const records = [];
    const pageSize = 200;
    let page = 1;
    let totalCount = 1;

    while ((page - 1) * pageSize < totalCount) {
      const url = 'https://api.fund.eastmoney.com/f10/lsjz';
      const response = await axios.get(url, {
        params: {
          fundCode: symbol,
          pageIndex: page,
          pageSize,
          startDate: fromString,
          endDate: toString
        },
        headers: { ...HEADERS, Referer: `https://fund.eastmoney.com/${symbol}.html` },
        timeout: MARKET_DATA_TIMEOUT_MS
      });
      const list = response.data?.Data?.LSJZList;
      if (!Array.isArray(list)) {
        throw new MarketDataError(
          MARKET_DATA_ERROR.INVALID_RESPONSE,
          PROVIDER,
          `Tiantian returned invalid history for ${symbol}`,
          { retryable: false }
        );
      }

      totalCount = Number(response.data?.TotalCount ?? response.data?.Data?.TotalCount ?? list.length);
      for (const item of list) {
        const date = item.FSRQ;
        const price = Number(item.DWJZ);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(price)) {
          records.push({ symbol, price, timestamp: new Date(`${date}T12:00:00.000Z`) });
        }
      }
      if (list.length === 0) break;
      page += 1;
    }
    return records;
  });
}

module.exports = { fetchLatest, fetchHistory };
