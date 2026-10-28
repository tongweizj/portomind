/* 把 portomind-prototype.html 里的中文文案按「片段→英文」映射整体替换为英文版。
   规则：
   1. 只替换 _i18n-part-*.json 中登记的原文片段，其余字节一字不动（代码/类名/标识符安全）。
   2. 按片段长度倒序拼成单条正则，一次扫描替换 —— 长片段优先，杜绝「短片段先吃掉长片段」。
   3. 输出后自检：未命中的 key、残留中文行，逐一列出行号。
   用法：node _apply-i18n.cjs            （正常生成）
        node _apply-i18n.cjs --check    （只体检，不写文件） */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const CHECK = process.argv.includes('--check');

const SRC = path.join(dir, 'portomind-prototype.html');
const DST = path.join(dir, 'portomind-prototype-en.html');

/* ---------- 载入分片映射 ---------- */
const parts = fs.readdirSync(dir).filter((f) => /^_i18n-part-\d+\.json$/.test(f)).sort();
if (!parts.length) { console.error('没有找到 _i18n-part-*.json'); process.exit(1); }

const map = new Map();
const conflicts = [];
const dupExact = [];
for (const f of parts) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
  catch (e) { console.error(`解析失败 ${f}: ${e.message}`); process.exit(1); }
  for (const e of (j.entries || [])) {
    if (typeof e.zh !== 'string' || typeof e.en !== 'string') { console.error(`${f} 条目缺字段`, e); process.exit(1); }
    // 片段必须含汉字或全角标点（纯 ASCII 片段无需登记，且会误伤代码）
    if (!/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(e.zh)) { console.error(`${f} 片段不含汉字或全角标点（无需登记）: ${JSON.stringify(e.zh)}`); process.exit(1); }
    // 引号允许（替换是字面量替换，不会破坏字符串边界）；尖括号仍禁止（避免误把标记当文案）
    if (/[<>]/.test(e.zh)) { console.error(`${f} 片段含尖括号，会破坏标记: ${JSON.stringify(e.zh)}`); process.exit(1); }
    // 后加载的分片覆盖先前分片：编号大的分片可作为「统一术语」的覆盖层
    if (map.has(e.zh) && map.get(e.zh) !== e.en) conflicts.push({ zh: e.zh, a: map.get(e.zh), b: e.en, file: f });
    else if (map.has(e.zh)) dupExact.push(e.zh);
    map.set(e.zh, e.en);
  }
}

/* ---------- 替换 ---------- */
let src = fs.readFileSync(SRC, 'utf8');
src = src.replace('<html lang="zh-CN">', '<html lang="en">');
src = src.replace('<title>PortoMind · 产品原型 v2.0</title>', '<title>PortoMind · Product Prototype v2.0</title>');

const keys = [...map.keys()].sort((a, b) => b.length - a.length);
const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const used = new Set();
/* 迭代到收敛：正则「最左匹配优先」，带前导空格的短片段会抢在长片段前面命中，
   把长片段切碎（例如 ` 的` 抢在 ` 的再平衡执行？…重做。` 之前）。
   下一轮扫描会把上一轮剩下的中文再吃一次，直到没有变化为止。 */
let out = src;
let passes = 0;
for (; passes < 12; passes++) {
  const before = out;
  out = out.replace(re, (m) => { used.add(m); return map.get(m); });
  if (out === before) break;
}

/* 全角标点归一化：只在最后做一次 —— 映射的 key 本身就含全角标点，提前归一化会让 key 失配。
   `＋` 是 UI 设计里刻意用的全角加号（如「＋ 新建组合」），保留。 */
const PUNCT = [['：', ': '], ['，', ', '], ['。', '.'], ['、', ', '], ['；', '; '],
  ['（', '('], ['）', ')'], ['？', '?'], ['！', '!'], ['｜', '|'], ['　', ' '],
  ['《', '\u201c'], ['》', '\u201d'], ['「', '\u201c'], ['」', '\u201d'], ['～', '~']];
for (const [a, b] of PUNCT) out = out.split(a).join(b);

const missed = keys.filter((k) => !used.has(k));

/* ---------- 自检 ---------- */
const lines = out.split('\n');
const residual = [];
lines.forEach((l, i) => { if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(l)) residual.push([i + 1, l.trim().slice(0, 140)]); });

console.log(`分片 ${parts.length} 个 · 映射 ${keys.length} 条 · 命中 ${used.size} 条 · 未命中 ${missed.length} 条 · 迭代 ${passes + 1} 轮`);
if (conflicts.length) console.log('术语冲突（同一原文两种译法）:\n' + conflicts.map((c) => `  ${JSON.stringify(c.zh)}\n    A=${c.a}\n    B=${c.b} (${c.file})`).join('\n'));
if (missed.length) console.log('未命中（原文与文件不符 / 已被长片段吃掉）:\n' + missed.map((m) => '  ' + JSON.stringify(m)).join('\n'));
console.log(`残留中文行 ${residual.length} 行`);
if (residual.length) console.log(residual.slice(0, 100).map(([n, t]) => `  L${n} ${t}`).join('\n'));

if (!CHECK) {
  fs.writeFileSync(DST, out, 'utf8');
  const a = fs.statSync(SRC).size, b = Buffer.byteLength(out, 'utf8');
  console.log(`\n已写出 ${path.basename(DST)}（${b} 字节，原 ${a} 字节）`);
}
