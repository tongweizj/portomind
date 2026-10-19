// client/scripts/e2e-task-044.mjs
// TASK-044 真实浏览器走查（ExecPlan §7「手动走查」的自动化版本）。
//
// 前置条件（按需手工准备，不写入 package.json 依赖）：
//   1) API 服务在跑：`npm start --workspace server`（MONGO_URI 指向测试库，勿指向生产库）
//   2) 前端 dev server 在跑：`npm run dev:client`
//   3) playwright-core：`npm i playwright-core`（仅需 core，复用本机 Chrome，不下载浏览器）
//
// 运行：
//   E2E_BASE=http://localhost:5173 \
//   E2E_PORTFOLIO_ID=<组合 _id> \
//   node client/scripts/e2e-task-044.mjs
//
// 说明：脚本会**写入并删除**一笔测试交易，请在测试库上执行。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PID = process.env.E2E_PORTFOLIO_ID || '681524cc3fe4113c492df5b1';
const SYMBOL = process.env.E2E_SYMBOL || 'VAB.TO';
const SHOT_DIR = path.join(os.tmpdir(), 'portomind-e2e-044');

const ACTION_LABELS = ['买入', '卖出', '现金分红', '分红再投'];
const ASSET_LABELS = ['股票', 'ETF', '基金', '债券', '现金'];

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

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  page.on('dialog', dialog => dialog.accept());
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  // ───────── S1 侧边栏：顶层 6 项 + 二级导航 + 展开态不持久化（AC1 / AC11）─────────
  await page.goto(`${BASE}/portfolios`, { waitUntil: 'networkidle' });
  const nav = page.locator('aside nav');
  const navCount = await nav.locator('> *').count();
  check('AC1 顶层导航项 = 6', navCount === 6, `实际 ${navCount}`);

  const navTexts = await nav.locator('> *').allInnerTexts();
  check('AC1 顶层无「交易记录」', !navTexts.some(t => t.includes('交易记录')), navTexts.join(' | '));
  check('AC1 顶层含「组合管理」', navTexts.some(t => t.includes('组合管理')));

  const childLink = page.getByRole('link', { name: '全部交易', exact: true });
  check('AC11 默认收起（「全部交易」不可见）', (await childLink.count()) === 0);

  await page.locator('button[aria-label="展开组合管理"]').click();
  await childLink.first().waitFor({ state: 'visible', timeout: 3000 });
  const childTexts = await nav.locator('> div').last().innerText();
  check('AC1 展开后含「组合列表」「全部交易」', childTexts.includes('组合列表') && childTexts.includes('全部交易'), childTexts.replace(/\n/g, '/'));
  await shot(page, '01-sidebar-expanded');

  await page.reload({ waitUntil: 'networkidle' });
  check('AC11 刷新后回到默认收起态', (await page.getByRole('link', { name: '全部交易', exact: true }).count()) === 0);
  const lsKeys = await page.evaluate(() => Object.keys(localStorage));
  check('AC11 未写 localStorage', lsKeys.length === 0, lsKeys.join(','));

  // ───────── S2 组合内交易 Tab：单表 + 中文口径 + 增/改/删（AC2 / AC6 / AC8 / AC9 / AC10）─────────
  await page.goto(`${BASE}/portfolios/view/${PID}/transactions`, { waitUntil: 'networkidle' });
  await page.locator('table.transaction-table').first().waitFor({ timeout: 8000 });

  const headers = await page.locator('table.transaction-table thead th').allInnerTexts();
  check('AC6 组合内无「组合」列', !headers.includes('组合'), headers.join(' | '));
  check('Bug-3 表头全中文', headers.every(h => !/^[A-Z_]+$/.test(h)), headers.join(' | '));

  const actionCells = await page.locator('table.transaction-table tbody tr td:nth-child(3)').allInnerTexts();
  check('AC8 类型列均为中文四值', actionCells.every(t => ACTION_LABELS.includes(t.trim())), [...new Set(actionCells)].join(','));
  const assetTypeCells = await page.locator('table.transaction-table tbody tr td:nth-child(4)').allInnerTexts();
  check('Bug-3 证券类型为中文', assetTypeCells.every(t => ASSET_LABELS.includes(t.trim())), [...new Set(assetTypeCells)].join(','));
  const priceCells = await page.locator('table.transaction-table tbody tr td:nth-child(6)').allInnerTexts();
  const badPrice = priceCells.filter(t => !/^(C\$|HK\$|\$|¥)[\d,]+(\.\d+)?$/.test(t.trim()));
  check('Bug-2 价格带币种符号', badPrice.length === 0, badPrice.slice(0, 3).join(',') || priceCells.slice(0, 3).join(','));
  check('AC2 Tab 内存在「新建交易」「导入 CSV」', (await page.getByRole('button', { name: '新建交易' }).count()) === 1 && (await page.getByRole('button', { name: '导入 CSV' }).count()) === 1);
  await shot(page, '02-portfolio-transactions');

  // 新增
  const beforeRows = await page.locator('table.transaction-table tbody tr').count();
  await page.getByRole('button', { name: '新建交易' }).click();
  await page.waitForURL(new RegExp(`/portfolios/${PID}/transactions/new$`));
  check('AC4 新路由 = /portfolios/:id/transactions/new', page.url().endsWith(`/portfolios/${PID}/transactions/new`), page.url());
  check('AC2 无「所属组合」下拉', (await page.locator('select[name="portfolioId"]').count()) === 0);
  const lockedName = await page.locator('form').first().innerText();
  check('AC2 组合锁定为当前组合', lockedName.includes('CA-家庭RESP组合'), lockedName.split('\n').slice(0, 3).join('/'));

  await page.selectOption('select[name="symbol"]', SYMBOL);
  await page.fill('input[name="quantity"]', '7');
  await page.fill('input[name="price"]', '22.5');
  await shot(page, '03-add-transaction');
  await page.getByRole('button', { name: '提交交易' }).click();
  await page.waitForURL(new RegExp(`/portfolios/view/${PID}/transactions$`));
  await page.locator('table.transaction-table').first().waitFor();
  const afterRows = await page.locator('table.transaction-table tbody tr').count();
  check('AC2 新增后回到组合 Tab 且列表刷新', page.url().endsWith(`/portfolios/view/${PID}/transactions`) && afterRows >= beforeRows, `${beforeRows}→${afterRows}`);
  check('AC2 新增全程未跳离 /portfolios', !page.url().includes('/transactions/') || page.url().includes('/portfolios/'));

  const firstRow = page.locator('table.transaction-table tbody tr').first();
  check('AC2 新增记录出现在首行', (await firstRow.innerText()).includes(SYMBOL) && (await firstRow.innerText()).includes('7'));

  // 编辑
  await firstRow.getByRole('button', { name: '编辑' }).click();
  await page.waitForURL(new RegExp(`/portfolios/${PID}/transactions/edit/[a-f0-9]+$`));
  check('AC4 编辑路由带组合 id + txId', /\/portfolios\/[a-f0-9]+\/transactions\/edit\/[a-f0-9]+$/.test(page.url()), page.url());
  check('AC2 编辑页无「所属组合」下拉', (await page.locator('select[name="portfolioId"]').count()) === 0);
  await page.fill('input[name="quantity"]', '9');
  await page.getByRole('button', { name: '更新交易' }).click();
  await page.waitForURL(new RegExp(`/portfolios/view/${PID}/transactions$`));
  await page.locator('table.transaction-table').first().waitFor();
  const editedRow = await page.locator('table.transaction-table tbody tr').first().innerText();
  check('AC2 编辑落库（份额 7→9）', editedRow.includes('9') && !editedRow.includes('\t7\t'), editedRow.replace(/\n/g, ' '));

  // 删除
  const beforeDelete = await page.locator('table.transaction-table tbody tr').count();
  await page.locator('table.transaction-table tbody tr').first().getByRole('button', { name: '删除' }).click();
  await page.waitForTimeout(1200);
  const afterDelete = await page.locator('table.transaction-table tbody tr').count();
  check('AC2 删除后列表即时刷新', afterDelete === beforeDelete - 1, `${beforeDelete}→${afterDelete}`);

  // ───────── S3 全部交易聚合页：组合列 + 筛选 + 分页 + 行内跳转（AC3 / AC7）─────────
  await page.goto(`${BASE}/portfolios/transactions`, { waitUntil: 'networkidle' });
  await page.locator('table.transaction-table').first().waitFor();
  check('AC3 页面标题 = 全部交易', (await page.locator('h1').first().innerText()).trim() === '全部交易');
  const aggHeaders = await page.locator('table.transaction-table thead th').allInnerTexts();
  check('AC3 聚合页含「组合」列', aggHeaders.includes('组合'), aggHeaders.join(' | '));
  check('AC7 聚合页无导入/新建入口', (await page.getByRole('button', { name: '导入 CSV' }).count()) === 0 && (await page.getByRole('button', { name: '新建交易' }).count()) === 0);
  const aggRows = await page.locator('table.transaction-table tbody tr').count();
  const pagerText = await page.locator('text=/第 \\d+ \\/ \\d+ 页/').first().innerText().catch(() => '');
  check('AC3 分页可用（每页 20）', aggRows === 20 && /第 1 \/ \d+ 页/.test(pagerText), `rows=${aggRows}, ${pagerText}`);
  await shot(page, '04-aggregation');

  // 按组合筛选（选一个有流水的组合；空组合另测空态提示）
  await page.selectOption('#filter-portfolio', { label: 'CA-RRSP组合' });
  await page.getByRole('button', { name: '查询' }).click();
  await page.waitForTimeout(1200);
  const pfCells = await page.locator('table.transaction-table tbody tr td:nth-child(7)').allInnerTexts();
  check('AC3 按组合筛选生效', pfCells.length > 0 && pfCells.every(t => t.trim() === 'CA-RRSP组合'), `${pfCells.length} 行`);

  // 筛选无结果时的空态
  await page.selectOption('#filter-portfolio', { label: 'A股-稳钱组合' });
  await page.getByRole('button', { name: '查询' }).click();
  await page.waitForTimeout(1200);
  check('AC3 无结果时给空态提示', (await page.locator('text=当前筛选条件下没有交易记录').count()) === 1);

  // 重置后按标的筛选
  await page.getByRole('button', { name: '重置' }).click();
  await page.waitForTimeout(800);
  await page.fill('#filter-symbol', SYMBOL);
  await page.getByRole('button', { name: '查询' }).click();
  await page.waitForTimeout(1200);
  const symCells = await page.locator('table.transaction-table tbody tr td:nth-child(2)').allInnerTexts();
  check('AC3 按标的筛选生效', symCells.length > 0 && symCells.every(t => t.trim() === SYMBOL), `${symCells.length} 行`);

  // Bug-1：分红记录不再显示为「卖出」
  const divRow = page.locator('table.transaction-table tbody tr').filter({ hasText: '现金分红' }).first();
  check('Bug-1 现金分红显示为「现金分红」', (await divRow.count()) > 0);

  // 行内跳回所属组合
  await page.locator('table.transaction-table tbody tr').first().getByRole('link').first().click();
  await page.waitForURL(/\/portfolios\/view\/[a-f0-9]+\/transactions$/);
  check('AC3 组合名可跳回所属组合交易 Tab', /\/portfolios\/view\/[a-f0-9]+\/transactions$/.test(page.url()), page.url());

  // ───────── S4 CSV 导入仅在组合内 + 无组合下拉（AC7）─────────
  await page.goto(`${BASE}/portfolios/${PID}/transactions/import`, { waitUntil: 'networkidle' });
  const importText = await page.locator('main, body').first().innerText();
  check('AC7 导入页无组合下拉', (await page.locator('select').count()) === 0, `select 数量 ${await page.locator('select').count()}`);
  check('AC7 目标组合已锁定展示', importText.includes('CA-家庭RESP组合'));

  const csv = [
    '代码,方向,份额,价格,费用,日期',
    `${SYMBOL},买入,1,20.00,0,2025-09-01`,
    `${SYMBOL},现金分红,1,20.00,0,2025-09-02`,
  ].join('\n');
  await page.locator('input[type="file"]').setInputFiles({ name: 'e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
  await page.locator('text=预览（前 2 行）').waitFor({ timeout: 5000 });
  const previewText = await page.locator('table').last().innerText();
  check('R8 导入预览方向为中文', previewText.includes('买入') && previewText.includes('现金分红'), previewText.split('\n').slice(0, 3).join('/'));
  await shot(page, '05-import-preview');
  await page.getByRole('button', { name: /确认导入/ }).click();
  await page.locator('text=导入结果').waitFor({ timeout: 15000 });
  const resultText = await page.locator('text=导入结果').locator('..').innerText();
  check('AC7 导入成功（2 条）', /成功导入：\s*2/.test(resultText.replace(/\s+/g, ' ')), resultText.replace(/\n/g, ' ').slice(0, 120));
  await shot(page, '06-import-result');

  // ───────── S5 旧 /transactions 路由已删除，落 * 通配（AC5）─────────
  await page.goto(`${BASE}/transactions`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/portfolios$/, { timeout: 5000 }).catch(() => {});
  check('AC5 旧 /transactions 落至 /portfolios', /\/portfolios$/.test(page.url()), page.url());

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
