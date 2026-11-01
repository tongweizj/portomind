// client/scripts/e2e-task-053-verify.cjs
//
// TASK-053 验收脚本：AC1–AC7 的真实浏览器断言（AC8 走 build/lint，不在本脚本）。
//
// 期望值全部取自 TASK-053 §3 的 AC 文字与计划 §7 的映射，**不从实现反推**。
//
// 用法：
//   node client/scripts/e2e-task-053-verify.cjs
//   LOG_BASE=http://localhost:6601 LOG_PASS=Verify053Pass node client/scripts/e2e-task-053-verify.cjs
//
// 前置：一个已登录可用的 /logs 环境（本仓库用临时库服务 + vite dev）。

const { chromium } = require('playwright-core');

const BASE = process.env.LOG_BASE || 'http://localhost:6601';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER = process.env.LOG_USER || 'admin';
const PASS = process.env.LOG_PASS || 'Verify053Pass';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // ── 登录 ──
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名').fill(USER);
  await page.getByLabel('密码').fill(PASS);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {});
  await sleep(500);

  // ══ AC1：默认落看板 + 顺序 ══
  await page.goto(`${BASE}/logs`, { waitUntil: 'networkidle' });
  await sleep(900);
  const tabLabels = await page.getByRole('tab').allInnerTexts();
  check('AC1 恰好 3 个 tab', tabLabels.length === 3, JSON.stringify(tabLabels));
  check('AC1 顺序 = 看板/服务器/任务',
    tabLabels[0] === '任务运行看板' && tabLabels[1] === '服务器日志' && tabLabels[2] === '任务日志',
    JSON.stringify(tabLabels));
  const selected0 = await page.getByRole('tab', { selected: true }).innerText().catch(() => '');
  check('AC1 无参数时默认选中看板', selected0 === '任务运行看板', selected0);
  check('AC1 看板内容可见', await page.getByTestId('board-shell').isVisible().catch(() => false));

  // ══ AC3：总览条结构（5 灯 + 1 徽章 + 1 快照位，全未知、无绿色） ══
  const dots = await page.getByTestId('health-dot').count();
  check('AC3 恰好 5 个健康灯位', dots === 5, String(dots));
  const badges = await page.getByTestId('overall-badge').count();
  check('AC3 恰好 1 个整体健康徽章', badges === 1, String(badges));
  const snaps = await page.getByTestId('snapshot-at').count();
  check('AC3 恰好 1 行数据快照时间', snaps === 1, String(snaps));
  const dotStates = await page.getByTestId('health-dot').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-state'))
  );
  check('AC3 5 灯全为 unknown（不默认绿色）',
    dotStates.length === 5 && dotStates.every((s) => s === 'unknown'), JSON.stringify(dotStates));
  const dotColors = await page.getByTestId('health-dot').evaluateAll((els) =>
    els.map((e) => getComputedStyle(e.querySelector('span')).backgroundColor)
  );
  const greenish = dotColors.filter((c) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return g > r + 25 && g > b + 25; // 明显偏绿
  });
  check('AC3 灯色无绿色（无成功语义）', greenish.length === 0, JSON.stringify(dotColors));

  // ══ AC4：5 卡六区域，无 undefined/NaN/Invalid Date ══
  const cards = await page.getByTestId('task-card').count();
  check('AC4 恰好 5 张任务卡', cards === 5, String(cards));
  for (const id of ['card-title', 'run-state', 'last-run', 'data-ratio', 'key-metric', 'anomaly-entry']) {
    const n = await page.getByTestId(id).count();
    check(`AC4 每卡六区域之一就位：${id}（应为 5）`, n === 5, String(n));
  }
  const boardText = await page.getByTestId('board-shell').innerText();
  const badTokens = ['undefined', 'NaN', 'Invalid Date', 'null'];
  const foundBad = badTokens.filter((t) => boardText.includes(t));
  check('AC4 无 undefined/NaN/Invalid Date/null', foundBad.length === 0, foundBad.join(','));

  // ══ AC2：URL tab 直接进入 / 刷新 / 前进后退 / 无效值 ══
  await page.goto(`${BASE}/logs?tab=server`, { waitUntil: 'networkidle' });
  await sleep(1100);
  check('AC2 ?tab=server 直入服务器日志',
    (await page.getByRole('tab', { selected: true }).innerText()) === '服务器日志');
  await page.goto(`${BASE}/logs?tab=task`, { waitUntil: 'networkidle' });
  await sleep(1100);
  check('AC2 ?tab=task 直入任务日志',
    (await page.getByRole('tab', { selected: true }).innerText()) === '任务日志');
  await page.goto(`${BASE}/logs?tab=nonsense`, { waitUntil: 'networkidle' });
  await sleep(900);
  check('AC2 无效 tab 回落看板',
    (await page.getByRole('tab', { selected: true }).innerText()) === '任务运行看板');

  // 刷新保持
  await page.goto(`${BASE}/logs?tab=task`, { waitUntil: 'networkidle' });
  await sleep(900);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1100);
  check('AC2 刷新后保持 task tab',
    (await page.getByRole('tab', { selected: true }).innerText()) === '任务日志');

  // 点选 → URL 变化 → 前进后退
  await page.goto(`${BASE}/logs`, { waitUntil: 'networkidle' });
  await sleep(900);
  await page.getByRole('tab', { name: '服务器日志' }).click();
  await sleep(1000);
  check('AC2 点选后 URL 带 tab=server', /tab=server/.test(page.url()), page.url());
  await page.getByRole('tab', { name: '任务日志' }).click();
  await sleep(1000);
  check('AC2 再点选 URL 带 tab=task', /tab=task/.test(page.url()), page.url());
  await page.goBack();
  await sleep(1100);
  check('AC2 后退回到 server tab',
    (await page.getByRole('tab', { selected: true }).innerText()) === '服务器日志', page.url());
  await page.goForward();
  await sleep(1100);
  check('AC2 前进回到 task tab',
    (await page.getByRole('tab', { selected: true }).innerText()) === '任务日志', page.url());

  // ══ AC6：只读（DOM 无写入口） ══
  await page.goto(`${BASE}/logs`, { waitUntil: 'networkidle' });
  await sleep(900);
  const bodyAll = await page.locator('body').innerText();
  const forbidden = ['执行再平衡', '撤销', '重做', '手动触发', '编辑阈值', '运行一次'];
  const hit = forbidden.filter((w) => bodyAll.includes(w));
  check('AC6 看板 DOM 无执行/撤销/重做/触发/编辑阈值按钮', hit.length === 0, hit.join(','));

  // 负向对照：塞一个假按钮，确认上面的检测式能失败
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = '执行再平衡';
    document.body.appendChild(b);
  });
  const bodyAfterInject = await page.locator('body').innerText();
  const hitAfter = forbidden.filter((w) => bodyAfterInject.includes(w));
  check('AC6 负向对照：注入假按钮后检测式能命中（证明断言可失败）',
    hitAfter.includes('执行再平衡'), hitAfter.join(','));

  // ══ AC5：原始视图可用（详细分页/筛选对照见 a11y-053-log-regression.cjs） ══
  await page.goto(`${BASE}/logs?tab=server`, { waitUntil: 'networkidle' });
  await sleep(1300);
  const rows = await page.locator('table tbody tr').count();
  check('AC5 服务器日志可加载出数据', rows > 0, `rows=${rows}`);
  await page.goto(`${BASE}/logs?tab=task`, { waitUntil: 'networkidle' });
  await sleep(1300);
  const taskRows = await page.locator('table tbody tr').count();
  check('AC5 任务日志可访问（可为 0 行，不报错）',
    taskRows >= 0 && !(await page.locator('body').innerText()).includes('日志加载失败'), `rows=${taskRows}`);

  // ══ AC7：看板不白屏、不影响原始日志 ══
  await page.goto(`${BASE}/logs`, { waitUntil: 'networkidle' });
  await sleep(900);
  const boardOk = await page.getByTestId('board-shell').isVisible();
  const hasError = (await page.locator('body').innerText()).includes('数据加载失败');
  check('AC7 看板不白屏、无整页错误', boardOk && !hasError, `boardVisible=${boardOk}, globalError=${hasError}`);
  await page.getByRole('tab', { name: '服务器日志' }).click();
  await sleep(1300);
  check('AC7 从看板切到原始日志仍可用',
    (await page.locator('table tbody tr').count()) > 0);

  // ══ 侧栏不新增项（OQ1） ══
  const navCount = await page.locator('aside nav a').count();
  check('OQ1 侧栏项数未变（4 项，未新增日志子项）', navCount === 4, String(navCount));

  check('运行时无页面级 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== TASK-053 验收：${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(' - ' + f.name + ' — ' + f.detail));
  }
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => { console.error('CRASH', e); process.exit(2); });
