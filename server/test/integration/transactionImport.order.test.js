// server/test/integration/transactionImport.order.test.js
//
// TASK-096（#96）：成交时间精度、时区确认、结算日与持仓重放顺序核对（Spec #93 AC-04、AC-11）。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 的内存替身，不连接 MongoDB。
// 全部样例为合成数据（仓库为 public，禁止使用真实券商报表）。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const Transaction = require('@portomind/shared/models/transaction');
const marketData = require('@portomind/shared/services/marketData.service');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');

const PORTFOLIO_A = '64b000000000000000000a01';

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

const HEADER = 'activity_type,trade_date,trade_time,time_zone,settlement_date,external_id,source_row,' +
  'symbol,market,quantity,unit_price,cash_currency,commission,notes';

function csv(rows) {
  const line = row => {
    const base = {
      activity_type: 'buy', trade_date: '2026-03-02', trade_time: '', time_zone: '', settlement_date: '',
      external_id: '', source_row: '', symbol: 'VTI', market: 'US', quantity: '10', unit_price: '100',
      cash_currency: 'USD', commission: '0', notes: '', ...row
    };
    return HEADER.split(',').map(key => base[key]).join(',');
  };
  return [HEADER, ...rows.map(line)].join('\n');
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [{ _id: PORTFOLIO_A, name: '合成组合 A', currency: 'USD' }],
    assets: [{ _id: '64b000000000000000000b01', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true }],
    ...extra
  });
  // 编辑链路（PUT /api/transactions/:id）所需的更新替身
  t.mock.method(Transaction, 'findByIdAndUpdate', async (id, update) => {
    const doc = world.transactions.find(item => String(item._id) === String(id));
    if (!doc) return null;
    for (const [key, value] of Object.entries(update)) {
      if (key === '$unset') for (const field of Object.keys(value)) delete doc[field];
      else if (key === '$set') Object.assign(doc, value);
      else doc[key] = value;
    }
    return { ...doc, toObject: () => ({ ...doc }) };
  });
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function body(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'standard',
    file: { name: 'synthetic-order.csv', content },
    sourceAccount: { broker: 'other', alias: '合成券商账户' },
    ...overrides
  };
}

const preview = input => call('POST', '/api/transactions/import/preview', input);

async function previewAndCommit(input) {
  const first = await preview(input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...input,
    previewToken: first.body.data.previewToken,
    ledgerFingerprint: first.body.data.ledgerFingerprint
  });
  return { preview: first.body.data, commit };
}

async function positionOf(symbol = 'VTI.US') {
  const response = await call('GET', `/api/portfolios/${PORTFOLIO_A}/stats/positions`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data.find(item => item.symbol === symbol) || null;
}

// ─────────────────────────────────────────────────────────────
// 时间精度与时区确认
// ─────────────────────────────────────────────────────────────

test('报表有成交时间但无时区：行待确认时区并阻塞整批，可选北京 / 多伦多', async (t) => {
  freshWorld(t);
  const { status, body: response } = await preview(body(csv([{ trade_time: '10:30:00' }, { trade_date: '2026-03-03' }])));
  assert.equal(status, 200, JSON.stringify(response));
  const data = response.data;
  assert.deepEqual(data.timeZoneOptions, ['Asia/Shanghai', 'America/Toronto']);
  assert.equal(data.requiresTimeZone, true);
  assert.equal(data.rows[0].disposition, 'review');
  assert.equal(data.rows[0].code, 'TIME_ZONE_UNCONFIRMED');
  assert.equal(data.rows[0].candidate.date, null, '时区未确认前不猜成交时刻');
  assert.equal(data.rows[0].candidate.localDate, '2026-03-02');
  assert.equal(data.rows[0].candidate.localTime, '10:30:00');
  assert.equal(data.rows[1].disposition, 'add', '仅日期行不需要时区');
  assert.equal(data.blocking, true);
  assert.ok(data.blockingReasons.some(item => item.code === 'TIME_ZONE_REQUIRED'));
});

test('用户确认北京时区后按北京时间换算并保存时区来源；非北京 / 多伦多的确认值被拒绝', async (t) => {
  const world = freshWorld(t);
  const content = csv([{ trade_time: '10:30:00' }]);
  const { preview: data, commit } = await previewAndCommit(body(content, { timeZone: 'Asia/Shanghai' }));
  assert.equal(data.requiresTimeZone, false);
  assert.equal(data.rows[0].candidate.timeZoneSource, 'user');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const [tx] = world.transactions;
  assert.equal(new Date(tx.date).toISOString(), '2026-03-02T02:30:00.000Z');
  assert.equal(tx.timeZone, 'Asia/Shanghai');
  assert.equal(tx.timeZoneSource, 'user');
  assert.equal(tx.dateKind, 'datetime');

  const rejected = await preview(body(content, { timeZone: 'Europe/London' }));
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.code, 'INVALID_TIME_ZONE');
});

test('报表自带时区优先于页面确认值；明示午夜保留时刻精度，仅日期保留日期精度', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { trade_time: '00:00:00', time_zone: 'America/Toronto' },
    { trade_date: '2026-03-03' }
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content, { timeZone: 'Asia/Shanghai' }));
  assert.equal(data.rows[0].candidate.timeZoneSource, 'report');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const [midnight, dateOnly] = world.transactions;
  assert.equal(midnight.dateKind, 'datetime');
  assert.equal(new Date(midnight.date).toISOString(), '2026-03-02T05:00:00.000Z');
  assert.equal(midnight.timeZone, 'America/Toronto');
  assert.equal(dateOnly.dateKind, 'date');
  assert.equal(dateOnly.timeZone, undefined, '仅日期精度不记录时区');
});

// ─────────────────────────────────────────────────────────────
// 结算日
// ─────────────────────────────────────────────────────────────

test('结算日独立保存；缺失时标记未知（不以成交日代替）', async (t) => {
  const world = freshWorld(t);
  const content = csv([{ settlement_date: '2026-03-04' }, { trade_date: '2026-03-03' }]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.equal(data.rows[0].candidate.settlementStatus, 'known');
  assert.equal(data.rows[1].candidate.settlementStatus, 'unknown');
  assert.equal(data.rows[1].candidate.settlementDate, null);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const [known, unknown] = world.transactions;
  assert.equal(new Date(known.settlementDate).toISOString(), '2026-03-04T00:00:00.000Z');
  assert.equal(known.settlementStatus, 'known');
  assert.equal(unknown.settlementDate, undefined);
  assert.equal(unknown.settlementStatus, 'unknown');
});

// ─────────────────────────────────────────────────────────────
// 重放顺序：预览 = 确认后重放 = 后续编辑
// ─────────────────────────────────────────────────────────────

const EXISTING_ID = '64b000000000000000000e01';

function existingTx(overrides = {}) {
  return {
    _id: EXISTING_ID, portfolioId: PORTFOLIO_A, symbol: 'VTI.US', assetType: 'etf', market: 'US', currency: 'USD',
    action: 'buy', quantity: 10, price: 100, fee: 0, updatedAt: new Date('2026-01-01'), ...overrides
  };
}

test('期初无持仓的同日买卖（同报表仅日期）：按原行顺序重放，预览与确认后持仓一致', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { quantity: '10', unit_price: '100' },
    { activity_type: 'sell', quantity: '-4', unit_price: '130' },
    { quantity: '2', unit_price: '160' },
    { activity_type: 'sell', quantity: '-7', unit_price: '120' }
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.deepEqual(data.rows.map(row => row.disposition), ['add', 'add', 'add', 'add']);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.deepEqual(world.transactions.map(tx => tx.sequence), [0, 1, 2, 3]);
  // 原行顺序：10@100 → 卖 4（剩 6 股成本 600）→ 2@160（8 股成本 920，均价 115）→ 卖 7 → 剩 1 股成本 115
  const position = await positionOf();
  assert.equal(position.quantity, 1);
  assert.ok(Math.abs(position.remainingCost - 115) < 1e-9);
  assert.ok(Math.abs(position.realizedPnl - (4 * 30 + 7 * 5)) < 1e-9);
});

test('同报表同日先卖后买：保持原行顺序（不自动重排），卖出行按超卖规则报错', async (t) => {
  freshWorld(t);
  const { body: response } = await preview(body(csv([
    { activity_type: 'sell', quantity: '-4', unit_price: '130' },
    { quantity: '10', unit_price: '100' }
  ])));
  assert.deepEqual(response.data.rows.map(row => [row.disposition, row.code]), [['error', 'INSUFFICIENT_POSITION'], ['add', null]]);
});

test('同日多笔且结果与顺序无关（全是买入）：跨报表不要求确认顺序', async (t) => {
  freshWorld(t, { transactions: [existingTx({ date: new Date('2026-03-02T00:00:00Z'), dateKind: 'date' })] });
  const { body: response } = await preview(body(csv([{ quantity: '5', unit_price: '120' }])));
  assert.deepEqual(response.data.rows.map(row => row.disposition), ['add']);
  assert.equal(response.data.blocking, false);
});

test('跨报表同日仅日期、不同顺序导致成本与已实现盈亏不同：暂停批次，待用户确认顺序', async (t) => {
  const world = freshWorld(t, {
    transactions: [
      existingTx({ _id: '64b000000000000000000e00', date: new Date('2026-03-01T00:00:00Z'), dateKind: 'date' }),
      existingTx({ action: 'sell', quantity: 10, price: 150, date: new Date('2026-03-02T00:00:00Z'), dateKind: 'date' })
    ]
  });
  const content = csv([{ quantity: '10', unit_price: '200' }]);
  const first = await preview(body(content));
  const [row] = first.body.data.rows;
  assert.equal(row.disposition, 'review');
  assert.equal(row.code, 'ORDER_AMBIGUOUS');
  assert.deepEqual(row.options, ['order', 'skip']);
  assert.deepEqual(row.orderConflict.existing.map(item => item.id), [EXISTING_ID]);
  assert.equal(first.body.data.blocking, true);

  const blocked = await call('POST', '/api/transactions/import/commit', {
    ...body(content), previewToken: first.body.data.previewToken, ledgerFingerprint: first.body.data.ledgerFingerprint
  });
  assert.equal(blocked.status, 422);
  assert.equal(world.transactions.length, 2);

  // 用户确认：新买入发生在已有卖出之前
  const { preview: resolved, commit } = await previewAndCommit(body(content, { resolutions: { [row.rowKey]: { order: 'before' } } }));
  assert.equal(resolved.rows[0].disposition, 'add');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const imported = world.transactions.find(tx => tx.source);
  assert.equal(imported.orderRank, -1);
  // 先买：(1000+2000)/20=150 均价，卖 10 → 剩 10 股成本 1500
  const position = await positionOf();
  assert.equal(position.quantity, 10);
  assert.equal(position.remainingCost, 1500);
});

test('同报表混合精度（带时刻与仅日期同日）且结果不同：待确认顺序；确认后编辑仍沿用同一顺序', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { quantity: '10', unit_price: '100', trade_time: '10:00:00', time_zone: 'America/Toronto' },
    { activity_type: 'sell', quantity: '-10', unit_price: '120' }
  ]);
  const first = await preview(body(content));
  const [timed, dateOnly] = first.body.data.rows;
  assert.equal(timed.disposition, 'add');
  assert.equal(dateOnly.disposition, 'review');
  assert.equal(dateOnly.code, 'ORDER_AMBIGUOUS');

  const { preview: resolved, commit } = await previewAndCommit(body(content, { resolutions: { [dateOnly.rowKey]: { order: 'after' } } }));
  assert.deepEqual(resolved.rows.map(row => row.disposition), ['add', 'add']);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const sell = world.transactions.find(tx => tx.action === 'sell');
  assert.equal(sell.orderRank, 1);
  assert.equal(await positionOf(), null);

  // 后续编辑（改佣金）：超卖校验必须沿用已确认的顺序，否则仅日期卖出会被排到 10:00 买入之前
  const edit = await call('PUT', `/api/transactions/${sell._id}`, { fee: 1 });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(sell.orderRank, 1, '编辑不改变确认过的顺序');
});

test('编辑改动成交日期后，原交易日上确认的顺序不再沿用', async (t) => {
  const world = freshWorld(t, {
    transactions: [
      existingTx({ date: new Date('2026-03-01T00:00:00Z'), dateKind: 'date' }),
      existingTx({ _id: '64b000000000000000000e02', action: 'sell', quantity: 5, price: 120, date: new Date('2026-03-02T00:00:00Z'), dateKind: 'date', orderRank: 1 })
    ]
  });
  const edit = await call('PUT', '/api/transactions/64b000000000000000000e02', { date: '2026-03-05' });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(world.transactions[1].orderRank, undefined);
});
