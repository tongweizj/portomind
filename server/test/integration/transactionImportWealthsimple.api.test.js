// server/test/integration/transactionImportWealthsimple.api.test.js
//
// TASK-100（#100）：Wealthsimple 原格式 CSV（activities export）直接导入。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 内存替身。
// 全部样例为合成数据：表头与符号约定仿照原报表结构，标的、数量、金额、账号均为虚构（仓库为 public）。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');
const marketData = require('@portomind/shared/services/marketData.service');

const PORTFOLIO_A = '64b000000000000000000c41';
const ACCOUNT_ID = 'SYNTH0ACCT01';

let server;
let baseUrl;

test.before(async () => {
  installAdminSession();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  uninstallSessionStub();
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
});

async function call(method, pathname, body) {
  const headers = { cookie: authHeaders().cookie };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const WS_HEADER = 'effective_date,effective_time,settlement_date,account_id,account_name,account_type,activity_type,activity_sub_type,description,direction,symbol,name,currency,quantity,unit_price,commission,net_cash_amount';

function cell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// 合成 Wealthsimple 行：默认一笔买入（direction 恒为 LONG，买卖方向只看 activity_sub_type）
function wsCsv(rows) {
  const base = {
    effective_date: '2026-03-02', effective_time: '10:15:30', settlement_date: '2026-03-03',
    account_id: ACCOUNT_ID, account_name: 'TFSA', account_type: 'TFSA',
    activity_type: 'Trade', activity_sub_type: 'BUY', description: 'SYNCA - Synthetic CA ETF: Bought 10.0000 shares at $20.00 per share (executed at 2026-03-02)',
    direction: 'LONG', symbol: 'SYNCA', name: '', currency: 'CAD',
    quantity: '10', unit_price: '20', commission: '0', net_cash_amount: '-200'
  };
  const keys = WS_HEADER.split(',');
  return `${[WS_HEADER, ...rows.map(row => keys.map(key => cell({ ...base, ...row }[key])).join(','))].join('\n')}\n`;
}

// 现金类行：无结算日、无方向、数量重复现金金额（原报表的怪癖），单价与佣金为空
function cashRow(row) {
  return {
    effective_time: '00:00:00', settlement_date: '', direction: '', unit_price: '', commission: '',
    quantity: row.net_cash_amount, ...row
  };
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [{ _id: PORTFOLIO_A, name: '合成组合 WS', currency: 'CAD' }],
    assets: [
      { _id: '64b000000000000000000e41', symbol: 'SYNCA.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true },
      { _id: '64b000000000000000000e42', symbol: 'SYNUS.US', type: 'etf', market: 'US', currency: 'USD', active: true }
    ],
    sourceAccounts: [],
    ...extra
  });
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function body(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'wealthsimple',
    file: { name: 'synthetic-activities-export.csv', content },
    sourceAccount: { broker: 'wealthsimple', alias: '合成 WS 账户' },
    timeZone: 'America/Toronto',
    ...overrides
  };
}

async function preview(input) {
  const response = await call('POST', '/api/transactions/import/preview', input);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

async function previewAndCommit(input) {
  const data = await preview(input);
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...input, previewToken: data.previewToken, ledgerFingerprint: data.ledgerFingerprint
  });
  return { preview: data, commit };
}

async function ledger() {
  const list = await call('GET', `/api/portfolios/${PORTFOLIO_A}/transactions`);
  assert.equal(list.status, 200, JSON.stringify(list.body));
  return list.body.data;
}

async function positions() {
  const response = await call('GET', `/api/portfolios/${PORTFOLIO_A}/stats/positions`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

test('买卖方向来自活动子类型：负的卖出数量表示卖出，明确零佣金保留为零；回读来源账户、文件行号与持仓', async (t) => {
  freshWorld(t);
  const content = wsCsv([
    { quantity: '10', unit_price: '20', net_cash_amount: '-200' },
    {
      effective_date: '2026-03-05', effective_time: '14:00:01', settlement_date: '2026-03-06',
      activity_sub_type: 'SELL', description: 'SYNCA - Synthetic CA ETF: Sold 4.0000 shares at $25.00 per share (executed at 2026-03-05)',
      quantity: '-4', unit_price: '25', net_cash_amount: '100'
    }
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.equal(data.counts.add, 2, JSON.stringify(data.rows));
  const [buy, sell] = data.rows;
  assert.deepEqual([buy.rowNumber, buy.rowNumberKind, sell.rowNumber], [2, 'file', 3]);
  assert.deepEqual([buy.candidate.action, buy.candidate.quantity, buy.candidate.fee, buy.candidate.feeSource],
    ['buy', 10, 0, 'broker']);
  assert.deepEqual([sell.candidate.action, sell.candidate.quantity, sell.candidate.cashAmount], ['sell', 4, 100]);
  // 报表无时区：按用户确认的多伦多时区解读成交时刻；结算日独立保存
  assert.equal(buy.candidate.date, '2026-03-02T15:15:30.000Z');
  assert.equal(buy.candidate.timeZoneSource, 'user');
  assert.equal(buy.candidate.settlementStatus, 'known');
  assert.equal(data.sourceAccount.broker, 'wealthsimple');
  assert.equal(data.sourceAccount.accountKeyLast4, 'CT01');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));

  const rows = await ledger();
  const byAction = Object.fromEntries(rows.map(tx => [tx.action, tx]));
  assert.equal(byAction.sell.quantity, 4);
  assert.equal(byAction.sell.fee, 0);
  assert.equal(byAction.sell.feeSource, 'broker');
  assert.equal(byAction.sell.source.rowNumber, 3);
  assert.equal(byAction.sell.source.format, 'wealthsimple');
  assert.equal(String(byAction.sell.sourceAccountId), commit.body.data.sourceAccountId);
  const [held] = await positions();
  assert.deepEqual([held.symbol, held.quantity, held.remainingCost], ['SYNCA.TO', 6, 120]);
});

const CASH_ROWS = [
  { effective_date: '2026-03-01', effective_time: '09:00:00', activity_type: 'MoneyMovement', activity_sub_type: 'EFT', ...cashRow({ description: 'Deposit', symbol: '', name: 'Deposit', net_cash_amount: '500' }) },
  { effective_date: '2026-03-01', activity_type: 'MoneyMovement', activity_sub_type: 'E_TRFIN', ...cashRow({ description: 'Interac e-Transfer Received', symbol: '', name: 'Interac', net_cash_amount: '50' }) },
  { quantity: '10', unit_price: '20', net_cash_amount: '-200' },
  // 美股分红以 CAD 现金入账：资产为 USD 资产，现金币种保留 CAD
  { effective_date: '2026-03-20', activity_type: 'Dividend', activity_sub_type: '-', ...cashRow({ description: 'SYNUS - Synthetic US ETF: Cash dividend distribution, received on 2026-03-20', symbol: 'SYNUS', net_cash_amount: '3.21' }) },
  // 非居民税：原报表无标的
  { effective_date: '2026-03-20', activity_type: 'Tax', activity_sub_type: 'NRT', ...cashRow({ description: 'Non-resident tax (executed at 2026-03-20)', symbol: '', name: 'Non-resident tax', net_cash_amount: '-0.48' }) },
  { effective_date: '2026-03-31', activity_type: 'Interest', activity_sub_type: '-', ...cashRow({ description: 'Stock lending monthly interest payment, FX Rate: 1.2345', symbol: '', name: 'Interest', net_cash_amount: '0.07' }) },
  { effective_date: '2026-04-02', effective_time: '11:00:00', activity_type: 'MoneyMovement', activity_sub_type: 'EFT', ...cashRow({ description: 'Withdrawal (executed at 2026-04-02)', symbol: '', name: 'Withdrawal', net_cash_amount: '-100' }) }
];

test('现金分红、非居民税、利息与现金划转：保留券商现金净额与实际现金币种，明确午夜保留为时刻，未知类型标明原因', async (t) => {
  freshWorld(t);
  const content = wsCsv([
    ...CASH_ROWS,
    { effective_date: '2026-04-03', activity_type: 'SyntheticUnknown', activity_sub_type: 'XYZ', ...cashRow({ symbol: '', net_cash_amount: '1' }) }
  ]);
  const data = await preview(body(content));
  assert.equal(data.counts.total, 8);
  assert.deepEqual(data.rows.map(row => row.candidate?.action ?? row.code),
    ['cash_in', 'cash_in', 'buy', 'div_cash', 'tax', 'interest', 'cash_out', 'UNSUPPORTED_ACTIVITY']);
  assert.match(data.rows[7].reason, /SyntheticUnknown \/ XYZ/);
  assert.equal(data.rows[7].disposition, 'error');
  assert.equal(data.blocking, true, '错误行阻塞整批');
  const dividend = data.rows[3].candidate;
  assert.deepEqual([dividend.symbol, dividend.quantity, dividend.price, dividend.cashAmount, dividend.cashCurrency, dividend.cashAmountSource],
    ['SYNUS.US', null, null, 3.21, 'CAD', 'broker']);
  // 00:00:00 是明确午夜：保留时刻精度（多伦多午夜），不降为仅日期
  assert.deepEqual([dividend.dateKind, dividend.localTime, dividend.date], ['datetime', '00:00:00', '2026-03-20T04:00:00.000Z']);
  assert.equal(data.rows[4].candidate.symbol, null);
  assert.equal(data.rows[4].candidate.cashAmount, -0.48);
  assert.equal(data.rows[4].candidate.settlementStatus, 'unknown');
  assert.equal(data.rows[6].candidate.cashAmount, -100);
});

test('现金流水整批入账：回读现金原币金额、资产币种快照与来源，现金流水不改变持仓', async (t) => {
  freshWorld(t);
  const { commit } = await previewAndCommit(body(wsCsv(CASH_ROWS)));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.added, 7);
  const rows = await ledger();
  const byAction = action => rows.filter(tx => tx.action === action);
  assert.equal(byAction('div_cash')[0].cashCurrency, 'CAD');
  assert.equal(byAction('div_cash')[0].currency, 'USD');
  assert.equal(byAction('div_cash')[0].source.rowNumber, 5);
  assert.equal(byAction('tax')[0].currency, 'CAD');
  assert.equal(byAction('interest')[0].cashAmount, 0.07);
  assert.deepEqual(byAction('cash_in').map(tx => tx.cashAmount).sort((a, b) => a - b), [50, 500]);
  assert.equal(byAction('cash_out')[0].cashAmount, -100);
  const [held] = await positions();
  assert.deepEqual([held.quantity, held.remainingCost], [10, 200]);
});

test('美股成交以 CAD 结算：按报表 FX Rate 把单价换回资产币种计持仓成本，现金净额保留 CAD；缺 FX Rate 不猜汇率', async (t) => {
  freshWorld(t);
  const content = wsCsv([
    {
      symbol: 'SYNUS', quantity: '2', unit_price: '137.5', net_cash_amount: '-275',
      description: 'SYNUS - Synthetic US ETF: Bought 2.0000 shares at $137.50 per share (executed at 2026-03-02), FX Rate: 1.375'
    },
    {
      effective_date: '2026-03-05', settlement_date: '2026-03-06', activity_sub_type: 'SELL', symbol: 'SYNUS',
      quantity: '-1', unit_price: '154', net_cash_amount: '154',
      description: 'SYNUS - Synthetic US ETF: Sold 1.0000 shares at $154.00 per share (executed at 2026-03-05), FX Rate: 1.4'
    },
    {
      effective_date: '2026-03-06', symbol: 'SYNUS', quantity: '1', unit_price: '140', net_cash_amount: '-140',
      description: 'SYNUS - Synthetic US ETF: Bought 1.0000 shares at $140.00 per share (executed at 2026-03-06)'
    }
  ]);
  const data = await preview(body(content));
  const [buy, sell, noRate] = data.rows;
  assert.equal(buy.disposition, 'add', JSON.stringify(buy));
  assert.deepEqual([buy.candidate.price, buy.candidate.grossAmount, buy.candidate.cashAmount, buy.candidate.cashCurrency, buy.candidate.cashFxRate],
    [100, 200, -275, 'CAD', 1.375]);
  assert.equal(buy.candidate.cashDifference, null, '按报表汇率换算后与券商净额一致');
  assert.deepEqual([sell.candidate.price, sell.candidate.cashAmount], [110, 154]);
  assert.equal(noRate.disposition, 'error');
  assert.equal(noRate.code, 'CURRENCY_MISMATCH');

  const { commit } = await previewAndCommit(body(wsCsv([
    { symbol: 'SYNUS', quantity: '2', unit_price: '137.5', net_cash_amount: '-275', description: 'Bought (executed at 2026-03-02), FX Rate: 1.375' },
    { effective_date: '2026-03-05', activity_sub_type: 'SELL', symbol: 'SYNUS', quantity: '-1', unit_price: '154', net_cash_amount: '154', description: 'Sold (executed at 2026-03-05), FX Rate: 1.4' }
  ])));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const rows = await ledger();
  const buyTx = rows.find(tx => tx.action === 'buy');
  assert.deepEqual([buyTx.currency, buyTx.price, buyTx.cashAmount, buyTx.cashCurrency, buyTx.cashFxRate], ['USD', 100, -275, 'CAD', 1.375]);
  const [held] = await positions();
  assert.deepEqual([held.symbol, held.currency, held.quantity, held.remainingCost, held.realizedPnl], ['SYNUS.US', 'USD', 1, 100, 10]);
});

test('跨币种成交的分币差异按报表原始现金币种金额核对：保留券商差异，不因汇率换算产生噪声', async (t) => {
  freshWorld(t);
  const data = await preview(body(wsCsv([
    // 7.1234 × 151.23 = 1077.271782：券商净额舍到分，差 +0.001782
    { symbol: 'SYNUS', quantity: '7.1234', unit_price: '151.23', net_cash_amount: '-1077.27', description: 'Bought (executed at 2026-03-02), FX Rate: 1.3712' },
    // 3 × 137.37 = 412.11：与净额一致，换算往返后仍无差异
    { effective_date: '2026-03-03', symbol: 'SYNUS', quantity: '3', unit_price: '137.37', net_cash_amount: '-412.11', description: 'Bought (executed at 2026-03-03), FX Rate: 1.3893' }
  ])));
  assert.deepEqual(data.rows.map(row => row.candidate.cashDifference), [0.001782, null]);
});

test('裸代码在 US / CA 都有资产时报 MARKET_AMBIGUOUS，都没有时报 ASSET_NOT_FOUND', async (t) => {
  freshWorld(t, {
    assets: [
      { _id: '64b000000000000000000e43', symbol: 'SYNDU.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true },
      { _id: '64b000000000000000000e44', symbol: 'SYNDU.US', type: 'etf', market: 'US', currency: 'USD', active: true }
    ]
  });
  const data = await preview(body(wsCsv([{ symbol: 'SYNDU' }, { symbol: 'NOPE' }])));
  assert.deepEqual(data.rows.map(row => [row.disposition, row.code]), [['error', 'MARKET_AMBIGUOUS'], ['error', 'ASSET_NOT_FOUND']]);
});

test('原格式不接受手动列映射；缺少原报表必需列时阻塞并列出列名', async (t) => {
  freshWorld(t);
  const mapped = await call('POST', '/api/transactions/import/preview', body(wsCsv([{}]), { mapping: { 0: 'trade_date' } }));
  assert.equal(mapped.status, 400);
  assert.equal(mapped.body.code, 'INVALID_MAPPING');
  const truncated = wsCsv([{}]).split('\n').map(line => line.split(',').slice(0, 16).join(',')).join('\n');
  const data = await preview(body(truncated));
  assert.equal(data.blocking, true);
  assert.deepEqual(data.blockingReasons.find(item => item.code === 'MISSING_COLUMNS')?.reason, '未映射必需列：net_cash_amount');
});
