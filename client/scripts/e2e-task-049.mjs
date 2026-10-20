// client/scripts/e2e-task-049.mjs
// TASK-049 真实浏览器走查（ExecPlan §7「Verification」的自动化版本）。
//
// 前置条件（按需手工准备，不写入 package.json 依赖）：
//   1) API 在跑：`MONGO_URI=<测试库> npm start --workspace server`（**勿指向生产库**：
//      本脚本会点击「标记已读 / 立即评估」，属写操作）
//   2) 前端 dev server 在跑：`npm run dev:client`
//   3) playwright-core：`npm i playwright-core --no-save`（复用本机 Chrome，不下载浏览器）
//
// 运行：node client/scripts/e2e-task-049.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = path.join(os.tmpdir(), 'portomind-e2e-049');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const shots = [];
async function shot(page, name) {
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  shots.push(file);
}

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

/** 把展示金额解析回数字：去掉非数字字符（含 ¥ / , / 空格）。 */
const parseCny = (text) => Number(String(text).replace(/[^\d.-]/g, ''));

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  // 期望值独立来源：直接读接口，不从实现反推
  const api = await page.request.get(`${BASE}/api/family/summary`).then(r => r.json());
  const totalCny = api.data.totalCny;
  const asOf = api.data.asOf;

  const card = page.locator('[role="button"][aria-label="家庭总资产，点击进入组合管理"]');

  // ───────── S1 首页首屏：总资产卡可见（AC1 / AC5）─────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await card.waitFor({ state: 'visible', timeout: 8000 });

  const navTexts = await page.locator('aside nav').innerText();
  check('AC5 侧边栏标签 = Dashboard', /(^|\n)Dashboard(\n|$)/.test(navTexts) && !navTexts.includes('Dashboard · 提醒'));
  const h1 = squash(await page.locator('h1').first().innerText());
  check('AC5 h1 = 家庭总览', h1 === '家庭总览', h1);

  const box = await card.boundingBox();
  check('AC1 1440×900 内不滚动即可见（卡片底边 ≤ 900）', !!box && box.y >= 0 && box.y + box.height <= 900,
    box ? `y=${Math.round(box.y)} h=${Math.round(box.height)} bottom=${Math.round(box.y + box.height)}` : 'no box');

  const cardText = squash(await card.innerText());
  check('AC1 卡片含标「家庭总资产（RMB 折算）」', cardText.includes('家庭总资产（RMB 折算）'), cardText);

  const amountText = (cardText.match(/¥[\d,]+(?:\.\d+)?/) || [''])[0];
  const shown = parseCny(amountText);
  check('AC1 金额与接口 totalCny 一致（±0.01，独立来源）',
    amountText !== '' && Math.abs(shown - totalCny) < 0.01, `页面 ${amountText} / 接口 ${totalCny}`);

  const asOfShown = (cardText.match(/数据时点：([^·]+)/) || ['', ''])[1].trim();
  const diffMin = asOfShown ? Math.abs(new Date(asOfShown).getTime() - new Date(asOf).getTime()) / 60000 : NaN;
  check('AC1 卡片含「数据时点」且与接口 asOf 同分钟', !!asOfShown && diffMin < 1,
    `页面 ${asOfShown} / 接口 ${asOf}`);

  const h2Texts = await page.locator('h2').allInnerTexts();
  check('AC5 提醒区有「待处理提醒」区块标题', h2Texts.map(squash).includes('待处理提醒'), h2Texts.map(squash).join(' | '));

  const h2Box = await page.locator('h2', { hasText: '待处理提醒' }).first().boundingBox();
  check('AC5 区块标题位于卡片下方', !!h2Box && !!box && h2Box.y > box.y + box.height - 2, h2Box ? `h2.y=${Math.round(h2Box.y)}` : 'no h2');
  await shot(page, '01-dashboard-first-screen');

  // ───────── S2 与 /family 同源同格式（AC2 / AC6）─────────
  await page.goto(`${BASE}/family`, { waitUntil: 'networkidle' });
  const familyCard = page.locator('div.rounded-2xl.bg-gradient-to-r').first();
  await familyCard.waitFor({ state: 'visible', timeout: 8000 });
  // 注意：两页各自请求接口，`asOf` 秒级会不同 —— 故掩掉时间戳后逐字比对格式，
  // 再单独校验时间戳形状与「两次取数间隔」。（避免把时变值写进逐字断言，令测试偶发/恒假）
  const TS_RE = /\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}/;
  const mask = (s) => squash(s).replace(TS_RE, '<TS>');
  const tsOf = (s) => (squash(s).match(TS_RE) || [''])[0];
  const familyText = squash(await familyCard.innerText());
  check('AC2 总资产卡文案与 /family 逐字一致（时间戳掩码后）', mask(familyText) === mask(cardText),
    `[/] ${mask(cardText)}\n      [/family] ${mask(familyText)}`);
  const tsGapMin = Math.abs(new Date(tsOf(familyText)) - new Date(tsOf(cardText))) / 60000;
  check('AC2 两页 asOf 时间戳形状一致且取数间隔 < 2 分钟', !!tsOf(familyText) && tsGapMin < 2,
    `[/] ${tsOf(cardText)} / [/family] ${tsOf(familyText)}，差 ${tsGapMin.toFixed(2)} 分钟`);
  check('AC6 /family 仍可访问（h1 = 家庭视图）', squash(await page.locator('h1').first().innerText()) === '家庭视图');
  await shot(page, '02-family-same-card');

  // ───────── S3 卡片可点击 / 键盘等效（AC3）─────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('AC3 卡片 role="button" + tabIndex=0 + hover 态',
    (await card.getAttribute('role')) === 'button'
    && (await card.getAttribute('tabindex')) === '0'
    && (await card.getAttribute('class') || '').includes('hover:'));

  await card.click();
  await page.waitForURL(/\/portfolios$/, { timeout: 5000 });
  check('AC3 点击卡片跳 /portfolios', page.url().endsWith('/portfolios'), page.url());

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await card.waitFor({ state: 'visible' });
  await card.focus();
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  check('AC3 卡片可键盘聚焦', focused === '家庭总资产，点击进入组合管理', String(focused));
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/portfolios$/, { timeout: 5000 });
  check('AC3 聚焦后 Enter 等效跳转', page.url().endsWith('/portfolios'), page.url());
  await shot(page, '03-card-clicked-portfolios');

  // ───────── S4 提醒区行为零变化（AC4）─────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('h2', { hasText: '待处理提醒' }).first().waitFor();

  const unreadCount = await page.locator('div.space-y-3 > div').count();
  check('AC4 默认「未读」筛选下有条目', unreadCount > 0, `${unreadCount} 条`);

  const selectOptions = await page.locator('select').first().locator('option').allInnerTexts();
  check('AC4 组合筛选含「全部组合」+ ≥1 组合', selectOptions[0] === '全部组合' && selectOptions.length > 1, selectOptions.join(' | '));

  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.waitForTimeout(900);
  const allCount = await page.locator('div.space-y-3 > div').count();
  check('AC4 切「全部」后条目数 ≥ 未读', allCount >= unreadCount, `未读 ${unreadCount} → 全部 ${allCount}`);

  await page.getByRole('button', { name: '未读', exact: true }).click();
  await page.waitForTimeout(900);
  const backToUnread = await page.locator('div.space-y-3 > div').count();
  check('AC4 切回「未读」恢复原条目数', backToUnread === unreadCount, `${backToUnread} vs ${unreadCount}`);

  // 标记已读：未读列表应少 1 条
  const readBtn = page.locator('button[title="标记已读"]').first();
  if (await readBtn.count()) {
    const before = await page.locator('div.space-y-3 > div').count();
    await readBtn.click();
    await page.waitForTimeout(1400);
    const after = await page.locator('div.space-y-3 > div').count();
    check('AC4 标记已读后未读列表 −1', after === before - 1, `${before}→${after}`);
  }

  await page.getByRole('button', { name: '立即评估' }).click();
  await page.waitForTimeout(2500);
  check('AC4「立即评估」点击后页面仍可用', await page.locator('h2', { hasText: '待处理提醒' }).first().isVisible());
  await shot(page, '04-alerts-actions');

  await page.getByRole('button', { name: '规则管理' }).click();
  await page.waitForURL(/\/alerts\/rules/, { timeout: 5000 });
  check('AC4「规则管理」仍跳 /alerts/rules', page.url().includes('/alerts/rules'), page.url());

  // ───────── 汇总 ─────────
  check('无 JS 运行时错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach(f => console.log(` - ${f.name} ${f.detail}`));
  }
  console.log('screenshots:', shots.join('\n  '));
  process.exitCode = failed.length ? 1 : 0;
}

main().catch(error => {
  console.error('E2E_CRASH', error.message);
  process.exitCode = 1;
});
