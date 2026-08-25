const mongoose = require('mongoose');

const ids = Object.freeze({
  assets: [
    new mongoose.Types.ObjectId('650000000000000000000001'),
    new mongoose.Types.ObjectId('650000000000000000000002')
  ],
  portfolio: new mongoose.Types.ObjectId('650000000000000000000010'),
  transactions: [
    new mongoose.Types.ObjectId('650000000000000000000101'),
    new mongoose.Types.ObjectId('650000000000000000000102'),
    new mongoose.Types.ObjectId('650000000000000000000103'),
    new mongoose.Types.ObjectId('650000000000000000000104')
  ],
  prices: [
    new mongoose.Types.ObjectId('650000000000000000000201'),
    new mongoose.Types.ObjectId('650000000000000000000202'),
    new mongoose.Types.ObjectId('650000000000000000000203'),
    new mongoose.Types.ObjectId('650000000000000000000204'),
    new mongoose.Types.ObjectId('650000000000000000000205'),
    new mongoose.Types.ObjectId('650000000000000000000206')
  ]
});

function startOfLocalDay(daysAgo = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function createBaselineData() {
  const assets = [
    {
      _id: ids.assets[0],
      symbol: 'VTI',
      name: 'Vanguard Total Stock Market ETF',
      market: 'US',
      currency: 'USD',
      type: 'etf',
      tags: ['baseline', 'equity'],
      watchlist: true,
      active: true,
      createdAt: startOfLocalDay(30)
    },
    {
      _id: ids.assets[1],
      symbol: 'BND.TO',
      name: 'Baseline Canadian Bond ETF',
      market: 'CA',
      currency: 'CAD',
      type: 'etf',
      tags: ['baseline', 'bond'],
      watchlist: true,
      active: true,
      createdAt: startOfLocalDay(30)
    }
  ];

  const portfolio = {
    _id: ids.portfolio,
    name: 'Baseline Portfolio',
    description: 'Deterministic development data created by npm run seed:baseline.',
    type: '稳健',
    currency: 'CAD',
    targets: [
      { symbol: 'VTI', targetRatio: 60 },
      { symbol: 'BND.TO', targetRatio: 40 }
    ],
    rebalanceSettings: {
      absoluteDeviation: 5,
      relativeDeviation: 10,
      timeInterval: 60,
      rebalanceSchedule: 'daily'
    },
    createdAt: startOfLocalDay(30)
  };

  const transactions = [
    {
      _id: ids.transactions[0], portfolioId: ids.portfolio,
      assetType: 'etf', symbol: 'VTI', market: 'US', currency: 'USD',
      action: 'buy', quantity: 10, price: 200, date: startOfLocalDay(20),
      notes: 'Baseline initial VTI purchase'
    },
    {
      _id: ids.transactions[1], portfolioId: ids.portfolio,
      assetType: 'etf', symbol: 'VTI', market: 'US', currency: 'USD',
      action: 'buy', quantity: 5, price: 210, date: startOfLocalDay(10),
      notes: 'Baseline additional VTI purchase'
    },
    {
      _id: ids.transactions[2], portfolioId: ids.portfolio,
      assetType: 'etf', symbol: 'VTI', market: 'US', currency: 'USD',
      action: 'sell', quantity: 2, price: 220, date: startOfLocalDay(5),
      notes: 'Baseline partial VTI sale'
    },
    {
      _id: ids.transactions[3], portfolioId: ids.portfolio,
      assetType: 'etf', symbol: 'BND.TO', market: 'CA', currency: 'CAD',
      action: 'buy', quantity: 20, price: 70, date: startOfLocalDay(15),
      notes: 'Baseline bond purchase'
    }
  ];

  const priceValues = {
    VTI: [218, 220, 222],
    'BND.TO': [69, 70, 71]
  };
  const prices = [];
  let priceIdIndex = 0;
  Object.entries(priceValues).forEach(([symbol, values]) => {
    values.forEach((price, index) => {
      prices.push({
        _id: ids.prices[priceIdIndex++],
        symbol,
        name: assets.find(asset => asset.symbol === symbol).name,
        price,
        currency: symbol === 'VTI' ? 'USD' : 'CAD',
        market: symbol === 'VTI' ? 'US' : 'CA',
        timestamp: startOfLocalDay(2 - index)
      });
    });
  });

  return { assets, portfolio, transactions, prices };
}

module.exports = { ids, createBaselineData };
