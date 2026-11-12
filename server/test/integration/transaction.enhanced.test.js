const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-transaction-enhanced-test-logs';

const Transaction = require('@portomind/shared/models/transaction');
const Portfolio = require('@portomind/shared/models/portfolio');
const Asset = require('@portomind/shared/models/asset');
const transactionService = require('@portomind/shared/services/transaction.service');
const { calculatePositions } = require('@portomind/shared/services/transaction/positionCalculator');
const { executeRebalance, revokeExecution } = require('@portomind/shared/services/rebalance/executeRebalance');
const recorder = require('@portomind/shared/services/rebalance/recorder');

const portfolioId = '64b000000000000000000010';

function tx(overrides = {}) {
  return {
    _id: overrides._id || '64b0000000000000000000aa',
    portfolioId,
    symbol: 'VTI',
    assetType: 'etf',
    market: 'US',
    currency: 'USD',
    action: 'buy',
    quantity: 10,
    price: 100,
    fee: 0,
    date: new Date('2026-01-01T12:00:00Z'),
    ...overrides
  };
}

// ───────────────────────── TR-06：fee 重放口径 ─────────────────────────

test('buy 含 fee：剩余成本含费、均价含费', () => {
  const positions = calculatePositions([
    tx({ quantity: 10, price: 100, fee: 5 })
  ]);
  assert.equal(positions[0].remainingCost, 10 * 100 + 5);
  assert.equal(positions[0].avgCost, 100.5);
});

test('sell 扣 fee：realizedPnl = (卖出价-均价)×数量 - fee', () => {
  const positions = calculatePositions([
    tx({ quantity: 10, price: 100, fee: 0 }),
    tx({ _id: '64b0000000000000000000bb', action: 'sell', quantity: 5, price: 110, fee: 2, date: new Date('2026-02-01T12:00:00Z') })
  ]);
  assert.equal(positions[0].quantity, 5);
  assert.equal(positions[0].realizedPnl, (110 - 100) * 5 - 2);
});

test('fee 不回溯漂移：历史交易加 fee 只影响之后持仓', () => {
  const positions = calculatePositions([
    tx({ quantity: 10, price: 100, fee: 0 }),
    tx({ _id: '64b0000000000000000000bb', action: 'buy', quantity: 10, price: 120, fee: 5, date: new Date('2026-02-01T12:00:00Z') })
  ]);
  // 第二笔买入含费 → 均价 = (1000 + 1200 + 5) / 20
  assert.equal(positions[0].avgCost, (1000 + 1200 + 5) / 20);
});

test('非法 fee（负数）拒绝', () => {
  assert.throws(
    () => calculatePositions([tx({ fee: -1 })]),
    error => error.code === 'INVALID_FEE'
  );
});

// ───────────────────────── TR-07：分红 ─────────────────────────

test('div_cash：现金分红不进持仓', () => {
  const positions = calculatePositions([
    tx({ quantity: 10, price: 100 }),
    tx({ _id: '64b0000000000000000000bb', action: 'div_cash', quantity: 10, price: 2, date: new Date('2026-02-01T12:00:00Z') })
  ]);
  assert.equal(positions[0].quantity, 10, '分红不改变持仓数量');
  assert.equal(positions[0].remainingCost, 1000, '分红不改变持仓成本');
  assert.equal(positions[0].realizedPnl, 0, '现金分红不产生已实现盈亏');
});

test('div_reinvest：分红再投等价买入转增持仓', () => {
  const positions = calculatePositions([
    tx({ quantity: 10, price: 100 }),
    tx({ _id: '64b0000000000000000000bb', action: 'div_reinvest', quantity: 2, price: 105, fee: 0, date: new Date('2026-02-01T12:00:00Z') })
  ]);
  assert.equal(positions[0].quantity, 12);
  assert.equal(positions[0].remainingCost, 1000 + 2 * 105);
});

// ───────────────────────── TR-08：A股整手软警告 ─────────────────────────

test('detectLotWarnings：CN buy 非整手返回警告，整手/卖出/基金无警告', () => {
  assert.deepEqual(transactionService.detectLotWarnings({
    asset: { market: 'CN-SH' }, action: 'buy', quantity: 150
  }), ['CN_LOT_SIZE:undefined']);
  assert.deepEqual(transactionService.detectLotWarnings({
    asset: { market: 'CN-SZ', symbol: '000001' }, action: 'buy', quantity: 200
  }), []);
  assert.deepEqual(transactionService.detectLotWarnings({
    asset: { market: 'CN-SH' }, action: 'sell', quantity: 150
  }), [], '卖出不受限');
  assert.deepEqual(transactionService.detectLotWarnings({
    asset: { market: 'CN-FUND' }, action: 'buy', quantity: 150
  }), [], '基金不受限');
});

// ───────────────────────── TR-09：CSV 批量导入 ─────────────────────────

// TASK-046：内存版 Transaction 存储，**尊重 select() 投影**。
// 原 mock 无视投影、直接返回 portfolioId，导致「库侧键含 portfolioId」的假阳性；
// 这里按 select 参数裁剪字段，未请求的字段一律不出现（与真实 Mongo 行为一致）。
const PICK_ALL = ['portfolioId', 'symbol', 'action', 'quantity', 'price', 'date', 'fee', 'notes'];

function createProjectedStore(t, initial = [], store = []) {
  const rows = [...initial, ...store];
  const pick = (doc, projection) => {
    if (!projection) return { ...doc };
    const fields = String(projection).split(/\s+/).filter(Boolean);
    const out = {};
    for (const field of fields) {
      if (field in doc) out[field] = doc[field];
    }
    // 真实 Mongo 一定返回 _id（除非显式排除），这里保留以便调试
    if (doc._id !== undefined && !fields.includes('-_id')) out._id = doc._id;
    return out;
  };

  t.mock.method(Transaction, 'find', (query = {}) => {
    const matched = rows.filter(row => {
      if (query.portfolioId && String(row.portfolioId) !== String(query.portfolioId)) return false;
      if (query.symbol && row.symbol !== query.symbol) return false;
      return true;
    });
    const chain = {
      select(projection) {
        chain._projection = projection;
        return chain;
      },
      sort: () => chain,
      limit: () => chain,
      lean: async () => matched.map(row => pick(row, chain._projection))
    };
    return chain;
  });

  t.mock.method(Transaction, 'insertMany', async (docs) => {
    const created = docs.map((doc, i) => ({ _id: `new-${rows.length + i}`, ...doc }));
    rows.push(...created);
    return created;
  });

  return rows;
}

test('importTransactions：幂等去重 + 成功导入计数', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  createProjectedStore(t, [
    { portfolioId, symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: new Date('2026-01-01T12:00:00Z'), fee: 0 }
  ]);

  const result = await transactionService.importTransactions({
    portfolioId,
    transactions: [
      // 与库中已有记录完全一致 → skipped
      { symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: '2026-01-01' },
      // 新记录 → imported
      { symbol: 'VTI', action: 'buy', quantity: 5, price: 101, date: '2026-03-01', fee: 2 },
      // 批次内重复 → 去重
      { symbol: 'VTI', action: 'buy', quantity: 5, price: 101, date: '2026-03-01', fee: 2 }
    ]
  });
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.errors, []);
});

// TASK-046 AC1：同一 CSV 连续导入两次——第二次必须全部跳过，库内只增 N 条。
test('importTransactions：连续导入两次 → 第二次全部跳过（AC1）', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  const store = createProjectedStore(t);

  const csv = [
    { symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: '2026-01-01' },
    { symbol: 'VTI', action: 'buy', quantity: 5, price: 101, date: '2026-03-01', fee: 2 }
  ];

  const first = await transactionService.importTransactions({ portfolioId, transactions: csv });
  assert.equal(first.imported, 2, '首次导入 2 条');
  assert.equal(first.skipped, 0, '首次无跳过');
  assert.deepEqual(first.errors, []);

  const second = await transactionService.importTransactions({ portfolioId, transactions: csv });
  assert.equal(second.imported, 0, '二次导入不应新增（AC1）');
  assert.equal(second.skipped, 2, '二次导入应全部跳过（AC1）');
  assert.deepEqual(second.errors, []);

  assert.equal(store.length, 2, '库内只应有 2 行（AC1）');
});

// TASK-046 AC2：批次内重复行仍去重（不回归）。
test('importTransactions：同批次内重复行去重（AC2）', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  const store = createProjectedStore(t);

  const result = await transactionService.importTransactions({
    portfolioId,
    transactions: [
      { symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: '2026-01-01' },
      { symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: '2026-01-01' }
    ]
  });

  assert.equal(result.imported, 1, '同批重复只导入 1 条');
  assert.equal(store.length, 1);
});

// TASK-046 AC3（F-046-1 返修）：同一 CSV 导入两个不同组合——两边都应成功导入，
// 不得跨组合误判重复。幂等键首段是 portfolioId，且库侧查询范围是 find({portfolioId})。
test('importTransactions：同一 CSV 导入两个不同组合，两边都成功（AC3）', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  const store = createProjectedStore(t);

  const otherPortfolio = '64b0000000000000000000c2';
  const csv = [{ symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: '2026-01-01' }];

  const intoFirst = await transactionService.importTransactions({ portfolioId, transactions: csv });
  assert.equal(intoFirst.imported, 1, '第一个组合应导入 1 条');
  assert.equal(intoFirst.skipped, 0, '第一个组合不应判重');

  const intoSecond = await transactionService.importTransactions({ portfolioId: otherPortfolio, transactions: csv });
  assert.equal(intoSecond.imported, 1, '第二个组合同样应导入（不得跨组合误判重复）');
  assert.equal(intoSecond.skipped, 0, '第二个组合不应跳过');

  assert.equal(store.length, 2, '两个组合各存一份，共 2 行');

  // 回到第一个组合再导入同一批 → 必须跳过（证明隔离的是归属，不是关掉了判重）
  const backToFirst = await transactionService.importTransactions({ portfolioId, transactions: csv });
  assert.equal(backToFirst.imported, 0, '原组合重复导入应全部跳过');
  assert.equal(backToFirst.skipped, 1);
});

// TASK-046 AC4（F-046-1 返修）：字段有任何差异时不得判重（幂等键语义不被放宽）。
test('importTransactions：字段有差异时不判重（AC4）', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  const store = createProjectedStore(t);

  const base = { symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: '2026-01-01' };

  // 先导入基准行
  const first = await transactionService.importTransactions({ portfolioId, transactions: [base] });
  assert.equal(first.imported, 1);

  // 五项差异：fee / quantity / price / date 差一天 / action
  const variants = [
    { label: 'fee', tx: { ...base, fee: 5 } },
    { label: 'quantity', tx: { ...base, quantity: 11 } },
    { label: 'price', tx: { ...base, price: 101 } },
    { label: 'date 差一天', tx: { ...base, date: '2026-01-02' } },
    { label: 'action', tx: { ...base, action: 'div_cash' } }
  ];

  let expectedRows = 1;
  for (const { label, tx } of variants) {
    const result = await transactionService.importTransactions({ portfolioId, transactions: [tx] });
    assert.equal(result.imported, 1, `${label} 有差异时应照常导入，不得判重`);
    assert.equal(result.skipped, 0, `${label} 有差异时 skipped 应为 0`);
    expectedRows += 1;
    assert.equal(store.length, expectedRows, `${label} 导入后库内应有 ${expectedRows} 行`);
  }

  // 对照：完全相同的行仍然判重（证明上面不是把判重关掉了）
  const control = await transactionService.importTransactions({ portfolioId, transactions: [base] });
  assert.equal(control.imported, 0, '完全相同的行应判重');
  assert.equal(control.skipped, 1);
});

test('importTransactions：非法行整批回滚（imported=0 且返回错误）', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  t.mock.method(Transaction, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const insertMock = t.mock.method(Transaction, 'insertMany', async (docs) => docs);

  const result = await transactionService.importTransactions({
    portfolioId,
    transactions: [
      { symbol: 'VTI', action: 'buy', quantity: 10, price: 100 },
      { symbol: 'VTI', action: 'bad', quantity: 10, price: 100 } // 非法方向
    ]
  });
  assert.equal(result.imported, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(insertMock.mock.callCount(), 0, '校验失败不写入任何记录');
});

test('importTransactions：超卖导致整批回滚', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  t.mock.method(Transaction, 'find', (query) => {
    if (query.portfolioId && !query.symbol) return { select: () => ({ lean: async () => [] }) };
    return { lean: async () => [] };
  });
  const insertMock = t.mock.method(Transaction, 'insertMany', async (docs) => docs);

  await assert.rejects(
    transactionService.importTransactions({
      portfolioId,
      transactions: [{ symbol: 'VTI', action: 'sell', quantity: 100, price: 90, date: '2026-01-01' }]
    }),
    error => error.code === 'INSUFFICIENT_POSITION'
  );
  assert.equal(insertMock.mock.callCount(), 0, '超卖不写入任何记录');
});

// ───────────────────────── RB-10：执行/撤销费用口径 ─────────────────────────

test('executeRebalance：创建交易时写入建议预估费用（fee = estimatedCost）', async (t) => {
  const record = {
    _id: '64b0000000000000000000cc',
    portfolioId,
    status: 'PENDING',
    suggestions: [
      { symbol: 'VTI', action: 'sell', quantity: 5, price: 100, estimatedCost: 3.5 },
      { symbol: 'BND', action: 'buy', quantity: 10, price: 50, estimatedCost: 1.2 }
    ]
  };
  t.mock.method(recorder, 'getRecord', async () => record);
  t.mock.method(recorder, 'updateStatus', async (id, status) => ({ id, status }));
  const created = [];
  t.mock.method(transactionService, 'createTransaction', async (input) => {
    created.push(input);
    return { _id: '64b0000000000000000000dd', ...input };
  });

  await executeRebalance(portfolioId, { recordId: record._id, suggestions: record.suggestions, mode: 'MANUAL' });

  assert.equal(created.length, 2);
  assert.equal(created[0].symbol, 'VTI');
  assert.equal(created[0].fee, 3.5, '卖出建议费用写入交易');
  assert.equal(created[1].fee, 1.2, '买入建议费用写入交易');
});

test('revokeExecution：反向交易 fee 与原交易一致', async (t) => {
  const record = {
    _id: '64b0000000000000000000ee',
    portfolioId,
    status: 'EXECUTED',
    executedTransactionIds: ['64b0000000000000000000ff']
  };
  t.mock.method(recorder, 'getRecord', async () => record);
  t.mock.method(recorder, 'updateStatus', async (id, status) => ({ id, status }));
  t.mock.method(Transaction, 'find', () => ({ lean: async () => [
    { _id: '64b0000000000000000000ff', portfolioId, symbol: 'VTI', action: 'buy', quantity: 5, price: 100, fee: 3.5 }
  ] }));
  const created = [];
  t.mock.method(transactionService, 'createTransaction', async (input) => {
    created.push(input);
    return { _id: '64b000000000000000000010', ...input };
  });

  await revokeExecution(record._id);

  assert.equal(created.length, 1);
  assert.equal(created[0].action, 'sell');
  assert.equal(created[0].fee, 3.5, '撤销反向交易保留原费用');
});
