const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_DIR = '/tmp/portomind-transaction-enhanced-test-logs';

const Transaction = require('../../models/transaction');
const Portfolio = require('../../models/portfolio');
const Asset = require('../../models/asset');
const transactionService = require('../../services/transaction.service');
const { calculatePositions } = require('../../services/transaction/positionCalculator');
const { executeRebalance, revokeExecution } = require('../../services/rebalance/executeRebalance');
const recorder = require('../../services/rebalance/recorder');

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

test('importTransactions：幂等去重 + 成功导入计数', async (t) => {
  t.mock.method(Portfolio, 'exists', async () => true);
  t.mock.method(Asset, 'findOne', async () => ({ symbol: 'VTI', type: 'etf', market: 'US', currency: 'USD', active: true }));
  t.mock.method(Transaction, 'find', (query) => {
    if (query.portfolioId && !query.symbol) {
      return { select: () => ({ lean: async () => [
        { portfolioId, symbol: 'VTI', action: 'buy', quantity: 10, price: 100, date: new Date('2026-01-01T12:00:00Z'), fee: 0 }
      ] }) };
    }
    return { lean: async () => [] };
  });
  t.mock.method(Transaction, 'insertMany', async (docs) => docs);

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
