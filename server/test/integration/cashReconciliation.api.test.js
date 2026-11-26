// server/test/integration/cashReconciliation.api.test.js
//
// TASK-103（#103，Spec #93 AC-02 / AC-08）：按来源账户与实际币种核对已结算现金。
// 同一来源账户的流水经两个组合分别导入（标准 CSV），再从
// POST /api/source-accounts/:id/cash-reconciliation 按币种读回变动、缺项与差额。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 内存替身。全部为合成数据。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');
const marketData = require('@portomind/shared/services/marketData.service');

const PORTFOLIO_A = '64b000000000000000000c11';
const PORTFOLIO_B = '64b000000000000000000c12';
const SOURCE_ID = '64b000000000000000000c21';
const OTHER_SOURCE_ID = '64b000000000000000000c22';
const PERIOD = { from: '2026-03-01', to: '2026-03-31' };

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

const HEADER = 'activity_type,trade_date,settlement_date,external_id,pair_group,symbol,market,quantity,unit_price,cash_amount,cash_currency,commission,notes';

function csv(rows) {
  const base = {
    activity_type: '', trade_date: '', settlement_date: '', external_id: '', pair_group: '',
    symbol: '', market: '', quantity: '', unit_price: '', cash_amount: '', cash_currency: '', commission: '', notes: ''
  };
  return [HEADER, ...rows.map(row => HEADER.split(',').map(key => ({ ...base, ...row })[key]).join(','))].join('\n');
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [
      { _id: PORTFOLIO_A, name: '合成组合 甲', currency: 'CAD' },
      { _id: PORTFOLIO_B, name: '合成组合 乙', currency: 'CAD' }
    ],
    assets: [
      { _id: '64b000000000000000000c31', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true }
    ],
    sourceAccounts: [
      { _id: SOURCE_ID, broker: 'other', alias: '合成核对账户', portfolioIds: [PORTFOLIO_A, PORTFOLIO_B] },
      { _id: OTHER_SOURCE_ID, broker: 'other', alias: '合成其他账户', portfolioIds: [PORTFOLIO_A] }
    ],
    ...extra
  });
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

async function importInto(portfolioId, rows, { sourceId = SOURCE_ID, fileName = 'synthetic-cash.csv' } = {}) {
  const input = {
    portfolioId,
    format: 'standard',
    file: { name: fileName, content: csv(rows) },
    sourceAccount: { id: sourceId }
  };
  const preview = await call('POST', '/api/transactions/import/preview', input);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...input, previewToken: preview.body.data.previewToken, ledgerFingerprint: preview.body.data.ledgerFingerprint
  });
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  return commit.body.data;
}

// 甲组合：CAD 划入、CAD→USD 换汇两端、USD 买入（已知结算日 3-04）；乙组合：CAD 利息、USD 利息。
// CAD 变动 = 1000 − 1370 + 5 = −365；USD 变动 = 1000 − 100 + 2 = 902。
const ROWS_A = [
  { activity_type: 'cash_in', trade_date: '2026-03-02', cash_amount: '1000', cash_currency: 'CAD' },
  { activity_type: 'fx', trade_date: '2026-03-02', pair_group: 'FX-1', cash_amount: '-1370', cash_currency: 'CAD' },
  { activity_type: 'fx', trade_date: '2026-03-02', pair_group: 'FX-1', cash_amount: '1000', cash_currency: 'USD' },
  {
    activity_type: 'buy', trade_date: '2026-03-03', settlement_date: '2026-03-04', external_id: 'T-1',
    symbol: 'VTI', market: 'US', quantity: '1', unit_price: '100', commission: '0', cash_amount: '-100', cash_currency: 'USD'
  }
];
const ROWS_B = [
  { activity_type: 'interest', trade_date: '2026-03-20', cash_amount: '5', cash_currency: 'CAD' },
  { activity_type: 'interest', trade_date: '2026-03-21', cash_amount: '2', cash_currency: 'USD' }
];

async function seedTwoPortfolios() {
  await importInto(PORTFOLIO_A, ROWS_A);
  await importInto(PORTFOLIO_B, ROWS_B);
}

async function reconcile(body, sourceId = SOURCE_ID) {
  const response = await call('POST', `/api/source-accounts/${sourceId}/cash-reconciliation`, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

function byCurrency(data) {
  return Object.fromEntries(data.currencies.map(entry => [entry.currency, entry]));
}

function codes(entry) {
  return entry.missing.map(item => item.code).sort();
}

test('资料齐备且期末一致：同一账户两个组合、两种币种各自标记「余额已核对」', async (t) => {
  freshWorld(t);
  await seedTwoPortfolios();

  const data = await reconcile({
    ...PERIOD,
    balances: { CAD: { opening: 2000, closing: 1635 }, USD: { opening: 0, closing: 902 } }
  });

  assert.equal(data.reconciled, true);
  assert.equal(data.sourceAccount.id, SOURCE_ID);
  const { CAD, USD } = byCurrency(data);
  assert.deepEqual(data.currencies.map(entry => entry.currency).sort(), ['CAD', 'USD']);

  assert.equal(CAD.status, 'reconciled');
  assert.equal(CAD.statusLabel, '余额已核对');
  assert.equal(CAD.knownChange, -365);
  assert.equal(CAD.computedClosing, 1635);
  assert.equal(CAD.difference, 0);
  assert.deepEqual(CAD.missing, []);
  assert.deepEqual(CAD.unknownSettlement, []);
  assert.deepEqual(
    CAD.portfolios.map(entry => [entry.portfolioId, entry.portfolioName, entry.knownChange, entry.count]).sort(),
    [[PORTFOLIO_A, '合成组合 甲', -370, 2], [PORTFOLIO_B, '合成组合 乙', 5, 1]]
  );

  assert.equal(USD.status, 'reconciled');
  assert.equal(USD.knownChange, 902);
  assert.equal(USD.difference, 0);
  // 已结算成交按结算日归入
  const buy = USD.items.find(item => item.action === 'buy');
  assert.deepEqual([buy.cashDate, buy.cashDateBasis, buy.cashAmount], ['2026-03-04', 'settlement', -100]);

  // 换汇两端各归对应币种，并互指对方（组号 + 导入批次分组）
  const cadLeg = CAD.items.find(item => item.action === 'fx');
  const usdLeg = USD.items.find(item => item.action === 'fx');
  assert.equal(cadLeg.cashAmount, -1370);
  assert.equal(usdLeg.cashAmount, 1000);
  assert.equal(cadLeg.pair.groupId, 'FX-1');
  assert.equal(cadLeg.pair.key, usdLeg.pair.key);
  assert.deepEqual([cadLeg.pair.counterpart.currency, cadLeg.pair.counterpart.cashAmount], ['USD', 1000]);
  assert.deepEqual([usdLeg.pair.counterpart.currency, usdLeg.pair.counterpart.cashAmount], ['CAD', -1370]);
  // 规则 10：不出现跨币种合计
  assert.equal(data.currencies.some(entry => 'total' in entry || 'totalCny' in entry), false);
});

test('期初缺失：仍展示各币种已知变动，缺项列出期初余额，计算期末与差额为 null', async (t) => {
  freshWorld(t);
  await seedTwoPortfolios();

  const data = await reconcile({ ...PERIOD, balances: { CAD: { closing: 1635 }, USD: { opening: 0, closing: 902 } } });

  assert.equal(data.reconciled, false);
  const { CAD, USD } = byCurrency(data);
  assert.equal(CAD.status, 'unreconciled');
  assert.notEqual(CAD.statusLabel, '余额已核对');
  assert.equal(CAD.knownChange, -365);
  assert.equal(CAD.items.length, 3);
  assert.equal(CAD.openingBalance, null);
  assert.equal(CAD.computedClosing, null);
  assert.equal(CAD.difference, null);
  assert.deepEqual(codes(CAD), ['OPENING_BALANCE_MISSING']);
  // 另一币种齐备且一致，不受影响
  assert.equal(USD.status, 'reconciled');
});

test('结算日未知：成交单列且不计入已知变动，该币种不标记已核对', async (t) => {
  freshWorld(t);
  await importInto(PORTFOLIO_A, [
    ...ROWS_A,
    {
      activity_type: 'buy', trade_date: '2026-03-25', external_id: 'T-2',
      symbol: 'VTI', market: 'US', quantity: '1', unit_price: '50', commission: '0', cash_amount: '-50', cash_currency: 'USD'
    }
  ]);
  await importInto(PORTFOLIO_B, ROWS_B);

  const data = await reconcile({
    ...PERIOD,
    balances: { CAD: { opening: 2000, closing: 1635 }, USD: { opening: 0, closing: 852 } }
  });

  assert.equal(data.reconciled, false);
  const { CAD, USD } = byCurrency(data);
  assert.equal(CAD.status, 'reconciled');
  assert.equal(USD.status, 'unreconciled');
  assert.equal(USD.knownChange, 902);
  assert.equal(USD.items.some(item => item.cashAmount === -50), false);
  assert.equal(USD.unknownSettlement.length, 1);
  assert.deepEqual(
    [USD.unknownSettlement[0].tradeDate, USD.unknownSettlement[0].settlementStatus, USD.unknownSettlement[0].cashAmount],
    ['2026-03-25', 'unknown', -50]
  );
  assert.deepEqual(codes(USD), ['BALANCE_MISMATCH', 'SETTLEMENT_UNKNOWN']);
  assert.equal(USD.missing.find(item => item.code === 'SETTLEMENT_UNKNOWN').count, 1);
  assert.equal(USD.difference, -50);
});

test('期末与券商不一致：给出计算期末与差额，不标记已核对', async (t) => {
  freshWorld(t);
  await seedTwoPortfolios();

  const data = await reconcile({
    ...PERIOD,
    balances: { CAD: { opening: 2000, closing: 1640.25 }, USD: { opening: 0, closing: 902 } }
  });

  const { CAD, USD } = byCurrency(data);
  assert.equal(data.reconciled, false);
  assert.equal(CAD.status, 'unreconciled');
  assert.equal(CAD.computedClosing, 1635);
  assert.equal(CAD.difference, 5.25);
  assert.deepEqual(codes(CAD), ['BALANCE_MISMATCH']);
  assert.equal(USD.status, 'reconciled');
});

test('期间流水不完整：未提交的 pending 行不计入变动但列为缺项；其他账户与期间外流水不计入', async (t) => {
  const world = freshWorld(t);
  await seedTwoPortfolios();
  // 其他来源账户同组合、同币种的流水
  await importInto(PORTFOLIO_A, [{ activity_type: 'interest', trade_date: '2026-03-05', cash_amount: '7', cash_currency: 'CAD' }],
    { sourceId: OTHER_SOURCE_ID, fileName: 'synthetic-other.csv' });
  // 期间外的流水
  await importInto(PORTFOLIO_B, [{ activity_type: 'interest', trade_date: '2026-04-01', cash_amount: '9', cash_currency: 'CAD' }],
    { fileName: 'synthetic-april.csv' });
  // 提交中断残留的 pending 行（对所有读取方不可见）
  world.transactions.push({
    _id: '64b000000000000000000c99', portfolioId: PORTFOLIO_B, sourceAccountId: SOURCE_ID, action: 'interest',
    currency: 'CAD', cashAmount: 11, cashCurrency: 'CAD', date: new Date('2026-03-15T00:00:00Z'), dateKind: 'date', status: 'pending'
  });

  const data = await reconcile({
    ...PERIOD,
    balances: { CAD: { opening: 2000, closing: 1635 }, USD: { opening: 0, closing: 902 } }
  });

  const { CAD, USD } = byCurrency(data);
  assert.equal(CAD.knownChange, -365);
  assert.equal(CAD.difference, 0);
  assert.equal(CAD.status, 'unreconciled');
  assert.deepEqual(codes(CAD), ['IMPORT_PENDING']);
  assert.equal(USD.status, 'reconciled');
});

test('换汇缺另一端：该端仍计入本币种变动，标记换汇不完整', async (t) => {
  const world = freshWorld(t);
  await seedTwoPortfolios();
  // 模拟换汇一端被删除
  const index = world.transactions.findIndex(tx => tx.action === 'fx' && tx.cashCurrency === 'USD');
  world.transactions.splice(index, 1);

  const data = await reconcile({
    ...PERIOD,
    balances: { CAD: { opening: 2000, closing: 1635 }, USD: { opening: 0, closing: -98 } }
  });

  const { CAD, USD } = byCurrency(data);
  assert.equal(CAD.knownChange, -365);
  assert.deepEqual(codes(CAD), ['FX_PAIR_INCOMPLETE']);
  assert.equal(CAD.items.find(item => item.action === 'fx').pair.counterpart, null);
  assert.equal(USD.status, 'reconciled');
});

test('入参校验：期间无效 400，未知币种 400，来源账户不存在 404', async (t) => {
  freshWorld(t);
  const badPeriod = await call('POST', `/api/source-accounts/${SOURCE_ID}/cash-reconciliation`, { from: '2026-03-31', to: '2026-03-01' });
  assert.equal(badPeriod.status, 400);
  assert.equal(badPeriod.body.code, 'INVALID_PERIOD');
  const badCurrency = await call('POST', `/api/source-accounts/${SOURCE_ID}/cash-reconciliation`, { ...PERIOD, balances: { EUR: { opening: 1 } } });
  assert.equal(badCurrency.status, 400);
  assert.equal(badCurrency.body.code, 'INVALID_CURRENCY');
  const missing = await call('POST', '/api/source-accounts/64b000000000000000000cff/cash-reconciliation', PERIOD);
  assert.equal(missing.status, 404);
});
