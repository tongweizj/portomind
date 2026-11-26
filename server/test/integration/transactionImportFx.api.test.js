// server/test/integration/transactionImportFx.api.test.js
//
// TASK-101（#101）：换汇两端流水的配对（显式组号 / 同账户同日唯一建议 / 多候选由用户指定）、
// 共同确认入账与回读，以及成对流水在第 500 / 501 行时的拆批边界。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 内存替身。全部为合成数据。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');
const marketData = require('@portomind/shared/services/marketData.service');

const PORTFOLIO_A = '64b000000000000000000a11';
const SOURCE_ID = '64b000000000000000000a21';

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

const HEADER = 'activity_type,trade_date,external_id,pair_group,account_number,symbol,market,quantity,unit_price,cash_amount,cash_currency,commission,notes';

function csv(rows) {
  const base = {
    activity_type: 'fx', trade_date: '2026-04-02', external_id: '', pair_group: '', account_number: '',
    symbol: '', market: '', quantity: '', unit_price: '', cash_amount: '', cash_currency: 'CAD', commission: '', notes: ''
  };
  return [HEADER, ...rows.map(row => HEADER.split(',').map(key => ({ ...base, ...row })[key]).join(','))].join('\n');
}

function buyRow(row = {}) {
  return { activity_type: 'buy', symbol: 'VTI', market: 'US', quantity: '1', unit_price: '100', cash_currency: 'USD', commission: '0', ...row };
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [{ _id: PORTFOLIO_A, name: '合成组合 换汇', currency: 'CAD' }],
    assets: [
      { _id: '64b000000000000000000a31', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true }
    ],
    sourceAccounts: [{ _id: SOURCE_ID, broker: 'other', alias: '合成换汇账户', portfolioIds: [PORTFOLIO_A] }],
    ...extra
  }, extra.hooks);
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function body(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'standard',
    file: { name: 'synthetic-fx.csv', content },
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

test('显式组号的换汇两端：预览互指对方，共同确认后回读两端各自币种与带符号金额', async (t) => {
  freshWorld(t);
  const content = csv([
    { pair_group: 'FX-1', cash_amount: '-1370.00', cash_currency: 'CAD', notes: '合成换汇 卖出端' },
    { pair_group: 'FX-1', cash_amount: '1000.00', cash_currency: 'USD' }
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.deepEqual(data.rows.map(row => row.disposition), ['add', 'add'], JSON.stringify(data.rows));
  const [cadLeg, usdLeg] = data.rows;
  assert.deepEqual(cadLeg.pair, { groupId: 'FX-1', source: 'explicit', partnerRowKey: usdLeg.rowKey, partnerRowNumber: usdLeg.rowNumber });
  assert.equal(usdLeg.pair.partnerRowKey, cadLeg.rowKey);
  assert.deepEqual([cadLeg.candidate.action, cadLeg.candidate.cashAmount, cadLeg.candidate.cashCurrency], ['fx', -1370, 'CAD']);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.added, 2);

  const rows = await ledger();
  const fx = rows.filter(tx => tx.action === 'fx').sort((a, b) => a.cashAmount - b.cashAmount);
  assert.equal(fx.length, 2);
  assert.deepEqual(fx.map(tx => [tx.cashCurrency, tx.currency, tx.cashAmount, tx.pairGroupId, tx.symbol]),
    [['CAD', 'CAD', -1370, 'FX-1', undefined], ['USD', 'USD', 1000, 'FX-1', undefined]]);
  assert.equal(fx[0].notes, '合成换汇 卖出端');
});

test('未填组号：同账户同日唯一一对相容两端（不相邻）→ 提出配对建议，确认后两端以同一组号入账', async (t) => {
  freshWorld(t);
  const content = csv([
    { trade_date: '2026-04-02', account_number: 'SYN00001', cash_amount: '-685.00', cash_currency: 'CAD' },
    buyRow({ trade_date: '2026-04-02', account_number: 'SYN00001' }),
    { trade_date: '2026-04-02', account_number: 'SYN00001', cash_amount: '500.00', cash_currency: 'USD' },
    // 另一日的一对
    { trade_date: '2026-04-09', account_number: 'SYN00001', cash_amount: '-200.00', cash_currency: 'USD' },
    { trade_date: '2026-04-09', account_number: 'SYN00001', cash_amount: '272.00', cash_currency: 'CAD' }
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.deepEqual(data.rows.map(row => row.disposition), ['add', 'add', 'add', 'add', 'add'], JSON.stringify(data.rows.map(r => r.reason)));
  const [cad, , usd, usd2, cad2] = data.rows;
  assert.equal(cad.pair.source, 'suggested');
  assert.equal(cad.pair.partnerRowKey, usd.rowKey);
  assert.equal(usd.pair.groupId, cad.pair.groupId);
  assert.equal(usd2.pair.partnerRowKey, cad2.rowKey);
  assert.notEqual(usd2.pair.groupId, cad.pair.groupId);
  assert.equal(data.rows[1].pair, null, '成交行不参与配对');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));

  const fx = (await ledger()).filter(tx => tx.action === 'fx');
  assert.equal(fx.length, 4);
  const groups = new Map();
  for (const tx of fx) groups.set(tx.pairGroupId, [...(groups.get(tx.pairGroupId) || []), `${tx.cashCurrency}${tx.cashAmount}`]);
  assert.deepEqual([...groups.values()].map(legs => legs.sort()).sort(), [['CAD-685', 'USD500'], ['CAD272', 'USD-200']]);
});

test('同账户同日多种可能：两端均待核对并列出候选，未指定前整批不写入；用户指定后共同入账', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { cash_amount: '-1370.00', cash_currency: 'CAD' },
    { cash_amount: '-685.00', cash_currency: 'CAD' },
    { cash_amount: '1000.00', cash_currency: 'USD' }
  ]);
  const first = await preview(body(content));
  assert.deepEqual(first.rows.map(row => row.code), ['FX_PAIR_AMBIGUOUS', 'FX_PAIR_AMBIGUOUS', 'FX_PAIR_AMBIGUOUS']);
  assert.deepEqual(first.rows[2].pairCandidates.map(item => item.rowKey), [first.rows[0].rowKey, first.rows[1].rowKey]);
  assert.deepEqual(first.rows[0].options, ['pairWith', 'skip']);
  assert.equal(first.blocking, true);
  const blocked = await call('POST', '/api/transactions/import/commit', {
    ...body(content), previewToken: first.previewToken, ledgerFingerprint: first.ledgerFingerprint
  });
  assert.equal(blocked.status, 422);
  assert.equal(world.transactions.length, 0, '未配对时两端均不入账');

  // 指定 USD 端与第 1 行配对；剩余的 CAD 端无另一端 → 只能跳过
  const [big, small, usd] = first.rows;
  const chosen = await preview(body(content, { resolutions: { [usd.rowKey]: { pairWith: big.rowKey } } }));
  assert.deepEqual(chosen.rows.map(row => [row.disposition, row.code]), [['add', null], ['review', 'FX_UNPAIRED'], ['add', null]]);
  assert.equal(chosen.rows[0].pair.source, 'user');
  assert.deepEqual(chosen.rows[1].options, ['skip']);

  const resolutions = { [usd.rowKey]: { pairWith: big.rowKey }, [small.rowKey]: { action: 'skip' } };
  const { commit } = await previewAndCommit(body(content, { resolutions }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const fx = (await ledger()).filter(tx => tx.action === 'fx');
  assert.deepEqual(fx.map(tx => tx.cashAmount).sort((a, b) => a - b), [-1370, 1000]);
  assert.equal(fx[0].pairGroupId, fx[1].pairGroupId);
});

test('无法配对或组号不完整的单端：待核对阻塞；组号两端不相容按行报错；换汇不填标的', async (t) => {
  const world = freshWorld(t);
  const lonely = csv([
    { pair_group: 'G-1', cash_amount: '-100', cash_currency: 'CAD' },
    { cash_amount: '50', cash_currency: 'USD', trade_date: '2026-04-03' },
    buyRow()
  ]);
  const data = await preview(body(lonely));
  assert.deepEqual(data.rows.map(row => [row.disposition, row.code]),
    [['review', 'FX_PAIR_INCOMPLETE'], ['review', 'FX_UNPAIRED'], ['add', null]]);
  assert.equal(data.blocking, true);

  const bad = csv([
    { pair_group: 'G-2', cash_amount: '-100', cash_currency: 'CAD' },
    { pair_group: 'G-2', cash_amount: '-70', cash_currency: 'CAD' }
  ]);
  const invalid = await preview(body(bad));
  assert.deepEqual(invalid.rows.map(row => [row.disposition, row.code]), [['error', 'FX_PAIR_INVALID'], ['error', 'FX_PAIR_INVALID']]);
  assert.equal(world.transactions.length, 0);

  const symbolOnFx = await preview(body(csv([{ symbol: 'VTI', cash_amount: '-1', cash_currency: 'CAD' }])));
  assert.equal(symbolOnFx.rows[0].code, 'INVALID_FIELD');
});

test('已入账的换汇再次导入：两端同为现金重复待核对；只跳过一端时另一端不能单独入账', async (t) => {
  freshWorld(t);
  let content = csv([
    { pair_group: 'FX-9', cash_amount: '-1370', cash_currency: 'CAD' },
    { pair_group: 'FX-9', cash_amount: '1000', cash_currency: 'USD' }
  ]);
  const first = await previewAndCommit(body(content));
  assert.equal(first.commit.status, 201);

  // 决定 8：同一文件重新上传 → 同行号同内容的两端都自动跳过
  const same = await preview(body(content));
  assert.deepEqual(same.rows.map(row => row.code), ['ALREADY_IMPORTED', 'ALREADY_IMPORTED']);

  // 另一份报表（行号不同）里的同额换汇：两端按现金重复人工核对
  const other = csv([
    { pair_group: 'FX-9', cash_amount: '1000', cash_currency: 'USD' },
    { pair_group: 'FX-9', cash_amount: '-1370', cash_currency: 'CAD' }
  ]);
  const again = await preview(body(other));
  assert.deepEqual(again.rows.map(row => row.code), ['CASH_DUPLICATE', 'CASH_DUPLICATE']);
  const [usd, cad] = again.rows;
  content = other;
  const half = await preview(body(content, { resolutions: { [cad.rowKey]: { action: 'skip' }, [usd.rowKey]: { action: 'add' } } }));
  assert.deepEqual(half.rows.map(row => [row.disposition, row.code]), [['review', 'FX_PARTNER_SKIPPED'], ['skip', 'CASH_DUPLICATE']]);
  assert.equal(half.blocking, true);

  const both = await preview(body(content, { resolutions: { [cad.rowKey]: { action: 'skip' }, [usd.rowKey]: { action: 'skip' } } }));
  assert.deepEqual(both.rows.map(row => row.disposition), ['skip', 'skip']);
});

test('写入中断：换汇两端都不可见，无单边结果', async (t) => {
  const world = freshWorld(t, { hooks: { beforeFlip: async () => { throw new Error('simulated crash'); } } });
  const content = csv([
    { cash_amount: '-1370', cash_currency: 'CAD' },
    { cash_amount: '1000', cash_currency: 'USD' }
  ]);
  const { commit } = await previewAndCommit(body(content));
  assert.equal(commit.status, 500);
  assert.equal(world.transactions.length, 0);
  assert.equal((await ledger()).length, 0);
  assert.equal(world.importBatches[0].status, 'rolled_back');
});

function manyBuys(count) {
  return Array.from({ length: count }, (_, index) => buyRow({
    trade_date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`, external_id: `SYN-B-${index}`
  }));
}

test('建议配对的两端落在第 500 / 501 行：拆批边界前移，第 1 批 499 条，两端同在第 2 批', async (t) => {
  freshWorld(t);
  const rows = [
    ...manyBuys(499),
    { cash_amount: '-1370', cash_currency: 'CAD', trade_date: '2026-04-20' },
    { cash_amount: '1000', cash_currency: 'USD', trade_date: '2026-04-20' }
  ];
  const { preview: data, commit } = await previewAndCommit(body(csv(rows)));
  assert.equal(data.rows[499].pair.partnerRowKey, data.rows[500].rowKey);
  assert.deepEqual(data.batches.map(batch => batch.count), [499, 2]);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.added, 499);
  assert.deepEqual(commit.body.data.rows.slice(499).map(row => row.disposition), ['deferred', 'deferred']);

  // 下一次确认：已入账 499 行跳过，两端在同一批共同入账
  const next = await previewAndCommit(body(csv(rows)));
  assert.equal(next.commit.status, 201, JSON.stringify(next.commit.body));
  assert.equal(next.commit.body.data.added, 2);
  const fx = (await ledger()).filter(tx => tx.action === 'fx');
  assert.equal(fx.length, 2);
  assert.equal(fx[0].pairGroupId, fx[1].pairGroupId);
});
