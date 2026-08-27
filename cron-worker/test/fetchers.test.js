"use strict";
// fetcher 单测：通过注入 http 客户端验证 host 回退与错误分类。
// 关键场景：host1 超时挂起时，host2 仍有机会被调用（双重超时 bug 的回归测试）。
// 必须在 require fetcher 之前设置 MARKET_DATA_TIMEOUT_MS（timeout.js 在模块加载时读取）。

process.env.MARKET_DATA_TIMEOUT_MS = '50';

const { test } = require('node:test');
const assert = require('node:assert');
const yahooFetcher = require('../src/fetchers/yahooFetcher');
const eastmoneyFetcher = require('../src/fetchers/eastmoneyFetcher');
const tiantianFetcher = require('../src/fetchers/tiantianFetcher');

// 永不 resolve 的 Promise，模拟上游挂起（超时由 withMarketDataTimeout 的计时器触发）。
const hang = () => new Promise(() => {});

// 可注入的 http 客户端：记录被调用的 URL 与选项，并按 handler 返回/拒绝。
function mockHttp(handler) {
  const calls = [];
  const callsOptions = [];
  return {
    calls,
    callsOptions,
    async get(url, options) {
      calls.push(url);
      callsOptions.push(options);
      return handler(url, options);
    }
  };
}

test('Yahoo：host1 超时挂起时回退 host2', async () => {
  const http = mockHttp(url => {
    if (url.includes('query1')) return hang();
    return {
      data: {
        chart: {
          result: [{ meta: { symbol: 'VOO', regularMarketPrice: 123.45, currency: 'USD' } }]
        }
      }
    };
  });

  const result = await yahooFetcher.fetchLatest('VOO', http);
  assert.equal(result.price, 123.45);
  assert.equal(result.market, 'US');
  assert.equal(http.calls.length, 2, 'host2 应被调用');
  assert.ok(http.calls[0].includes('query1'));
  assert.ok(http.calls[1].includes('query2'));
});

test('Yahoo：host1 限流(429)时回退 host2', async () => {
  const http = mockHttp(url => {
    if (url.includes('query1')) return Promise.reject({ response: { status: 429 } });
    return { data: { chart: { result: [{ meta: { regularMarketPrice: 50 } }] } } };
  });

  const result = await yahooFetcher.fetchLatest('XEQT.TO', http);
  assert.equal(result.price, 50);
  assert.equal(result.market, 'CA');
  assert.equal(http.calls.length, 2);
});

test('Yahoo：全部 host 超时抛 TIMEOUT 且可重试', async () => {
  const http = mockHttp(() => hang());
  await assert.rejects(
    yahooFetcher.fetchLatest('VOO', http),
    err => {
      assert.equal(err.category, 'TIMEOUT');
      assert.equal(err.retryable, true);
      return true;
    }
  );
  assert.equal(http.calls.length, 2, '两个 host 都应被尝试');
});

test('Yahoo：fetchHistory host1 超时回退 host2', async () => {
  const ts = Math.floor(new Date('2024-08-01T00:00:00Z').getTime() / 1000);
  const http = mockHttp(url => {
    if (url.includes('query1')) return hang();
    return {
      data: {
        chart: {
          result: [{ timestamp: [ts, ts + 86400], indicators: { quote: [{ close: [100, 101] }] } }]
        }
      }
    };
  });

  const records = await yahooFetcher.fetchHistory('VOO', new Date('2024-08-01'), new Date('2024-08-02'), http);
  assert.equal(records.length, 2);
  assert.equal(records[0].price, 100);
  assert.equal(records[1].price, 101);
  assert.equal(records[0].symbol, 'VOO');
  assert.equal(http.calls.length, 2);
});

test('Eastmoney：push2 超时挂起时回退 push2delay', async () => {
  const http = mockHttp(url => {
    if (url.includes('push2.eastmoney.com')) return hang();
    return {
      data: {
        data: { f43: 12345, f59: 3, f57: '510300', f58: '沪深300ETF', f107: 1, f86: 1600000000 }
      }
    };
  });

  const result = await eastmoneyFetcher.fetchLatest('510300', http);
  assert.equal(result.price, 12.345); // f43 / 10^f59
  assert.equal(result.market, 'CN-SH');
  assert.equal(result.currency, 'CNY');
  assert.equal(http.calls.length, 2);
});

test('Eastmoney：全部 host 超时抛 TIMEOUT', async () => {
  const http = mockHttp(() => hang());
  await assert.rejects(
    eastmoneyFetcher.fetchLatest('510300', http),
    err => {
      assert.equal(err.category, 'TIMEOUT');
      assert.equal(err.provider, 'EASTMONEY');
      return true;
    }
  );
});

test('Eastmoney：fetchHistory 解析 K 线', async () => {
  const http = mockHttp(() => ({
    data: {
      data: { klines: ['2024-08-01,1.0,1.1,1.2,1.3,100', '2024-08-02,1.1,1.2,1.3,1.4,200'] }
    }
  }));

  const records = await eastmoneyFetcher.fetchHistory('510300', new Date('2024-08-01'), new Date('2024-08-02'), http);
  assert.equal(records.length, 2);
  assert.equal(records[0].price, 1.1);
  assert.equal(records[0].symbol, '510300');
  assert.equal(records[0].timestamp.toISOString().slice(0, 10), '2024-08-01');
});

test('Tiantian：fetchLatest 取最近一期单位净值', async () => {
  const http = mockHttp(() => ({
    data: {
      Data: { LSJZList: [{ FSRQ: '2026-08-25', DWJZ: '1.3596' }] },
      TotalCount: 1
    }
  }));

  const result = await tiantianFetcher.fetchLatest('000191', http);
  assert.equal(result.price, 1.3596);
  assert.equal(result.market, 'CN-FUND');
  assert.equal(result.currency, 'CNY');
  assert.equal(result.timestamp.toISOString().slice(0, 10), '2026-08-25');
  assert.equal(http.callsOptions[0].params.fundCode, '000191');
  assert.equal(http.callsOptions[0].params.pageSize, 1);
});

test('Tiantian：查无净值抛 NOT_FOUND 且不可重试', async () => {
  const http = mockHttp(() => ({ data: { Data: { LSJZList: [] }, TotalCount: 0 } }));
  await assert.rejects(
    tiantianFetcher.fetchLatest('999999', http),
    err => {
      assert.equal(err.category, 'NOT_FOUND');
      assert.equal(err.provider, 'TIANTIAN');
      assert.equal(err.retryable, false);
      return true;
    }
  );
});

test('Tiantian：非法响应抛 INVALID_RESPONSE', async () => {
  const http = mockHttp(() => ({ data: {} }));
  await assert.rejects(
    tiantianFetcher.fetchLatest('000191', http),
    err => {
      assert.equal(err.category, 'INVALID_RESPONSE');
      assert.equal(err.retryable, false);
      return true;
    }
  );
});

test('Tiantian：fetchHistory 分页解析净值', async () => {
  let page = 0;
  const http = mockHttp(() => {
    page += 1;
    return {
      data: {
        Data: { LSJZList: [{ FSRQ: '2026-08-25', DWJZ: '1.3596' }, { FSRQ: '2026-08-24', DWJZ: '1.3596' }] },
        TotalCount: 2
      }
    };
  });

  const records = await tiantianFetcher.fetchHistory('000191', new Date('2026-08-20T12:00:00Z'), new Date('2026-08-25T12:00:00Z'), http);
  assert.equal(records.length, 2);
  assert.equal(records[0].price, 1.3596);
  assert.equal(records[1].price, 1.3596);
  assert.equal(records[0].symbol, '000191');
  assert.equal(records[0].timestamp.toISOString().slice(0, 10), '2026-08-25');
  assert.equal(http.calls.length, 1);
  assert.equal(http.callsOptions[0].params.pageSize, 20);
  assert.ok(http.callsOptions[0].params.startDate === '2026-08-20');
  assert.ok(http.callsOptions[0].params.endDate === '2026-08-25');
});

test('Tiantian：fetchHistory 超出单页(20 条)时分页取全', async () => {
  let page = 0;
  const http = mockHttp(() => {
    page += 1;
    if (page === 1) {
      const list = Array.from({ length: 20 }, (_, i) => ({ FSRQ: `2026-07-${String(31 - i).padStart(2, '0')}`, DWJZ: '1.0' }));
      return { data: { Data: { LSJZList: list }, TotalCount: 22 } };
    }
    return {
      data: {
        Data: { LSJZList: [{ FSRQ: '2026-07-09', DWJZ: '1.1' }, { FSRQ: '2026-07-08', DWJZ: '1.2' }] },
        TotalCount: 22
      }
    };
  });

  const records = await tiantianFetcher.fetchHistory('000191', new Date('2026-07-01T12:00:00Z'), new Date('2026-08-25T12:00:00Z'), http);
  assert.equal(records.length, 22);
  assert.equal(http.calls.length, 2);
  assert.equal(http.callsOptions[1].params.pageIndex, 2);
});
