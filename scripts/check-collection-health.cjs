// scripts/check-collection-health.cjs
// 采集数据健康检查（**只读**，不写任何集合）。
//
// 用途：部署后定期核对「定时任务是否真的把数据采进来」——
//       重点是抓「任务全绿但数据断档」这类静默故障（taskruns 的 successCount
//       统计的是「抓取 + upsert 成功」，重复时间戳被 upsert 吸收时同样计成功，
//       所以任务 SUCCEEDED 不能证明有新数据）。
//
// 用法：
//   node scripts/check-collection-health.cjs                 # 默认库 portomind
//   PROD_DB=portomind_dev node scripts/check-collection-health.cjs
//
// 退出码：0 = 无 CRITICAL；1 = 存在 CRITICAL 级缺口（CI / 巡检可用）

require('dotenv').config({ path: 'server/.env' });
const { MongoClient } = require('mongodb');

const DB = process.env.PROD_DB || 'portomind';
const STALE_DAYS = Number(process.env.STALE_DAYS || 3);

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const lagDays = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
const pad = (v, n) => String(v ?? '').padEnd(n);

const findings = []; // { level, code, msg }
const add = (level, code, msg) => findings.push({ level, code, msg });

(async () => {
  const base = process.env.MONGO_URI;
  if (!base) throw new Error('MONGO_URI 未配置（检查 server/.env）');
  const uri = base.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(DB);

  console.log(`\n=== 采集健康检查 @ ${DB} ===`);
  console.log(`时间: ${new Date().toISOString()}\n`);

  // ── 1. 各 cron 任务最近状态与逐日时间线 ─────────────────────
  const runs = db.collection('taskruns');
  const groups = await runs.aggregate([
    { $group: { _id: { t: '$taskName', s: '$status' }, n: { $sum: 1 }, last: { $max: '$startedAt' } } },
    { $sort: { '_id.t': 1 } }
  ]).toArray();

  console.log('-- 1. 任务状态 --');
  const taskNames = [...new Set(groups.map(g => g._id.t))].sort();
  for (const t of taskNames) {
    const rows = groups.filter(g => g._id.t === t);
    const total = rows.reduce((s, r) => s + r.n, 0);
    const last = rows.reduce((m, r) => (r.last > m ? r.last : m), rows[0].last);
    const st = rows.map(r => `${r._id.s}:${r.n}`).join(' ');
    const failedRecent = await runs.findOne({ taskName: t, status: 'FAILED', startedAt: { $gte: new Date(Date.now() - 3 * 86400000) } });
    console.log(`  ${pad(t, 46)} 共${String(total).padStart(3)}  [${st}]  最近 ${day(last)}${failedRecent ? '  ⚠ 近 3 天有失败' : ''}`);
    if (failedRecent) add('CRITICAL', 'TASK_FAILING', `${t} 近 3 天有 FAILED（最近 ${day(failedRecent.startedAt)}）`);
  }

  // ── 2. 价格覆盖：业务日序列 + 逐资产落后 ────────────────────
  const prices = db.collection('prices');
  const assets = await db.collection('assets').find({}).toArray();
  const perSym = await prices.aggregate([
    { $group: { _id: '$symbol', n: { $sum: 1 }, last: { $max: '$timestamp' } } }
  ]).toArray();
  const bySym = new Map(perSym.map(p => [String(p._id).toUpperCase(), p]));

  const latestPrice = perSym.reduce((m, p) => (p.last > m ? p.last : m), new Date(0));
  console.log(`\n-- 2. 价格 --`);
  console.log(`  最新业务日: ${day(latestPrice)}（落后 ${lagDays(latestPrice)} 天）  资产数=${assets.length}  symbol 数=${perSym.length}`);
  if (lagDays(latestPrice) > STALE_DAYS) {
    add('CRITICAL', 'PRICE_STALE', `价格最新业务日 ${day(latestPrice)}，落后 ${lagDays(latestPrice)} 天（阈值 ${STALE_DAYS}）`);
  }

  const perDay = await prices.aggregate([
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, syms: { $addToSet: '$symbol' } } },
    { $sort: { _id: -1 } }, { $limit: 10 }
  ]).toArray();
  console.log('  最近 10 个有数据的业务日:');
  for (const d of perDay) console.log(`    ${d._id}  symbol=${d.syms.length}`);

  // 双判：① 全局陈旧度（上面的 PRICE_STALE）② 相对基准 —— 只列比「全市场最新业务日」还落后的资产，
  // 否则全市场同时停更时会把 44 个资产全部重复报一遍（相对基准法测不出「集体停更」，故两者必须都有）。
  const globalLag = lagDays(latestPrice);
  const stale = assets.map((a) => {
    const s = String(a.symbol || '').toUpperCase();
    const p = bySym.get(s);
    return { symbol: a.symbol, n: p?.n || 0, last: p?.last || null, lag: p ? lagDays(p.last) : null };
  }).filter(r => r.n === 0 || r.lag > globalLag);

  if (stale.length) {
    console.log(`  ⚠ 比全市场最新日（${day(latestPrice)}）更落后的资产（${stale.length}）:`);
    for (const r of stale) {
      console.log(`    ${pad(r.symbol, 14)} 条数=${String(r.n).padStart(4)}  最新 ${day(r.last)}${r.n === 0 ? '（从未采到）' : `  落后 ${r.lag} 天（多出 ${r.lag - globalLag} 天）`}`);
    }
    add(stale.some(r => r.n === 0) ? 'CRITICAL' : 'WARN', 'PRICE_ASSET_STALE',
      `${stale.length} 个资产比全市场最新日更落后: ${stale.slice(0, 6).map(r => `${r.symbol}(${r.n === 0 ? '无数据' : r.lag + 'd'})`).join(', ')}${stale.length > 6 ? ' …' : ''}`);
  } else {
    console.log('  OK：所有资产都跟上全市场最新业务日');
  }

  // ── 3. symbol 一致性：交易/目标 vs 资产主数据 ──────────────
  const txSyms = (await db.collection('transactions').distinct('symbol')).map(String);
  const assetSyms = new Set(assets.map(a => String(a.symbol || '')));
  const mismatch = txSyms.filter(s => !assetSyms.has(s));
  console.log(`\n-- 3. symbol 一致性 --`);
  if (mismatch.length === 0) {
    console.log('  OK：交易中的 symbol 均存在于 assets');
  } else {
    for (const s of mismatch) {
      const alt = s.replace(/\.(CN|SH|SZ)$/i, '');
      console.log(`  ⚠ 交易用 ${pad(s, 14)} 但 assets 无此写法${assetSyms.has(alt) ? `（疑似同一标的写作 ${alt}）` : ''}`);
    }
    add('CRITICAL', 'SYMBOL_MISMATCH', `${mismatch.length} 个交易 symbol 在 assets 中不存在 → 相关组合的估值/再平衡会失败: ${mismatch.join(', ')}`);
  }

  // ── 4. 汇率 ────────────────────────────────────────────────
  const fx = await db.collection('fxrates').find({}).sort({ date: 1 }).toArray();
  console.log(`\n-- 4. 汇率 --`);
  if (!fx.length) {
    console.log('  ⚠ 无任何汇率记录');
    add('CRITICAL', 'FX_EMPTY', 'fxrates 为空，家庭折算无法进行');
  } else {
    const lastFx = fx[fx.length - 1].date;
    console.log(`  ${fx.length} 条，最新 ${day(lastFx)}（落后 ${lagDays(lastFx)} 天）`);
    for (const f of fx.slice(-3)) console.log(`    ${day(f.date)} ${pad(f.currency, 4)} ${f.rateToCny} ${f.source}`);
    if (lagDays(lastFx) > STALE_DAYS) add('CRITICAL', 'FX_STALE', `汇率最新 ${day(lastFx)}，落后 ${lagDays(lastFx)} 天`);
    // 方向哨兵：rateToCny 语义为「1 外币 = X 人民币」，USD/CAD 应 > 1，HKD 应 < 1
    const lastByCur = {};
    for (const f of fx) lastByCur[f.currency] = f;
    const bad = Object.entries(lastByCur).filter(([c, f]) => (c === 'HKD' ? f.rateToCny >= 1 : f.rateToCny <= 1));
    if (bad.length) {
      console.log(`  ⚠ 方向可疑: ${bad.map(([c, f]) => `${c}=${f.rateToCny}`).join(', ')}（应为 1 外币 = X 人民币）`);
      add('CRITICAL', 'FX_DIRECTION', `汇率方向疑似反向（USD 应≈7、HKD 应≈0.9）: ${bad.map(([c, f]) => `${c}=${f.rateToCny}`).join(', ')}`);
    }
  }

  // ── 5. 其它采集产物 ────────────────────────────────────────
  console.log(`\n-- 5. 其它 --`);
  const counts = {};
  for (const c of ['valuations', 'alertrules', 'alertevents', 'rebalancerecords', 'transactions']) {
    counts[c] = await db.collection(c).countDocuments();
  }
  console.log('  ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
  if (counts.alertrules === 0 && counts.alertevents > 0) {
    console.log('  ⚠ alertrules 为 0 但存在 alertevents —— 规则缺失，提醒引擎实际无可评估规则');
    add('WARN', 'ALERT_RULES_EMPTY', 'alertrules 为空但有历史事件，提醒评估在新规则建立前不会生效');
  }

  // ── 结论 ──────────────────────────────────────────────────
  console.log(`\n=== 结论 ===`);
  const crit = findings.filter(f => f.level === 'CRITICAL');
  const warn = findings.filter(f => f.level === 'WARN');
  if (!findings.length) {
    console.log('  ✅ 未发现缺口');
  } else {
    for (const f of crit) console.log(`  ❌ [${f.code}] ${f.msg}`);
    for (const f of warn) console.log(`  ⚠️  [${f.code}] ${f.msg}`);
    console.log(`\n  合计 CRITICAL=${crit.length}  WARN=${warn.length}`);
  }

  await client.close();
  process.exit(crit.length ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });
