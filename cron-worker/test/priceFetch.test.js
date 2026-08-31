"use strict";
// priceFetch.service 路由单测：覆盖 resolveFetcher 的 market 优先路由
// （CN-FUND→天天基金、CN*/US/CA）与 Symbol 特征推断（.TO/.CN/.SS/.SZ/6 位数字码）。

process.env.MARKET_DATA_TIMEOUT_MS = '50';

const { test } = require('node:test');
const assert = require('node:assert');
const { resolveFetcher } = require('../src/services/priceFetch.service');

test('market=CN-FUND 路由到 Tiantian 并剥离 .cn 后缀', () => {
  const resolved = resolveFetcher({ symbol: '000191.cn', market: 'CN-FUND' });
  assert.equal(resolved.provider, 'TIANTIAN');
  assert.equal(resolved.providerSymbol, '000191');
  assert.equal(resolved.requestedSymbol, '000191.CN');
});

test('market=CN-FUND 无后缀符号仍路由到 Tiantian', () => {
  const resolved = resolveFetcher({ symbol: '000191', market: 'CN-FUND' });
  assert.equal(resolved.provider, 'TIANTIAN');
  assert.equal(resolved.providerSymbol, '000191');
});

test('market=CN/CN-SH/CN-SZ 路由到 Eastmoney', () => {
  for (const market of ['CN', 'CN-SH', 'CN-SZ']) {
    const resolved = resolveFetcher({ symbol: '510300', market });
    assert.equal(resolved.provider, 'EASTMONEY');
    assert.equal(resolved.providerSymbol, '510300');
  }
});

test('market=US/CA 路由到 Yahoo', () => {
  const us = resolveFetcher({ symbol: 'VTI', market: 'US' });
  assert.equal(us.provider, 'YAHOO');
  const ca = resolveFetcher({ symbol: 'BND.TO', market: 'CA' });
  assert.equal(ca.provider, 'YAHOO');
  assert.equal(ca.providerSymbol, 'BND.TO');
});

test('Symbol 特征：.TO 路由到 Yahoo', () => {
  const resolved = resolveFetcher('XEQT.TO');
  assert.equal(resolved.provider, 'YAHOO');
  assert.equal(resolved.providerSymbol, 'XEQT.TO');
});

test('Symbol 特征：.CN 路由到 Tiantian', () => {
  const resolved = resolveFetcher('000191.cn');
  assert.equal(resolved.provider, 'TIANTIAN');
  assert.equal(resolved.providerSymbol, '000191');
});

test('Symbol 特征：.SS/.SZ 与 6 位数字码路由到 Eastmoney', () => {
  for (const symbol of ['600519.SS', '000001.SZ', '510300']) {
    const resolved = resolveFetcher(symbol);
    assert.equal(resolved.provider, 'EASTMONEY');
    assert.equal(resolved.providerSymbol, symbol.replace(/\.(SS|SZ)$/i, ''));
  }
});

test('Symbol 特征：其余默认 Yahoo', () => {
  const resolved = resolveFetcher('VOO');
  assert.equal(resolved.provider, 'YAHOO');
  assert.equal(resolved.providerSymbol, 'VOO');
});

test('market=HK 路由到 Yahoo 且符号原样透传（AS-08）', () => {
  for (const [symbol, market] of [['0700.HK', 'HK'], ['1211.HK', 'HK']]) {
    const resolved = resolveFetcher({ symbol, market });
    assert.equal(resolved.provider, 'YAHOO');
    assert.equal(resolved.providerSymbol, symbol);
    assert.equal(resolved.requestedSymbol, symbol);
  }
});

test('Symbol 特征：.HK 后缀路由到 Yahoo，不与场外基金 .CN 推断冲突', () => {
  const hk = resolveFetcher('0700.HK');
  assert.equal(hk.provider, 'YAHOO');
  assert.equal(hk.providerSymbol, '0700.HK');

  // 无 market 字段时两者按后缀互斥：.HK → Yahoo，.CN → Tiantian
  const cn = resolveFetcher('000191.CN');
  assert.equal(cn.provider, 'TIANTIAN');
  assert.equal(cn.providerSymbol, '000191');
});

test('空 symbol 抛 TypeError', () => {
  assert.throws(() => resolveFetcher({ symbol: '', market: 'CN-FUND' }), TypeError);
});
