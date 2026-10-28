/* 残留报告：逐行比对源文件与英文版输出，列出仍含中文/全角标点的行，并打印残留字符。
   用法：node _residual.cjs [max] */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const max = parseInt(process.argv[2], 10) || 60;
const src = fs.readFileSync(path.join(dir, 'portomind-prototype.html'), 'utf8').split('\n');
let out;
try { out = fs.readFileSync(path.join(dir, 'portomind-prototype-en.html'), 'utf8').split('\n'); }
catch { console.error('先运行 node _apply-i18n.cjs 生成英文版'); process.exit(1); }

const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g;
let han = 0, punct = 0, shown = 0, total = 0;
out.forEach((l, i) => {
  const runs = l.match(CJK);
  if (!runs) return;
  total++;
  if (shown >= max) return;
  shown++;
  console.log(`L${i + 1}  残留： ${runs.map((r) => `<${r}>`).join(' ')}`);
  console.log(`  源: ${(src[i] || '').trim().slice(0, 200)}`);
});
const all = out.join('\n');
(all.match(/[\u4e00-\u9fff]/g) || []).forEach(() => han++);
(all.match(/[\u3000-\u303f\uff00-\uffef]/g) || []).forEach(() => punct++);
console.log(`\n残留行 ${total} 行 · 汉字 ${han} 个 · 全角标点 ${punct} 个（已列出 ${shown} 行）`);
