// server/test/integration/transactionImport.transfer.test.js
//
// TASK-099（#99）：跨账户及跨组合证券划转（Spec #93 AC-07、AC-09、AC-10）。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 的内存替身，不连接 MongoDB。
// 全部样例为合成数据（仓库为 public，禁止使用真实券商报表）。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const marketData = require('@portomind/shared/services/marketData.service');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');

const PORTFOLIO_A = '64b000000000000000000a01';
const PORTFOLIO_B = '64b000000000000000000a02';
const PORTFOLIO_C = '64b000000000000000000a03';

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
  return { status: response.status, body: await response.json().catch(() => null) };
}

const HEADER = 'activity_type,trade_date,source_row,pair_group,symbol,market,quantity,unit_price,' +
  'cash_currency,commission,transfer_cost,transfer_cost_currency,transfer_fx_rate,notes';

function csv(rows) {
  const line = row => {
    const base = {
      activity_type: 'buy', trade_date: '2026-03-02', source_row: '', pair_group: '', symbol: 'VTI', market: 'US',
      quantity: '10', unit_price: '100', cash_currency: 'USD', commission: '0', transfer_cost: '',
      transfer_cost_currency: '', transfer_fx_rate: '', notes: '', ...row
    };
    return HEADER.split(',').map(key => base[key]).join(',');
  };
  return [HEADER, ...rows.map(line)].join('\n');
}

const ASSETS = [
  { _id: '64b000000000000000000b01', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true },
  { _id: '64b000000000000000000b02', symbol: 'XEQ.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true },
  { _id: '64b000000000000000000b03', symbol: 'XEQ.US', type: 'etf', market: 'US', currency: 'USD', active: true }
];

function buyTx(overrides = {}) {
  return {
    _id: `64b0000000000000000c${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`,
    portfolioId: PORTFOLIO_A,
    symbol: 'VTI.US', assetType: 'etf', market: 'US', currency: 'USD',
    action: 'buy', quantity: 10, price: 100, fee: 0,
    date: new Date('2026-01-05T00:00:00.000Z'),
    createdAt: new Date('2026-01-05T00:00:00.000Z'), updatedAt: new Date('2026-01-05T00:00:00.000Z'),
    ...overrides
  };
}

function freshWorld(t, extra = {}, hooks = {}) {
  const world = installImportWorld(t, {
    portfolios: [
      { _id: PORTFOLIO_A, name: '合成组合 A', currency: 'USD' },
      { _id: PORTFOLIO_B, name: '合成组合 B', currency: 'USD' },
      { _id: PORTFOLIO_C, name: '合成组合 C', currency: 'CAD' }
    ],
    assets: ASSETS,
    ...extra
  }, hooks);
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function body(portfolioId, content, overrides = {}) {
  return {
    portfolioId,
    format: 'standard',
    file: { name: 'synthetic-transfer.csv', content },
    sourceAccount: { broker: 'other', alias: `合成账户-${portfolioId.slice(-2)}` },
    ...overrides
  };
}

const preview = input => call('POST', '/api/transactions/import/preview', input);

async function commitFrom(input, data) {
  return call('POST', '/api/transactions/import/commit', {
    ...input,
    previewToken: data.previewToken,
    ledgerFingerprint: data.ledgerFingerprint
  });
}

async function previewAndCommit(input) {
  const first = await preview(input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const commit = await commitFrom(input, first.body.data);
  return { preview: first.body.data, commit };
}

async function positionOf(portfolioId, symbol) {
  const response = await call('GET', `/api/portfolios/${portfolioId}/stats/positions`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data.find(item => item.symbol === symbol) || null;
}

const visible = world => world.transactions.filter(tx => tx.status !== 'pending');

// ─────────────────────────────────────────────────────────────
// 先到的一端：暂存待核对，两边账本不变
// ─────────────────────────────────────────────────────────────

test('只收到转出端：预览标记待核对（暂存），确认后两边账本均不变，暂存一端可查询', async (t) => {
  const world = freshWorld(t, { transactions: [buyTx()] });
  const input = body(PORTFOLIO_A, csv([{ activity_type: 'transfer_out', trade_date: '2026-03-02', quantity: '-4', unit_price: '' }]));
  const { preview: data, commit } = await previewAndCommit(input);
  const row = data.rows[0];
  assert.equal(row.disposition, 'stage');
  assert.equal(row.code, 'TRANSFER_AWAITING_COUNTERPART');
  assert.equal(data.counts.stage, 1);
  assert.equal(data.blocking, false);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.staged, 1);
  assert.equal(commit.body.data.added, 0);

  assert.equal(world.transactions.length, 1, '账本未写入任何划转流水');
  const position = await positionOf(PORTFOLIO_A, 'VTI.US');
  assert.equal(position.quantity, 10);

  const staged = await call('GET', '/api/transactions/import/transfers');
  assert.equal(staged.status, 200, JSON.stringify(staged.body));
  assert.equal(staged.body.data.length, 1);
  assert.equal(staged.body.data[0].direction, 'out');
  assert.equal(staged.body.data[0].portfolioId, PORTFOLIO_A);
  assert.equal(staged.body.data[0].symbol, 'VTI.US');
  assert.equal(staged.body.data[0].quantity, 4);
  assert.ok(staged.body.data[0].sourceAccountId);

  // 再次导入同一报表：已暂存的一端识别为重复并跳过，不重复暂存
  const again = await preview({ ...input, sourceAccount: { id: commit.body.data.sourceAccountId } });
  assert.equal(again.body.data.rows[0].disposition, 'skip');
  assert.equal(again.body.data.rows[0].code, 'TRANSFER_ALREADY_STAGED');
});

// ─────────────────────────────────────────────────────────────
// 后一端到达：自动配对，共同确认跨组合入账
// ─────────────────────────────────────────────────────────────

async function stageOut(t, extra = {}, outRow = {}) {
  const world = freshWorld(t, { transactions: [buyTx(), buyTx({ price: 200, date: new Date('2026-01-06T00:00:00.000Z') })], ...extra });
  const first = await previewAndCommit(body(PORTFOLIO_A, csv([{
    activity_type: 'transfer_out', trade_date: '2026-03-02', source_row: '7', quantity: '-5', unit_price: '', ...outRow
  }])));
  assert.equal(first.commit.status, 201, JSON.stringify(first.commit.body));
  return world;
}

test('转入端到达：自动配对暂存的转出端，共同确认后两个组合持仓与来源可回读，转入承接成本，无买卖盈亏', async (t) => {
  const world = await stageOut(t);
  const input = body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', trade_date: '2026-03-03', source_row: '3', quantity: '5', unit_price: '' }]));
  const first = await preview(input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const row = first.body.data.rows[0];
  assert.equal(row.disposition, 'add', JSON.stringify(row));
  assert.equal(row.transfer.direction, 'in');
  assert.equal(row.transfer.partner.kind, 'staged');
  assert.equal(row.transfer.partner.portfolioId, PORTFOLIO_A);
  assert.equal(row.transfer.partner.portfolioName, '合成组合 A');
  assert.equal(row.transfer.partner.direction, 'out');
  assert.equal(row.transfer.carryCost, 750, '承接转出端移动平均成本 150 × 5');
  assert.equal(row.transfer.carryCostCurrency, 'USD');
  assert.equal(row.transfer.carryCostSource, 'carried');

  const commit = await commitFrom(input, first.body.data);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.added, 1);
  assert.equal(commit.body.data.counterpartsWritten, 1);

  const outTx = visible(world).find(tx => tx.action === 'transfer_out');
  const inTx = visible(world).find(tx => tx.action === 'transfer_in');
  assert.ok(outTx && inTx, '两端同批写入');
  assert.equal(String(outTx.portfolioId), PORTFOLIO_A);
  assert.equal(String(inTx.portfolioId), PORTFOLIO_B);
  assert.equal(outTx.pairGroupId, inTx.pairGroupId);
  assert.notEqual(String(outTx.sourceAccountId), String(inTx.sourceAccountId), '各自保留来源账户');
  assert.equal(outTx.source.rowNumber, 7);
  assert.equal(inTx.source.rowNumber, 3);
  assert.equal(String(outTx.source.importBatchId), String(inTx.source.importBatchId), '同一次确认');

  const a = await positionOf(PORTFOLIO_A, 'VTI.US');
  const b = await positionOf(PORTFOLIO_B, 'VTI.US');
  assert.equal(a.quantity, 15);
  assert.equal(a.remainingCost, 2250);
  assert.equal(a.realizedPnl, 0, '转出不产生买卖盈亏');
  assert.equal(b.quantity, 5);
  assert.equal(b.remainingCost, 750);
  assert.equal(b.avgCost, 150);
  assert.equal(b.realizedPnl, 0);

  const staged = await call('GET', '/api/transactions/import/transfers');
  assert.equal(staged.body.data.length, 0, '配对入账后不再待核对');

  const listB = await call('GET', `/api/portfolios/${PORTFOLIO_B}/transactions`);
  assert.equal(listB.status, 200, JSON.stringify(listB.body));
  const listed = (listB.body.data.items || listB.body.data).find(tx => tx.action === 'transfer_in');
  assert.ok(listed, '转入流水可在组合 B 回读');
});

// ─────────────────────────────────────────────────────────────
// 跨币种：转入成本与换算依据均缺时暂停，补充其中一项后继续
// ─────────────────────────────────────────────────────────────

function cadWorld(t, hooks = {}) {
  return freshWorld(t, {
    transactions: [buyTx({ portfolioId: PORTFOLIO_C, symbol: 'XEQ.TO', market: 'CA', currency: 'CAD', quantity: 10, price: 30 })]
  }, hooks);
}

const cadOut = (quantity = '-10') => ({
  activity_type: 'transfer_out', symbol: 'XEQ', market: 'CA', quantity, unit_price: '', cash_currency: 'CAD'
});
const usdIn = (quantity = '10', extra = {}) => ({
  activity_type: 'transfer_in', symbol: 'XEQ', market: 'US', quantity, unit_price: '', ...extra
});

test('跨币种划转缺转入成本与换算依据：暂停核对；补换算依据后承接折算成本并共同入账', async (t) => {
  const world = cadWorld(t);
  const staged = await previewAndCommit(body(PORTFOLIO_C, csv([cadOut()])));
  assert.equal(staged.commit.status, 201, JSON.stringify(staged.commit.body));

  const input = body(PORTFOLIO_B, csv([usdIn()]));
  const paused = await preview(input);
  const row = paused.body.data.rows[0];
  assert.equal(row.disposition, 'review');
  assert.equal(row.code, 'TRANSFER_COST_REQUIRED');
  assert.deepEqual(row.options, ['transferCost', 'fxRate', 'skip']);
  assert.equal(row.transfer.crossCurrency, true);
  assert.equal(row.transfer.removedCost, 300);
  assert.equal(row.transfer.removedCostCurrency, 'CAD');
  assert.equal(paused.body.data.blocking, true);
  const blocked = await commitFrom(input, paused.body.data);
  assert.equal(blocked.status, 422);
  assert.equal(world.transactions.length, 1, '暂停时两边账本均不变');

  const resolved = { ...input, resolutions: { [row.rowKey]: { fxRate: 0.75 } } };
  const next = await preview(resolved);
  const ready = next.body.data.rows[0];
  assert.equal(ready.disposition, 'add', JSON.stringify(ready));
  assert.equal(ready.transfer.carryCost, 225);
  assert.equal(ready.transfer.carryCostSource, 'fx');
  assert.equal(ready.transfer.fxRate, 0.75);
  const commit = await commitFrom(resolved, next.body.data);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));

  const inTx = visible(world).find(tx => tx.action === 'transfer_in');
  assert.equal(inTx.carryCost, 225);
  assert.equal(inTx.carryCostCurrency, 'USD');
  assert.equal(inTx.transferFxRate, 0.75);
  const b = await positionOf(PORTFOLIO_B, 'XEQ.US');
  assert.equal(b.remainingCost, 225);
  assert.equal(b.currency, 'USD', '组合与持仓保留资产原币种');
  assert.equal(await positionOf(PORTFOLIO_C, 'XEQ.TO'), null, '转出端清仓');
});

test('跨币种划转：补转入成本（而非换算依据）同样可继续，以补填值为承接成本', async (t) => {
  cadWorld(t);
  await previewAndCommit(body(PORTFOLIO_C, csv([cadOut()])));
  const input = body(PORTFOLIO_B, csv([usdIn()]));
  const paused = await preview(input);
  const rowKey = paused.body.data.rows[0].rowKey;
  const resolved = { ...input, resolutions: { [rowKey]: { transferCost: 230 } } };
  const next = await preview(resolved);
  assert.equal(next.body.data.rows[0].transfer.carryCost, 230);
  assert.equal(next.body.data.rows[0].transfer.carryCostSource, 'user');
  const commit = await commitFrom(resolved, next.body.data);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal((await positionOf(PORTFOLIO_B, 'XEQ.US')).remainingCost, 230);
});

test('同文件两端（同账户跨币种日记账）：报表给出换算依据即可配对，两端同批入账', async (t) => {
  const world = cadWorld(t);
  const { preview: data, commit } = await previewAndCommit(body(PORTFOLIO_C, csv([
    cadOut('-4'),
    usdIn('4', { transfer_fx_rate: '0.8' })
  ])));
  assert.deepEqual(data.rows.map(row => row.disposition), ['add', 'add']);
  assert.equal(data.rows[0].transfer.partner.kind, 'row');
  assert.equal(data.rows[1].transfer.carryCost, 96, '30 × 4 × 0.8');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.added, 2);
  const legs = visible(world).filter(tx => tx.action.startsWith('transfer_'));
  assert.equal(legs.length, 2);
  assert.equal(legs[0].pairGroupId, legs[1].pairGroupId);
  assert.equal((await positionOf(PORTFOLIO_C, 'XEQ.TO')).quantity, 6);
  assert.equal((await positionOf(PORTFOLIO_C, 'XEQ.US')).remainingCost, 96);
  assert.equal(world.transferLegs.length, 0, '同文件配对不经暂存');
});

test('同组号两端份额不一致：行错误，整批不写入', async (t) => {
  const world = freshWorld(t, { transactions: [buyTx()] });
  const input = body(PORTFOLIO_A, csv([
    { activity_type: 'transfer_out', pair_group: 'G1', quantity: '-4', unit_price: '' },
    { activity_type: 'transfer_in', pair_group: 'G1', quantity: '3', unit_price: '' }
  ]));
  const { preview: data, commit } = await previewAndCommit(input);
  assert.deepEqual(data.rows.map(row => row.code), ['TRANSFER_QUANTITY_MISMATCH', 'TRANSFER_QUANTITY_MISMATCH']);
  assert.equal(commit.status, 422);
  assert.equal(world.transactions.length, 1);
});

test('多个可配对的暂存一端：待用户指定配对对象（pairWith）', async (t) => {
  const world = freshWorld(t, {
    transactions: [buyTx(), buyTx({ portfolioId: PORTFOLIO_C, price: 120 })]
  });
  for (const pid of [PORTFOLIO_A, PORTFOLIO_C]) {
    const staged = await previewAndCommit(body(pid, csv([{ activity_type: 'transfer_out', quantity: '-2', unit_price: '' }])));
    assert.equal(staged.commit.status, 201);
  }
  const input = body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', quantity: '2', unit_price: '' }]));
  const first = await preview(input);
  const row = first.body.data.rows[0];
  assert.equal(row.code, 'TRANSFER_PAIR_AMBIGUOUS');
  assert.equal(row.transfer.candidates.length, 2);
  const fromC = row.transfer.candidates.find(item => item.portfolioId === PORTFOLIO_C);
  const resolved = { ...input, resolutions: { [row.rowKey]: { pairWith: fromC.legId } } };
  const next = await preview(resolved);
  assert.equal(next.body.data.rows[0].transfer.carryCost, 240);
  const commit = await commitFrom(resolved, next.body.data);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal((await positionOf(PORTFOLIO_C, 'VTI.US')).quantity, 8);
  assert.equal((await positionOf(PORTFOLIO_A, 'VTI.US')).quantity, 10, '未选中的暂存一端不动');
  assert.equal(world.transferLegs.filter(leg => leg.status === 'staged').length, 1);
});

test('转出端组合持仓不足：行错误，暂存对端保持待核对', async (t) => {
  const world = freshWorld(t, { transactions: [buyTx({ quantity: 3 })] });
  await previewAndCommit(body(PORTFOLIO_A, csv([{ activity_type: 'transfer_out', quantity: '-5', unit_price: '' }])));
  const { preview: data, commit } = await previewAndCommit(body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', quantity: '5', unit_price: '' }])));
  assert.equal(data.rows[0].code, 'TRANSFER_INSUFFICIENT_POSITION');
  assert.equal(commit.status, 422);
  assert.equal(world.transferLegs[0].status, 'staged');
});

// ─────────────────────────────────────────────────────────────
// 故障与并发：不产生单边结果
// ─────────────────────────────────────────────────────────────

test('翻转前写入中断：两个组合均无划转流水，暂存一端恢复待核对，可重新确认', async (t) => {
  let fail = false;
  const world = freshWorld(t, { transactions: [buyTx()] }, {
    beforeFlip: async () => { if (fail) throw new Error('injected interruption'); }
  });
  await previewAndCommit(body(PORTFOLIO_A, csv([{ activity_type: 'transfer_out', quantity: '-5', unit_price: '' }])));
  fail = true;
  const input = body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', quantity: '5', unit_price: '' }]));
  const first = await preview(input);
  const broken = await commitFrom(input, first.body.data);
  assert.equal(broken.status, 500);
  assert.equal(world.transactions.filter(tx => tx.action.startsWith('transfer_')).length, 0, '两端均未写入');
  assert.equal(world.transferLegs[0].status, 'staged');
  assert.equal(world.importBatches.filter(item => item.status === 'committing').length, 0, '主锁与伴随锁均释放');

  fail = false;
  const retry = await preview(input);
  const commit = await commitFrom(input, retry.body.data);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(visible(world).filter(tx => tx.action.startsWith('transfer_')).length, 2);
});

test('翻转后补完暂存状态时中断：两端均可见，暂存一端向前补完为已入账（不回滚为单边）', async (t) => {
  let failures = 0;
  const world = freshWorld(t, { transactions: [buyTx()] }, {
    beforeLegFlip: async () => { if (failures > 0) { failures -= 1; throw new Error('injected after flip'); } }
  });
  await previewAndCommit(body(PORTFOLIO_A, csv([{ activity_type: 'transfer_out', quantity: '-5', unit_price: '' }])));
  failures = 1;
  const input = body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', quantity: '5', unit_price: '' }]));
  const first = await preview(input);
  const broken = await commitFrom(input, first.body.data);
  assert.equal(broken.status, 500);
  const legs = visible(world).filter(tx => tx.action.startsWith('transfer_'));
  assert.equal(legs.length, 2, '两端都已可见');
  assert.equal(world.transferLegs[0].status, 'committed');
  const batch = world.importBatches.find(item => String(item._id) === String(legs[0].source.importBatchId));
  assert.equal(batch.status, 'committed');
  assert.equal(world.importBatches.filter(item => item.status === 'committing').length, 0);
});

test('并发：暂存一端在预览后被另一组合配对 → 后确认者 409，不产生第二对', async (t) => {
  const world = freshWorld(t, { transactions: [buyTx()] });
  await previewAndCommit(body(PORTFOLIO_A, csv([{ activity_type: 'transfer_out', quantity: '-5', unit_price: '' }])));
  const inB = body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', quantity: '5', unit_price: '' }]));
  const inC = body(PORTFOLIO_C, csv([{ activity_type: 'transfer_in', quantity: '5', unit_price: '', symbol: 'VTI', market: 'US' }]));
  const previewB = await preview(inB);
  const previewC = await preview(inC);
  const first = await commitFrom(inB, previewB.body.data);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await commitFrom(inC, previewC.body.data);
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'PREVIEW_STALE');
  assert.equal(visible(world).filter(tx => tx.action === 'transfer_in').length, 1);
  assert.equal(visible(world).filter(tx => tx.action === 'transfer_out').length, 1);
});

test('并发：对端组合正在确认另一导入 → 409 IMPORT_IN_PROGRESS，不写入并释放主锁', async (t) => {
  const world = freshWorld(t, { transactions: [buyTx()] });
  await previewAndCommit(body(PORTFOLIO_A, csv([{ activity_type: 'transfer_out', quantity: '-5', unit_price: '' }])));
  world.importBatches.push({
    _id: '64b0000000000000000d0001', portfolioId: PORTFOLIO_A, status: 'committing',
    lockKey: `portfolio:${PORTFOLIO_A}`, createdAt: new Date(), updatedAt: new Date()
  });
  const input = body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', quantity: '5', unit_price: '' }]));
  const first = await preview(input);
  const commit = await commitFrom(input, first.body.data);
  assert.equal(commit.status, 409);
  assert.equal(commit.body.code, 'IMPORT_IN_PROGRESS');
  assert.equal(world.transactions.filter(tx => tx.action.startsWith('transfer_')).length, 0);
  assert.equal(world.transferLegs[0].status, 'staged');
  assert.equal(world.importBatches.filter(item => item.status === 'committing' && item.lockKey === `portfolio:${PORTFOLIO_B}`).length, 0);
});

test('放弃暂存的一端后预览过期：确认返回 409，本端改为暂存（需重新提供对端）', async (t) => {
  freshWorld(t, { transactions: [buyTx()] });
  await previewAndCommit(body(PORTFOLIO_A, csv([{ activity_type: 'transfer_out', quantity: '-5', unit_price: '' }])));
  const input = body(PORTFOLIO_B, csv([{ activity_type: 'transfer_in', quantity: '5', unit_price: '' }]));
  const first = await preview(input);
  const legId = first.body.data.rows[0].transfer.partner.legId;
  const discard = await call('DELETE', `/api/transactions/import/transfers/${legId}`);
  assert.equal(discard.status, 200, JSON.stringify(discard.body));
  const commit = await commitFrom(input, first.body.data);
  assert.equal(commit.status, 409);
  const next = await preview(input);
  assert.equal(next.body.data.rows[0].disposition, 'stage');
  const again = await call('DELETE', `/api/transactions/import/transfers/${legId}`);
  assert.equal(again.status, 404);
});

// ─────────────────────────────────────────────────────────────
// 拆批：两端落在第 500 / 501 条时同一次确认
// ─────────────────────────────────────────────────────────────

test('拆批：同文件两端落在第 500 和 501 条时边界前移，两端同一次确认', async (t) => {
  const world = freshWorld(t, { transactions: [buyTx({ quantity: 1000 })] });
  const buys = Array.from({ length: 499 }, (_, index) => ({ trade_date: '2026-02-01', quantity: '1', source_row: String(index + 2) }));
  const input = body(PORTFOLIO_A, csv([
    ...buys,
    { activity_type: 'transfer_out', trade_date: '2026-03-02', pair_group: 'J1', quantity: '-2', unit_price: '' },
    { activity_type: 'transfer_in', trade_date: '2026-03-02', pair_group: 'J1', symbol: 'XEQ', market: 'US', quantity: '2', unit_price: '', transfer_cost: '210' }
  ]));
  const { preview: data, commit } = await previewAndCommit(input);
  assert.equal(data.batches.length, 2);
  assert.equal(data.batches[0].count, 499);
  assert.equal(data.batches[1].count, 2);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(world.transactions.filter(tx => tx.action.startsWith('transfer_')).length, 0, '第 1 批不含划转');
  const second = await previewAndCommit({ ...input, sourceAccount: { id: commit.body.data.sourceAccountId } });
  assert.equal(second.commit.status, 201, JSON.stringify(second.commit.body));
  assert.equal(visible(world).filter(tx => tx.action.startsWith('transfer_')).length, 2);
  assert.equal((await positionOf(PORTFOLIO_A, 'XEQ.US')).remainingCost, 210, '报表给出的承接成本');
});
