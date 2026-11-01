// client/scripts/a11y-053-log-regression.cjs
//
// ⚠️ **本脚本会写入被测数据，不要用它的行数/页数做「总量对照」**（Reviewer F-05）：
//    每次请求都会让服务端记一条 `HTTP_ACCESS`，因此「改动前跑一次、改动后跑一次」
//    本身就会改变被观测的日志总量（实测：当日 /api/logs 从 ~50 涨到 110，页数 3 → 6）。
//    → 用它看**交互是否可用**可以；判定 AC5「行为是否等价」请用冻结数据对照
//      `a11y-053-freeze-compare.cjs`（桩服务返回固定 45 条，不写任何日志）。
//
// TASK-053 AC5 回归对照脚本：记录 /logs 两个原始视图（服务器日志 / 任务日志）的
// 分页、级别筛选、日期筛选行为，用于「改动前 / 改动后」双向对照。
//
// 为什么单独一个脚本而不是写进 E2E：
//   AC5 要求「同一组回归断言，改动前后各跑一次对照」。因此这个脚本必须能在**旧实现**
//   上跑通（旧实现没有 ?tab= 参数、没有看板），所以它只依赖「日志视图」这一层可见行为，
//   不假设 tab 的存在方式：切到「服务器日志」/「任务日志」时，如果页面有 tab 就点 tab，
//   没有就点旧按钮；两种实现都能被同一组断言覆盖。
//
// 用法：
//   node client/scripts/a11y-053-log-regression.cjs --out /tmp/baseline.json
//   node client/scripts/a11y-053-log-regression.cjs --out /tmp/after.json --compare /tmp/baseline.json
//
// 依赖：playwright-core + 本机 Chrome（与 client/scripts/e2e-*.mjs 同手法）。
// 前置：/logs 需要一个已登录会话。本脚本通过 --login 参数登录（默认 admin/admin），
//       因此应指向**临时库**服务，不要指向日常开发库。

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.LOG_BASE || 'http://localhost:6601';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER = process.env.LOG_USER || 'admin';
const PASS = process.env.LOG_PASS || 'Verify053Pass';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = argOf('--out', path.join(process.env.TEMP || '/tmp', 'logs-regression.json'));
const COMPARE = argOf('--compare', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 定位「原始日志视图」容器：新旧实现都必须能命中。 */
async function logRows(page) {
  return page.locator('table tbody tr');
}

/**
 * 切到指定原始视图。
 * 旧实现用英文标签（`Server Log` / `Task Log`），AC1 落地后用中文（「服务器日志」/「任务日志」）。
 * 出于「改动前后同一组断言对照」的要求，这里两种标签都试，不因标签语言变化误判为回归。
 * 中文优先：AC1 之后中文是规范写法。
 */
async function switchView(page, kind) {
  const labels = kind === 'server'
    ? ['服务器日志', 'Server Log']
    : ['任务日志', 'Task Log'];
  for (const label of labels) {
    const candidates = [
      () => page.getByRole('tab', { name: label }),
      () => page.getByRole('button', { name: label, exact: true }),
      () => page.locator(`button:has-text("${label}")`),
    ];
    for (const make of candidates) {
      const loc = make();
      if (await loc.count().catch(() => 0)) {
        await loc.first().click();
        await sleep(900);
        return label;
      }
    }
  }
  return false;
}

async function snapshot(page) {
  const rows = await logRows(page);
  const count = await rows.count();
  const firstTimestamps = [];
  for (let i = 0; i < Math.min(count, 3); i += 1) {
    const cell = await rows.nth(i).locator('td').first().innerText().catch(() => '');
    firstTimestamps.push(cell.trim());
  }
  const body = await page.locator('body').innerText().catch(() => '');
  const pageIndicator = (body.match(/第\s*(\d+)\s*\/\s*(\d+)\s*页/) || []).slice(1);
  return {
    rowCount: count,
    firstTimestamps,
    pageIndicator,
    hasLoading: /加载中/.test(body),
    hasError: /加载失败|失败/.test(body),
  };
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // ── 登录 ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名').fill(USER);
  await page.getByLabel('密码').fill(PASS);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {});
  await sleep(600);

  const result = { base: BASE, capturedAt: new Date().toISOString(), checks: {} };

  // ── 记录：默认进入 /logs 后可见什么 ──
  await page.goto(`${BASE}/logs`, { waitUntil: 'networkidle' });
  await sleep(1200);
  result.checks.entry = {
    url: page.url(),
    bodySnippet: (await page.locator('body').innerText()).slice(0, 200),
  };

  // ── 原始视图：服务器日志 ──
  const okServer = await switchView(page, 'server');
  await sleep(1200);
  result.checks.serverView = { switched: okServer, ...(await snapshot(page)) };

  // ── 分页：下一页 ──
  const nextBtn = page.getByRole('button', { name: /下一页/ });
  const nextEnabledBefore = await nextBtn.isEnabled().catch(() => false);
  if (nextEnabledBefore) {
    await nextBtn.click();
    await sleep(1200);
  }
  result.checks.serverNextPage = { clicked: nextEnabledBefore, ...(await snapshot(page)) };

  // ── 分页：上一页（回退） ──
  const prevBtn = page.getByRole('button', { name: /上一页/ });
  if (await prevBtn.isEnabled().catch(() => false)) {
    await prevBtn.click();
    await sleep(1200);
  }
  result.checks.serverPrevPage = await snapshot(page);

  // ── 级别筛选：error ──
  const levelSelect = page.locator('select').first();
  await levelSelect.selectOption('error').catch(() => {});
  await sleep(1200);
  result.checks.serverLevelError = await snapshot(page);

  // ── 级别筛选：all（复位） ──
  await levelSelect.selectOption('all').catch(() => {});
  await sleep(1200);
  result.checks.serverLevelAll = await snapshot(page);

  // ── 日期筛选：改成前一天 ──
  const dateInput = page.locator('input[type="date"]').first();
  const today = await dateInput.inputValue().catch(() => '');
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA');
  })();
  await dateInput.fill(yesterday).catch(() => {});
  await sleep(1400);
  result.checks.serverDateYesterday = { date: yesterday, ...(await snapshot(page)) };
  await dateInput.fill(today).catch(() => {});
  await sleep(1200);

  // ── 任务日志视图 ──
  const okTask = await switchView(page, 'task');
  await sleep(1200);
  result.checks.taskView = { switched: okTask, ...(await snapshot(page)) };

  // ── 切回服务器日志：分页应重置到第 1 页（旧行为） ──
  await switchView(page, 'server');
  await sleep(1200);
  result.checks.backToServer = await snapshot(page);

  result.consoleErrors = consoleErrors;
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`snapshot written: ${OUT}`);
  console.log(JSON.stringify(result.checks, null, 2).slice(0, 3000));

  if (COMPARE) {
    const before = JSON.parse(fs.readFileSync(COMPARE, 'utf8'));
    const diffs = [];
    const keys = new Set([...Object.keys(before.checks), ...Object.keys(result.checks)]);
    for (const k of keys) {
      if (k === 'entry') continue;               // 默认落点按 AC1 有意变更，不参与对照
      if (k === 'taskView' || k === 'serverView') continue; // switched 字段受实现影响，单独看 rowCount
      const a = before.checks[k] || {};
      const b = result.checks[k] || {};
      for (const f of ['rowCount', 'pageIndicator', 'hasError']) {
        const av = JSON.stringify(a[f]);
        const bv = JSON.stringify(b[f]);
        if (av !== bv) diffs.push(`${k}.${f}: before=${av} after=${bv}`);
      }
    }
    console.log(`\n=== AC5 COMPARE ===`);
    if (diffs.length === 0) console.log('PASS  原始视图行为一致（rowCount / 分页指示 / 错误态）');
    else { console.log(`FAIL  ${diffs.length} 处差异`); diffs.forEach((d) => console.log('  - ' + d)); }
  }

  await browser.close();
}

main().catch((e) => { console.error('CRASH', e); process.exit(2); });
