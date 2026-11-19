#!/usr/bin/env node

const fs = require('node:fs');
const { BSON } = require('mongodb');
const { args, env, withDb, EXACT, FIND, bson, digest } = require('./symbol-data-tools.cjs');
const { toStorageSymbol } = require('@portomind/shared/utils/symbol');

env();
const { marketDate, MARKET_TIMEZONE } = require('@portomind/shared/utils/marketTime');

const DATABASE = 'portomind_task077_restore_test';
const KEYS = [
  ['000191', 'CN-FUND'], ['000942', 'CN-FUND'],
  ['ARKK', 'US'], ['CQQQ', 'US'], ['TLT', 'US'], ['VCR', 'US']
].map(([bare, market]) => ({ bare, standard: toStorageSymbol(bare, market), market }));
const BARE = KEYS.map(({ bare }) => bare);
const STANDARD = KEYS.map(({ standard }) => standard);
const DAY_ZONE = MARKET_TIMEZONE;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function fingerprint(rows) {
  return digest(bson(rows));
}

function compare(bareRows, standardRows) {
  const bySymbol = new Map([...BARE, ...STANDARD].map(symbol => [symbol, new Map()]));
  for (const row of [...bareRows, ...standardRows]) {
    const day = marketDate(row.timestamp, DAY_ZONE);
    const days = bySymbol.get(row.symbol);
    const previous = days.get(day);
    if (!previous || row.timestamp >= previous.timestamp) days.set(day, row);
  }

  return KEYS.map(({ bare, standard }) => {
    const oldDays = bySymbol.get(bare);
    const newDays = bySymbol.get(standard);
    const uncovered = [...oldDays.keys()].filter(day => !newDays.has(day)).sort();
    const conflicts = [];
    let overlap = 0;
    for (const [day, row] of oldDays) {
      const canonical = newDays.get(day);
      if (!canonical) continue;
      overlap += 1;
      if (Number(row.price) !== Number(canonical.price)) {
        conflicts.push({ day, barePrice: Number(row.price), standardPrice: Number(canonical.price) });
      }
    }
    return {
      bare, standard, overlap, conflicts: conflicts.sort((a, b) => a.day.localeCompare(b.day)),
      oldOnlyDays: uncovered.length, oldOnlyFrom: uncovered[0], oldOnlyTo: uncovered.at(-1),
      oldOnlyDates: uncovered
    };
  });
}

async function readPrices(db) {
  const prices = db.collection('prices');
  const [descriptor, assets, bare, standard] = await Promise.all([
    db.listCollections({ name: 'prices' }).next(),
    db.collection('assets').find({ symbol: { $in: [...BARE, ...STANDARD] } }, EXACT).toArray(),
    prices.find({ symbol: { $in: BARE } }, FIND).sort({ _id: 1 }).toArray(),
    prices.find({ symbol: { $in: STANDARD } }, FIND).sort({ _id: 1 }).toArray()
  ]);
  check(descriptor?.info?.uuid, '无法读取 prices 集合 UUID。');
  for (const key of KEYS) {
    check(assets.filter(a => a.symbol === key.standard && a.market === key.market).length === 1 &&
      !assets.some(a => a.symbol === key.bare), '资产键或市场不符合预期：' + key.standard);
    check(standard.some(r => r.symbol === key.standard), '标准键没有价格：' + key.standard);
  }
  return { uuid: descriptor.info.uuid.toString(), bare, standard };
}

function archiveAt(file) {
  const contents = fs.readFileSync(file);
  return { archive: BSON.EJSON.parse(contents.toString('utf8'), { relaxed: false }), sha256: digest(contents) };
}

function saveArchive(file, snapshot) {
  const contents = bson({
    database: DATABASE, collection: 'prices', uuid: snapshot.uuid, timezone: DAY_ZONE,
    standardSha256: fingerprint(snapshot.standard), bare: snapshot.bare
  });
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const saved = archiveAt(file);
  check(saved.sha256 === digest(contents) && fingerprint(saved.archive.bare) === fingerprint(snapshot.bare),
    '归档读回校验失败。');
  return saved.sha256;
}

async function apply(db, snapshot, options) {
  const { archive, sha256 } = archiveAt(options['--archive']);
  check(sha256 === options['--archive-sha256'], '归档 SHA256 与确认值不符。');
  check(archive.database === DATABASE && archive.collection === 'prices' && archive.uuid === snapshot.uuid &&
    archive.timezone === DAY_ZONE, '归档与当前目标库、集合或时区不符。');
  check(archive.standardSha256 === fingerprint(snapshot.standard), '标准键价格有变化，请重新预演。');
  check(Array.isArray(archive.bare) && archive.bare.every(row => BARE.includes(row.symbol)), '归档含范围外记录。');
  const archived = new Map(archive.bare.map(row => [String(row._id), bson(row)]));
  check(snapshot.bare.every(row => archived.get(String(row._id)) === bson(row)),
    '有未归档或已变化的裸码记录，请重新预演。');
  const affected = compare(archive.bare, snapshot.standard);
  const uncovered = affected.reduce((sum, row) => sum + row.oldOnlyDays, 0);
  check(!uncovered || options['--accept-archive-only'],
    `仍有 ${uncovered} 个标的日期只在归档中有价。先补齐标准键，或明确接受历史仅留归档。`);

  const prices = db.collection('prices');
  for (let offset = 0; offset < snapshot.bare.length; offset += 200) {
    const batch = snapshot.bare.slice(offset, offset + 200);
    const result = await prices.bulkWrite(batch.map(row => ({ deleteOne: {
      filter: { _id: row._id, symbol: row.symbol, $expr: { $eq: ['$$ROOT', { $literal: row }] } },
      collation: EXACT.collation
    } })), { ordered: true, writeConcern: { w: 'majority', j: true } });
    check(result.deletedCount === batch.length, '裸码记录在操作期间变化，已暂停；请保留归档核对。');
  }
  const after = await readPrices(db);
  check(after.uuid === snapshot.uuid && !after.bare.length && fingerprint(after.standard) === archive.standardSha256,
    '清理后校验失败；请保留归档核对。');
  console.log(JSON.stringify({ database: DATABASE, deleted: snapshot.bare.length, remainingBare: 0, archived: archive.bare.length }));
}

async function main() {
  const options = args(process.argv.slice(2), ['--archive', '--archive-sha256'],
    ['--apply', '--accept-archive-only', '--help']);
  if (options['--help']) {
    console.log('预演：node scripts/retire-task075-bare-prices.cjs [--archive <新归档.ejson>]\n' +
      '清理：node scripts/retire-task075-bare-prices.cjs --apply --archive <既有归档.ejson> --archive-sha256 <预演哈希>\n' +
      '通过 MONGO_URI 或 server/.env 连接。只允许 portomind_task077_restore_test。\n' +
      '执行前暂停写入者；仅删除六个裸码，保留标准键。仅归档中有价的日期默认阻断。\n' +
      '只有确认接受这些日期从现用库消失时，才加 --accept-archive-only。');
    return;
  }
  check(!options['--apply'] || (options['--archive'] && options['--archive-sha256']),
    '清理需要先生成归档并确认 SHA256。');
  check(options['--apply'] || (!options['--archive-sha256'] && !options['--accept-archive-only']),
    '确认参数只适用于 --apply。');
  await withDb(undefined, async db => {
    check(db.databaseName === DATABASE, '拒绝操作非指定验收库。');
    const snapshot = await readPrices(db);
    if (options['--apply']) return apply(db, snapshot, options);
    const affected = compare(snapshot.bare, snapshot.standard);
    const archiveSha256 = options['--archive'] ? saveArchive(options['--archive'], snapshot) : undefined;
    console.log(JSON.stringify({ database: DATABASE, timezone: DAY_ZONE, bareRecords: snapshot.bare.length,
      standardRecords: snapshot.standard.length, archiveSha256, affected }, null, 2));
  });
}

main().catch(error => {
  console.error(error.name === 'Error' ? error.message : `操作暂停（${error.name}）。保留归档并核对当前数据。`);
  process.exitCode = 1;
});
