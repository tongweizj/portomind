/* 原型审查：量 1440x900 首屏折线 + 抓关键交互状态。
   只读，不改原型文件；输出截图到 docs/ui/2.0/_audit/ */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const FILE = 'file:///' + path.resolve(__dirname, 'portomind-prototype.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '_audit');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(FILE);
  await page.waitForTimeout(300);

  const probe = async (hash, label) => {
    await page.goto(FILE + hash);
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const vh = window.innerHeight;
      const rect = sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
      };
      // 健康表：最后一行
      const rows = [...document.querySelectorAll('.card table.tb tbody tr')];
      const lastRow = rows.length ? (() => { const b = rows[rows.length - 1].getBoundingClientRect(); return { bottom: Math.round(b.bottom) }; })() : null;
      const cards = [...document.querySelectorAll('.content > .card')].map(c => {
        const b = c.getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
      });
      return {
        vh,
        scrollH: document.documentElement.scrollHeight,
        contentScrollH: (() => { const c = document.querySelector('.content'); return c ? c.scrollHeight : null; })(),
        cards,
        lastRow,
        tabs: [...document.querySelectorAll('.tab')].map(t => t.textContent.trim()),
        activeTab: (document.querySelector('.tab.on') || {}).textContent || null,
        kpiLabels: [...document.querySelectorAll('.kpi .l')].map(x => x.textContent.trim()),
        segs: [...document.querySelectorAll('.seg-btn')].map(x => x.textContent.trim()),
        chips: [...document.querySelectorAll('.chip')].map(x => x.textContent.trim()).slice(0, 14),
      };
    });
    await page.screenshot({ path: path.join(OUT, label + '.png'), fullPage: false });
    return r;
  };

  const dash = await probe('#/', 'dash');
  const ov = await probe('#/portfolios/view/cn-long/overview', 'overview');
  const reb = await probe('#/portfolios/view/cn-long/rebalance', 'rebalance');
  await probe('#/portfolios', 'list');

  // 交互：点「N 条待确认」，看最终落到哪个 hash
  await page.goto(FILE + '#/');
  await page.waitForTimeout(250);
  const clickTarget = await page.locator('.card table.tb tbody tr a').first();
  await clickTarget.click();
  await page.waitForTimeout(350);
  const afterTodoClick = await page.evaluate(() => location.hash);

  // 交互：切换再平衡子 Tab 后刷新，看是否保持
  await page.goto(FILE + '#/portfolios/view/cn-long/rebalance');
  await page.waitForTimeout(250);
  await page.getByText('再平衡历史', { exact: true }).click();
  await page.waitForTimeout(300);
  const hashAfterHist = await page.evaluate(() => location.hash);
  await page.reload();
  await page.waitForTimeout(300);
  const segAfterReload = await page.evaluate(() =>
    (document.querySelector('.seg-btn.on') || {}).textContent || null);

  // 交互：driftOf 对「到期未超阈」的表现
  const dueOnly = await page.evaluate(() => {
    // 造一个：阈值放宽到 100%（不会超阈），间隔 1 天（必到期）
    const p = PORTFOLIOS.find(x => x.id === 'cn-long');
    const bak = JSON.parse(JSON.stringify(p.cfg));
    p.cfg.abs = 100; p.cfg.rel = 999; p.cfg.interval = 1; p.cfg.timeOn = true;
    const d = driftOf(p);
    p.cfg = bak;
    return { kind: d.kind, label: d.label, due: d.due, overN: d.overN };
  });

  // 交互：大类目标保存后是否必为 0 偏离
  const classMode = await page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-long');
    const total = pValue(p);
    const t = {};
    p.holdings.forEach(h => { const a = A(h.sym); t[h.sym] = total > 0 ? +((a.price * h.qty / total * 100)).toFixed(4) : 0; });
    const bak = p.targets; p.targets = t;
    const rows = devRows(p).map(r => ({ sym: r.sym, abs: +r.abs.toFixed(4), flag: r.flag }));
    p.targets = bak;
    return rows;
  });

  console.log(JSON.stringify({ dash, ov, reb, afterTodoClick, hashAfterHist, segAfterReload, dueOnly, classMode, errs }, null, 2));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
