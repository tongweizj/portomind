const test = require('node:test');
const assert = require('node:assert/strict');

const Transaction = require('../../models/transaction');
const Portfolio = require('../../models/portfolio');
const Asset = require('../../models/asset');
const RebalanceRecord = require('../../models/rebalanceRecord');
const transactionService = require('../../services/transaction.service');
const { calculatePositions } = require('../../services/transaction/positionCalculator');
const { deletePortfolioCascade } = require('../../services/portfolio/deletePortfolio');

const portfolioId = '64b000000000000000000010';
const transactionId = '64b000000000000000000011';
const original = {
  transactionFind: Transaction.find,
  transactionCount: Transaction.countDocuments,
  transactionFindById: Transaction.findById,
  transactionCreate: Transaction.create,
  transactionUpdate: Transaction.findByIdAndUpdate,
  transactionDelete: Transaction.findByIdAndDelete,
  transactionDeleteMany: Transaction.deleteMany,
  portfolioExists: Portfolio.exists,
  portfolioFindById: Portfolio.findById,
  portfolioDelete: Portfolio.findByIdAndDelete,
  assetFindOne: Asset.findOne,
  rebalanceDeleteMany: RebalanceRecord.deleteMany
};

test.afterEach(() => {
  Transaction.find = original.transactionFind;
  Transaction.countDocuments = original.transactionCount;
  Transaction.findById = original.transactionFindById;
  Transaction.create = original.transactionCreate;
  Transaction.findByIdAndUpdate = original.transactionUpdate;
  Transaction.findByIdAndDelete = original.transactionDelete;
  Transaction.deleteMany = original.transactionDeleteMany;
  Portfolio.exists = original.portfolioExists;
  Portfolio.findById = original.portfolioFindById;
  Portfolio.findByIdAndDelete = original.portfolioDelete;
  Asset.findOne = original.assetFindOne;
  RebalanceRecord.deleteMany = original.rebalanceDeleteMany;
});

function transaction(overrides = {}) {
  return {
    _id: overrides._id || transactionId,
    portfolioId,
    symbol: 'VTI',
    assetType: 'etf',
    market: 'US',
    currency: 'USD',
    action: 'buy',
    quantity: 10,
    price: 100,
    date: new Date('2026-01-01T12:00:00Z'),
    ...overrides
  };
}

test('移动平均成本规则正确处理买入和卖出', () => {
  const positions = calculatePositions([
    transaction({ _id: '1', quantity: 10, price: 100 }),
    transaction({ _id: '2', quantity: 10, price: 200, date: new Date('2026-01-02T12:00:00Z') }),
    transaction({ _id: '3', action: 'sell', quantity: 5, price: 180, date: new Date('2026-01-03T12:00:00Z') })
  ]);
  assert.equal(positions[0].quantity, 15);
  assert.equal(positions[0].totalCost, 2250);
  assert.equal(positions[0].avgCost, 150);
  assert.equal(positions[0].realizedPnl, 150);
});

test('修改或删除交易会按新账本重新计算持仓', () => {
  const buy = transaction({ _id: '1', quantity: 10 });
  const sell = transaction({ _id: '2', action: 'sell', quantity: 4, price: 120, date: new Date('2026-01-02T12:00:00Z') });
  assert.equal(calculatePositions([buy, sell])[0].quantity, 6);
  assert.equal(calculatePositions([buy, { ...sell, quantity: 2 }])[0].quantity, 8);
  assert.equal(calculatePositions([buy])[0].quantity, 10);
});

test('创建交易校验组合、资产并从资产派生元数据', async () => {
  Portfolio.exists = async () => true;
  Asset.findOne = async () => ({ active: true, type: 'etf', market: 'US', currency: 'USD' });
  Transaction.find = () => ({ lean: async () => [] });
  let inserted;
  Transaction.create = async data => { inserted = data; return data; };

  await transactionService.createTransaction({
    portfolioId,
    symbol: 'vti',
    action: 'BUY',
    quantity: '2',
    price: '101.5',
    date: '2026-01-01'
  });
  assert.equal(inserted.symbol, 'VTI');
  assert.equal(inserted.quantity, 2);
  assert.equal(inserted.assetType, 'etf');
});

test('无效组合、资产、数量和价格会被拒绝', async () => {
  await assert.rejects(
    transactionService.createTransaction({ portfolioId, symbol: 'VTI', action: 'buy', quantity: 0, price: 1 }),
    error => error.code === 'INVALID_QUANTITY'
  );
  await assert.rejects(
    transactionService.createTransaction({ portfolioId, symbol: 'VTI', action: 'buy', quantity: 1, price: -1 }),
    error => error.code === 'INVALID_PRICE'
  );

  Portfolio.exists = async () => false;
  Asset.findOne = async () => ({ active: true });
  await assert.rejects(
    transactionService.createTransaction({ portfolioId, symbol: 'VTI', action: 'buy', quantity: 1, price: 1 }),
    error => error.code === 'PORTFOLIO_NOT_FOUND' && error.status === 404
  );

  Portfolio.exists = async () => true;
  Asset.findOne = async () => null;
  await assert.rejects(
    transactionService.createTransaction({ portfolioId, symbol: 'NONE', action: 'buy', quantity: 1, price: 1 }),
    error => error.code === 'ASSET_NOT_FOUND' && error.status === 404
  );
});

test('卖出超过交易日可用持仓会被拒绝', async () => {
  Portfolio.exists = async () => true;
  Asset.findOne = async () => ({ active: true, type: 'etf', market: 'US', currency: 'USD' });
  Transaction.find = () => ({ lean: async () => [transaction({ quantity: 2 })] });
  await assert.rejects(
    transactionService.createTransaction({
      portfolioId,
      symbol: 'VTI',
      action: 'sell',
      quantity: 3,
      price: 110,
      date: '2026-01-02'
    }),
    error => error.code === 'INSUFFICIENT_POSITION'
  );
});

test('删除早期买入若造成后续超卖会被拒绝', async () => {
  Transaction.findById = () => ({ lean: async () => transaction() });
  Transaction.find = () => ({ lean: async () => [transaction({
    _id: '2', action: 'sell', quantity: 5, date: new Date('2026-01-02T12:00:00Z')
  })] });
  await assert.rejects(
    transactionService.deleteTransaction(transactionId),
    error => error.code === 'INSUFFICIENT_POSITION'
  );
});

test('更新和成功删除交易都会重放受影响账本', async () => {
  Portfolio.exists = async () => true;
  Asset.findOne = async () => ({ active: true, type: 'etf', market: 'US', currency: 'USD' });
  Transaction.findById = () => ({ lean: async () => transaction({ quantity: 10 }) });
  Transaction.find = () => ({ lean: async () => [transaction({
    _id: '2', action: 'sell', quantity: 5, date: new Date('2026-01-02T12:00:00Z')
  })] });
  let updated;
  Transaction.findByIdAndUpdate = async (id, data) => {
    updated = { id, data };
    return data;
  };

  await transactionService.updateTransaction(transactionId, { quantity: 7 });
  assert.equal(updated.id, transactionId);
  assert.equal(updated.data.quantity, 7);

  Transaction.findById = () => ({ lean: async () => transaction({ action: 'sell', quantity: 5 }) });
  Transaction.find = () => ({ lean: async () => [transaction({ _id: '1', quantity: 10 })] });
  Transaction.findByIdAndDelete = async id => ({ _id: id });
  const deleted = await transactionService.deleteTransaction(transactionId);
  assert.equal(deleted._id, transactionId);
});

test('交易列表统一按日期和 id 倒序并执行分页', async () => {
  let sort;
  let skip;
  let limit;
  Transaction.countDocuments = async query => {
    assert.deepEqual(query, { portfolioId, symbol: 'VTI' });
    return 21;
  };
  Transaction.find = () => ({
    sort(value) { sort = value; return this; },
    skip(value) { skip = value; return this; },
    limit(value) { limit = value; return Promise.resolve([]); }
  });

  const result = await transactionService.getTransactions({
    portfolioId,
    symbol: 'vti',
    page: 2,
    pageSize: 10
  });
  assert.deepEqual(sort, { date: -1, _id: -1 });
  assert.equal(skip, 10);
  assert.equal(limit, 10);
  assert.equal(result.total, 21);
});

test('删除组合级联删除交易和再平衡记录', async () => {
  Portfolio.findById = async () => ({ _id: portfolioId, name: 'Core' });
  Transaction.deleteMany = async query => {
    assert.deepEqual(query, { portfolioId });
    return { deletedCount: 3 };
  };
  RebalanceRecord.deleteMany = async () => ({ deletedCount: 2 });
  Portfolio.findByIdAndDelete = async () => ({ _id: portfolioId });

  const result = await deletePortfolioCascade(portfolioId);
  assert.equal(result.deletedTransactions, 3);
  assert.equal(result.deletedRebalanceRecords, 2);
});
