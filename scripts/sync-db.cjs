#!/usr/bin/env node
/**
 * sync-db.cjs — 把「真实库」整库镜像到「开发库」
 *
 * 目的：开发完成后用前端验收时，能看到接近真实的完整数据（持仓、交易、价格、
 * 再平衡记录、提醒事件），而不是一套手工造的空壳数据。
 *
 * 设计：复制引擎用官方 mongodump / mongorestore（原生处理 BSON 类型、集合选项、
 * 索引与唯一约束，且比手写搬运快）。本脚本只补两件官方工具没有的事：
 *   1. 安全守卫 —— 官方工具会老老实实把数据灌进任何库名，误写生产库没有任何提示；
 *   2. 事后校验 —— mongorestore 不做回读比对。
 *
 * 依赖：MongoDB Database Tools（mongodump / mongorestore）。
 *   Windows（scoop）：scoop install mongodb-database-tools
 *   其它平台见 https://www.mongodb.com/try/download/database-tools
 *   找不到时可用 MONGODUMP_BIN / MONGORESTORE_BIN 指定可执行文件绝对路径。
 *
 * 用法：
 *   npm run sync:db -- --dry-run        # 只看计划，不写入
 *   npm run sync:db                     # 执行 portomind -> portomind_dev
 *   npm run sync:db -- --verify-only    # 只校验两边是否一致
 *   npm run sync:db -- --only prices,transactions
 *   npm run sync:db -- --exclude taskruns
 *
 * 退出码：0 成功；1 出错或被安全守卫拦下。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
const SAFE_DB_SUFFIX = /_dev$|_test$|_e2e$/;

// ── 参数解析 ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    from: 'portomind',
    to: 'portomind_dev',
    uri: null,
    fromUri: null,
    toUri: null,
    only: null,
    exclude: [],
    dryRun: false,
    verifyOnly: false,
    verify: true,
    prune: true,
    hash: true,
    force: false,
    parallel: 4,
    // 集合文档数超过该阈值时跳过 _id 哈希校验，只比对精确条数
    hashLimit: 300000,
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
      case '--from-uri': opts.fromUri = next(); break;
      case '--to-uri': opts.toUri = next(); break;
      case '--only': opts.only = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--exclude': opts.exclude = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--parallel': opts.parallel = Number(next()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--verify-only': opts.verifyOnly = true; break;
      case '--no-verify': opts.verify = false; break;
      case '--no-prune': opts.prune = false; break;
      case '--no-hash': opts.hash = false; break;
      case '--force': opts.force = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      default:
        throw new Error(`未知参数：${a}（用 --help 查看用法）`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
用法：npm run sync:db -- [选项]

  --from <db>        源库名，默认 portomind
  --to <db>          目标库名，默认 portomind_dev（必须以 _dev 结尾，除非 --force）
  --uri <uri>        基础连接串，默认取 server/.env 的 MONGO_URI
  --from-uri <uri>   源库独立连接串（跨实例时用）
  --to-uri <uri>     目标库独立连接串（跨实例时用）
  --only a,b         只同步指定集合
  --exclude a,b      跳过指定集合
  --parallel <n>     并行还原的集合数，默认 4
  --dry-run          只打印计划，不写入任何数据
  --verify-only      只做校验（集合清单 / 条数 / 索引 / _id 哈希），不写入
  --no-verify        跳过事后校验（不建议）
  --no-prune         保留目标库中「源库不存在」的集合（默认会删掉）
  --no-hash          跳过 _id 哈希校验（数据量大时更快）
  --force            允许目标库名不以 _dev 结尾（危险）
  -h, --help         显示本帮助

依赖官方工具：mongodump / mongorestore（MongoDB Database Tools）。
Windows 安装：scoop install mongodb-database-tools
`);
}

// ── 环境与连接串 ────────────────────────────────────────────────────────────

/** 读取 server/.env，但不覆盖已存在的真实环境变量（便于临时用 ENV 覆盖） */
function loadEnvFile() {
  const envPath = path.join(ROOT, 'server', '.env');
  if (!fs.existsSync(envPath)) return;
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

/** 把连接串里的库名替换掉，保留主机、认证与查询参数 */
function withDatabase(uri, dbName) {
  const m = String(uri).match(/^(mongodb(?:\+srv)?:\/\/[^/?]*)(?:\/[^?]*)?(\?.*)?$/);
  if (!m) throw new Error('无法解析连接串，应以 mongodb:// 或 mongodb+srv:// 开头');
  return `${m[1]}/${dbName}${m[2] || ''}`;
}

/** 脱敏后打印，避免把密码打到日志里 */
function maskUri(uri) {
  return String(uri).replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');
}

function parseDbName(uri) {
  const m = String(uri).match(/^mongodb(?:\+srv)?:\/\/[^/?]+\/([^?]*)/);
  return m && m[1] ? m[1] : null;
}

// ── 官方工具定位 ────────────────────────────────────────────────────────────

/**
 * 依次尝试：环境变量 → PATH → 常见安装位置。
 * scoop 的 mongodb-database-tools 清单未声明 bin，因此不会生成 shim，
 * 只靠 PATH 找不到，这里补上 scoop 的默认目录。
 */
function resolveTool(name, envVar) {
  if (process.env[envVar] && fs.existsSync(process.env[envVar])) return process.env[envVar];

  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [
    exe,
    path.join(os.homedir(), 'scoop', 'apps', 'mongodb-database-tools', 'current', 'bin', exe),
    path.join('C:', 'Program Files', 'MongoDB', 'Database Tools', exe),
    path.join('C:', 'Program Files', 'MongoDB', 'Tools', exe),
  ];
  for (const c of candidates) {
    if (c === exe) {
      if (whichSync(exe)) return exe;
    } else if (fs.existsSync(c)) {
      return c;
    }
  }
  throw new Error(
    `找不到 ${name}。请安装 MongoDB Database Tools：\n` +
    '  Windows：scoop install mongodb-database-tools\n' +
    '  其它平台：https://www.mongodb.com/try/download/database-tools\n' +
    `  或用环境变量 ${envVar} 指定可执行文件绝对路径`,
  );
}

function whichSync(cmd) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, cmd + e);
      try {
        if (fs.statSync(p).isFile()) return true;
      } catch (e2) { /* 不存在，继续 */ }
    }
  }
  return false;
}

function runTool(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${path.basename(cmd)} 退出码 ${code}\n${(err || out).trim()}`));
    });
  });
}

// ── 校验 ────────────────────────────────────────────────────────────────────

async function idHash(db, name, count) {
  const ids = await db
    .collection(name)
    .find({}, { projection: { _id: 1 } })
    .map((d) => String(d._id))
    .toArray();
  if (ids.length !== count) return `长度不符(${ids.length})`;
  ids.sort();
  return crypto.createHash('md5').update(ids.join(',')).digest('hex').slice(0, 12);
}

async function verify({ srcDb, dstDb, names, opts, log }) {
  const rows = [];
  let ok = true;

  // 1) 集合清单。countDocuments 对不存在的集合返回 0，只用条数比对会把
  //    「目标库缺集合」误判为通过（该缺陷在本项目实测踩过一次）。
  const expected = new Set(names);
  const actual = new Set((await dstDb.listCollections().toArray()).map((c) => c.name));
  const missing = [...expected].filter((n) => !actual.has(n));
  // --only 只同步部分集合，目标库其余集合属正常存在，不能算「多出」
  const extra = opts.prune && !opts.only ? [...actual].filter((n) => !expected.has(n)) : [];
  if (missing.length === 0 && extra.length === 0) {
    log.info(`集合清单一致：${expected.size} 个`);
  } else {
    ok = false;
    if (missing.length) log.warn(`目标库缺少集合：${missing.join(', ')}`);
    if (extra.length) log.warn(`目标库多出集合：${extra.join(', ')}`);
  }

  // 2) 每个集合：索引清单 + 条数 + _id 哈希
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

    // 索引：比对名字集合，索引缺失等于查询会全表扫，属于「看起来同步了其实没同步」
    const srcIdx = new Set((await srcDb.collection(name).indexes()).map((i) => i.name));
    const dstIdx = new Set((await dstDb.collection(name).indexes()).map((i) => i.name));
    const idxMissing = [...srcIdx].filter((n) => !dstIdx.has(n));
    if (idxMissing.length) ok = false;

    let hashNote = '—';
    let hashOk = true;
    if (opts.hash && countOk && srcCount > 0 && srcCount <= opts.hashLimit) {
      const a = await idHash(srcDb, name, srcCount);
      const b = await idHash(dstDb, name, srcCount);
      hashOk = a === b;
      hashNote = hashOk ? `${a} ✓` : `${a} ≠ ${b}`;
      if (!hashOk) ok = false;
    } else if (srcCount > opts.hashLimit) {
      hashNote = '跳过(数据量大)';
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

  log.table(rows);
  return ok;
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return 0;
  }

  loadEnvFile();

  const log = {
    step: (m) => console.log(`\n▶ ${m}`),
    info: (m) => console.log(`  ${m}`),
    detail: (m) => console.log(`    · ${m}`),
    warn: (m) => console.log(`  ⚠ ${m}`),
    table: (rows) => {
      if (rows.length === 0) return;
      const cols = Object.keys(rows[0]);
      const width = cols.map((c) =>
        Math.max(strLen(c), ...rows.map((r) => strLen(String(r[c])))));
      const line = (cells) => '  ' + cells.map((c, i) => pad(String(c), width[i])).join('  ');
      console.log('  ' + cols.map((c, i) => pad(c, width[i])).join('  '));
      console.log('  ' + width.map((w) => '─'.repeat(w)).join('  '));
      rows.forEach((r) => console.log(line(cols.map((c) => r[c]))));
    },
  };

  // ── 安全守卫（官方工具完全没有这些保护）──
  if (opts.from === opts.to) {
    throw new Error(`源库与目标库同名（${opts.from}），拒绝执行`);
  }
  if (!SAFE_DB_SUFFIX.test(opts.to) && !opts.force) {
    throw new Error(
      `目标库 "${opts.to}" 不以 _dev/_test/_e2e 结尾，为防止误覆盖生产数据已中止。\n` +
      '  确认无误请加 --force。',
    );
  }

  const baseUri = opts.uri || process.env.MONGO_URI;
  if (!baseUri) {
    throw new Error('缺少连接串：请设置环境变量 MONGO_URI，或传 --uri / --from-uri / --to-uri');
  }

  const srcUri = opts.fromUri || withDatabase(baseUri, opts.from);
  const dstUri = opts.toUri || withDatabase(baseUri, opts.to);
  const srcDbName = parseDbName(srcUri);
  const dstDbName = parseDbName(dstUri);

  const mode = opts.verifyOnly ? '仅校验（不写入）' : opts.dryRun ? 'DRY-RUN（不写入）' : '执行镜像';
  console.log('PortoMind 数据库同步');
  console.log(`  源库  ：${srcDbName}  (${maskUri(srcUri)})`);
  console.log(`  目标库：${dstDbName}  (${maskUri(dstUri)})`);
  console.log(`  模式  ：${mode}`);
  console.log(`  引擎  ：mongodump / mongorestore`);

  const client = new MongoClient(srcUri, { serverSelectionTimeoutMS: 8000 });
  const sameConnection = dstUri === srcUri;
  let dstClient = null;

  try {
    await client.connect();
    const srcDb = client.db(srcDbName);
    if (!sameConnection) {
      dstClient = new MongoClient(dstUri, { serverSelectionTimeoutMS: 8000 });
      await dstClient.connect();
    }
    const dstDb = dstClient ? dstClient.db(dstDbName) : srcDb;

    log.step('扫描源库集合');
    const srcColls = await srcDb.listCollections().toArray();
    if (srcColls.length === 0) throw new Error(`源库 ${srcDbName} 没有任何集合，中止`);

    let names = srcColls.map((c) => c.name).sort((a, b) => a.localeCompare(b));
    if (opts.only) {
      const miss = opts.only.filter((n) => !names.includes(n));
      if (miss.length) throw new Error(`--only 中的集合在源库不存在：${miss.join(', ')}`);
      names = names.filter((n) => opts.only.includes(n));
    }
    if (opts.exclude.length) {
      names = names.filter((n) => !opts.exclude.includes(n));
    }
    if (names.length === 0) throw new Error('筛选后没有需要同步的集合，中止');

    const sizes = [];
    for (const n of names) sizes.push({ 集合: n, 文档数: await srcDb.collection(n).countDocuments({}) });
    log.table(sizes);
    const totalDocs = sizes.reduce((s, x) => s + x.文档数, 0);
    log.info(`共 ${names.length} 个集合，${totalDocs} 条文档`);

    // 目标库多出来的集合（源库没有）→ 默认删除，让开发库与真实库严格一致
    log.step('比对目标库集合');
    const dstColls = await dstDb.listCollections().toArray();
    const srcNames = new Set(srcColls.map((c) => c.name));
    const extra = dstColls.map((c) => c.name).filter((n) => !srcNames.has(n));
    if (extra.length === 0) {
      log.info('目标库没有多余集合');
    } else if (opts.prune) {
      log.info(`将删除目标库多余集合：${extra.join(', ')}`);
    } else {
      log.warn(`目标库有 ${extra.length} 个多余集合（--no-prune 已保留）：${extra.join(', ')}`);
    }

    if (opts.verifyOnly) {
      log.step('仅校验（不写入）');
      const okOnly = await verify({ srcDb, dstDb, names, opts, log });
      log.step(okOnly ? '校验通过 ✓' : '校验未通过 ✗');
      return okOnly ? 0 : 1;
    }

    if (opts.dryRun) {
      log.step('DRY-RUN 结束，未写入任何数据');
      return 0;
    }

    // ── 真正同步：官方工具 dump → restore ──
    const mongodump = resolveTool('mongodump', 'MONGODUMP_BIN');
    const mongorestore = resolveTool('mongorestore', 'MONGORESTORE_BIN');
    log.detail(`mongodump    : ${mongodump}`);
    log.detail(`mongorestore : ${mongorestore}`);

    const archive = path.join(os.tmpdir(), `portomind-mirror-${Date.now()}.dump`);
    // 注意：官方工具用自有参数解析，--uri 后跟空格取值会被当成位置参数而报错，
    // 必须写成 --uri=<value> 的单参数形式。
    const dumpArgs = [`--uri=${srcUri}`, '--gzip', `--archive=${archive}`];
    const restoreArgs = [
      `--uri=${dstUri}`,
      '--gzip', `--archive=${archive}`,
      `--nsFrom=${srcDbName}.*`,
      `--nsTo=${dstDbName}.*`,
      // nsFrom/nsTo 必须配合 nsInclude 才会选中集合，否则会「0 条还原」而退出码仍为 0
      ...names.map((n) => `--nsInclude=${srcDbName}.${n}`),
      '--drop',
      `--numParallelCollections=${opts.parallel}`,
    ];

    try {
      log.step('mongodump 导出');
      const t0 = Date.now();
      await runTool(mongodump, dumpArgs);
      const size = fs.existsSync(archive) ? `${(fs.statSync(archive).size / 1024).toFixed(0)} KB` : '?';
      log.info(`完成，${Date.now() - t0}ms，归档 ${size}`);

      log.step('mongorestore 还原');
      const t1 = Date.now();
      const { out, err } = await runTool(mongorestore, restoreArgs);
      // mongorestore 的日志写 stderr，不是 stdout
      const text = `${out}\n${err}`;
      const m = text.match(/(\d+) document\(s\) (?:restored successfully|successfully restored)/);
      const failed = text.match(/(\d+) document\(s\) failed/);
      const restored = m ? Number(m[1]) : NaN;
      const failCount = failed ? Number(failed[1]) : 0;
      log.info(`完成，${Date.now() - t1}ms，还原 ${Number.isNaN(restored) ? '未识别' : restored} 条，失败 ${failCount} 条`);
      if (Number.isNaN(restored)) {
        log.warn('未能从 mongorestore 输出中解析还原条数，请核对下面的校验结果');
      } else if (restored !== totalDocs || failCount > 0) {
        log.warn(`还原条数 ${restored} / 失败 ${failCount}，与源库统计 ${totalDocs} 不一致，请看下面的校验结果`);
      }
    } finally {
      fs.existsSync(archive) && fs.rmSync(archive, { force: true });
    }

    if (opts.prune) {
      for (const name of extra) {
        await dstDb.dropCollection(name);
        log.detail(`已删除多余集合：${name}`);
      }
    }

    let ok = true;
    if (opts.verify) {
      log.step('校验');
      ok = await verify({ srcDb, dstDb, names, opts, log });
    } else {
      log.warn('已跳过事后校验（--no-verify）');
    }

    log.step(ok ? '同步完成 ✓' : '同步完成，但校验未全部通过 ✗');
    log.info(`开发库 ${dstDbName} 现有集合：${names.length} 个`);
    log.info('开发服务器读的是 portomind_dev，重启 server 后即可用真实数据验收。');
    return ok ? 0 : 1;
  } finally {
    await client.close().catch(() => {});
    if (dstClient) await dstClient.close().catch(() => {});
  }
}

// ── 小工具 ──────────────────────────────────────────────────────────────────

function strLen(s) {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return n;
}

function pad(s, width) {
  return s + ' '.repeat(Math.max(0, width - strLen(s)));
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
  });
