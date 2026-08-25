const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const Asset = require('../models/asset');
const Portfolio = require('../models/portfolio');
const Transaction = require('../models/transaction');
const Price = require('../models/price');
const { ids } = require('./baselineData');

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required. Copy server/.env.example to server/.env first.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const [assets, portfolios, transactions, prices] = await Promise.all([
    Asset.countDocuments({ _id: { $in: ids.assets } }),
    Portfolio.countDocuments({ _id: ids.portfolio }),
    Transaction.countDocuments({ _id: { $in: ids.transactions } }),
    Price.countDocuments({ _id: { $in: ids.prices } })
  ]);

  const actual = { assets, portfolios, transactions, prices };
  const expected = { assets: 2, portfolios: 1, transactions: 4, prices: 6 };
  const mismatches = Object.keys(expected)
    .filter(key => actual[key] !== expected[key])
    .map(key => `${key}: expected ${expected[key]}, received ${actual[key]}`);

  if (mismatches.length > 0) {
    throw new Error(`Baseline verification failed (${mismatches.join('; ')}). Run npm run seed:baseline.`);
  }

  process.stdout.write(`Baseline database verification passed: ${JSON.stringify(actual)}\n`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
