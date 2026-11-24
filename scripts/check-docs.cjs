#!/usr/bin/env node
/** Read-only document link validation. Exit: 0 pass, 1 errors, 2 warnings.
 *
 * node scripts/check-docs.cjs [--links-only] [--json]
 * --root PATH        validate another documentation root (also used by fixture tests).
 * --source-root PATH resolve missing non-docs files from an explicitly named
 *                    source checkout. Never use that checkout to replace missing docs or anchors.
 *
 * Scope: local links, heading anchors and HTML assets only. Task cards,
 * delivery directory layout, task status enums and agent routing tables now
 * live in GitHub Issues / Projects and are intentionally not validated here.
 * --links-only is kept as a compatibility alias for `npm run docs:check:links`;
 * every check in this script is a link check.
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`${name} requires a path`);
  return path.resolve(args[i + 1]);
}
const ROOT = option('--root') || path.resolve(__dirname, '..');
const SOURCE_ROOT = option('--source-root');
const json = args.includes('--json');
const entries = ['README.md', ...['client', 'server', 'cron-worker', 'shared'].flatMap(d => [`${d}/README.md`, `${d}/readme.md`, `${d}/AGENTS.md`])];
const files = [], findings = [], sourceOnly = [];
const seen = new Set();
const relative = f => path.relative(ROOT, f).split(path.sep).join('/');
function add(file) {
  const key = process.platform === 'win32' ? file.toLowerCase() : file;
  if (fs.existsSync(file) && !seen.has(key)) { seen.add(key); files.push(file); }
}
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(md|html)$/.test(e.name)) add(f);
  }
}
walk(path.join(ROOT, 'docs'));
entries.forEach(f => add(path.join(ROOT, f)));
function report(level, file, line, rule, message) { findings.push({ level, file: relative(file), line, rule, message }); }
function resolveTarget(file, target) {
  const local = path.resolve(path.dirname(file), target);
  if (fs.existsSync(local)) return local;
  const rel = relative(local);
  if (!SOURCE_ROOT || rel === 'docs' || rel.startsWith('docs/') || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  const fallback = path.resolve(SOURCE_ROOT, rel);
  if (!fs.existsSync(fallback)) return null;
  sourceOnly.push({ file: relative(file), target: rel });
  return fallback;
}
const anchorCache = new Map();
function anchors(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const ids = new Set(), counts = new Map();
  const content = fs.readFileSync(file, 'utf8');
  let fence = null;
  for (const line of content.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    if (heading) {
      let slug = heading[1].replace(/<[^>]+>/g, '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}\p{Pc}\-\s]/gu, '').replace(/\s/g, '-');
      const count = counts.get(slug) || 0;
      counts.set(slug, count + 1);
      if (count) slug += '-' + count;
      ids.add(slug);
    }
    for (const match of line.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  }
  anchorCache.set(file, ids);
  return ids;
}
let totalLinks = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const inMarkdown = file.endsWith('.md');
  const pattern = inMarkdown ? /\]\(([^)]+)\)|\b(?:href|src)=["']([^"'<>]+)["']/g : /\b(?:href|src)=["']([^"'<>]+)["']/g;
  for (const match of text.matchAll(pattern)) {
    const raw = (inMarkdown ? match[1] || match[2] : match[1]).trim();
    const line = text.slice(0, match.index).split('\n').length;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      if (/^https?:\/\/(?:www\.)?mongodb\.com\/docs\/(?:handbook|development|os|reference)\//i.test(raw)) report('ERROR', file, line, 'external-url-rewritten', `MongoDB 官方网址疑似被本地目录迁移误改: ${raw}`);
      continue;
    }
    if (/[<>]/.test(raw) || raw.startsWith('/')) continue;
    let target, fragment;
    try {
      const hash = raw.indexOf('#');
      target = decodeURIComponent((hash < 0 ? raw : raw.slice(0, hash)).split('?')[0]);
      fragment = hash < 0 ? null : decodeURIComponent(raw.slice(hash + 1));
    } catch { report('ERROR', file, line, 'invalid-link', `无法解码链接: ${raw}`); continue; }
    if (!target && !fragment) continue;
    totalLinks++;
    const resolved = target ? resolveTarget(file, target) : file;
    if (!resolved) { report('ERROR', file, line, 'broken-link', `链接目标不存在: ${raw}`); continue; }
    if (fragment && resolved.endsWith('.md') && !anchors(resolved).has(fragment)) report('ERROR', file, line, 'broken-anchor', `章节锚点不存在: ${raw}`);
  }
}
const errors = findings.filter(f => f.level === 'ERROR'), warns = findings.filter(f => f.level === 'WARN');
const result = { files: files.length, totalLinks, sourceRoot: SOURCE_ROOT, sourceOnlyLinks: sourceOnly, errors, warns };
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const f of findings) console.log(`${f.level} ${f.file}:${f.line} [${f.rule}] ${f.message}`);
  console.log(`扫描 ${files.length} 份文档；链接 ${totalLinks} 条；ERROR ${errors.length}；WARN ${warns.length}`);
  if (SOURCE_ROOT) console.log(`仅在源码目录解析的引用 ${sourceOnly.length} 条（不包含 docs）。`);
}
process.exitCode = errors.length ? 1 : warns.length ? 2 : 0;
