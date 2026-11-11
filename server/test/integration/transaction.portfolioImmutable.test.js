// server/test/integration/transaction.portfolioImmutable.test.js
//
// TASK-047 M-2：交易归属不可变守卫（后端为权威层）。
//
// Human 2026-10-19 裁定「方案②」：归属不可变，由数据层保证。
// 三条硬约束（卡内 R-1b / R-1c）：
//   ① 不能写成「出现 portfolioId 就拒绝」——编辑页每次提交都带该字段；
//   ② 不能靠从 WRITABLE_FIELDS 删 portfolioId——创建路径仍需它；
//   ③ 校验必须在 normalizeInput 合并入参**之前**。
//
// 本文件在未加守卫的实现上，「改归属 → 400」用例必须失败。
const test = require('node:test');
const assert = require('node:assert/strict');

const Transaction = require('@portomind/shared/models/transaction');
const Portfolio = require('@portomind/shared/models/portfolio');
const Asset = require('@portomind/shared/models/asset');
const transactionService = require('@portomind/shared/services/transaction.service');

const PORTFOLIO_A = '64b000000000000000000010';
const PORTFOLIO_B = '64b000000000000000000020';
const TX_ID = '64b000000000000000000011';

const original = {
  transactionFind: Transaction.find,
  transactionCount: Transaction.countDocuments,
  transactionFindById: Transaction.findById,
  transactionCreate: Transaction.create,
  transactionUpdate: Transaction.findByIdAndUpdate,
  portfolioExists: Portfolio.exists,
  assetFindOne: Asset.findOne
};

test.afterEach(() => {
  Transaction.find = original.transactionFind;
  Transaction.countDocuments = original.transactionCount;
  Transaction.findById = original.transactionFindById;
  Transaction.create = original.transactionCreate;
  Transaction.findByIdAndUpdate = original.transactionUpdate;
  Portfolio.exists = original.portfolioExists;
  Asset.findOne = original.assetFindOne;
});

function existingTransaction(overrides = {}) {
  return {
    _id: TX_ID,
    portfolioId: PORTFOLIO_A,
    symbol: 'VTI',
    action: 'buy',
    quantity: 10,
    price: 100,
    fee: 0,
    date: new Date('2026-01-01T12:00:00Z'),
    notes: '',
    ...overrides
  };
}

function installWorld() {
  Portfolio.exists = async () => true;
  Asset.findOne = async () => ({ active: true, type: 'etf', market: 'US', currency: 'USD' });
  Transaction.find = () => ({ lean: async () => [] });
}

// ───────────────────────── M-2：拒绝改归属 ─────────────────────────

test('M-2 更新时改归属 → 400 PORTFOLIO_ID_IMMUTABLE，且不写库', async () => {
  installWorld();
  Transaction.findById = () => ({ lean: async () => existingTransaction() });
  let updateCalled = false;
  Transaction.findByIdAndUpdate = async (id, data) => {
    updateCalled = true;
    return data;
  };

  await assert.rejects(
    () => transactionService.updateTransaction(TX_ID, { portfolioId: PORTFOLIO_B, quantity: 11 }),
    error => error.status === 400 && error.code === 'PORTFOLIO_ID_IMMUTABLE'
  );
  assert.equal(updateCalled, false, '守卫必须阻止写库');
});

test('M-2 不传 portfolioId → 200 且归属不变', async () => {
  installWorld();
  Transaction.findById = () => ({ lean: async () => existingTransaction() });
  let captured;
  Transaction.findByIdAndUpdate = async (id, data) => {
    captured = data;
    return data;
  };

  const result = await transactionService.updateTransaction(TX_ID, { quantity: 12 });

  assert.equal(result.quantity, 12);
  assert.equal(String(captured.portfolioId), PORTFOLIO_A, '归属必须保持原组合');
});

test('M-2 传相同 portfolioId → 200 且归属不变（编辑页每次都带该字段）', async () => {
  installWorld();
  Transaction.findById = () => ({ lean: async () => existingTransaction() });
  let captured;
  Transaction.findByIdAndUpdate = async (id, data) => {
    captured = data;
    return data;
  };

  const result = await transactionService.updateTransaction(TX_ID, {
    portfolioId: PORTFOLIO_A,
    quantity: 13
  });

  assert.equal(result.quantity, 13);
  assert.equal(String(captured.portfolioId), PORTFOLIO_A, '同值放行且归属不变');
});

test('M-2 创建路径仍可用：带 portfolioId 创建成功（不得从 WRITABLE_FIELDS 删除）', async () => {
  installWorld();
  let created;
  Transaction.create = async data => {
    created = data;
    return data;
  };

  await transactionService.createTransaction({
    portfolioId: PORTFOLIO_B,
    symbol: 'VTI',
    action: 'buy',
    quantity: 5,
    price: 100,
    date: '2026-02-01'
  });

  assert.equal(String(created.portfolioId), PORTFOLIO_B, '创建必须能写入归属');
});
