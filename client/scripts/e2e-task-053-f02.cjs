// client/scripts/e2e-task-053-f02.cjs
//
// F-02 定向回归：跨视图切换后，级别 / 日期筛选必须**保持**（与改动前一致）。
//
// 为什么单独一个脚本：
//   全量对照脚本 a11y-053-freeze-compare.cjs 依赖两个源码树同时起 vite 且 Chrome 多标签，
//   在本机曾出现「Target crashed」不稳定。F-02 是**单页内行为**，用真实数据单页面即可
//   稳定复现与验证，不必上双树对照。
//
// 判据（直接取自评审给出的现象）：
//   1. 服务器视图设 level=error + date=2026-10-29
//   2. 切到任务日志，再切回服务器日志
//   3. 切回后控件值仍为 error + 2026-10-29，且最后一次请求带 level=error&date=2026-10-29
//      （缺陷形态会退化为 all + 今天，请求变 p1|all|<今天>）
const { chromium } = require('playwright-core');

const BASE = process.env.LOG_BASE || 'http://localhost:6601';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER = process.env.LOG_USER || 'admin';
const PASS = process.env.LOG_PASS || 'Verify053Pass';
const TARGET_DATE = '2026-10-29';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  const apiCalls = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/logs')) {
      const parsed = new URL(u);
      apiCalls.push({
        path: parsed.pathname,
        level: parsed.searchParams.get('level') || 'all',
        date: parsed.searchParams.get('date') || '',
        page: parsed.searchParams.get('page') || '1',
      });
    }
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名').fill(USER);
  await page.getByLabel('密码').fill(PASS);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {});
  await sleep(500);

  // 进服务器日志视图
  await page.goto(`${BASE}/logs?tab=server`, { waitUntil: 'networkidle' });
  await sleep(1300);

  // 设级别 error + 日期 2026-10-29
  await page.locator('select').first().selectOption('error');
  await sleep(1000);
  await page.locator('input[type="date"]').first().fill(TARGET_DATE);
  await sleep(1300);

  const before = {
    level: await page.locator('select').first().inputValue(),
    date: await page.locator('input[type="date"]').first().inputValue(),
  };
  check('F-02 前置：设好 error + 2026-10-29',
    before.level === 'error' && before.date === TARGET_DATE, JSON.stringify(before));

  const lastBefore = apiCalls[apiCalls.length - 1];
  check('F-02 前置：请求已带 level=error 与目标日期',
    lastBefore.level === 'error' && lastBefore.date === TARGET_DATE,
    JSON.stringify(lastBefore));

  // 切到任务日志
  await page.getByRole('tab', { name: '任务日志' }).click();
  await sleep(1300);

  // 切回服务器日志
  await page.getByRole('tab', { name: '服务器日志' }).click();
  await sleep(1600);

  const after = {
    level: await page.locator('select').first().inputValue(),
    date: await page.locator('input[type="date"]').first().inputValue(),
  };
  check('F-02 切回后 级别筛选保持 error', after.level === 'error', `level=${after.level}`);
  check('F-02 切回后 日期筛选保持 2026-10-29', after.date === TARGET_DATE, `date=${after.date}`);

  const lastAfter = apiCalls[apiCalls.length - 1];
  check('F-02 切回后 最后一次请求仍为 error + 目标日期',
    lastAfter.level === 'error' && lastAfter.date === TARGET_DATE,
    JSON.stringify(lastAfter));
  check('F-02 切回后 页码回到第 1 页（与改动前一致）',
    lastAfter.page === '1', `page=${lastAfter.page}`);

  // 负向对照：确认上面的断言「本可失败」——把 level 复位成 all 后，
  // 若断言只看「值等于 error」就应失败；这里直接验证断言链路对变化敏感。
  await page.locator('select').first().selectOption('all');
  await sleep(1200);
  const reset = await page.locator('select').first().inputValue();
  check('F-02 负向对照：手动改成 all 后值确实变化（证明断言非恒真）',
    reset === 'all', `level=${reset}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== F-02 定向：${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) failed.forEach((f) => console.log(' - ' + f.name + ' — ' + f.detail));
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => { console.error('CRASH', e); process.exit(2); });
