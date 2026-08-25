const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
const Asset = require('../models/asset');
const Portfolio = require('../models/portfolio');
const Transaction = require('../models/transaction');
const Price = require('../models/price');
const { createBaselineData } = require('./baselineData');

function requireMongoUri() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required. Copy server/.env.example to server/.env first.');
  }
  return process.env.MONGO_URI;
}

async function upsertDocuments(Model, documents) {
  if (documents.length === 0) return;
  await Model.bulkWrite(documents.map(document => ({
    replaceOne: {
      filter: { _id: document._id },
      replacement: document,
      upsert: true
    }
  })));
}

async function main() {
  await mongoose.connect(requireMongoUri());

  const { assets, portfolio, transactions, prices } = createBaselineData();
  await upsertDocuments(Asset, assets);
  await upsertDocuments(Portfolio, [portfolio]);
  await upsertDocuments(Transaction, transactions);
  await upsertDocuments(Price, prices);

  process.stdout.write('Baseline data is ready: 2 assets, 1 portfolio, 4 transactions, 6 prices.\n');
}

main()
  .catch(error => {
    console.error(`Baseline seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
