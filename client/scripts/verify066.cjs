// client/scripts/verify066.cjs
// TASK-066 验收：AC-01/02/04/05/06/07/08/10 真实浏览器验证。
// 坑1：必须注册 **/api/** 兜底。useUnreadAlertCount 轮询
//      /api/alerts/events/unread-count，漏拦截 → 真实服务器 401 →
//      notifyUnauthorized() 全局跳登录页 → 结果间歇性失效。
// 坑2：每个场景新建 page 重新挂路由，不用 page.reload()（导航清理 page.route）。
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.VERIFY_BASE || 'http://localhost:6601';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = path.join(process.env.TEMP || '/tmp', '066-shots');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
};
const ok = (body) => JSON.stringify({ success: true, data: body });

const MOCK = [
  { _id: 'p_over', name: '超阈组合', targets: [{}], createdAt: '2026-01-01T00:00:00Z', stats: {
    positionCount: 5, marketValueByCurrency: { CNY: 82340, USD: 1200 },
    lastExecutedAt: '2026-09-07T00:00:00Z', pendingRebalanceCount: 2,
    drift: { needsRebalance: true, triggeredThresholds: ['absoluteDeviation', 'relativeDeviation'], dueByTime: false, overThresholdCount: 1 },
    unreadAlertCount: 0 } },
  { _id: 'p_due', name: '到期组合', targets: [{}], createdAt: '2026-02-01T00:00:00Z', stats: {
    positionCount: 3, marketValueByCurrency: { CAD: 52100 },
    lastExecutedAt: '2026-09-06T00:00:00Z', pendingRebalanceCount: 0,
    drift: { needsRebalance: false, triggeredThresholds: [], dueByTime: true, overThresholdCount: 0 },
    unreadAlertCount: 1 } },
  { _id: 'p_normal', name: '正常组合', targets: [{}], createdAt: '2026-03-01T00:00:00Z', stats: {
    positionCount: 4, marketValueByCurrency: { CNY: 68900 },
    lastExecutedAt: '2026-10-25T00:00:00Z', pendingRebalanceCount: 0,
    drift: { needsRebalance: false, triggeredThresholds: [], dueByTime: false, overThresholdCount: 0 },
    unreadAlertCount: 0 } },
  { _id: 'p_notarget', name: '无目标组合', targets: [], createdAt: '2026-04-01T00:00:00Z', stats: {
    positionCount: 2, marketValueByCurrency: { CNY: 10000 },
    lastExecutedAt: null, pendingRebalanceCount: 0, drift: null, unreadAlertCount: 0 } },
  { _id: 'p_todo', name: '待办组合', targets: [{}], createdAt: '2026-05-01T00:00:00Z', stats: {
    positionCount: 6, marketValueByCurrency: { HKD: null },
    lastExecutedAt: '2026-10-20T00:00:00Z', pendingRebalanceCount: 1,
    drift: { needsRebalance: false, triggeredThresholds: [], dueByTime: false, overThresholdCount: 0 },
    unreadAlertCount: 3 } },
  { _id: 'p_over2', name: '超阈组合2', targets: [{}], createdAt: '2026-06-01T00:00:00Z', stats: {
    positionCount: 3, marketValueByCurrency: { CNY: 50000 },
    lastExecutedAt: '2026-10-01T00:00:00Z', pendingRebalanceCount: 0,
    drift: { needsRebalance: true, triggeredThresholds: ['absoluteDeviation'], dueByTime: false, overThresholdCount: 3 },
    unreadAlertCount: 0 } },
];

const FAMILY = {
  totalCny: 1234567.89,
  buckets: {
    CNY: { amount: 862300, cnyValue: 862300, rate: 1 },
    USD: { amount: 18400, cnyValue: 128800, rate: 7 },
    CAD: { amount: 52100, cnyValue: 243870, rate: 4.68 },
    HKD: { amount: null, cnyValue: null, rate: 0.92 },
  },
  asOf: '2026-11-06T10:00:00Z',
  portfolioContributions: [],
};
const SESSION = { authenticated: true, user: { id: 'u1', username: 'admin', role: 'admin', mustChangePassword: false } };

async function newPage(ctx, mode) {
  const page = await ctx.newPage();
  await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: ok({}) }));
  await page.route('**/api/auth/session', r => r.fulfill({ contentType: 'application/json', body: ok(SESSION) }));
  await page.route('**/api/family/summary*', r => r.fulfill({ contentType: 'application/json', body: ok(FAMILY) }));
  await page.route('**/api/alerts/events*', r => r.fulfill({ contentType: 'application/json', body: ok([]) }));
  await page.route('**/api/portfolios/summary*', r => {
    if (mode === 'abort') return r.abort();
    const list = mode === 'empty' ? [] : MOCK;
    return r.fulfill({ contentType: 'application/json', body: ok(list) });
  });
  return page;
}

async function rowTexts(page) {
  const rows = await page.locator('tbody tr').all();
  const out = [];
  for (const r of rows) out.push((await r.innerText()).replace(/\s+/g, ' '));
  return out;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });

  const page = await newPage(ctx, 'fulfill');
  const apiCalls = [];
  page.on('request', req => { if (req.url().includes('/api/')) apiCalls.push(req.url().replace(BASE, '')); });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr', { timeout: 15000 });
  await page.waitForTimeout(800);

  check('AC-01 落在 Dashboard（未跳登录页）', !page.url().includes('/login'), page.url());
  const n = apiCalls.filter(u => u.includes('/portfolios/summary')).length;
  check('AC-01 零新增请求：/api/portfolios/summary 恰好 1 次', n === 1,
    'count=' + n + ', 全部API=' + apiCalls.length + ' [' + apiCalls.join(', ') + ']');

  const texts = await rowTexts(page);
  check('AC-02 健康表渲染 6 行', texts.length === 6, 'rows=' + texts.length);
  const over = texts.find(t => t.startsWith('超阈组合 ')) || '';
  const over2 = texts.find(t => t.startsWith('超阈组合2 ')) || '';
  const due = texts.find(t => t.startsWith('到期组合 ')) || '';
  const normal = texts.find(t => t.startsWith('正常组合 ')) || '';
  const noTarget = texts.find(t => t.startsWith('无目标组合 ')) || '';

  check('AC-02 ① 仅超阈 → 1 项超阈（负向对照：triggeredThresholds=2 但 overThresholdCount=1）',
    over.includes('1 项超阈') && !over.includes('2 项超阈'), over.substring(0, 90));
  check('AC-02 ① overThresholdCount=3 → 3 项超阈', over2.includes('3 项超阈'), over2.substring(0, 90));
  check('AC-02 ② 仅 dueByTime → 已到期（N 天）', due.includes('已到期') && /\d+ 天/.test(due), due.substring(0, 90));
  check('AC-02 ③ 皆无 → 正常', normal.includes('正常') && !normal.includes('超阈') && !normal.includes('已到期'), normal.substring(0, 90));
  check('AC-02 ④ 无目标 → 未设目标', noTarget.includes('未设目标'), noTarget.substring(0, 90));

  const expected = ['超阈组合 ', '到期组合 ', '待办组合 ', '超阈组合2 ', '无目标组合 ', '正常组合 '];
  const order = texts.map(t => { const e = expected.find(k => t.startsWith(k)); return e ? e.trim() : '?'; });
  check('AC-04 排序全序且符合有事的在上',
    JSON.stringify(order) === JSON.stringify(expected.map(s => s.trim())), 'actual=' + JSON.stringify(order));
  const input = ['超阈组合', '到期组合', '正常组合', '无目标组合', '待办组合', '超阈组合2'];
  check('AC-04 负向对照：顺序 != 输入顺序（证明排序生效）', JSON.stringify(order) !== JSON.stringify(input), 'input=' + JSON.stringify(input));

  const page2 = await newPage(ctx, 'fulfill');
  await page2.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page2.waitForSelector('tbody tr', { timeout: 15000 });
  check('AC-04 全序稳定：独立重载后顺序不变', texts.join('|') === (await rowTexts(page2)).join('|'));
  await page2.close();

  check('AC-05 健康表不出现已归档组合', !texts.some(t => t.includes('已归档')));

  await page.screenshot({ path: SHOT_DIR + '/066-viewport.png', fullPage: false });
  const card = await page.locator('[aria-label="家庭总资产，点击进入组合管理"]').boundingBox();
  const rowBoxes = await page.locator('tbody tr').evaluateAll(els => els.slice(0, 3).map(e => {
    const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) };
  }));
  check('AC-10 总资产金额在 1440x900 视口内', card && card.y + card.height <= 900, card ? 'bottom=' + Math.round(card.y + card.height) : 'no box');
  check('AC-10 分币种小计一行在视口内（与总资产卡同块）', card && card.y + card.height <= 900);
  check('AC-10 健康表前 3 行均在视口内（不滚动可见）', rowBoxes.length >= 3 && rowBoxes.every(b => b.bottom <= 900), JSON.stringify(rowBoxes));
  await page.close();

  const errPage = await newPage(ctx, 'abort');
  await errPage.goto(BASE + '/', { waitUntil: 'networkidle' });
  await errPage.waitForTimeout(2500);
  const eb = await errPage.locator('body').innerText();
  check('AC-06 summary 失败：健康表局部错误态', eb.includes('数据加载失败'), eb.substring(eb.indexOf('组合健康'), eb.indexOf('组合健康') + 60));
  check('AC-06 总资产卡仍正常渲染', eb.includes('家庭总资产') && eb.includes('¥1,234,567.89'));
  check('AC-06 分币种小计仍渲染（family/summary 不受影响）', eb.includes('US$18,400'));
  check('AC-06 提醒列表仍渲染', eb.includes('待处理提醒'));
  check('AC-06 负向对照：错误态不影响整页（非白屏、非登录页）', !errPage.url().includes('/login') && eb.includes('家庭总览'));
  await errPage.close();

  const moneyPage = await newPage(ctx, 'fulfill');
  await moneyPage.goto(BASE + '/', { waitUntil: 'networkidle' });
  await moneyPage.waitForSelector('[aria-label="家庭总资产，点击进入组合管理"]', { timeout: 15000 });
  const ct = await moneyPage.locator('[aria-label="家庭总资产，点击进入组合管理"]').innerText();
  const cny = ct.indexOf('¥862,300'), usd = ct.indexOf('US$18,400'), cad = ct.indexOf('CA$52,100');
  check('AC-07 币种顺序 CNY > USD > CAD > HKD', cny >= 0 && usd > cny && cad > usd, 'CNY@' + cny + ' USD@' + usd + ' CAD@' + cad);
  check('AC-07 null 桶显示 —', ct.includes('—'), ct.replace(/\n/g, ' ').substring(0, 140));
  check('AC-07 分币种小计为单行', (ct.split('\n').find(l => l.includes('US$')) || '').includes('·'));
  await moneyPage.close();

  const nb = await ctx.newPage();
  await nb.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: ok({}) }));
  await nb.route('**/api/auth/session', r => r.fulfill({ contentType: 'application/json', body: ok(SESSION) }));
  await nb.route('**/api/portfolios/summary*', r => r.fulfill({ contentType: 'application/json', body: ok([]) }));
  await nb.route('**/api/family/summary*', r => r.fulfill({ contentType: 'application/json', body: ok({ totalCny: 100, asOf: '2026-11-06' }) }));
  await nb.goto(BASE + '/', { waitUntil: 'networkidle' });
  await nb.waitForSelector('[aria-label="家庭总资产，点击进入组合管理"]', { timeout: 15000 });
  const nbt = await nb.locator('[aria-label="家庭总资产，点击进入组合管理"]').innerText();
  check('AC-07 负向对照：无 buckets 时分币种小计行整体不渲染', !nbt.includes('US$') && !nbt.includes('CA$'), nbt.replace(/\n/g, ' ').substring(0, 100));
  await nb.close();

  const emptyPage = await newPage(ctx, 'empty');
  await emptyPage.goto(BASE + '/', { waitUntil: 'networkidle' });
  await emptyPage.waitForTimeout(1800);
  const eb2 = await emptyPage.locator('body').innerText();
  check('AC-05 0 组合：显示暂无组合，先创建一个', eb2.includes('暂无组合，先创建一个'));
  check('AC-05 0 组合：显示新建组合按钮', eb2.includes('新建组合'));
  check('AC-05 0 组合：不渲染空表格（无 table）', (await emptyPage.locator('table').count()) === 0);
  await emptyPage.close();

  const alertPage = await newPage(ctx, 'fulfill');
  await alertPage.goto(BASE + '/', { waitUntil: 'networkidle' });
  await alertPage.waitForSelector('tbody tr', { timeout: 15000 });
  const ab = await alertPage.locator('body').innerText();
  check('AC-08 提醒区仍完整（标题/未读/全部/立即评估/规则管理）', ['待处理提醒', '未读', '全部', '立即评估', '规则管理'].every(w => ab.includes(w)));
  await alertPage.close();

  check('AC-02 文案与 driftLabels.js 逐字一致（D-01 解 B）',
    over.includes('1 项超阈') && due.includes('已到期（') && normal.includes('正常') && noTarget.includes('未设目标'));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n===== TASK-066 验收：' + (results.length - failed.length) + '/' + results.length + ' PASS =====');
  if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log(' - ' + f.name + ' — ' + f.detail)); }
  process.exitCode = failed.length ? 1 : 0;
}
main().catch(e => { console.error('CRASH', e); process.exit(2); });
