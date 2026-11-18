#!/usr/bin/env node
/**
 * sync-db-fallback.cjs — sync-db.cjs 的纯 Node 替代实现（沙箱禁止 spawn 时的退路）
 *
 * 背景：scripts/sync-db.cjs 调用 mongodump/mongorestore，但本沙箱禁止 child_process.spawn
 * （EPERM）。本脚本用 mongodb 驱动直接搬运，语义对齐官方脚本：
 *   源库 portomind（真实库）→ 目标库 portomind_dev（开发库）
 *
 * 与官方脚本一致的安全约束：
 *   - 目标库名必须以 _dev/_test/_e2e 结尾，否则拒绝（--force 可强制）
 *   - 源库与目标库不能同名
 *   - users / sessions 是开发库专属集合，不存在于源库时**保留**，不删除
 *   - 事后校验：集合清单 + 条数 + _id 哈希
 *
 * 用法：
 *   node scripts/sync-db-fallback.cjs --dry-run
 *   node scripts/sync-db-fallback.cjs
 *   node scripts/sync-db-fallback.cjs --verify-only
 *   node scripts/sync-db-fallback.cjs --only prices,transactions
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
const SAFE_DB_SUFFIX = /_dev$|_test$|_e2e$/;
const DEV_ONLY_COLLECTIONS = new Set(['users', 'sessions']);

function parseArgs(argv) {
  const opts = {
    from: 'portomind',
    to: 'portomind_dev',
    uri: null,
    only: null,
    exclude: [],
    dryRun: false,
    verifyOnly: false,
    batchSize: 5000,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`参数 ${a} 缺少取值`);
      i += 1;
      return v;
    };
    switch (a) {
      case '--from': opts.from = next(); break;
      case '--to': opts.to = next(); break;
      case '--uri': opts.uri = next(); break;
      case '--only': opts.only = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--exclude': opts.exclude = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--batch-size': opts.batchSize = Number(next()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--verify-only': opts.verifyOnly = true; break;
      case '--force': opts.force = true; break;
      default: throw new Error(`未知参数：${a}`);
    }
  }
  return opts;
}

function loadEnvFile() {
  const envPath = path.join(ROOT, 'server', '.env');
  if (!fs.existsSync(envPath)) return;
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function withDatabase(uri, dbName) {
  const m = String(uri).match(/^(mongodb(?:\+srv)?:\/\/[^/?]*)(?:\/[^?]*)?(\?.*)?$/);
  if (!m) throw new Error('无法解析连接串');
  return `${m[1]}/${dbName}${m[2] || ''}`;
}

function maskUri(uri) {
  return String(uri).replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');
}

function pad(s, w) {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return s + ' '.repeat(Math.max(0, w - n));
}

function strLen(s) {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return n;
}

function printTable(rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(strLen(c), ...rows.map((r) => strLen(String(r[c])))));
  const line = (cells) => '  ' + cells.map((c, i) => pad(String(c), w[i])).join('  ');
  console.log('  ' + cols.map((c, i) => pad(c, w[i])).join('  '));
  console.log('  ' + w.map((x) => '─'.repeat(x)).join('  '));
  rows.forEach((r) => console.log(line(cols.map((c) => r[c]))));
}

async function idHash(db, name, count) {
  const ids = await db.collection(name).find({}, { projection: { _id: 1 } })
    .map((d) => String(d._id)).toArray();
  if (ids.length !== count) return `长度不符(${ids.length})`;
  ids.sort();
  return crypto.createHash('md5').update(ids.join(',')).digest('hex').slice(0, 12);
}

async function verify({ srcDb, dstDb, names, opts }) {
  const rows = [];
  let ok = true;

  const expected = new Set(names);
  const actual = new Set((await dstDb.listCollections().toArray()).map((c) => c.name));
  const missing = [...expected].filter((n) => !actual.has(n));
  if (missing.length === 0) {
    console.log(`  集合清单一致：${expected.size} 个`);
  } else {
    ok = false;
    console.log(`  ⚠ 目标库缺少集合：${missing.join(', ')}`);
  }

  for (const name of names) {
    const srcCount = await srcDb.collection(name).countDocuments({});
    let dstCount;
    try {
      dstCount = await dstDb.collection(name).countDocuments({});
    } catch (e) {
      dstCount = `读取失败:${e.code || e.message}`;
    }
    const countOk = srcCount === dstCount;
    if (!countOk) ok = false;

    const srcIdx = new Set((await srcDb.collection(name).indexes()).map((i) => i.name));
    const dstIdx = new Set((await dstDb.collection(name).indexes()).map((i) => i.name));
    const idxMissing = [...srcIdx].filter((n) => !dstIdx.has(n));
    if (idxMissing.length) ok = false;

    let hashNote = '—';
    if (countOk && srcCount > 0 && srcCount <= 300000) {
      const a = await idHash(srcDb, name, srcCount);
      const b = await idHash(dstDb, name, srcCount);
      hashNote = a === b ? `${a} ✓` : `${a} ≠ ${b}`;
      if (a !== b) ok = false;
    } else if (srcCount === 0) {
      hashNote = '空集合';
    }

    rows.push({
      集合: name,
      源库: srcCount,
      开发库: dstCount,
      条数: countOk ? '✓' : '✗',
      索引: idxMissing.length ? `缺${idxMissing.length}` : `${srcIdx.size} ✓`,
      '_id 哈希': hashNote,
    });
  }
  printTable(rows);
  return ok;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  loadEnvFile();

  if (opts.from === opts.to) throw new Error(`源库与目标库同名（${opts.from}），拒绝执行`);
  if (!SAFE_DB_SUFFIX.test(opts.to) && !opts.force) {
    throw new Error(`目标库 "${opts.to}" 不以 _dev/_test/_e2e 结尾，为防止误覆盖生产数据已中止。`);
  }

  const baseUri = opts.uri || process.env.MONGO_URI;
  if (!baseUri) throw new Error('缺少连接串');

  const srcUri = withDatabase(baseUri, opts.from);
  const dstUri = withDatabase(baseUri, opts.to);

  console.log('PortoMind 数据库同步（纯 Node 实现）');
  console.log(`  源库  ：${opts.from}  (${maskUri(srcUri)})`);
  console.log(`  目标库：${opts.to}  (${maskUri(dstUri)})`);
  console.log(`  模式  ：${opts.verifyOnly ? '仅校验' : opts.dryRun ? 'DRY-RUN' : '执行镜像'}`);

  const client = new MongoClient(srcUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const srcDb = client.db(opts.from);
  const dstDb = client.db(opts.to);
  let exitCode = 0;

  try {
    console.log('\n▶ 扫描源库集合');
    const srcColls = await srcDb.listCollections().toArray();
    if (srcColls.length === 0) throw new Error(`源库 ${opts.from} 没有任何集合`);

    let names = srcColls.map((c) => c.name).sort((a, b) => a.localeCompare(b));
    if (opts.only) {
      const miss = opts.only.filter((n) => !names.includes(n));
      if (miss.length) throw new Error(`--only 中的集合在源库不存在：${miss.join(', ')}`);
      names = names.filter((n) => opts.only.includes(n));
    }
    if (opts.exclude.length) names = names.filter((n) => !opts.exclude.includes(n));

    const sizes = [];
    for (const n of names) sizes.push({ 集合: n, 文档数: await srcDb.collection(n).countDocuments({}) });
    printTable(sizes);
    const totalDocs = sizes.reduce((s, x) => s + x.文档数, 0);
    console.log(`  共 ${names.length} 个集合，${totalDocs} 条文档`);

    console.log('\n▶ 比对目标库集合');
    const dstColls = await dstDb.listCollections().toArray();
    const srcNames = new Set(srcColls.map((c) => c.name));
    const dstOnly = dstColls.map((c) => c.name).filter((n) => !srcNames.has(n));
    const preserved = dstOnly.filter((n) => DEV_ONLY_COLLECTIONS.has(n));
    const extra = dstOnly.filter((n) => !DEV_ONLY_COLLECTIONS.has(n));
    if (extra.length === 0) {
      console.log('  目标库没有多余集合');
    } else {
      console.log(`  将删除目标库多余集合：${extra.join(', ')}`);
    }
    if (preserved.length) {
      console.log(`  保留开发库专属集合（绝不删除）：${preserved.join(', ')}`);
    }

    if (opts.verifyOnly) {
      console.log('\n▶ 仅校验（不写入）');
      const ok = await verify({ srcDb, dstDb, names, opts });
      console.log(ok ? '\n▶ 校验通过 ✓' : '\n▶ 校验未通过 ✗');
      return ok ? 0 : 1;
    }

    if (opts.dryRun) {
      console.log('\n▶ DRY-RUN 结束，未写入任何数据');
      return 0;
    }

    // ── 真正同步 ──
    console.log('\n▶ 复制集合（drop 目标集合 → 全量写入）');
    for (const name of names) {
      const t0 = Date.now();
      const src = srcDb.collection(name);

      // 目标集合先 drop，保证「镜像」而非「合并」（与 mongorestore --drop 一致）
      const exists = dstColls.some((c) => c.name === name);
      if (exists) {
        await dstDb.collection(name).drop().catch(() => {});
      }

      const count = await src.countDocuments({});
      let copied = 0;
      // 即使源集合为空也要在目标库建出同名集合（否则 listCollections 缺项，
      // 与 mongorestore 的行为不一致，且会让校验误报「缺集合」）
      if (count === 0) {
        await dstDb.createCollection(name).catch(() => {});
      }
      if (count > 0) {
        let batch = [];
        const cursor = src.find({});
        for await (const doc of cursor) {
          batch.push(doc);
          if (batch.length >= opts.batchSize) {
            await dstDb.collection(name).insertMany(batch, { ordered: false });
            copied += batch.length;
            batch = [];
          }
        }
        if (batch.length) {
          await dstDb.collection(name).insertMany(batch, { ordered: false });
          copied += batch.length;
        }
      }

      // 重建索引（与源库一致）
      const idx = await src.indexes();
      for (const spec of idx) {
        if (spec.name === '_id_') continue;
        const { key, name: idxName, v, ns, ...rest } = spec;
        try {
          await dstDb.collection(name).createIndex(key, { name: idxName, ...rest });
        } catch (e) {
          console.log(`    ⚠ 索引 ${idxName} 创建失败：${e.message}`);
        }
      }

      console.log(`  ${pad(name, 20)} ${String(copied).padStart(6)} 条  ${Date.now() - t0}ms`);
    }

    // prune 多余集合
    for (const name of extra) {
      await dstDb.collection(name).drop().catch(() => {});
      console.log(`  已删除多余集合：${name}`);
    }

    console.log('\n▶ 校验');
    const ok = await verify({ srcDb, dstDb, names, opts });
    console.log(ok ? '\n▶ 同步完成 ✓' : '\n▶ 同步完成，但校验未全部通过 ✗');
    console.log(`  开发库 ${opts.to} 现有集合：${names.length + preserved.length} 个`);
    if (!ok) exitCode = 1;
  } catch (e) {
    console.error(`\n✗ ${e.message}`);
    exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
  return exitCode;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
