const test = require('node:test');
const assert = require('node:assert/strict');

const Transaction = require('../../models/transaction');
const transactionService = require('../../services/transaction.service');
const recorder = require('../../services/rebalance/recorder');
const { evaluateThresholds } = require('../../services/rebalance/thresholdChecker');
const { buildSuggestions } = require('../../services/rebalance/suggestionGenerator');
const { calculatePositions } = require('../../services/transaction/positionCalculator');
const {
  executeRebalance,
  revokeExecution,
  prepareReexecution
} = require('../../services/rebalance/executeRebalance');

test('阈值检查包含零持仓目标并返回可解释偏离明细', () => {
  const result = evaluateThresholds({
    targets: [{ symbol: 'VTI', targetRatio: 80 }, { symbol: 'BND', targetRatio: 20 }],
    positions: [{ symbol: 'VTI', marketValue: 1000 }],
    settings: { absoluteDeviation: 5, relativeDeviation: 10 }
  });
  assert.equal(result.needsRebalance, true);
  assert.deepEqual(result.triggeredThresholds.sort(), ['absoluteDeviation', 'relativeDeviation']);
  assert.deepEqual(result.details.map(item => ({
    symbol: item.symbol,
    targetRatio: item.targetRatio,
    currentRatio: item.currentRatio,
    absoluteDeviation: item.absoluteDeviation
  })), [
    { symbol: 'BND', targetRatio: 20, currentRatio: 0, absoluteDeviation: 20 },
    { symbol: 'VTI', targetRatio: 80, currentRatio: 100, absoluteDeviation: 20 }
  ]);
});

test('总市值为零和时间阈值均有明确原因', () => {
  const zero = evaluateThresholds({
    targets: [{ symbol: 'VTI', targetRatio: 100 }],
    positions: [],
    settings: { absoluteDeviation: 5 }
  });
  assert.equal(zero.needsRebalance, false);
  assert.deepEqual(zero.reasons, ['TOTAL_VALUE_ZERO']);

  const timed = evaluateThresholds({
    targets: [], positions: [], settings: { timeInterval: 30 }, lastExecutedAt: null
  });
  assert.equal(timed.needsRebalance, true);
  assert.ok(timed.triggeredThresholds.includes('timeInterval'));
  assert.ok(timed.reasons.includes('NEVER_EXECUTED'));
});

test('建议覆盖零持仓目标并按先卖后买接近目标比例', () => {
  const result = buildSuggestions({
    targets: [{ symbol: 'VTI', targetRatio: 50 }, { symbol: 'BND', targetRatio: 50 }],
    positions: [{ symbol: 'VTI', quantity: 10, latestPrice: 80, marketValue: 800 }],
    latestPrices: { BND: 20 }
  });
  assert.equal(result.suggestions.length, 2);
  assert.deepEqual(result.suggestions.map(item => item.action), ['sell', 'buy']);
  assert.deepEqual(result.suggestions.map(item => item.symbol), ['VTI', 'BND']);
  assert.equal(result.suggestions[0].quantity, 5);
  assert.equal(result.suggestions[1].quantity, 20);
  assert.ok(result.suggestions.every(item => Math.abs(item.postRebalanceRatio - 50) < 1e-9));
});

test('手续费和卖出税费会降低可买数量且不会透支资金', () => {
  const result = buildSuggestions({
    targets: [{ symbol: 'VTI', targetRatio: 50 }, { symbol: 'BND', targetRatio: 50 }],
    positions: [{ symbol: 'VTI', quantity: 10, latestPrice: 80, marketValue: 800 }],
    latestPrices: { BND: 20 },
    feeModel: { fixedFee: 1, ratioFee: 0.01, taxRate: 0.02 }
  });
  const [sell, buy] = result.suggestions;
  assert.equal(sell.estimatedFee, 5);
  assert.equal(sell.estimatedTax, 8);
  assert.ok(buy.quantity < 20);
  assert.ok(result.funding.buySpend <= result.funding.availableForBuys + 1e-9);
  assert.ok(result.warnings.includes('BUYS_LIMITED_BY_AVAILABLE_CASH'));
});

test('零市值只有显式现金预算时才产生买入建议', () => {
  const noCash = buildSuggestions({
    targets: [{ symbol: 'BND', targetRatio: 100 }], positions: [], latestPrices: { BND: 20 }
  });
  assert.deepEqual(noCash.suggestions, []);
  assert.ok(noCash.warnings.includes('TOTAL_VALUE_ZERO'));

  const funded = buildSuggestions({
    targets: [{ symbol: 'BND', targetRatio: 100 }], positions: [], latestPrices: { BND: 20 }, cashBudget: 100
  });
  assert.equal(funded.suggestions[0].action, 'buy');
  assert.equal(funded.suggestions[0].quantity, 5);
});

const originals = {
  getRecord: recorder.getRecord,
  updateStatus: recorder.updateStatus,
  createRecord: recorder.createRecord,
  createTransaction: transactionService.createTransaction,
  transactionFind: Transaction.find
};

test.afterEach(() => {
  recorder.getRecord = originals.getRecord;
  recorder.updateStatus = originals.updateStatus;
  recorder.createRecord = originals.createRecord;
  transactionService.createTransaction = originals.createTransaction;
  Transaction.find = originals.transactionFind;
});

test('确认执行按先卖后买创建交易并记录交易 ID', async () => {
  recorder.getRecord = async () => ({
    _id: 'record-1', portfolioId: 'portfolio-1', status: 'PENDING', suggestions: [
      { symbol: 'BND', action: 'buy', quantity: 20, price: 20 },
      { symbol: 'VTI', action: 'sell', quantity: 5, price: 80 }
    ]
  });
  const created = [];
  transactionService.createTransaction = async data => {
    created.push(data);
    return { _id: `tx-${created.length}`, ...data };
  };
  let update;
  recorder.updateStatus = async (id, status, fields) => {
    update = { id, status, fields };
    return { _id: id, status, ...fields };
  };

  const submitted = [
    { symbol: 'BND', action: 'buy', quantity: 20, price: 20 },
    { symbol: 'VTI', action: 'sell', quantity: 5, price: 80 }
  ];
  await executeRebalance('portfolio-1', {
    recordId: 'record-1', suggestions: submitted, mode: 'MANUAL'
  });
  assert.deepEqual(created.map(item => item.action), ['sell', 'buy']);
  assert.deepEqual(update.fields.executedTransactionIds, ['tx-1', 'tx-2']);
  assert.equal(update.status, 'EXECUTED');
  const positions = calculatePositions([
    { _id: 'initial', symbol: 'VTI', action: 'buy', quantity: 10, price: 80,
      date: new Date('2026-01-01T00:00:00Z') },
    ...created.map((item, index) => ({ ...item, _id: `created-${index}` }))
  ], { VTI: 80, BND: 20 });
  assert.deepEqual(positions.map(position => [position.symbol, position.marketValue]), [
    ['BND', 400], ['VTI', 400]
  ]);
});

test('撤销按原交易逆序创建反向交易后才标记 REVOKED', async () => {
  recorder.getRecord = async () => ({
    _id: 'record-1', status: 'EXECUTED', executedTransactionIds: ['tx-sell', 'tx-buy']
  });
  Transaction.find = () => ({ lean: async () => [
    { _id: 'tx-sell', portfolioId: 'portfolio-1', symbol: 'VTI', action: 'sell', quantity: 1, price: 80 },
    { _id: 'tx-buy', portfolioId: 'portfolio-1', symbol: 'BND', action: 'buy', quantity: 4, price: 20 }
  ] });
  const reversals = [];
  transactionService.createTransaction = async data => {
    reversals.push(data);
    return { _id: `reverse-${reversals.length}` };
  };
  let status;
  recorder.updateStatus = async (_id, value, fields) => {
    status = value;
    return { _id, status: value, ...fields };
  };

  const result = await revokeExecution('record-1');
  assert.deepEqual(reversals.map(item => [item.symbol, item.action]), [
    ['BND', 'sell'], ['VTI', 'buy']
  ]);
  assert.equal(status, 'REVOKED');
  assert.deepEqual(result.reversalTransactionIds, ['reverse-1', 'reverse-2']);
});

test('重做只生成新的 PENDING 记录，不自动创建交易', async () => {
  recorder.getRecord = async () => ({
    _id: 'record-old', portfolioId: 'portfolio-1', status: 'REVOKED',
    suggestions: [{ symbol: 'VTI', action: 'sell', quantity: 1, price: 80 }]
  });
  let created;
  recorder.createRecord = async (portfolioId, mode, suggestions, metadata) => {
    created = { portfolioId, mode, suggestions, metadata };
    return { _id: 'record-new', status: 'PENDING', sourceRecordId: metadata.sourceRecordId, suggestions };
  };
  transactionService.createTransaction = async () => assert.fail('重做不应创建交易');

  const result = await prepareReexecution('record-old');
  assert.equal(result.status, 'PENDING');
  assert.equal(created.mode, 'MANUAL');
  assert.equal(created.metadata.sourceRecordId, 'record-old');
});
