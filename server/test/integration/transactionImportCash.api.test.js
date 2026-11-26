// server/test/integration/transactionImportCash.api.test.js
//
// TASK-097（#97）：分红、税款、利息、现金划转、独立费用导入，现金净额 / 币种 / 佣金核对，
// 以及无编号现金流水的人工核对。起真实 Express + 认证闸门；模型层用 helpers/importWorld 内存替身。
// 全部样例为合成数据（仓库为 public，禁止使用真实券商报表）。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');
const marketData = require('@portomind/shared/services/marketData.service');

const PORTFOLIO_A = '64b000000000000000000c01';
const SOURCE_ID = '64b000000000000000000d01';

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

const HEADER = 'activity_type,trade_date,external_id,symbol,market,quantity,unit_price,cash_amount,cash_currency,commission,notes';

function csv(rows) {
  const base = {
    activity_type: 'buy', trade_date: '2026-03-02', external_id: '', symbol: 'VTI', market: 'US',
    quantity: '10', unit_price: '100', cash_amount: '', cash_currency: 'USD', commission: '0', notes: ''
  };
  return [HEADER, ...rows.map(row => HEADER.split(',').map(key => ({ ...base, ...row })[key]).join(','))].join('\n');
}

// 现金类行的默认空字段（无数量 / 单价 / 佣金）
function cashRow(row) {
  return { quantity: '', unit_price: '', commission: '', ...row };
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [{ _id: PORTFOLIO_A, name: '合成组合 现金', currency: 'USD' }],
    assets: [
      { _id: '64b000000000000000000e01', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true },
      { _id: '64b000000000000000000e02', symbol: 'XEQT.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true }
    ],
    sourceAccounts: [{ _id: SOURCE_ID, broker: 'other', alias: '合成现金账户', portfolioIds: [PORTFOLIO_A] }],
    ...extra
  });
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function body(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'standard',
    file: { name: 'synthetic-cash.csv', content },
    sourceAccount: { id: SOURCE_ID },
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

test('逐笔入账现金分红、税款、利息、现金划转与独立费用：回读实际现金币种与来源，现金分红不改变持仓', async (t) => {
  freshWorld(t);
  const content = csv([
    { quantity: '10', unit_price: '100', cash_amount: '-1000', commission: '0' },
    // 现金分红：数量 / 单价可空；美股分红以 CAD 现金入账（现金币种与资产币种不同）
    cashRow({ activity_type: 'div_cash', trade_date: '2026-03-20', cash_amount: '4.37', cash_currency: 'CAD', notes: '合成分红' }),
    // 股息预扣税：独立一行，可带标的
    cashRow({ activity_type: 'tax', trade_date: '2026-03-20', cash_amount: '-0.66', cash_currency: 'CAD' }),
    cashRow({ activity_type: 'interest', trade_date: '2026-03-31', symbol: '', market: '', cash_amount: '0.12', cash_currency: 'CAD' }),
    cashRow({ activity_type: 'cash_in', trade_date: '2026-03-01', symbol: '', market: '', cash_amount: '2000', cash_currency: 'USD' }),
    // 现金划出：方向由类型决定，正数金额也按流出记
    cashRow({ activity_type: 'cash_out', trade_date: '2026-03-25', symbol: '', market: '', cash_amount: '150', cash_currency: 'USD' }),
    cashRow({ activity_type: 'fee', trade_date: '2026-03-31', symbol: '', market: '', cash_amount: '-3.5', cash_currency: 'USD' })
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.equal(data.counts.add, 7, JSON.stringify(data.rows.filter(row => row.disposition !== 'add')));
  const divRow = data.rows[1].candidate;
  assert.deepEqual([divRow.action, divRow.quantity, divRow.price, divRow.cashAmount, divRow.cashCurrency, divRow.cashAmountSource],
    ['div_cash', null, null, 4.37, 'CAD', 'broker']);
  assert.equal(data.rows[5].candidate.cashAmount, -150);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.added, 7);

  const rows = await ledger();
  const byAction = Object.fromEntries(rows.map(tx => [tx.action, tx]));
  assert.equal(byAction.div_cash.symbol, 'VTI.US');
  assert.equal(byAction.div_cash.currency, 'USD', '资产币种快照不变');
  assert.equal(byAction.div_cash.cashCurrency, 'CAD', '实际现金币种');
  assert.equal(byAction.div_cash.cashAmount, 4.37);
  assert.equal(byAction.div_cash.quantity, undefined);
  assert.equal(byAction.div_cash.notes, '合成分红');
  assert.equal(byAction.div_cash.source.kind, 'import');
  assert.equal(byAction.div_cash.source.rowNumber, 3);
  assert.equal(String(byAction.div_cash.sourceAccountId), SOURCE_ID);
  assert.equal(byAction.tax.symbol, 'VTI.US');
  assert.equal(byAction.tax.cashAmount, -0.66);
  assert.equal(byAction.interest.symbol, undefined, '利息无标的');
  assert.equal(byAction.interest.currency, 'CAD', '无标的现金流水的币种即现金币种');
  assert.equal(byAction.cash_in.cashAmount, 2000);
  assert.equal(byAction.cash_out.cashAmount, -150);
  assert.equal(byAction.fee.cashAmount, -3.5);
  assert.equal(byAction.fee.cashCurrency, 'USD');

  const held = await positions();
  assert.equal(held.length, 1);
  assert.equal(held[0].quantity, 10);
  assert.equal(held[0].remainingCost, 1000, '现金分红、税费、划转不改变持仓成本');
});

test('现金净额优先：保存券商净额并保留分币差异；缺净额时按数量、单价与佣金推算并标明；明确零佣金维持为零', async (t) => {
  freshWorld(t);
  const content = csv([
    // 券商净额与成交金额 + 佣金相差 1 分：净额原样保存，差异展示
    { trade_date: '2026-03-02', quantity: '10', unit_price: '100', commission: '1', cash_amount: '-1001.01' },
    // 明确零佣金 + 带分币差异的净额：佣金维持 0，不按差额推算
    { trade_date: '2026-03-03', quantity: '3', unit_price: '100', commission: '0', cash_amount: '-300.03' },
    // 缺净额、佣金完整：推算净额
    { activity_type: 'sell', trade_date: '2026-03-04', quantity: '-2', unit_price: '110', commission: '0.5', cash_amount: '' },
    // 现金分红缺净额、有数量与每股金额：推算现金金额
    cashRow({ activity_type: 'div_cash', trade_date: '2026-03-20', quantity: '11', unit_price: '0.25', cash_amount: '' })
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  const [brokerNet, zeroFee, derivedNet, derivedDividend] = data.rows.map(row => row.candidate);
  assert.deepEqual([brokerNet.cashAmount, brokerNet.cashAmountSource, brokerNet.fee, brokerNet.feeSource, brokerNet.cashDifference],
    [-1001.01, 'broker', 1, 'broker', -0.01]);
  assert.deepEqual([zeroFee.fee, zeroFee.feeSource, zeroFee.cashAmount, zeroFee.cashDifference], [0, 'broker', -300.03, -0.03]);
  assert.deepEqual([derivedNet.cashAmount, derivedNet.cashAmountSource, derivedNet.cashDifference], [219.5, 'derived', null]);
  assert.deepEqual([derivedDividend.cashAmount, derivedDividend.cashAmountSource], [2.75, 'derived']);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));

  const rows = await ledger();
  const byDate = Object.fromEntries(rows.map(tx => [String(tx.date).slice(0, 10), tx]));
  assert.equal(byDate['2026-03-02'].cashAmount, -1001.01);
  assert.equal(byDate['2026-03-02'].cashAmountSource, 'broker');
  assert.equal(byDate['2026-03-03'].fee, 0);
  assert.equal(byDate['2026-03-03'].feeSource, 'broker');
  assert.equal(byDate['2026-03-04'].cashAmount, 219.5);
  assert.equal(byDate['2026-03-04'].cashAmountSource, 'derived');
  assert.equal(byDate['2026-03-20'].cashAmount, 2.75);
  assert.equal(byDate['2026-03-20'].cashAmountSource, 'derived');

  // 买入成本含费（1000 + 1 + 300）；卖出按均价减记；现金分红不改变持仓
  const [held] = await positions();
  assert.equal(held.quantity, 11);
  assert.ok(Math.abs(held.remainingCost - 1100.846153846154) < 1e-9, String(held.remainingCost));
});

test('无法推导的佣金：须人工补值或确认按零；确认后据此推算净额并回读佣金来源', async (t) => {
  freshWorld(t);
  const content = csv([
    { trade_date: '2026-03-02', quantity: '10', unit_price: '100', commission: '', cash_amount: '' },
    { activity_type: 'sell', trade_date: '2026-03-05', quantity: '4', unit_price: '120', commission: '', cash_amount: '' }
  ]);
  const first = await preview(body(content));
  assert.deepEqual(first.rows.map(row => [row.disposition, row.code]), [['review', 'FEE_UNKNOWN'], ['review', 'FEE_UNKNOWN']]);
  assert.deepEqual(first.rows.map(row => row.candidate.cashAmount), [null, null], '佣金未知时不推算净额');
  assert.equal(first.blocking, true);

  const [buyRow, sellRow] = first.rows;
  const resolutions = { [buyRow.rowKey]: { fee: 1.5 }, [sellRow.rowKey]: { confirmZeroFee: true } };
  const { preview: resolved, commit } = await previewAndCommit(body(content, { resolutions }));
  assert.deepEqual(resolved.rows.map(row => [row.candidate.fee, row.candidate.feeSource, row.candidate.cashAmount, row.candidate.cashAmountSource]),
    [[1.5, 'user', -1001.5, 'derived'], [0, 'confirmed_zero', 480, 'derived']]);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const rows = await ledger();
  const buy = rows.find(tx => tx.action === 'buy');
  const sell = rows.find(tx => tx.action === 'sell');
  assert.deepEqual([buy.fee, buy.feeSource, buy.cashAmount], [1.5, 'user', -1001.5]);
  assert.deepEqual([sell.fee, sell.feeSource, sell.cashAmount], [0, 'confirmed_zero', 480]);
});

test('分红再投：转增持仓且成本含费（沿用既有成本规则）', async (t) => {
  freshWorld(t);
  const content = csv([
    { trade_date: '2026-03-02', quantity: '10', unit_price: '100', commission: '0' },
    { activity_type: 'div_reinvest', trade_date: '2026-03-20', quantity: '0.5', unit_price: '110', commission: '0.5', cash_amount: '0' }
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.equal(data.rows[1].candidate.action, 'div_reinvest');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const [held] = await positions();
  assert.equal(held.quantity, 10.5);
  assert.equal(held.remainingCost, 1000 + 55 + 0.5);
});

test('Transaction 模型校验：现金流水可无标的 / 数量 / 单价；影响持仓的动作仍必填（内存替身不跑校验，故单独断言）', () => {
  const Transaction = require('@portomind/shared/models/transaction');
  const interest = new Transaction({ portfolioId: PORTFOLIO_A, action: 'interest', currency: 'CAD', cashAmount: 0.12, cashCurrency: 'CAD', date: new Date() });
  assert.equal(interest.validateSync(), undefined);
  const dividend = new Transaction({ portfolioId: PORTFOLIO_A, action: 'div_cash', symbol: 'VTI.US', assetType: 'etf', market: 'US', currency: 'USD', cashAmount: 4.37, cashCurrency: 'CAD', date: new Date() });
  assert.equal(dividend.validateSync(), undefined);
  const buy = new Transaction({ portfolioId: PORTFOLIO_A, action: 'buy', currency: 'USD', date: new Date() });
  const errors = Object.keys(buy.validateSync().errors).sort();
  assert.deepEqual(errors, ['assetType', 'market', 'price', 'quantity', 'symbol']);
});

// 已入账的同来源现金流水（合成）
function existingCash(overrides) {
  return {
    _id: overrides._id,
    portfolioId: PORTFOLIO_A,
    sourceAccountId: SOURCE_ID,
    source: { kind: 'import', format: 'standard', externalId: null },
    currency: overrides.cashCurrency,
    fee: 0,
    dateKind: 'date',
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides
  };
}

test('无编号现金流水：同来源同日同类型同币种同金额进入人工核对；有标的的分红另比标的；确认后回读处置与来源', async (t) => {
  const world = freshWorld(t, {
    transactions: [
      existingCash({ _id: '64b000000000000000000f01', action: 'interest', date: new Date('2026-03-31T00:00:00Z'), cashAmount: 0.12, cashCurrency: 'CAD' }),
      existingCash({ _id: '64b000000000000000000f02', action: 'div_cash', symbol: 'VTI.US', assetType: 'etf', market: 'US', currency: 'USD',
        date: new Date('2026-03-20T00:00:00Z'), cashAmount: 4.37, cashCurrency: 'CAD' })
    ]
  });
  const content = csv([
    cashRow({ activity_type: 'interest', trade_date: '2026-03-31', symbol: '', market: '', cash_amount: '0.12', cash_currency: 'CAD' }),
    // 同日同额但币种不同 / 金额不同 / 类型不同：不是重复
    cashRow({ activity_type: 'interest', trade_date: '2026-03-31', symbol: '', market: '', cash_amount: '0.12', cash_currency: 'USD' }),
    cashRow({ activity_type: 'interest', trade_date: '2026-03-31', symbol: '', market: '', cash_amount: '0.13', cash_currency: 'CAD' }),
    cashRow({ activity_type: 'cash_in', trade_date: '2026-03-31', symbol: '', market: '', cash_amount: '0.12', cash_currency: 'CAD' }),
    // 有标的的分红：同标的 → 核对；不同标的同额 → 新增
    cashRow({ activity_type: 'div_cash', trade_date: '2026-03-20', cash_amount: '4.37', cash_currency: 'CAD' }),
    cashRow({ activity_type: 'div_cash', trade_date: '2026-03-20', symbol: 'XEQT', market: 'CA', cash_amount: '4.37', cash_currency: 'CAD' })
  ]);
  const first = await preview(body(content));
  assert.deepEqual(first.rows.map(row => [row.disposition, row.code]), [
    ['review', 'CASH_DUPLICATE'], ['add', null], ['add', null], ['add', null], ['review', 'CASH_DUPLICATE'], ['add', null]
  ]);
  const [interestRow, , , , dividendRow] = first.rows;
  assert.deepEqual(interestRow.options.sort(), ['add', 'skip']);
  assert.equal(interestRow.matches[0].id, '64b000000000000000000f01');
  assert.equal(interestRow.matches[0].transaction.cashAmount, 0.12);
  assert.equal(dividendRow.matches[0].id, '64b000000000000000000f02');
  assert.equal(first.blocking, true, '待核对行阻塞整批');

  const resolutions = { [interestRow.rowKey]: { action: 'add' }, [dividendRow.rowKey]: { action: 'skip' } };
  const { commit } = await previewAndCommit(body(content, { resolutions }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const result = commit.body.data;
  assert.equal(result.added, 5);
  assert.equal(result.skipped, 1);
  const interestResult = result.rows.find(row => row.rowKey === interestRow.rowKey);
  const dividendResult = result.rows.find(row => row.rowKey === dividendRow.rowKey);
  assert.equal(interestResult.disposition, 'add');
  assert.equal(dividendResult.disposition, 'skip');
  assert.equal(dividendResult.transactionId, null);

  const written = world.transactions.find(tx => String(tx._id) === interestResult.transactionId);
  assert.equal(written.source.rowNumber, interestRow.rowNumber);
  assert.equal(String(written.sourceAccountId), SOURCE_ID);
  assert.equal(world.transactions.filter(tx => tx.action === 'div_cash' && tx.symbol === 'VTI.US').length, 1, '跳过的分红未重复入账');
});

test('同文件无编号现金流水重复：后一行进入人工核对；有编号的现金流水按编号识别，内容一致直接跳过', async (t) => {
  freshWorld(t, {
    transactions: [
      existingCash({ _id: '64b000000000000000000f03', action: 'fee', date: new Date('2026-03-31T00:00:00Z'), cashAmount: -3.5, cashCurrency: 'USD',
        source: { kind: 'import', format: 'standard', externalId: 'SYN-FEE-1' } })
    ]
  });
  const content = csv([
    cashRow({ activity_type: 'cash_in', trade_date: '2026-03-01', symbol: '', market: '', cash_amount: '500', cash_currency: 'USD' }),
    cashRow({ activity_type: 'cash_in', trade_date: '2026-03-01', symbol: '', market: '', cash_amount: '500', cash_currency: 'USD' }),
    cashRow({ activity_type: 'fee', trade_date: '2026-03-31', external_id: 'SYN-FEE-1', symbol: '', market: '', cash_amount: '-3.5', cash_currency: 'USD' })
  ]);
  const data = await preview(body(content));
  assert.deepEqual(data.rows.map(row => [row.disposition, row.code]), [
    ['add', null], ['review', 'CASH_DUPLICATE_IN_FILE'], ['skip', 'ALREADY_IMPORTED']
  ]);
  assert.equal(data.rows[1].duplicateOf.rowNumber, data.rows[0].rowNumber);
  assert.deepEqual(data.rows[1].options.sort(), ['add', 'skip']);
});
