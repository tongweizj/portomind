// server/test/integration/transactionImport.api.test.js
//
// TASK-094（#94）：标准 CSV 成交导入与来源追溯。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 的内存替身，不连接 MongoDB。
// 全部样例为合成数据（仓库为 public，禁止使用真实券商报表）。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');

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

async function call(method, pathname, body, { authenticated = true, raw } = {}) {
  const headers = authenticated ? { cookie: authHeaders().cookie } : {};
  if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body))
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON（模板下载） */ }
  return { status: response.status, body: json, text, headers: response.headers };
}

test('GET /api/transactions/import/template：下载标准 CSV 模板（表头 + 示例行）', async () => {
  const { status, text, headers } = await call('GET', '/api/transactions/import/template');
  assert.equal(status, 200);
  assert.match(headers.get('content-type'), /text\/csv/);
  assert.match(headers.get('content-disposition'), /attachment; filename="portomind-transactions-template\.csv"/);
  const [header, ...examples] = text.trim().split(/\r?\n/);
  assert.equal(
    header,
    'activity_type,trade_date,trade_time,time_zone,settlement_date,external_id,source_row,pair_group,' +
    'account_number,symbol,market,quantity,unit_price,cash_amount,cash_currency,commission,split_ratio,' +
    'transfer_cost,transfer_cost_currency,notes'
  );
  assert.ok(examples.length >= 2, '模板至少含买入与卖出示例行');
});

test('模板端点仍在认证闸门之后（未登录 401）', async () => {
  const { status } = await call('GET', '/api/transactions/import/template', undefined, { authenticated: false });
  assert.equal(status, 401);
});

// ─────────────────────────────────────────────────────────────
// 合成数据（虚构标的价格、编号与账号）
// ─────────────────────────────────────────────────────────────

const marketData = require('@portomind/shared/services/marketData.service');

const HEADER = 'activity_type,trade_date,trade_time,time_zone,settlement_date,external_id,source_row,' +
  'account_number,symbol,market,quantity,unit_price,cash_amount,cash_currency,commission,pair_group,notes';

function csvLine(row = {}) {
  const base = {
    activity_type: 'buy', trade_date: '2026-01-05', trade_time: '', time_zone: '', settlement_date: '',
    external_id: '', source_row: '', account_number: '', symbol: 'VTI', market: 'US', quantity: '1',
    unit_price: '100', cash_amount: '', cash_currency: 'USD', commission: '0', pair_group: '', notes: '',
    ...row
  };
  return HEADER.split(',').map(key => base[key]).join(',');
}

function csv(rows) {
  return [HEADER, ...rows.map(csvLine)].join('\n');
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [
      { _id: PORTFOLIO_A, name: '合成组合 A', currency: 'USD' },
      { _id: PORTFOLIO_B, name: '合成组合 B', currency: 'USD' }
    ],
    assets: [
      { _id: '64b000000000000000000b01', symbol: 'VTI.US', type: 'etf', market: 'US', currency: 'USD', active: true },
      { _id: '64b000000000000000000b02', symbol: 'XEQT.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true }
    ],
    ...extra
  }, extra.hooks);
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

const NEW_SOURCE = { broker: 'other', alias: '合成券商账户' };

function importBody(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'standard',
    file: { name: 'synthetic.csv', content },
    sourceAccount: NEW_SOURCE,
    ...overrides
  };
}

async function previewAndCommit(body) {
  const preview = await call('POST', '/api/transactions/import/preview', body);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...body,
    previewToken: preview.body.data.previewToken,
    ledgerFingerprint: preview.body.data.ledgerFingerprint
  });
  return { preview: preview.body.data, commit };
}

test('预览覆盖完整批次：60 行全部出现，第 51 行及之后参与核对', async (t) => {
  freshWorld(t);
  const rows = Array.from({ length: 60 }, (_, index) => ({ trade_date: '2026-01-05', quantity: String(index + 1) }));
  const { status, body } = await call('POST', '/api/transactions/import/preview', importBody(csv(rows)));
  assert.equal(status, 200, JSON.stringify(body));
  const data = body.data;
  assert.equal(data.rows.length, 60);
  assert.equal(data.counts.add, 60);
  assert.equal(data.blocking, false);
  assert.equal(data.target.name, '合成组合 A');
  assert.equal(data.sourceAccount.isNew, true);
  assert.equal(data.sourceAccount.alias, '合成券商账户');
  // 无原行号 → 上传文件行号（表头为第 1 行）
  assert.equal(data.rows[50].rowNumber, 52);
  assert.equal(data.rows[50].rowNumberKind, 'file');
  assert.equal(data.rows[59].candidate.quantity, 60);
  assert.equal(data.rows[0].candidate.symbol, 'VTI.US', 'symbol 经 ADR-003 派生为存储键');
});

test('未知类型与缺关键字段：显示原行号（缺失时上传文件行号）与原因，并阻塞整批', async (t) => {
  freshWorld(t);
  const content = csv([
    { source_row: '17', activity_type: 'mystery' },
    { unit_price: '' },
    { activity_type: 'fx' }
  ]);
  const { body } = await call('POST', '/api/transactions/import/preview', importBody(content));
  const [unknown, missing, unsupported] = body.data.rows;
  assert.deepEqual([unknown.disposition, unknown.code, unknown.rowNumber, unknown.rowNumberKind], ['error', 'UNKNOWN_ACTIVITY', 17, 'original']);
  assert.match(unknown.reason, /mystery/);
  assert.deepEqual([missing.disposition, missing.code, missing.rowNumber, missing.rowNumberKind], ['error', 'MISSING_FIELD', 3, 'file']);
  assert.match(missing.reason, /unit_price/);
  assert.equal(unsupported.code, 'UNSUPPORTED_ACTIVITY');
  assert.equal(body.data.blocking, true);
  assert.ok(body.data.blockingReasons.some(item => item.code === 'ROW_ERRORS'));
});

test('错误阻塞整批：commit 返回 422 IMPORT_BLOCKED，不写任何流水与来源账户', async (t) => {
  const world = freshWorld(t);
  const { commit } = await previewAndCommit(importBody(csv([{}, { activity_type: 'mystery' }])));
  assert.equal(commit.status, 422);
  assert.equal(commit.body.code, 'IMPORT_BLOCKED');
  assert.equal(world.transactions.length, 0);
  assert.equal(world.sourceAccounts.length, 0);
  assert.equal(world.importBatches[0].status, 'rolled_back', '锁已释放');
  assert.equal(world.importBatches[0].lockKey, undefined);
});

test('确认后回读：流水带来源引用与原成交编号（无编号为 null），持仓随之更新', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { external_id: 'SYN-1', source_row: '8', trade_time: '00:00:00', time_zone: 'America/Toronto', quantity: '10', unit_price: '100', commission: '1', cash_amount: '-1001', settlement_date: '2026-01-06' },
    { activity_type: 'sell', trade_date: '2026-02-01', quantity: '-4', unit_price: '110', commission: '0', notes: '合成卖出' }
  ]);
  const { commit } = await previewAndCommit(importBody(content, { file: { name: 'synthetic-a.csv', content } }));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const result = commit.body.data;
  assert.equal(result.added, 2);
  assert.equal(result.rows.every(row => row.transactionId), true, '当次结果逐行给出入账流水');

  const list = await call('GET', `/api/portfolios/${PORTFOLIO_A}/transactions`);
  const sell = list.body.data.find(tx => tx.action === 'sell');
  const buy = list.body.data.find(tx => tx.action === 'buy');
  assert.equal(buy.source.externalId, 'SYN-1');
  assert.equal(buy.source.rowNumber, 8);
  assert.equal(buy.source.rowNumberKind, 'original');
  assert.equal(buy.source.fileName, 'synthetic-a.csv');
  assert.equal(buy.dateKind, 'datetime', '明确午夜保留为时刻精度');
  assert.equal(new Date(buy.date).toISOString(), '2026-01-05T05:00:00.000Z');
  assert.equal(buy.cashAmount, -1001);
  assert.equal(buy.grossAmount, 1000);
  assert.equal(sell.source.externalId, null, '无编号留空，不合成');
  assert.equal(sell.dateKind, 'date');
  assert.equal(sell.quantity, 4, '卖出负数量取绝对值');
  assert.equal(String(sell.sourceAccountId), String(buy.sourceAccountId));
  assert.ok(world.transactions.every(tx => tx.status === 'committed'));

  const accounts = await call('GET', '/api/source-accounts');
  assert.equal(accounts.body.data.length, 1);
  assert.equal(accounts.body.data[0].id, String(buy.sourceAccountId));
  assert.deepEqual(accounts.body.data[0].portfolioIds, [PORTFOLIO_A]);

  const positions = await call('GET', `/api/portfolios/${PORTFOLIO_A}/stats/positions`);
  assert.equal(positions.status, 200, JSON.stringify(positions.body));
  assert.equal(positions.body.data[0].quantity, 6);
  assert.equal(positions.body.data[0].remainingCost, 1001 - (1001 / 10) * 4);
});

test('同一实际账户改别名后跨组合导入：识别为同一来源，原流水保持组合归属；不存完整账号', async (t) => {
  const world = freshWorld(t);
  const first = csv([{ account_number: 'SYN00012345', external_id: 'SYN-A1' }]);
  const one = await previewAndCommit(importBody(first, { sourceAccount: { broker: 'other', alias: '旧别名' } }));
  assert.equal(one.commit.status, 201);
  const sourceId = one.commit.body.data.sourceAccountId;
  assert.equal(world.sourceAccounts[0].accountKeyLast4, '2345');
  assert.ok(!JSON.stringify(world.sourceAccounts).includes('SYN00012345'), '完整账号不落库');

  const second = csv([{ account_number: 'SYN00012345', external_id: 'SYN-B1', trade_date: '2026-03-01' }]);
  const two = await previewAndCommit(importBody(second, {
    portfolioId: PORTFOLIO_B,
    sourceAccount: { broker: 'other', alias: '新别名' }
  }));
  assert.equal(two.preview.sourceAccount.id, sourceId, '按账号识别同一来源账户');
  assert.equal(two.preview.sourceAccount.isNew, false);
  assert.equal(two.commit.status, 201);
  assert.equal(world.sourceAccounts.length, 1);
  assert.equal(world.sourceAccounts[0].alias, '新别名');
  assert.deepEqual(world.sourceAccounts[0].portfolioIds.map(String).sort(), [PORTFOLIO_A, PORTFOLIO_B]);
  const byPortfolio = world.transactions.map(tx => [tx.source.externalId, String(tx.portfolioId)]).sort();
  assert.deepEqual(byPortfolio, [['SYN-A1', PORTFOLIO_A], ['SYN-B1', PORTFOLIO_B]]);

  // 也可按 id 选择已有来源账户（无账号列的文件）
  const third = await call('POST', '/api/transactions/import/preview', importBody(csv([{ trade_date: '2026-04-01' }]), {
    sourceAccount: { id: sourceId }
  }));
  assert.equal(third.body.data.sourceAccount.id, sourceId);

  const renamed = await call('PATCH', `/api/source-accounts/${sourceId}`, { alias: '第三个别名' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.alias, '第三个别名');
});

test('多账户报表按账户拆分：未选择时阻塞，选择后其他账户的行不入账', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { account_number: 'SYN-1111', external_id: 'M-1' },
    { account_number: 'SYN-2222', external_id: 'M-2' },
    { account_number: 'SYN-1111', external_id: 'M-3' }
  ]);
  const first = await call('POST', '/api/transactions/import/preview', importBody(content));
  assert.equal(first.body.data.requiresAccountSelection, true);
  assert.equal(first.body.data.blocking, true);
  assert.deepEqual(first.body.data.accounts.map(item => [item.accountKeyLast4, item.rowCount]), [['1111', 2], ['2222', 1]]);

  const selector = first.body.data.accounts[0].selector;
  const { preview, commit } = await previewAndCommit(importBody(content, { accountSelector: selector }));
  assert.deepEqual(preview.rows.map(row => row.disposition), ['add', 'skip', 'add']);
  assert.equal(preview.rows[1].code, 'OTHER_SOURCE_ACCOUNT');
  assert.equal(commit.status, 201);
  assert.deepEqual(world.transactions.map(tx => tx.source.externalId), ['M-1', 'M-3']);
  assert.equal(world.sourceAccounts[0].accountKeyLast4, '1111');
});

test('过期预览：预览后账本变化（手动录入同标的）→ 409 PREVIEW_STALE，不写入', async (t) => {
  const world = freshWorld(t);
  const body = importBody(csv([{ external_id: 'S-1' }]));
  const preview = await call('POST', '/api/transactions/import/preview', body);
  const manual = await call('POST', '/api/transactions', {
    portfolioId: PORTFOLIO_A, symbol: 'VTI.US', action: 'buy', quantity: 1, price: 99, date: '2026-01-02'
  });
  assert.equal(manual.status, 201, JSON.stringify(manual.body));
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...body,
    previewToken: preview.body.data.previewToken,
    ledgerFingerprint: preview.body.data.ledgerFingerprint
  });
  assert.equal(commit.status, 409);
  assert.equal(commit.body.code, 'PREVIEW_STALE');
  assert.equal(commit.body.details.reason, 'LEDGER_CHANGED');
  assert.equal(world.transactions.length, 1, '只有手动录入那一笔');
});

test('过期预览：确认时文件内容与预览不一致 → 409 PREVIEW_STALE（INPUT_CHANGED）', async (t) => {
  const world = freshWorld(t);
  const body = importBody(csv([{ quantity: '1' }]));
  const preview = await call('POST', '/api/transactions/import/preview', body);
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...importBody(csv([{ quantity: '2' }])),
    previewToken: preview.body.data.previewToken,
    ledgerFingerprint: preview.body.data.ledgerFingerprint
  });
  assert.equal(commit.status, 409);
  assert.equal(commit.body.details.reason, 'INPUT_CHANGED');
  assert.equal(world.transactions.length, 0);
});

test('commit 未携带预览凭据 → 400 PREVIEW_REQUIRED', async (t) => {
  freshWorld(t);
  const commit = await call('POST', '/api/transactions/import/commit', importBody(csv([{}])));
  assert.equal(commit.status, 400);
  assert.equal(commit.body.code, 'PREVIEW_REQUIRED');
});

function manyRows(count, overrides = () => ({})) {
  return Array.from({ length: count }, (_, index) => ({
    external_id: `BULK-${index + 1}`,
    trade_date: '2026-01-05',
    ...overrides(index)
  }));
}

test('500 条普通流水可一次提交（请求体超过默认 100kb 上限仍被接受）', async (t) => {
  const world = freshWorld(t);
  const longNote = 'x'.repeat(200);
  const content = csv(manyRows(500, () => ({ notes: longNote })));
  assert.ok(Buffer.byteLength(content) > 100 * 1024, '用例需覆盖超过 100kb 的请求体');
  const { preview, commit } = await previewAndCommit(importBody(content));
  assert.equal(preview.requiresSplit, false);
  assert.equal(commit.status, 201, JSON.stringify(commit.body).slice(0, 300));
  assert.equal(commit.body.data.added, 500);
  assert.equal(world.transactions.length, 500);
});

test('其他路由仍保持默认请求体上限（仅导入端点放宽）', async (t) => {
  freshWorld(t);
  const { status } = await call('POST', '/api/transactions', { notes: 'x'.repeat(120 * 1024) });
  assert.equal(status, 413);
});

test('501 条提示拆批：预览分为 500 + 1，确认只写第 1 批，其余标为 deferred', async (t) => {
  const world = freshWorld(t);
  const { preview, commit } = await previewAndCommit(importBody(csv(manyRows(501))));
  assert.equal(preview.requiresSplit, true);
  assert.deepEqual(preview.batches.map(batch => batch.count), [500, 1]);
  assert.equal(commit.status, 201);
  assert.equal(commit.body.data.added, 500);
  assert.equal(commit.body.data.deferred, 1);
  assert.equal(commit.body.data.remainingBatches, 1);
  assert.equal(world.transactions.length, 500);

  // 重新预览（选择已建立的来源账户）：已入账 500 行跳过，剩余 1 行可继续提交
  const next = importBody(csv(manyRows(501)), { sourceAccount: { id: commit.body.data.sourceAccountId } });
  const again = await previewAndCommit(next);
  assert.equal(again.preview.counts.skip, 500);
  assert.equal(again.preview.counts.add, 1);
  assert.equal(again.commit.status, 201);
  assert.equal(world.transactions.length, 501);
});

test('成对流水落在第 500 / 501 行：拆批边界前移，两条留在同一次确认中', async (t) => {
  freshWorld(t);
  const rows = manyRows(501, index => (index >= 499 ? { pair_group: 'PAIR-1' } : {}));
  const { body } = await call('POST', '/api/transactions/import/preview', importBody(csv(rows)));
  assert.deepEqual(body.data.batches.map(batch => batch.count), [499, 2]);
});

test('重复导入同一文件：全部跳过并提示无可写入流水', async (t) => {
  freshWorld(t);
  const content = csv([{ external_id: 'R-1' }, { trade_date: '2026-01-06' }]);
  const first = await previewAndCommit(importBody(content));
  assert.equal(first.commit.status, 201);
  const sourceAccount = { id: first.commit.body.data.sourceAccountId };
  const { body } = await call('POST', '/api/transactions/import/preview', importBody(content, { sourceAccount }));
  assert.deepEqual(body.data.rows.map(row => [row.disposition, row.code]), [['skip', 'ALREADY_IMPORTED'], ['skip', 'ALREADY_IMPORTED']]);
  assert.equal(body.data.blocking, true);
  assert.equal(body.data.blockingReasons[0].code, 'NOTHING_TO_IMPORT');
});

test('同文件重复原成交编号：内容一致跳过重复行，内容不同待核对（#95）', async (t) => {
  freshWorld(t);
  const { body } = await call('POST', '/api/transactions/import/preview', importBody(csv([
    { external_id: 'D-1' }, { external_id: 'D-1' }, { external_id: 'D-1', quantity: '3' }
  ])));
  assert.deepEqual(body.data.rows.map(row => row.code), [null, 'DUPLICATE_IN_FILE', 'EXTERNAL_ID_CONFLICT_IN_FILE']);
});

test('佣金缺失且无法推导：待核对阻塞；确认按 0 后可提交，可由现金净额推算佣金', async (t) => {
  const world = freshWorld(t);
  const content = csv([
    { commission: '' },
    { commission: '', cash_amount: '-101.5', trade_date: '2026-01-06' }
  ]);
  const first = await call('POST', '/api/transactions/import/preview', importBody(content));
  const [unknown, derived] = first.body.data.rows;
  assert.equal(unknown.disposition, 'review');
  assert.equal(unknown.code, 'FEE_UNKNOWN');
  assert.equal(derived.candidate.fee, 1.5);
  assert.equal(derived.candidate.feeSource, 'derived');
  assert.equal(first.body.data.blocking, true);

  const resolutions = { [unknown.rowKey]: { confirmZeroFee: true } };
  const { preview, commit } = await previewAndCommit(importBody(content, { resolutions }));
  assert.equal(preview.rows[0].candidate.feeSource, 'confirmed_zero');
  assert.equal(commit.status, 201);
  assert.deepEqual(world.transactions.map(tx => [tx.fee, tx.feeSource]), [[0, 'confirmed_zero'], [1.5, 'derived']]);
});

test('超卖校验沿用现行规则：导入卖出超过可用持仓的行标错并阻塞', async (t) => {
  freshWorld(t);
  const { body } = await call('POST', '/api/transactions/import/preview', importBody(csv([
    { quantity: '2' },
    { activity_type: 'sell', quantity: '5', trade_date: '2026-01-08' }
  ])));
  assert.deepEqual(body.data.rows.map(row => row.disposition), ['add', 'error']);
  assert.equal(body.data.rows[1].code, 'INSUFFICIENT_POSITION');
});

test('手动列映射：非标准表头经映射后由服务端解析', async (t) => {
  freshWorld(t);
  const content = ['Type,Date,Ticker,Exchange,Shares,Price,Currency,Fee', 'buy,2026-01-05,VTI,US,3,100,USD,0'].join('\n');
  const auto = await call('POST', '/api/transactions/import/preview', importBody(content));
  assert.equal(auto.body.data.blocking, true);
  assert.equal(auto.body.data.blockingReasons[0].code, 'MISSING_COLUMNS');
  assert.deepEqual(auto.body.data.headers, ['Type', 'Date', 'Ticker', 'Exchange', 'Shares', 'Price', 'Currency', 'Fee']);

  const mapping = { 0: 'activity_type', 1: 'trade_date', 2: 'symbol', 3: 'market', 4: 'quantity', 5: 'unit_price', 6: 'cash_currency', 7: 'commission' };
  const mapped = await call('POST', '/api/transactions/import/preview', importBody(content, { mapping }));
  assert.equal(mapped.body.data.blocking, false);
  assert.equal(mapped.body.data.rows[0].candidate.quantity, 3);

  const bad = await call('POST', '/api/transactions/import/preview', importBody(content, { mapping: { 0: 'activity_type', 1: 'activity_type' } }));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_MAPPING');
});

test('整批一致性：翻转前写入中断 → 无可见流水、无 pending 残留，批次 rolled_back', async (t) => {
  const world = freshWorld(t, { hooks: { beforeFlip: async () => { throw new Error('simulated crash'); } } });
  const content = csv([{ external_id: 'F-1' }, { external_id: 'F-2', pair_group: 'G' }, { external_id: 'F-3', pair_group: 'G' }]);
  const { commit } = await previewAndCommit(importBody(content));
  assert.equal(commit.status, 500);
  assert.equal(world.transactions.length, 0, 'pending 行已补偿删除');
  assert.equal(world.importBatches[0].status, 'rolled_back');
  assert.equal(world.importBatches[0].lockKey, undefined);
});

test('并发确认：同组合已有确认进行中 → 409 IMPORT_IN_PROGRESS，不写入', async (t) => {
  const world = freshWorld(t, {
    importBatches: [{ _id: '64b000000000000000000c01', portfolioId: PORTFOLIO_A, status: 'committing', lockKey: `portfolio:${PORTFOLIO_A}`, updatedAt: new Date() }]
  });
  const { commit } = await previewAndCommit(importBody(csv([{}])));
  assert.equal(commit.status, 409);
  assert.equal(commit.body.code, 'IMPORT_IN_PROGRESS');
  assert.equal(world.transactions.length, 0);
});

test('崩溃遗留的超时批次在下一次确认前回收：pending 行删除、锁释放', async (t) => {
  const staleId = '64b000000000000000000c02';
  const world = freshWorld(t, {
    importBatches: [{ _id: staleId, portfolioId: PORTFOLIO_A, status: 'committing', lockKey: `portfolio:${PORTFOLIO_A}`, updatedAt: new Date(Date.now() - 60 * 60 * 1000) }],
    transactions: [{ _id: '64b000000000000000000d01', portfolioId: PORTFOLIO_A, symbol: 'VTI.US', action: 'buy', quantity: 99, price: 1, fee: 0, date: new Date('2026-01-01'), status: 'pending', source: { importBatchId: staleId } }]
  });
  const { commit } = await previewAndCommit(importBody(csv([{}])));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  assert.equal(world.importBatches.find(batch => batch._id === staleId).status, 'rolled_back');
  assert.ok(world.transactions.every(tx => tx.quantity !== 99));
});

test('pending 行对手动录入的超卖校验不可见（回归：手动录入沿用现行规则）', async (t) => {
  freshWorld(t, {
    transactions: [{ _id: '64b000000000000000000d02', portfolioId: PORTFOLIO_A, symbol: 'VTI.US', assetType: 'etf', market: 'US', currency: 'USD', action: 'buy', quantity: 10, price: 1, fee: 0, date: new Date('2026-01-01'), status: 'pending' }]
  });
  const sell = await call('POST', '/api/transactions', {
    portfolioId: PORTFOLIO_A, symbol: 'VTI.US', action: 'sell', quantity: 1, price: 1, date: '2026-01-05'
  });
  assert.equal(sell.status, 400);
  assert.equal(sell.body.code, 'INSUFFICIENT_POSITION');
});
