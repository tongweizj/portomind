"use strict";
// fetcher 单测：通过注入 http 客户端验证 host 回退与错误分类。
// 关键场景：host1 超时挂起时，host2 仍有机会被调用（双重超时 bug 的回归测试）。
// 必须在 require fetcher 之前设置 MARKET_DATA_TIMEOUT_MS（timeout.js 在模块加载时读取）。

process.env.MARKET_DATA_TIMEOUT_MS = '50';

const { test } = require('node:test');
const assert = require('node:assert');
const yahooFetcher = require('../src/fetchers/yahooFetcher');
const eastmoneyFetcher = require('../src/fetchers/eastmoneyFetcher');

// 永不 resolve 的 Promise，模拟上游挂起（超时由 withMarketDataTimeout 的计时器触发）。
const hang = () => new Promise(() => {});

// 可注入的 http 客户端：记录被调用的 URL，并按 handler 返回/拒绝。
function mockHttp(handler) {
  const calls = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      return handler(url);
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
