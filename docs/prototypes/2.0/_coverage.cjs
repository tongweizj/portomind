/* 分片自检：确认 [from,to] 行内所有中文连续段都被本分片的 key 覆盖。
   用法：node _coverage.cjs 1 500 _i18n-part-1.json
   输出未覆盖的中文段（行号 + 原文）；已覆盖则打印 OK。 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const from = parseInt(process.argv[2], 10);
const to = parseInt(process.argv[3], 10);
const file = process.argv[4];
if (!from || !to || !file) { console.error('用法: node _coverage.cjs <from> <to> <part.json>'); process.exit(1); }

const j = JSON.parse(fs.readFileSync(path.resolve(dir, file), 'utf8'));
const keys = [...new Set((j.entries || []).map((e) => e.zh))].sort((a, b) => b.length - a.length);
const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

const lines = fs.readFileSync(path.join(dir, 'portomind-prototype.html'), 'utf8').split('\n');
const miss = [];
const badKey = [];
for (let n = from; n <= to && n <= lines.length; n++) {
  const line = lines[n - 1];
  if (!/[\u4e00-\u9fff]/.test(line)) continue;
  const rest = line.replace(re, '\u0000');
  if (/[\u4e00-\u9fff]/.test(rest)) miss.push([n, rest.replace(/\u0000/g, '·').trim().slice(0, 160)]);
}
// key 是否真的出现在文件里
for (const k of keys) {
  const hit = lines.some((l, i) => i + 1 >= from - 3 && i + 1 <= to + 3 && l.includes(k));
  if (!hit) badKey.push(k);
}
console.log(`分片 ${file} · key ${keys.length} 条 · 区间 L${from}-L${to}`);
if (badKey.length) console.log('key 在文件中找不到（抄写有误）:\n' + badKey.map((k) => '  ' + JSON.stringify(k)).join('\n'));
if (miss.length) console.log('未覆盖的中文:\n' + miss.map(([n, t]) => `  L${n} ${t}`).join('\n'));
if (!badKey.length && !miss.length) console.log('OK —— 该区间中文已全部覆盖，且所有 key 均可在文件中找到');
