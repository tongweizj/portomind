// server/test/integration/transactionImport.split.test.js
//
// TASK-098（#98）：拆股与成本重放（Spec #93 AC-07）。
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
const EXISTING_ID = '64b000000000000000000e01';

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

const HEADER = 'activity_type,trade_date,symbol,market,quantity,unit_price,split_ratio,cash_currency,commission,notes';

function csv(rows) {
  const line = row => {
    const base = {
      activity_type: 'buy', trade_date: '2026-03-02', symbol: 'VTI', market: 'US', quantity: '10', unit_price: '100',
      split_ratio: '', cash_currency: 'USD', commission: '0', notes: '', ...row
    };
    return HEADER.split(',').map(key => base[key]).join(',');
  };
  return [HEADER, ...rows.map(line)].join('\n');
}

// 拆股行：单价、币种、佣金可留空
const split = overrides => ({
  activity_type: 'split', trade_date: '2026-03-05', quantity: '10', unit_price: '', cash_currency: '', commission: '',
  ...overrides
});

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [{ _id: PORTFOLIO_A, name: '合成组合 A', currency: 'USD' }],
    assets: [{ _id: '64b000000000000000000b01', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true }],
    ...extra
  });
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function existingBuy(overrides = {}) {
  return {
    _id: EXISTING_ID, portfolioId: PORTFOLIO_A, symbol: 'VTI.US', assetType: 'etf', market: 'US', currency: 'USD',
    action: 'buy', quantity: 10, price: 100, fee: 0, date: new Date('2026-03-02T00:00:00Z'), dateKind: 'date',
    updatedAt: new Date('2026-01-01'), ...overrides
  };
}

function body(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'standard',
    file: { name: 'synthetic-split.csv', content },
    sourceAccount: { broker: 'other', alias: '合成券商账户' },
    ...overrides
  };
}

const preview = input => call('POST', '/api/transactions/import/preview', input);
const commit = (input, data) => call('POST', '/api/transactions/import/commit', {
  ...input, previewToken: data.previewToken, ledgerFingerprint: data.ledgerFingerprint
});

async function positionOf(symbol = 'VTI.US') {
  const response = await call('GET', `/api/portfolios/${PORTFOLIO_A}/stats/positions`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data.find(item => item.symbol === symbol) || null;
}

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, received ${actual}`);
}

test('买入 → 拆股 → 卖出：预览的拆股前后份额与持仓结果，与确认后持仓回读的成本和盈亏一致', async (t) => {
  const world = freshWorld(t);
  const input = body(csv([
    { commission: '2' },
    split({ split_ratio: '2:1' }),
    { activity_type: 'sell', trade_date: '2026-03-09', quantity: '-5', unit_price: '60', commission: '1' }
  ]));
  const first = await preview(input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const data = first.body.data;
  assert.deepEqual(data.rows.map(row => row.disposition), ['add', 'add', 'add'], JSON.stringify(data.rows));
  const splitRow = data.rows[1];
  assert.equal(splitRow.candidate.action, 'split');
  assert.equal(splitRow.candidate.quantity, 10);
  assert.equal(splitRow.candidate.splitRatio, 2);
  assert.equal(splitRow.candidate.price, null);
  // 拆股前 10 股、总成本 1002（含费）；拆后 20 股，总成本不变，单位成本 50.1
  closeTo(splitRow.splitEffect.quantityBefore, 10, 'quantityBefore');
  closeTo(splitRow.splitEffect.quantityAfter, 20, 'quantityAfter');
  closeTo(splitRow.splitEffect.remainingCost, 1002, 'remainingCost');
  closeTo(splitRow.splitEffect.avgCostBefore, 100.2, 'avgCostBefore');
  closeTo(splitRow.splitEffect.avgCostAfter, 50.1, 'avgCostAfter');

  // 卖出 5 股：成本减 250.5，已实现盈亏 (60-50.1)×5-1 = 48.5
  const after = data.positionsAfter.find(item => item.symbol === 'VTI.US');
  closeTo(after.quantity, 15, 'quantity');
  closeTo(after.remainingCost, 751.5, 'remainingCost');
  closeTo(after.avgCost, 50.1, 'avgCost');
  closeTo(after.realizedPnl, 48.5, 'realizedPnl');

  const committed = await commit(input, data);
  assert.equal(committed.status, 201, JSON.stringify(committed.body));
  const stored = world.transactions.find(tx => tx.action === 'split');
  assert.equal(stored.quantity, 10);
  assert.equal(stored.splitRatio, 2);
  assert.equal(stored.price, undefined, '拆股不记录单价');
  assert.equal(stored.fee, 0);

  const position = await positionOf();
  closeTo(position.quantity, after.quantity, 'readback quantity');
  closeTo(position.remainingCost, after.remainingCost, 'readback remainingCost');
  closeTo(position.avgCost, after.avgCost, 'readback avgCost');
  closeTo(position.realizedPnl, after.realizedPnl, 'readback realizedPnl');
});

test('已入账持仓上导入拆股：份额改变、总成本保持、单位成本按新份额重算', async (t) => {
  freshWorld(t, { transactions: [existingBuy()] });
  const input = body(csv([split({ quantity: '30', split_ratio: '4' })]));
  const first = await preview(input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.rows[0].disposition, 'add', JSON.stringify(first.body.data.rows[0]));
  const committed = await commit(input, first.body.data);
  assert.equal(committed.status, 201, JSON.stringify(committed.body));
  const position = await positionOf();
  assert.equal(position.quantity, 40);
  assert.equal(position.totalCost, 1000);
  assert.equal(position.avgCost, 25);
  assert.equal(position.realizedPnl, 0);
});

test('拆股前没有持仓：显示原行及原因，暂停入账（整批阻塞），跳过后其余行可入账', async (t) => {
  const world = freshWorld(t);
  const input = body(csv([split({ split_ratio: '2:1' }), { trade_date: '2026-03-06' }]));
  const first = await preview(input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const [splitRow, buyRow] = first.body.data.rows;
  assert.equal(splitRow.disposition, 'review');
  assert.equal(splitRow.code, 'SPLIT_NO_POSITION');
  assert.match(splitRow.reason, /拆股前没有/);
  assert.deepEqual(splitRow.options, ['skip']);
  assert.equal(splitRow.rowNumber, 2, '显示原行号');
  assert.equal(splitRow.candidate.symbol, 'VTI.US');
  assert.equal(buyRow.disposition, 'add', '拆股之后的买入不受影响');
  assert.equal(first.body.data.blocking, true);
  assert.ok(first.body.data.blockingReasons.some(item => item.code === 'UNRESOLVED_REVIEW'));

  const blocked = await commit(input, first.body.data);
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.code, 'IMPORT_BLOCKED');
  assert.equal(world.transactions.length, 0, '整批未写入');

  const skipped = { ...input, resolutions: { [splitRow.rowKey]: { action: 'skip' } } };
  const second = await preview(skipped);
  assert.equal(second.body.data.rows[0].disposition, 'skip');
  assert.equal(second.body.data.blocking, false);
  const committed = await commit(skipped, second.body.data);
  assert.equal(committed.status, 201, JSON.stringify(committed.body));
  assert.deepEqual(world.transactions.map(tx => tx.action), ['buy']);
});

test('已知比例与份额变动冲突：显示原因并暂停入账，依赖拆股份额的后续卖出随之报超卖', async (t) => {
  freshWorld(t, { transactions: [existingBuy()] });
  const input = body(csv([
    split({ quantity: '12', split_ratio: '2:1' }),
    { activity_type: 'sell', trade_date: '2026-03-09', quantity: '-15', unit_price: '60' }
  ]));
  const first = await preview(input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const [splitRow, sellRow] = first.body.data.rows;
  assert.equal(splitRow.disposition, 'review');
  assert.equal(splitRow.code, 'SPLIT_RATIO_CONFLICT');
  assert.match(splitRow.reason, /比例/);
  assert.deepEqual(splitRow.options, ['skip']);
  assert.equal(sellRow.disposition, 'error', '拆股未核对前，卖出 15 股超过 10 股持仓');
  assert.equal(sellRow.code, 'INSUFFICIENT_POSITION');
  assert.equal(first.body.data.blocking, true);
});

test('拆股行字段校验：份额变动必填且非零、比例格式、佣金只能为空或 0', async (t) => {
  freshWorld(t, { transactions: [existingBuy()] });
  const { status, body: response } = await preview(body(csv([
    split({ quantity: '' }),
    split({ quantity: '0' }),
    split({ split_ratio: '2-for-1' }),
    split({ commission: '1' })
  ])));
  assert.equal(status, 200, JSON.stringify(response));
  assert.deepEqual(response.data.rows.map(row => row.code), ['MISSING_FIELD', 'INVALID_NUMBER', 'INVALID_NUMBER', 'INVALID_NUMBER']);
  assert.ok(response.data.rows.every(row => row.disposition === 'error'));
});

test('标准格式说明开放 split 类型，模板含 split_ratio 列', async (t) => {
  freshWorld(t);
  const format = await call('GET', '/api/transactions/import/format');
  assert.equal(format.status, 200, JSON.stringify(format.body));
  const splitType = format.body.data.activityTypes.find(item => item.type === 'split');
  assert.equal(splitType.supported, true);
  assert.deepEqual(splitType.required, ['trade_date', 'symbol', 'quantity']);
  assert.ok(format.body.data.columns.some(column => column.key === 'split_ratio'));

  // 模板示例（买入 → 卖出 → 拆股）本身可通过预览
  const response = await fetch(`${baseUrl}/api/transactions/import/template`, { headers: { cookie: authHeaders().cookie } });
  const template = await preview(body(await response.text()));
  assert.equal(template.status, 200, JSON.stringify(template.body));
  const splitRow = template.body.data.rows.find(row => row.candidate?.action === 'split');
  assert.equal(splitRow.disposition, 'add', JSON.stringify(splitRow));
  assert.ok(template.body.data.rows.every(row => row.disposition === 'add'), JSON.stringify(template.body.data.rows));
  const after = template.body.data.positionsAfter.find(item => item.symbol === 'VTI.US');
  closeTo(after.quantity, 12, 'template quantity');
});
