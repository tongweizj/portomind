// server/test/helpers/importWorld.js
//
// TASK-094：流水导入测试用的内存世界。替换 Transaction / Asset / Portfolio /
// SourceAccount / ImportBatch 中导入链路实际调用的静态方法，不连接 MongoDB。
// 查询匹配支持等值、点路径、$in、$ne、$exists、$lt；足够覆盖导入服务的查询形状。

const crypto = require('crypto');
const Transaction = require('@portomind/shared/models/transaction');
const Asset = require('@portomind/shared/models/asset');
const Portfolio = require('@portomind/shared/models/portfolio');
const SourceAccount = require('@portomind/shared/models/sourceAccount');
const ImportBatch = require('@portomind/shared/models/importBatch');

let sequence = 0;
function nextId() {
  sequence += 1;
  return crypto.createHash('sha1').update(`import-world-${sequence}`).digest('hex').slice(0, 24);
}

function readPath(doc, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), doc);
}

function same(left, right) {
  if (left instanceof Date || right instanceof Date) return new Date(left).getTime() === new Date(right).getTime();
  return String(left) === String(right);
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([path, expected]) => {
    const actual = readPath(doc, path);
    if (expected && typeof expected === 'object' && !(expected instanceof Date) &&
        Object.keys(expected).some(key => key.startsWith('$'))) {
      if ('$in' in expected && !expected.$in.some(item => actual !== undefined && same(actual, item))) return false;
      if ('$ne' in expected && actual !== undefined && same(actual, expected.$ne)) return false;
      if ('$exists' in expected && (actual !== undefined) !== Boolean(expected.$exists)) return false;
      if ('$lt' in expected && !(new Date(actual) < new Date(expected.$lt))) return false;
      return true;
    }
    return actual !== undefined && same(actual, expected);
  });
}

function query(compute) {
  const chain = {
    select() { return chain; },
    sort() { return chain; },
    skip() { return chain; },
    limit() { return chain; },
    lean: async () => compute().map(doc => structuredClone(doc)),
    then(resolve, reject) { return chain.lean().then(resolve, reject); }
  };
  return chain;
}

function single(compute) {
  const chain = {
    select() { return chain; },
    lean: async () => { const doc = compute(); return doc ? structuredClone(doc) : null; },
    then(resolve, reject) { return chain.lean().then(resolve, reject); }
  };
  return chain;
}

function applyUpdate(doc, update = {}) {
  const plain = Object.keys(update).some(key => !key.startsWith('$'));
  if (plain) Object.assign(doc, update);
  if (update.$set) {
    for (const [path, value] of Object.entries(update.$set)) {
      const keys = path.split('.');
      let target = doc;
      for (const key of keys.slice(0, -1)) target = target[key] ??= {};
      target[keys.at(-1)] = value;
    }
  }
  if (update.$unset) for (const key of Object.keys(update.$unset)) delete doc[key];
  if (update.$addToSet) {
    for (const [key, value] of Object.entries(update.$addToSet)) {
      doc[key] = doc[key] || [];
      if (!doc[key].some(item => same(item, value))) doc[key].push(value);
    }
  }
  doc.updatedAt = new Date(Date.now() + sequence++);
  return doc;
}

function duplicateKeyError() {
  const error = new Error('E11000 duplicate key error');
  error.code = 11000;
  return error;
}

/**
 * world = { portfolios, assets, transactions, sourceAccounts, importBatches }
 * hooks = { beforeFlip }：在 pending→committed 之前注入故障（模拟写入中断）。
 */
function installImportWorld(t, world = {}, hooks = {}) {
  const portfolios = world.portfolios || [];
  const assets = world.assets || [];
  const transactions = world.transactions || [];
  const sourceAccounts = world.sourceAccounts || [];
  const importBatches = world.importBatches || [];

  t.mock.method(Portfolio, 'exists', async (filter) => (portfolios.some(doc => matches(doc, filter)) ? { _id: filter._id } : null));
  t.mock.method(Portfolio, 'findById', (id) => single(() => portfolios.find(doc => same(doc._id, id))));

  t.mock.method(Asset, 'find', (filter) => query(() => assets.filter(doc => matches(doc, filter))));
  t.mock.method(Asset, 'findOne', (filter) => single(() => assets.find(doc => matches(doc, filter))));

  t.mock.method(Transaction, 'find', (filter) => query(() => transactions.filter(doc => matches(doc, filter))));
  t.mock.method(Transaction, 'countDocuments', async (filter) => transactions.filter(doc => matches(doc, filter)).length);
  t.mock.method(Transaction, 'findById', (id) => single(() => transactions.find(doc => same(doc._id, id))));
  t.mock.method(Transaction, 'create', async (doc) => {
    const created = { _id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...doc };
    transactions.push(created);
    return { ...created, toObject: () => ({ ...created }) };
  });
  t.mock.method(Transaction, 'insertMany', async (docs) => {
    const created = docs.map(doc => ({ _id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...structuredClone(doc) }));
    transactions.push(...created);
    return created;
  });
  t.mock.method(Transaction, 'updateMany', async (filter, update) => {
    if (hooks.beforeFlip && update?.$set?.status === 'committed') await hooks.beforeFlip();
    const matched = transactions.filter(doc => matches(doc, filter));
    matched.forEach(doc => applyUpdate(doc, update));
    return { matchedCount: matched.length, modifiedCount: matched.length };
  });
  t.mock.method(Transaction, 'deleteMany', async (filter) => {
    const keep = transactions.filter(doc => !matches(doc, filter));
    const deletedCount = transactions.length - keep.length;
    transactions.splice(0, transactions.length, ...keep);
    return { deletedCount };
  });

  t.mock.method(SourceAccount, 'find', (filter = {}) => query(() => sourceAccounts.filter(doc => matches(doc, filter))));
  t.mock.method(SourceAccount, 'findById', (id) => single(() => sourceAccounts.find(doc => same(doc._id, id))));
  t.mock.method(SourceAccount, 'findOne', (filter) => single(() => sourceAccounts.find(doc => matches(doc, filter))));
  t.mock.method(SourceAccount, 'create', async (doc) => {
    if (doc.accountKeyHash && sourceAccounts.some(item => item.broker === doc.broker && item.accountKeyHash === doc.accountKeyHash)) {
      throw duplicateKeyError();
    }
    const created = { _id: nextId(), portfolioIds: [], createdAt: new Date(), updatedAt: new Date(), ...doc };
    sourceAccounts.push(created);
    return { ...created, toObject: () => ({ ...created }) };
  });
  t.mock.method(SourceAccount, 'findByIdAndUpdate', (id, update) => single(() => {
    const doc = sourceAccounts.find(item => same(item._id, id));
    return doc ? applyUpdate(doc, update) : null;
  }));
  t.mock.method(SourceAccount, 'updateOne', async (filter, update) => {
    const doc = sourceAccounts.find(item => matches(item, filter));
    if (doc) applyUpdate(doc, update);
    return { matchedCount: doc ? 1 : 0 };
  });

  t.mock.method(ImportBatch, 'create', async (doc) => {
    if (doc.lockKey && importBatches.some(item => item.status === 'committing' && item.lockKey === doc.lockKey)) {
      throw duplicateKeyError();
    }
    const created = { _id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...structuredClone(doc) };
    importBatches.push(created);
    return { ...created, toObject: () => ({ ...created }) };
  });
  t.mock.method(ImportBatch, 'find', (filter) => query(() => importBatches.filter(doc => matches(doc, filter))));
  t.mock.method(ImportBatch, 'updateOne', async (filter, update) => {
    const doc = importBatches.find(item => matches(item, filter));
    if (doc) applyUpdate(doc, update);
    return { matchedCount: doc ? 1 : 0 };
  });

  return { portfolios, assets, transactions, sourceAccounts, importBatches };
}

module.exports = { installImportWorld, matches };
