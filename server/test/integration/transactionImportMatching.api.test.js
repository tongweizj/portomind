// server/test/integration/transactionImportMatching.api.test.js
//
// TASK-095（#95）：重复成交识别与更正（Spec #93 AC-03、AC-10）。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 的内存替身，不连接 MongoDB。
// 全部样例为合成数据（仓库为 public，禁止使用真实券商报表）。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');
const marketData = require('@portomind/shared/services/marketData.service');

const PORTFOLIO_A = '64b000000000000000000a01';
const PORTFOLIO_B = '64b000000000000000000a02';

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

const HEADER = 'activity_type,trade_date,trade_time,time_zone,external_id,symbol,market,quantity,unit_price,cash_currency,commission,notes';

function csv(rows) {
  const lines = rows.map(row => {
    const base = {
      activity_type: 'buy', trade_date: '2026-01-05', trade_time: '', time_zone: '', external_id: '',
      symbol: 'VTI', market: 'US', quantity: '10', unit_price: '100', cash_currency: 'USD', commission: '1', notes: '',
      ...row
    };
    return HEADER.split(',').map(key => base[key]).join(',');
  });
  return [HEADER, ...lines].join('\n');
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [
      { _id: PORTFOLIO_A, name: '合成组合 A', currency: 'USD' },
      { _id: PORTFOLIO_B, name: '合成组合 B', currency: 'USD' }
    ],
    assets: [
      { _id: '64b000000000000000000b01', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true },
      { _id: '64b000000000000000000b03', symbol: 'VOO.US', type: 'etf', market: 'US', currency: 'USD', active: true }
    ],
    ...extra
  }, extra.hooks);
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function body(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'standard',
    file: { name: 'synthetic.csv', content },
    sourceAccount: { broker: 'other', alias: '合成券商账户' },
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
    ...input,
    previewToken: data.previewToken,
    ledgerFingerprint: data.ledgerFingerprint
  });
  return { preview: data, commit };
}

/** 先导入一次，返回已建立的来源账户（后续导入选择它）。 */
async function seedImport(rows, overrides = {}) {
  const { commit } = await previewAndCommit(body(csv(rows), overrides));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  return { sourceAccount: { id: commit.body.data.sourceAccountId }, result: commit.body.data };
}

test('同编号券商更正：显示新旧值差异待核对；确认更新后旧流水被改写且保留手工备注', async (t) => {
  const world = freshWorld(t);
  const { sourceAccount, result } = await seedImport([{ external_id: 'C-1', quantity: '10', unit_price: '100' }]);
  const txId = result.rows[0].transactionId;
  const edited = await call('PUT', `/api/transactions/${txId}`, { notes: '手工备注：长期持有' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));

  const corrected = csv([{ external_id: 'C-1', quantity: '10', unit_price: '101', notes: '券商更正' }]);
  const first = await preview(body(corrected, { sourceAccount }));
  const [row] = first.rows;
  assert.equal(row.disposition, 'review');
  assert.equal(row.code, 'EXTERNAL_ID_CHANGED');
  assert.deepEqual(row.options.sort(), ['skip', 'update']);
  assert.equal(row.matches.length, 1);
  assert.equal(row.matches[0].id, txId);
  const priceDiff = row.matches[0].diff.find(item => item.field === 'price');
  assert.deepEqual([priceDiff.before, priceDiff.after], [100, 101]);
  assert.ok(row.matches[0].diff.some(item => item.field === 'grossAmount'));
  assert.ok(!row.matches[0].diff.some(item => item.field === 'notes'), '备注不参与差异');
  assert.equal(first.blocking, true);

  const resolutions = { [row.rowKey]: { action: 'update', targetId: txId } };
  const { preview: resolved, commit } = await previewAndCommit(body(corrected, { sourceAccount, resolutions }));
  assert.equal(resolved.rows[0].disposition, 'update');
  assert.equal(resolved.counts.update, 1);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.updated, 1);
  assert.equal(commit.body.data.added, 0);
  assert.equal(commit.body.data.rows[0].transactionId, txId);

  const list = await call('GET', `/api/portfolios/${PORTFOLIO_A}/transactions`);
  assert.equal(list.body.data.length, 1, '更新而非新增');
  const [tx] = list.body.data;
  assert.equal(tx.price, 101);
  assert.equal(tx.grossAmount, 1010);
  assert.equal(tx.notes, '手工备注：长期持有');
  assert.equal(tx.source.externalId, 'C-1');
  assert.equal(world.importBatches.at(-1).status, 'committed');

  // 更新后再导入同一更正文件：唯一一致匹配 → 跳过
  const again = await preview(body(corrected, { sourceAccount }));
  assert.deepEqual([again.rows[0].disposition, again.rows[0].code], ['skip', 'ALREADY_IMPORTED']);
});

test('同编号已入账到另一组合：显示原组合并只允许显式跳过', async (t) => {
  const world = freshWorld(t);
  const { sourceAccount } = await seedImport([{ external_id: 'X-1' }], { portfolioId: PORTFOLIO_B });
  const content = csv([{ external_id: 'X-1' }, { external_id: 'X-2', trade_date: '2026-01-06' }]);
  const first = await preview(body(content, { sourceAccount }));
  const [row] = first.rows;
  assert.deepEqual([row.disposition, row.code], ['review', 'EXTERNAL_ID_OTHER_PORTFOLIO']);
  assert.match(row.reason, /合成组合 B/);
  assert.equal(row.matches[0].portfolioId, PORTFOLIO_B);
  assert.equal(row.matches[0].portfolioName, '合成组合 B');
  assert.deepEqual(row.options, ['skip']);

  const notAllowed = await preview(body(content, { sourceAccount, resolutions: { [row.rowKey]: { action: 'update', targetId: row.matches[0].id } } }));
  assert.equal(notAllowed.rows[0].disposition, 'review', '跨组合不可更新');

  const resolutions = { [row.rowKey]: { action: 'skip' } };
  const { preview: resolved, commit } = await previewAndCommit(body(content, { sourceAccount, resolutions }));
  assert.deepEqual(resolved.rows.map(item => item.disposition), ['skip', 'add']);
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.deepEqual(world.transactions.map(tx => [tx.source.externalId, String(tx.portfolioId)]).sort(),
    [['X-1', PORTFOLIO_B], ['X-2', PORTFOLIO_A]]);
});

const TIMED = { trade_time: '10:30:00', time_zone: 'America/Toronto' };

test('无编号有时间：时间、标的、数量、成交金额一致跳过；仅成交金额不同列出旧流水候选并暂停，用户可选新增', async (t) => {
  const world = freshWorld(t);
  const { sourceAccount, result } = await seedImport([{ ...TIMED, quantity: '10', unit_price: '100' }]);
  const same = await preview(body(csv([{ ...TIMED, quantity: '10', unit_price: '100' }]), { sourceAccount }));
  assert.deepEqual([same.rows[0].disposition, same.rows[0].code], ['skip', 'ALREADY_IMPORTED']);

  const changed = csv([{ ...TIMED, quantity: '10', unit_price: '100.5' }]);
  const first = await preview(body(changed, { sourceAccount }));
  const [row] = first.rows;
  assert.deepEqual([row.disposition, row.code], ['review', 'AMOUNT_CHANGED']);
  assert.deepEqual(row.options.sort(), ['add', 'skip', 'update']);
  assert.equal(row.matches[0].id, result.rows[0].transactionId);
  assert.equal(row.matches[0].transaction.grossAmount, 1000, '候选展示旧流水');
  assert.deepEqual(row.matches[0].diff.find(item => item.field === 'grossAmount'), { field: 'grossAmount', before: 1000, after: 1005 });
  assert.equal(first.blocking, true, '暂停整批');
  const blocked = await call('POST', '/api/transactions/import/commit', { ...body(changed, { sourceAccount }), previewToken: first.previewToken, ledgerFingerprint: first.ledgerFingerprint });
  assert.equal(blocked.status, 422);
  assert.equal(world.transactions.length, 1);

  const { commit } = await previewAndCommit(body(changed, { sourceAccount, resolutions: { [row.rowKey]: { action: 'add' } } }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(commit.body.data.added, 1);
  assert.deepEqual(world.transactions.map(tx => tx.price).sort(), [100, 100.5]);
});

test('无编号有时间、仅佣金不同：匹配同一成交并显示差异，可更新', async (t) => {
  const world = freshWorld(t);
  const { sourceAccount } = await seedImport([{ ...TIMED, commission: '1' }]);
  const content = csv([{ ...TIMED, commission: '2' }]);
  const first = await preview(body(content, { sourceAccount }));
  assert.deepEqual([first.rows[0].code, first.rows[0].options.sort()], ['TRADE_CHANGED', ['skip', 'update']]);
  assert.deepEqual(first.rows[0].matches[0].diff, [{ field: 'fee', before: 1, after: 2 }]);
  const { commit } = await previewAndCommit(body(content, { sourceAccount, resolutions: { [first.rows[0].rowKey]: { action: 'update' } } }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(world.transactions.length, 1);
  assert.equal(world.transactions[0].fee, 2);
});

test('同文件重复原编号：同方向内容不同显示与原行差异并暂停；不同方向不算重复；明确不同的无编号成交逐笔保留', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { external_id: 'D-1', quantity: '5' },
    { external_id: 'D-1', quantity: '6' },
    { external_id: 'D-1', activity_type: 'sell', quantity: '1', trade_date: '2026-01-07' },
    { ...TIMED, quantity: '2' },
    { trade_time: '11:30:00', time_zone: 'America/Toronto', quantity: '2' }
  ]);
  const first = await preview(body(content));
  const rows = first.rows;
  assert.deepEqual(rows.map(row => row.disposition), ['add', 'review', 'add', 'add', 'add']);
  assert.equal(rows[1].code, 'EXTERNAL_ID_CONFLICT_IN_FILE');
  assert.equal(rows[1].duplicateOf.rowNumber, rows[0].rowNumber);
  assert.deepEqual(rows[1].duplicateOf.diff.find(item => item.field === 'quantity'), { field: 'quantity', before: 5, after: 6 });
  assert.deepEqual(rows[1].options.sort(), ['add', 'skip']);

  const resolutions = { [rows[1].rowKey]: { action: 'skip' } };
  const { commit } = await previewAndCommit(body(content, { resolutions }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(world.transactions.length, 4);
});

test('同文件两笔完全相同的无编号成交：逐笔入账；再次导入按一对一认领全部跳过', async (t) => {
  freshWorld(t);
  const rows = [{ ...TIMED, quantity: '3' }, { ...TIMED, quantity: '3' }];
  const { sourceAccount, result } = await seedImport(rows);
  assert.equal(result.added, 2);
  const again = await preview(body(csv(rows), { sourceAccount }));
  assert.deepEqual(again.rows.map(row => row.code), ['ALREADY_IMPORTED', 'ALREADY_IMPORTED']);
  assert.notEqual(again.rows[0].matches[0].id, again.rows[1].matches[0].id);
  const three = await preview(body(csv([...rows, rows[0]]), { sourceAccount }));
  assert.deepEqual(three.rows.map(row => row.disposition), ['skip', 'skip', 'add'], '多出的一笔不被重复认领');
});

test('无编号仅日期：同来源同日同标的同方向但内容不同 → 人工核对，可跳过、新增或指定更新', async (t) => {
  freshWorld(t);
  // 01-02 的买入为同日卖出提供持仓（同日同刻重放顺序由 #96 处理）
  const { sourceAccount } = await seedImport([{ quantity: '10' }, { quantity: '5', trade_date: '2026-01-02' }]);
  const first = await preview(body(csv([{ quantity: '12' }]), { sourceAccount }));
  assert.deepEqual([first.rows[0].disposition, first.rows[0].code], ['review', 'DATE_ONLY_MATCH']);
  assert.deepEqual(first.rows[0].options.sort(), ['add', 'skip', 'update']);
  const otherDay = await preview(body(csv([{ quantity: '12', trade_date: '2026-01-09' }]), { sourceAccount }));
  assert.equal(otherDay.rows[0].disposition, 'add');
  const sell = await preview(body(csv([{ activity_type: 'sell', quantity: '1' }]), { sourceAccount }));
  assert.equal(sell.rows[0].disposition, 'add', '不同方向不匹配');
});

const LEGACY = (id, overrides = {}) => ({
  _id: id, portfolioId: PORTFOLIO_A, symbol: 'VTI.US', assetType: 'etf', market: 'US', currency: 'USD',
  action: 'buy', quantity: 10, price: 100, fee: 0, date: new Date('2026-01-05T00:00:00.000Z'),
  notes: '手工录入', createdAt: new Date('2026-01-05'), updatedAt: new Date('2026-01-05'), ...overrides
});

test('缺来源账户的旧账：同日候选进入人工核对；多候选须指定更新对象，更新后挂上来源并保留备注', async (t) => {
  const world = freshWorld(t, {
    transactions: [LEGACY('64b000000000000000000e01'), LEGACY('64b000000000000000000e02', { quantity: 4, notes: '另一笔' })]
  });
  const content = csv([{ external_id: 'L-1', quantity: '10', unit_price: '100', commission: '1' }]);
  const first = await preview(body(content));
  const [row] = first.rows;
  assert.deepEqual([row.disposition, row.code], ['review', 'LEGACY_CANDIDATE']);
  assert.equal(row.matches.length, 2);
  assert.deepEqual(row.options.sort(), ['add', 'skip', 'update']);

  const ambiguous = await preview(body(content, { resolutions: { [row.rowKey]: { action: 'update' } } }));
  assert.equal(ambiguous.rows[0].disposition, 'review', '多候选未指定对象不生效');

  const resolutions = { [row.rowKey]: { action: 'update', targetId: '64b000000000000000000e01' } };
  const { commit } = await previewAndCommit(body(content, { resolutions }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(world.transactions.length, 2);
  const updated = world.transactions.find(tx => tx._id === '64b000000000000000000e01');
  assert.equal(updated.fee, 1);
  assert.equal(updated.notes, '手工录入');
  assert.equal(updated.source.externalId, 'L-1');
  assert.equal(String(updated.sourceAccountId), commit.body.data.sourceAccountId);
  assert.equal(world.transactions.find(tx => tx._id === '64b000000000000000000e02').notes, '另一笔');
});

test('更新导致后续卖出超卖：该行标错并阻塞', async (t) => {
  freshWorld(t);
  const { sourceAccount } = await seedImport([
    { external_id: 'O-1', quantity: '10' },
    { external_id: 'O-2', activity_type: 'sell', quantity: '8', trade_date: '2026-01-08' }
  ]);
  const content = csv([{ external_id: 'O-1', quantity: '5' }]);
  const first = await preview(body(content, { sourceAccount }));
  const resolved = await preview(body(content, { sourceAccount, resolutions: { [first.rows[0].rowKey]: { action: 'update' } } }));
  assert.deepEqual([resolved.rows[0].disposition, resolved.rows[0].code], ['error', 'INSUFFICIENT_POSITION']);
  assert.equal(resolved.blocking, true);
});

// ── AC-10：混合新增与更新的批次 ──

async function mixedSetup(t, hooks) {
  const world = freshWorld(t, { hooks });
  const { sourceAccount, result } = await seedImport([{ external_id: 'M-1', unit_price: '100' }]);
  const content = csv([
    { external_id: 'M-1', unit_price: '99' },
    { external_id: 'M-2', trade_date: '2026-01-06' }
  ]);
  const first = await preview(body(content, { sourceAccount }));
  const resolutions = { [first.rows[0].rowKey]: { action: 'update', targetId: result.rows[0].transactionId } };
  return { world, sourceAccount, content, resolutions, targetId: result.rows[0].transactionId };
}

test('混合新增 + 更新：未解决冲突时整批不写（新增行也不写）', async (t) => {
  const { world, sourceAccount, content } = await mixedSetup(t);
  const { preview: data, commit } = await previewAndCommit(body(content, { sourceAccount }));
  assert.deepEqual(data.rows.map(row => row.disposition), ['review', 'add']);
  assert.equal(commit.status, 422);
  assert.equal(world.transactions.length, 1);
  assert.equal(world.transactions[0].price, 100);
});

test('混合新增 + 更新：预览后目标旧流水被改动 → 409 PREVIEW_STALE，不写入', async (t) => {
  const { world, sourceAccount, content, resolutions, targetId } = await mixedSetup(t);
  const data = await preview(body(content, { sourceAccount, resolutions }));
  assert.equal(data.blocking, false);
  const edit = await call('PUT', `/api/transactions/${targetId}`, { notes: '预览后改动' });
  assert.equal(edit.status, 200);
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...body(content, { sourceAccount, resolutions }), previewToken: data.previewToken, ledgerFingerprint: data.ledgerFingerprint
  });
  assert.equal(commit.status, 409);
  assert.equal(commit.body.code, 'PREVIEW_STALE');
  assert.equal(world.transactions.length, 1);
  assert.equal(world.transactions[0].price, 100);
});

test('混合新增 + 更新：翻转前写入中断 → 新增行删除、旧流水恢复原值，批次 rolled_back', async (t) => {
  let armed = false;
  const { world, sourceAccount, content, resolutions, targetId } = await mixedSetup(t, {
    beforeFlip: async () => { if (armed) throw new Error('simulated crash'); }
  });
  const before = structuredClone(world.transactions[0]);
  armed = true;
  const { preview: data, commit } = await previewAndCommit(body(content, { sourceAccount, resolutions }));
  assert.deepEqual(data.rows.map(row => row.disposition), ['update', 'add']);
  assert.equal(commit.status, 500);
  assert.equal(world.transactions.length, 1, '新增 pending 行已删除');
  const restored = world.transactions[0];
  assert.equal(restored._id, targetId);
  for (const key of ['price', 'grossAmount', 'source', 'sequence', 'fee', 'date']) {
    assert.deepEqual(restored[key], before[key], `${key} 已恢复`);
  }
  const batch = world.importBatches.at(-1);
  assert.equal(batch.status, 'rolled_back');
  assert.equal(batch.updates.length, 1, '原值预写在批次中，供崩溃回收使用');
});

test('混合新增 + 更新：确认成功后回读账本与持仓', async (t) => {
  const { sourceAccount, content, resolutions } = await mixedSetup(t);
  const { commit } = await previewAndCommit(body(content, { sourceAccount, resolutions }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.deepEqual([commit.body.data.added, commit.body.data.updated], [1, 1]);
  const positions = await call('GET', `/api/portfolios/${PORTFOLIO_A}/stats/positions`);
  assert.equal(positions.body.data[0].quantity, 20);
  assert.equal(positions.body.data[0].remainingCost, 10 * 99 + 1 + 10 * 100 + 1);
});
