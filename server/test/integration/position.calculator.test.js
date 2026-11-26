const test = require('node:test');
const assert = require('node:assert/strict');

const Transaction = require('@portomind/shared/models/transaction');
const Price = require('@portomind/shared/models/price');
const {
  calculatePositions,
  calculatePositionHistory
} = require('@portomind/shared/services/transaction/positionCalculator');
const { getHistory } = require('@portomind/shared/services/portfolio/positionTracker');

let sequence = 0;
function trade(overrides = {}) {
  sequence += 1;
  return {
    _id: String(sequence).padStart(4, '0'),
    portfolioId: '64b000000000000000000010',
    symbol: 'VTI',
    assetType: 'etf',
    market: 'US',
    currency: 'USD',
    action: 'buy',
    quantity: 10,
    price: 100,
    date: new Date(`2026-01-${String(sequence).padStart(2, '0')}T12:00:00Z`),
    ...overrides
  };
}

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, received ${actual}`);
}

const calculationCases = [
  {
    name: '只有买入',
    transactions: () => [trade()],
    prices: { VTI: 120 },
    expected: [{ symbol: 'VTI', quantity: 10, avgCost: 100, remainingCost: 1000, marketValue: 1200, unrealizedPnl: 200, pnlPct: 20 }]
  },
  {
    name: '多次不同价格买入',
    transactions: () => [trade(), trade({ price: 200 })],
    prices: { VTI: 180 },
    expected: [{ symbol: 'VTI', quantity: 20, avgCost: 150, remainingCost: 3000, marketValue: 3600, unrealizedPnl: 600, pnlPct: 20 }]
  },
  {
    name: '部分卖出按卖出前平均成本减少剩余成本',
    transactions: () => [trade(), trade({ action: 'sell', quantity: 4, price: 120 })],
    prices: { VTI: 130 },
    expected: [{ symbol: 'VTI', quantity: 6, avgCost: 100, remainingCost: 600, marketValue: 780, unrealizedPnl: 180, pnlPct: 30, realizedPnl: 80 }]
  },
  {
    name: '全部卖出不再返回净持仓',
    transactions: () => [trade(), trade({ action: 'sell', quantity: 10, price: 120 })],
    prices: { VTI: 130 },
    expected: []
  },
  {
    name: '缺少最新价格时市值和未实现盈亏为空',
    transactions: () => [trade()],
    prices: { VTI: null },
    expected: [{ symbol: 'VTI', quantity: 10, avgCost: 100, remainingCost: 1000, marketValue: null, unrealizedPnl: null, pnlPct: null }]
  },
  {
    name: '多个资产独立计算',
    transactions: () => [trade(), trade({ symbol: 'BND', price: 50, quantity: 2 })],
    prices: { VTI: 110, BND: 55 },
    expected: [
      { symbol: 'BND', quantity: 2, avgCost: 50, remainingCost: 100, marketValue: 110, unrealizedPnl: 10, pnlPct: 10 },
      { symbol: 'VTI', quantity: 10, avgCost: 100, remainingCost: 1000, marketValue: 1100, unrealizedPnl: 100, pnlPct: 10 }
    ]
  },
  {
    name: '小数数量保留计算精度',
    transactions: () => [
      trade({ quantity: 0.5, price: 10 }),
      trade({ action: 'sell', quantity: 0.2, price: 12 })
    ],
    prices: { VTI: 15 },
    expected: [{ symbol: 'VTI', quantity: 0.3, avgCost: 10, remainingCost: 3, marketValue: 4.5, unrealizedPnl: 1.5, pnlPct: 50, realizedPnl: 0.4 }]
  },
  // TASK-097：现金类流水不改变持仓；导入的现金分红可无数量 / 单价
  {
    name: '现金分红（数量单价为空）与税款、利息、划转、独立费用不改变持仓与成本',
    transactions: () => [
      trade({ quantity: 10, price: 100, fee: 1 }),
      trade({ action: 'div_cash', quantity: undefined, price: undefined, cashAmount: 12.34, cashCurrency: 'USD' }),
      trade({ action: 'tax', quantity: undefined, price: undefined, cashAmount: -1.85 }),
      trade({ action: 'interest', symbol: undefined, assetType: undefined, market: undefined, quantity: undefined, price: undefined, cashAmount: 0.42 }),
      trade({ action: 'cash_in', symbol: undefined, assetType: undefined, market: undefined, quantity: undefined, price: undefined, cashAmount: 500 }),
      trade({ action: 'cash_out', symbol: undefined, assetType: undefined, market: undefined, quantity: undefined, price: undefined, cashAmount: -200 }),
      trade({ action: 'fee', symbol: undefined, assetType: undefined, market: undefined, quantity: undefined, price: undefined, cashAmount: -9.99 })
    ],
    prices: { VTI: 110 },
    expected: [{ symbol: 'VTI', quantity: 10, avgCost: 100.1, remainingCost: 1001, realizedPnl: 0 }]
  },
  {
    name: '分红再投成本含费，随后卖出净得扣费',
    transactions: () => [
      trade({ quantity: 10, price: 100 }),
      trade({ action: 'div_reinvest', quantity: 0.5, price: 110, fee: 0.5 }),
      trade({ action: 'sell', quantity: 5.25, price: 120, fee: 2 })
    ],
    prices: { VTI: 120 },
    // 再投后：10.5 股、成本 1000 + 55 + 0.5 = 1055.5，均价 100.5238…；卖出 5.25 股
    expected: [{ symbol: 'VTI', quantity: 5.25, remainingCost: 527.75, avgCost: 100.52380952380952, realizedPnl: (120 - 1055.5 / 10.5) * 5.25 - 2 }]
  }
];

for (const scenario of calculationCases) {
  test(`持仓表格用例：${scenario.name}`, () => {
    sequence = 0;
    const positions = calculatePositions(scenario.transactions(), scenario.prices);
    assert.equal(positions.length, scenario.expected.length);
    scenario.expected.forEach((expected, index) => {
      for (const [field, value] of Object.entries(expected)) {
        if (value === null || typeof value === 'string') {
          assert.equal(positions[index][field], value, field);
        } else {
          closeTo(positions[index][field], value, field);
        }
      }
    });
  });
}

test('持仓表格用例：先卖后买是非法账本', () => {
  sequence = 0;
  assert.throws(
    () => calculatePositions([
      trade({ action: 'sell', quantity: 1 }),
      trade({ action: 'buy', quantity: 2 })
    ], { VTI: 100 }),
    error => error.code === 'INSUFFICIENT_POSITION' && error.status === 400
  );
});

test('历史快照与概览共用移动平均成本和最新时点价格', () => {
  sequence = 0;
  const transactions = [
    trade({ quantity: 10, date: new Date('2026-01-01T12:00:00Z') }),
    trade({ action: 'sell', quantity: 4, price: 125, date: new Date('2026-01-03T12:00:00Z') })
  ];
  const prices = [
    { symbol: 'VTI', timestamp: new Date('2026-01-01T20:00:00Z'), price: 110 },
    { symbol: 'VTI', timestamp: new Date('2026-01-02T20:00:00Z'), price: 120 },
    { symbol: 'VTI', timestamp: new Date('2026-01-03T20:00:00Z'), price: 130 }
  ];
  const history = calculatePositionHistory(transactions, prices, 'day');
  assert.deepEqual(history.map(item => ({
    date: item.date,
    currency: item.currency,
    quantity: item.quantity,
    remainingCost: item.remainingCost,
    marketValue: item.marketValue
  })), [
    { date: '2026-01-01', currency: 'USD', quantity: 10, remainingCost: 1000, marketValue: 1100 },
    { date: '2026-01-02', currency: 'USD', quantity: 10, remainingCost: 1000, marketValue: 1200 },
    { date: '2026-01-03', currency: 'USD', quantity: 6, remainingCost: 600, marketValue: 780 }
  ]);
});

test('多币种历史按原币种分行而不直接相加', () => {
  sequence = 0;
  const transactions = [
    trade({ symbol: 'VTI', currency: 'USD', quantity: 1, price: 100 }),
    trade({ symbol: 'XIC', market: 'CA', currency: 'CAD', quantity: 2, price: 30,
      date: new Date('2026-01-01T13:00:00Z') })
  ];
  const prices = [
    { symbol: 'VTI', timestamp: new Date('2026-01-01T20:00:00Z'), price: 110 },
    { symbol: 'XIC', timestamp: new Date('2026-01-01T20:00:00Z'), price: 35 }
  ];
  const history = calculatePositionHistory(transactions, prices, 'day');
  assert.deepEqual(history.map(item => ({ currency: item.currency, marketValue: item.marketValue })), [
    { currency: 'CAD', marketValue: 70 },
    { currency: 'USD', marketValue: 110 }
  ]);
});

test('历史快照忽略现金类流水：不同币种的现金分红 / 利息不产生额外币种行（TASK-097）', () => {
  sequence = 0;
  const transactions = [
    trade({ quantity: 1, price: 100, date: new Date('2026-01-01T12:00:00Z') }),
    trade({ action: 'div_cash', quantity: undefined, price: undefined, currency: 'USD', cashAmount: 5, cashCurrency: 'CAD',
      date: new Date('2026-01-02T12:00:00Z') }),
    trade({ action: 'interest', symbol: undefined, assetType: undefined, market: undefined, currency: 'CAD',
      quantity: undefined, price: undefined, cashAmount: 1, cashCurrency: 'CAD', date: new Date('2026-01-02T13:00:00Z') })
  ];
  const prices = [{ symbol: 'VTI', timestamp: new Date('2026-01-01T20:00:00Z'), price: 110 }];
  const history = calculatePositionHistory(transactions, prices, 'day');
  assert.deepEqual(history.map(item => [item.date, item.currency, item.quantity]), [['2026-01-01', 'USD', 1]]);
});

const originalTransactionFind = Transaction.find;
const originalPriceFind = Price.find;

test.afterEach(() => {
  Transaction.find = originalTransactionFind;
  Price.find = originalPriceFind;
});

test('历史数据库适配层使用 portfolioId、timestamp 和 price', async () => {
  sequence = 0;
  const transactions = [trade()];
  const prices = [{ symbol: 'VTI', timestamp: new Date('2026-01-01T20:00:00Z'), price: 120 }];
  let transactionQuery;
  let priceQuery;
  Transaction.find = query => {
    transactionQuery = query;
    return { sort: () => ({ lean: async () => transactions }) };
  };
  Price.find = query => {
    priceQuery = query;
    return { sort: () => ({ lean: async () => prices }) };
  };

  const history = await getHistory('64b000000000000000000010', 'vti', 'day');
  // TASK-094：pending（导入未翻转）行对历史快照不可见
  assert.deepEqual(transactionQuery, {
    portfolioId: '64b000000000000000000010',
    symbol: 'VTI',
    status: { $ne: 'pending' }
  });
  assert.deepEqual(priceQuery, { symbol: { $in: ['VTI'] } });
  assert.equal(history[0].positions[0].quantity, 10);
  assert.equal(history[0].positions[0].latestPrice, 120);
});
