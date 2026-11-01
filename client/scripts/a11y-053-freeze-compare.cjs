#!/usr/bin/env node
/**
 * a11y-053-freeze-compare.cjs — AC5 严格对照：用**冻结的当日快照**排除数据增长干扰。
 *
 * 为什么需要它：
 *   第一次改动前后对照出现 5 处差异，但全部是「分页总数从 3 页变 6 页」——原因是
 *   验证本身在往 /logs 写行（每次请求都记 HTTP_ACCESS），日志总量从 ~50 涨到 110。
 *   这属于**数据增长**，不能据此判定「行为回归」，也不能反过来当「通过」。
 *
 * 做法：
 *   把「同一份固定日志数据」分别喂给「改动前实现」和「改动后实现」，对同一组交互
 *   （切视图 / 翻页 / 筛选 / 改日期）逐项比对。为此：
 *     1. 从 git 取改动前的 LogViewer（HEAD 版本）单独起一个 vite 实例（端口 6602）；
 *     2. 两个实例都指向同一个「日志内容冻结」的桩服务（端口 8091），
 *        该桩对任何 page 都返回**同一份** 45 条合成日志 + 正确 total；
 *     3. 用同一组 Playwright 交互跑两遍，比对 rowCount / 页码指示 / 错误态 / 请求参数序列。
 *
 * 结论口径：只有「请求参数序列 + 页面可见状态」全部一致才算 AC5 通过。
 */
const { chromium } = require('playwright-core');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const STUB_PORT = 8091;
const BEFORE_PORT = 6602;
const AFTER_PORT = 6603;
const ROOT = path.resolve(__dirname, '..', '..');
const CLIENT = path.join(ROOT, 'client');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 冻结的合成日志：45 条，跨 2 页（pageSize=20） ──
const TOTAL_ROWS = 45;
const PAGE_SIZE = 20;
const ALL_ROWS = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
  timestamp: `2026-10-30 10:${String(i).padStart(2, '0')}:00`,
  level: i % 7 === 0 ? 'error' : (i % 5 === 0 ? 'warn' : 'info'),
  traceId: `trace-${i}`,
  message: `frozen log line ${i}`,
}));

const requestLog = []; // 记录桩收到的查询参数，用于比对「请求序列」

function startStub() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`);
    if (url.pathname === '/api/auth/session') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, data: { authenticated: true, user: { id: '1', username: 'admin', role: 'admin', mustChangePassword: false } } }));
    }
    if (url.pathname === '/api/logs' || url.pathname === '/api/logs/tasks') {
      const page = Number(url.searchParams.get('page') || 1);
      const pageSize = Number(url.searchParams.get('pageSize') || PAGE_SIZE);
      const level = url.searchParams.get('level') || 'all';
      const date = url.searchParams.get('date') || '';
      requestLog.push({ path: url.pathname, page, pageSize, level, date });
      // 任务日志视图返回空集（与真实环境一致：尚未产生 taskruns）
      const isTask = url.pathname === '/api/logs/tasks';
      let rows = isTask ? [] : ALL_ROWS;
      // ⚠️ 必须真的按 level / date 过滤 —— 否则「筛选被重置」与「筛选被保留」
      // 在结果上无法区分，测试就会漏掉 F-02 这类缺陷（2026-10-31 实测踩过）。
      if (level !== 'all') rows = rows.filter((r) => r.level === level);
      if (date) rows = rows.filter((r) => r.timestamp.startsWith(date));
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: slice,
        pagination: { page, pageSize, total: rows.length },
      }));
    }
    if (url.pathname === '/api/alerts/events/unread-count') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, data: { count: 0 } }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: {} }));
  });
  return new Promise((resolve) => server.listen(STUB_PORT, '127.0.0.1', () => resolve(server)));
}

function startVite(port, cwd) {
  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort'],
    { cwd, env: { ...process.env, VITE_API_PROXY_TARGET: `http://127.0.0.1:${STUB_PORT}`, VITE_API_URL: '' }, stdio: 'ignore' }
  );
  return child;
}

/**
 * 准备「改动前」的独立源码树。
 *
 * 两边必须同时可跑，所以不能让它们共用同一份 src。做法：
 *   1. 在 **仓库内** 建临时目录 `client/.tmp-053-before/`（不是系统 temp）——
 *      这样 Node/Vite 的模块解析会自动向上走到 `client/node_modules` 与根 `node_modules`，
 *      不需要任何目录联接，避免 Windows junction 造成 `react/jsx-dev-runtime` 解析失败；
 *   2. 复制 client 的源码与配置进去（跳过 node_modules / dist）；
 *   3. 用 `git show HEAD:client/src/pages/LogViewer.jsx` 覆盖回**改动前**的版本，
 *      并移除本卡新增的文件，让旧树真正只含旧实现。
 */
function prepareBeforeTree() {
  const { execFileSync } = require('child_process');
  const dest = path.join(CLIENT, '.tmp-053-before');

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  const SKIP = new Set(['node_modules', 'dist', '.vite', '.tmp-053-before', 'scripts']);
  for (const entry of fs.readdirSync(CLIENT)) {
    if (SKIP.has(entry)) continue;
    fs.cpSync(path.join(CLIENT, entry), path.join(dest, entry), { recursive: true });
  }

  // 还原改动前的 LogViewer
  const oldSrc = execFileSync('git', ['show', 'HEAD:client/src/pages/LogViewer.jsx'], { cwd: ROOT, encoding: 'utf8' });
  fs.writeFileSync(path.join(dest, 'src', 'pages', 'LogViewer.jsx'), oldSrc);

  // 旧实现不引用本卡新增的文件，移走它们以确保「真的是旧实现」
  for (const rel of ['src/components/CronStatus', 'src/components/RawLog', 'src/constants/logTabs.js']) {
    fs.rmSync(path.join(dest, rel), { recursive: true, force: true });
  }

  return dest;
}

async function waitHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not ready */ }
    await sleep(400);
  }
  return false;
}

async function runScenario(page, base, label) {
  const out = { label };
  requestLog.length = 0;

  // 进入 /logs（旧实现默认 server 视图；新实现默认看板，因此显式切到原始视图）
  await page.goto(`${base}/logs`, { waitUntil: 'networkidle' });
  await sleep(1000);

  // 切到「服务器日志」：新实现点 tab，旧实现点英文按钮 —— 两种都试
  for (const name of ['服务器日志', 'Server Log']) {
    const loc = page.getByRole('tab', { name }).or(page.getByRole('button', { name, exact: true }));
    if (await loc.count().catch(() => 0)) { await loc.first().click(); break; }
  }
  await sleep(1200);

  const snap = async (tag) => ({
    tag,
    rows: await page.locator('table tbody tr').count(),
    pageText: ((await page.locator('body').innerText()).match(/第\s*\d+\s*\/\s*\d+\s*页/) || [''])[0],
    firstCell: await page.locator('table tbody tr td').first().innerText().catch(() => ''),
    hasError: (await page.locator('body').innerText()).includes('日志加载失败'),
  });

  out.initial = await snap('initial');

  // 下一页
  const next = page.getByRole('button', { name: /下一页/ });
  if (await next.isEnabled().catch(() => false)) { await next.click(); await sleep(1200); }
  out.page2 = await snap('page2');

  // 上一页
  const prev = page.getByRole('button', { name: /上一页/ });
  if (await prev.isEnabled().catch(() => false)) { await prev.click(); await sleep(1200); }
  out.backToPage1 = await snap('backToPage1');

  // 级别筛选 → error
  await page.locator('select').first().selectOption('error').catch(() => {});
  await sleep(1300);
  out.levelError = await snap('levelError');

  // 日期同时设为前一天（'2026-10-29' 在冻结数据里没有行 → 0 rows，可作为「筛选生效」的判据）
  const dateInput = page.locator('input[type="date"]').first();
  await dateInput.fill('2026-10-29').catch(() => {});
  await sleep(1400);
  out.filteredBeforeSwitch = await snap('filteredBeforeSwitch');

  // ── F-02 关键场景：带着「error + 2026-10-29」跨视图切换 ──
  // 改造前：切回后筛选**保持** error + 2026-10-29（只有 page 归 1）
  // 若实现把筛选 state 放进被 key 重挂的子组件，这里会退化成 all + 今天 → 断言应失败
  for (const name of ['任务日志', 'Task Log']) {
    const loc = page.getByRole('tab', { name }).or(page.getByRole('button', { name, exact: true }));
    if (await loc.count().catch(() => 0)) { await loc.first().click(); break; }
  }
  await sleep(1300);
  out.taskView = await snap('taskView');

  for (const name of ['服务器日志', 'Server Log']) {
    const loc = page.getByRole('tab', { name }).or(page.getByRole('button', { name, exact: true }));
    if (await loc.count().catch(() => 0)) { await loc.first().click(); break; }
  }
  await sleep(1400);
  out.backToServer = await snap('backToServer');

  // 记录切回后控件上真实的筛选值（这是 F-02 的直接证据，不只是行数）
  out.controlsAfterSwitch = {
    level: await page.locator('select').first().inputValue().catch(() => ''),
    date: await page.locator('input[type="date"]').first().inputValue().catch(() => ''),
  };

  // 级别复位（为后续场景收尾）
  await page.locator('select').first().selectOption('all').catch(() => {});
  await sleep(1300);
  out.levelAll = await snap('levelAll');

  // 请求序列：去掉 date 与 pageSize 的绝对值差异，只比「行为形状」
  out.requestShape = requestLog.map((r) => `${r.path}|p${r.page}|${r.level}`);
  return out;
}

function diffScenarios(a, b) {
  const diffs = [];
  const keys = ['initial', 'page2', 'backToPage1', 'levelError', 'filteredBeforeSwitch', 'taskView', 'backToServer', 'levelAll'];
  for (const k of keys) {
    for (const f of ['rows', 'pageText', 'firstCell', 'hasError']) {
      const av = JSON.stringify(a[k]?.[f]);
      const bv = JSON.stringify(b[k]?.[f]);
      if (av !== bv) diffs.push(`${k}.${f}: before=${av} after=${bv}`);
    }
  }
  // F-02 专项：切回后控件上的筛选值必须与改动前一致
  for (const f of ['level', 'date']) {
    const av = JSON.stringify(a.controlsAfterSwitch?.[f]);
    const bv = JSON.stringify(b.controlsAfterSwitch?.[f]);
    if (av !== bv) diffs.push(`controlsAfterSwitch.${f}: before=${av} after=${bv}`);
  }
  const ra = JSON.stringify(a.requestShape);
  const rb = JSON.stringify(b.requestShape);
  if (ra !== rb) diffs.push(`requestShape: before=${ra} after=${rb}`);
  return diffs;
}

async function main() {
  const stub = await startStub();
  console.log('preparing "before" source tree from git HEAD…');
  const beforeTree = prepareBeforeTree();
  console.log(`  before tree = ${beforeTree}`);

  const viteBefore = startVite(BEFORE_PORT, beforeTree);
  const viteAfter = startVite(AFTER_PORT, CLIENT);

  const okBefore = await waitHttp(`http://localhost:${BEFORE_PORT}/`);
  const okAfter = await waitHttp(`http://localhost:${AFTER_PORT}/`);
  if (!okBefore || !okAfter) throw new Error(`vite not ready: before=${okBefore} after=${okAfter}`);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = {};
  try {
    for (const [name, port] of [['before', BEFORE_PORT], ['after', AFTER_PORT]]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
      const page = await ctx.newPage();
      results[name] = await runScenario(page, `http://localhost:${port}`, name);
      await ctx.close();
    }
  } finally {
    await browser.close();
    viteBefore.kill();
    viteAfter.kill();
    stub.close();
    // 清理仓库内临时树，避免污染工作区（.gitignore 亦已登记）
    try { fs.rmSync(path.join(CLIENT, '.tmp-053-before'), { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log('=== BEFORE ===');
  console.log(JSON.stringify(results.before, null, 2));
  console.log('=== AFTER ===');
  console.log(JSON.stringify(results.after, null, 2));

  const diffs = diffScenarios(results.before, results.after);
  console.log('\n=== AC5 冻结数据严格对照 ===');
  if (!diffs.length) {
    console.log('PASS  改动前后：分页 / 级别筛选 / 日期筛选 / 视图切换 / 请求序列 全部一致');
  } else {
    console.log(`FAIL  ${diffs.length} 处差异`);
    diffs.forEach((d) => console.log('  - ' + d));
  }

  const outPath = process.env.OUT || path.join(os.tmpdir(), '053-freeze-compare.json');
  fs.writeFileSync(outPath, JSON.stringify({ results, diffs }, null, 2));
  console.log(`\nreport: ${outPath}`);
  process.exitCode = diffs.length ? 1 : 0;
}

main().catch((e) => { console.error('CRASH', e); process.exit(2); });
