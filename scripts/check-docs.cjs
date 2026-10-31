#!/usr/bin/env node
/** Read-only document validation. Exit: 0 pass, 1 errors, 2 warnings.
 * node scripts/check-docs.cjs [--links-only] [--json]
 * --root PATH: validate another documentation root (also used by fixture tests).
 * --source-root PATH: resolve missing non-docs files from an explicitly named
 * source checkout. Never use that checkout to replace missing docs or anchors.
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
const linksOnly = args.includes('--links-only');
const json = args.includes('--json');
const entries = ['README.md', 'AGENTS.md', ...['client', 'server', 'cron-worker', 'shared'].flatMap(d => [`${d}/README.md`, `${d}/readme.md`, `${d}/AGENTS.md`])];
const files = [], findings = [], sourceOnly = [], pendingTasks = [];
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
// The directory layout groups files; status still comes from each card.
const delivery = path.join(ROOT, 'docs/development/delivery');
function storyDirectories(parent) {
  if (!fs.existsSync(parent)) return [];
  return fs.readdirSync(parent, { withFileTypes: true }).filter(e => e.isDirectory() && /^US-\d+$/.test(e.name)).map(e => path.join(parent, e.name));
}
const currentDeliveries = storyDirectories(delivery);
if (currentDeliveries.length > 1) report('ERROR', delivery, 1, 'multiple-current-deliveries', 'delivery 根目录只能保留一个当前 Story 目录');
for (const name of ['active', 'archived']) {
  const old = path.join(delivery, name);
  if (fs.existsSync(old)) report('ERROR', old, 1, 'legacy-delivery-layout', 'Story 交付目录不再使用 active/ 或 archived/ 层');
}
for (const dir of [...currentDeliveries, ...storyDirectories(path.join(delivery, 'completed')), ...storyDirectories(path.join(ROOT, 'docs/development/archive/delivery'))]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) report('ERROR', path.join(dir, entry.name), 1, 'nested-story-directory', 'Story 过程文件须平铺，不再建立子目录');
}
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
let totalLinks = 0, routingRows = 0;
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
    if (path.basename(file) === 'AGENTS.md' && path.dirname(file) === ROOT) {
      const section = text.slice(0, match.index).match(/^## .*$/gm)?.at(-1) || '';
      if (section.startsWith('## 3. Find things')) routingRows++;
    }
  }
}
const TASK_STATUS = new Set(['Backlog', 'Planning', 'Implementing', 'Reviewing', 'Blocked', 'Completed']);
function tableValue(text, prefix) {
  for (const line of text.split(/\r?\n/)) {
    const row = line.match(/^\|\s*([^|]+)\|([^|]*)/);
    if (row && prefix.test(row[1].replace(/\*/g, '').trim())) return row[2].trim();
  }
  return null;
}
if (!linksOnly) for (const file of files.filter(f => f.endsWith('.md'))) {
  const rel = relative(file), text = fs.readFileSync(file, 'utf8');
  const standaloneTask = /^docs\/development\/tasks\/(?:active|completed)\/TASK-\d+[^/]*\.md$/.test(rel);
  const storyTask = /^docs\/development\/(?:delivery\/(?:completed\/)?|archive\/delivery\/)US-\d+\/TASK-\d+\.md$/.test(rel);
  if (standaloneTask || storyTask) {
    const pending = /^> 待 Orchestrator 正式登记的任务内容，当前不含 Status，不属于已登记任务或实施队列。/m.test(text);
    const cell = tableValue(text, /^Status$/i) ?? text.match(/^\*\*Status:?\*\*[:：]?[ \t]*(?:\r?\n)?[ \t]*(.+)$/m)?.[1] ?? text.match(/^##\s+Status[ \t]*\r?\n\s*([^\r\n]+)/m)?.[1];
    if (!cell) {
      if (pending) pendingTasks.push(rel);
      else report('WARN', file, 1, 'task-status-missing', '任务卡缺少 Status 字段，也未明确标注待登记');
    } else {
      if (pending) report('ERROR', file, 1, 'pending-status-conflict', '待登记声明与已有 Status 字段冲突');
      const value = cell.match(/^[\s*`]*([A-Za-z_]+)/)?.[1];
      const created = tableValue(text, /^Created\b/i) ?? text.match(/^\*\*Created[^*]*\*\*[:：]?[ \t]*(?:\r?\n)?[ \t]*(.+)$/m)?.[1] ?? text.match(/^##\s+Created[ \t]*\r?\n\s*([^\r\n]+)/m)?.[1] ?? '';
      const createdDate = created.match(/\d{4}-\d\d-\d\d/)?.[0];
      // Old spelling is retained only for dated legacy cards (STATES.md §7).
      if (!TASK_STATUS.has(value) && !(createdDate && createdDate < '2026-10-30')) report('ERROR', file, 1, 'task-status-enum', `Status 不在现行枚举内: ${value || cell}`);
    }
  }
  const template = /(?:^|\/)os\/templates\//.test(rel);
  if (!template && /(?:^|\/)os\/(?:standards|roles|architecture)\/|(?:^|\/)AGENTS\.md$/.test(rel)) {
    for (const match of text.matchAll(/<(PROJECT_NAME|technology|command|Brief description|security contact[^>]*|capability)>/g)) report('ERROR', file, text.slice(0, match.index).split('\n').length, 'template-placeholder', `规则文档残留模板占位符: ${match[0]}`);
  }
}
const errors = findings.filter(f => f.level === 'ERROR'), warns = findings.filter(f => f.level === 'WARN');
const result = { files: files.length, totalLinks, routingRows, sourceRoot: SOURCE_ROOT, sourceOnlyLinks: sourceOnly, pendingTasks, errors, warns };
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const f of findings) console.log(`${f.level} ${f.file}:${f.line} [${f.rule}] ${f.message}`);
  console.log(`扫描 ${files.length} 份文档；链接 ${totalLinks} 条；ERROR ${errors.length}；WARN ${warns.length}`);
  if (SOURCE_ROOT) console.log(`仅在源码目录解析的引用 ${sourceOnly.length} 条（不包含 docs）；待登记任务 ${pendingTasks.length} 份。`);
}
process.exitCode = errors.length ? 1 : warns.length ? 2 : 0;
