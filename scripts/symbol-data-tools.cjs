const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MongoClient, BSON } = require('mongodb');
const dotenv = require('dotenv');
const { STORAGE_SUFFIX, normalizeSymbol, marketFromSuffix, toStorageSymbol } =
  require('@portomind/shared/utils/symbol');
const Asset = require('@portomind/shared/models/asset');

const NAMES = ['assets', 'transactions', 'portfolios', 'prices'];
const EXACT = { collation: { locale: 'simple' } };
const FIND = { ...EXACT, promoteValues: false };
const ROOT = path.resolve(__dirname, '..');

function args(argv, valued, flags) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i] === '-h' ? '--help' : argv[i];
    if (Object.hasOwn(options, key) || ![...valued, ...flags].includes(key)) {
      throw new Error('未知或重复参数，请查阅 --help。');
    }
    if (valued.includes(key)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(key + ' 缺少参数值。');
      options[key] = value;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function env() {
  const file = path.join(ROOT, 'server', '.env');
  if (fs.existsSync(file)) {
    const parsed = dotenv.parse(fs.readFileSync(file));
    for (const [key, value] of Object.entries(parsed)) process.env[key] ??= value;
  }
}

async function withDb(uri, callback) {
  env();
  const connection = uri || process.env.MONGO_URI;
  if (!connection || !/^mongodb(?:\+srv)?:\/\/[^/?]+\/[^/?]+(?:\?|$)/.test(connection)) {
    throw new Error('连接串必须显式包含数据库名，请检查 --uri 或 MONGO_URI。');
  }
  let client;
  try {
    client = new MongoClient(connection, { serverSelectionTimeoutMS: 8000, readPreference: 'primary' });
    await client.connect();
  } catch {
    await client?.close();
    throw new Error('MongoDB 连接失败，请核对连接串、网络和权限。');
  }
  try {
    return await callback(client.db(), client);
  } finally {
    await client.close();
  }
}

function assertReadOnly(operation) {
  // 探测和计划调用此接口。仅开放 find 和无写出能力的聚合阶段。
  async function collection(name) {
    const found = await operation.listCollections({ name }, { nameOnly: true, authorizedCollections: true }).hasNext();
    if (!found) throw new Error('集合不存在或无读取权限：' + name);
    return operation.collection(name);
  }
  return Object.freeze({
    async find(name, filter = {}) {
      return (await collection(name)).find(filter, EXACT).toArray();
    },
    async priceStats() {
      return (await collection('prices')).aggregate([
        { $match: { symbol: { $type: 'string' } } },
        { $group: {
          _id: '$symbol', count: { $sum: 1 },
          first: { $min: '$timestamp' }, last: { $max: '$timestamp' }
        } },
        { $sort: { _id: 1 } }
      ], EXACT).toArray();
    }
  });
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function bson(value) {
  return BSON.EJSON.stringify(value, { relaxed: false });
}

function validSymbol(symbol) {
  return typeof symbol === 'string' && !Asset.schema.path('symbol').doValidateSync(symbol);
}

function symbolIdentity(symbol, market) {
  if (typeof symbol !== 'string') return null;
  if (!Object.hasOwn(STORAGE_SUFFIX, market)) return null;
  const canonical = toStorageSymbol(symbol, market);
  if (!validSymbol(canonical)) return null;
  return { canonical, bare: canonical.slice(0, -STORAGE_SUFFIX[market].length) };
}

function addOwner(map, key, asset) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(asset);
}

function inventory(assets) {
  const aliases = new Map();
  const exact = new Map();
  const rows = assets.map(doc => ({ doc, keys: symbolIdentity(doc.symbol, doc.market) }));
  for (const row of rows) {
    const { doc, keys } = row;
    addOwner(exact, doc.symbol, row);
    if (keys) {
      for (const key of [doc.symbol, keys.canonical, keys.bare]) {
        addOwner(aliases, normalizeSymbol(key), row);
      }
    } else if (typeof doc.symbol === 'string') {
      addOwner(aliases, normalizeSymbol(doc.symbol), row);
      // 缺 market 的资产也可能拥有同一个裸码，不能用它授权删除。
      const suffixMarket = marketFromSuffix(doc.symbol);
      const inferred = suffixMarket && symbolIdentity(doc.symbol, suffixMarket);
      if (inferred) addOwner(aliases, inferred.bare, row);
    }
  }
  return { rows, aliases, exact };
}

function priceInventory(index, priceStats) {
  const byAsset = new Map(index.rows.map(asset => [asset, []]));
  const owners = new Map();
  for (const { _id: symbol, count, first, last } of priceStats) {
    if (typeof symbol !== 'string') continue;
    const candidates = index.aliases.get(normalizeSymbol(symbol));
    if (!candidates) continue;
    owners.set(symbol, [...candidates].map(({ doc }) => ({
      id: String(doc._id), symbol: doc.symbol, market: doc.market ?? null
    })));
    for (const candidate of candidates) byAsset.get(candidate).push({ symbol, count, first, last });
  }

  const dual = [];
  const stranded = [];
  const ambiguous = priceStats.filter(row => owners.get(row._id)?.length > 1)
    .map(({ _id, count, first, last }) => ({
      symbol: _id, count, first, last, candidates: owners.get(_id)
    }));
  for (const [asset, prices] of byAsset) {
    const { doc, keys } = asset;
    if (!keys) continue;
    const record = {
      id: String(doc._id), previous: doc.symbol, market: doc.market,
      canonical: keys.canonical, prices
    };
    const bare = prices.filter(row => normalizeSymbol(row.symbol) === keys.bare);
    const suffixed = prices.filter(row => normalizeSymbol(row.symbol) !== keys.bare);
    if (doc.active === true && bare.length && suffixed.length) {
      const blocked = prices.length !== 2 || prices.some(row => owners.get(row.symbol).length !== 1);
      dual.push({ ...record, blocked });
    } else if (prices.length && !prices.some(row => row.symbol === keys.canonical)) {
      stranded.push({ ...record, active: doc.active === true });
    }
  }
  return { dual, stranded, ambiguous };
}

function targetsOf(portfolio) {
  return Array.isArray(portfolio.targets) ? portfolio.targets : [];
}

function reportError(error) {
  // MongoDB 连接类异常可能在 message 中包含主机等连接信息。
  return error.name.startsWith('Mongo') ? error.name + ' (' + (error.code ?? '无错误码') + ')' : error.message;
}

module.exports = {
  NAMES, EXACT, FIND, ROOT, args, env, withDb, assertReadOnly, digest, bson, validSymbol,
  symbolIdentity, inventory, priceInventory, targetsOf, reportError
};
