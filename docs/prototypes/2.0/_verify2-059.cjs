/* TASK-059 验收脚本 2：补测边界与精确渲染文案 */
const { chromium } = require('playwright-core');
const path = require('path');
const HTML = path.resolve(__dirname, 'portomind-prototype.html');
const FILE = 'file:///' + HTML.replace(/\\/g, '/');
const out = [];
const rec = (n, v) => out.push({ n, v });

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const goto = async h => { await page.goto(FILE + h); await page.waitForTimeout(200); };
  const safe = async (n, fn) => { try { rec(n, await fn()); } catch (e) { rec(n, 'ERR ' + e.message.split('\n')[0]); } };

  /* W1 全缺价时，界面上「再平衡状态」KPI 的真实文案 */
  await goto('#/portfolios/view/cn-stable/overview');
  await safe('W1 全缺价 → 界面再平衡状态文案', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-stable');
    const le = p.lastExecutedAt;
    const bak = p.holdings.map(h => { const a = A(h.sym), v = a.price; a.price = null; return { a, v }; });
    p.lastExecutedAt = TODAY; p.cfg = { abs: 5, rel: 10, interval: 60, freq: 'monthly' };
    route();
    const k = [...document.querySelectorAll('.kpi')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
    const res = { kpis: k, missingFoot: /缺最新价/.test(document.querySelector('#view').textContent) };
    bak.forEach(({ a, v }) => a.price = v); p.lastExecutedAt = le; route();
    return res;
  }));

  /* W2 全缺价时健康表该行文案 */
  await goto('#/');
  await safe('W2 全缺价 → 健康表文案', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-stable');
    const le = p.lastExecutedAt;
    const bak = p.holdings.map(h => { const a = A(h.sym), v = a.price; a.price = null; return { a, v }; });
    p.lastExecutedAt = TODAY;
    route();
    const rows = [...document.querySelectorAll('#view table.tb tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
    const mine = rows.find(t => /CN-稳钱/.test(t)) || null;
    bak.forEach(({ a, v }) => a.price = v); p.lastExecutedAt = le; route();
    return { row: mine };
  }));

  /* W3 due 边界：间隔 = ds 精确相等 */
  await safe('W3 ds == interval 边界', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-stable');
    const le = p.lastExecutedAt, cfg = JSON.parse(JSON.stringify(p.cfg));
    const t = new Date(TODAY);
    p.lastExecutedAt = new Date(t.getTime() - 20 * 86400000).toISOString().slice(0, 10);
    const ds = daysSinceRebal(p);
    p.cfg = { abs: 100, rel: 999, interval: ds, freq: 'monthly' };
    const d = driftOf(p);
    route();
    const txt = [...document.querySelectorAll('.kpi')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    const m = txt.match(/距上次再平衡 (\d+) 天 [>≥] 阈值 (\d+) 天/);
    const res = { ds, interval: ds, kind: d.kind, matched: m ? m[0] : null, contradicts: m ? (+m[1] === +m[2]) : null };
    p.lastExecutedAt = le; p.cfg = cfg; route();
    return res;
  }));

  /* W4 分币种小计：定位容器后判断空桶 */
  await goto('#/');
  await safe('W4 分币种小计容器', () => page.evaluate(() => {
    const ca = PORTFOLIOS.filter(p => p.ccy !== 'CNY').map(p => ({ p, i: PORTFOLIOS.indexOf(p) }));
    ca.slice().reverse().forEach(({ i }) => PORTFOLIOS.splice(i, 1));
    route();
    const cand = [...document.querySelectorAll('#view *')].filter(e => /^CNY|^USD|^CAD|^HKD/.test(e.textContent.trim()) && e.children.length <= 2);
    const res = { buckets: cand.map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)) };
    ca.slice().reverse().forEach(({ p, i }) => PORTFOLIOS.splice(i, 0, p)); route();
    return res;
  }));

  /* W5 激活 Tab/子 Tab 判定（用 class 名单） */
  await goto('#/portfolios/view/cn-stable/rebalance?sub=bogus');
  await safe('W5 非法 sub 激活项', () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[class*=active]')].map(e => ({ cls: e.className, t: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 20) }));
    const badge = [...document.querySelectorAll('.badge,.chip,[class*=count]')].map(e => e.textContent.trim());
    const body = document.querySelector('#view').innerHTML;
    return { actives: all.slice(0, 8), histTableRows: (body.match(/<tr/g) || []).length };
  }));

  await goto('#/portfolios/view/cn-stable/basic');
  await safe('W6 basic 激活项', () => page.evaluate(() => ({
    actives: [...document.querySelectorAll('[class*=active]')].map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 20)).slice(0, 6),
    kpi: document.querySelectorAll('.kpi').length,
    firstTableHd: (document.querySelector('#view table') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
  })));

  /* W7 「N 条未读」点击是否写入组合筛选 */
  await goto('#/');
  await safe('W7 未读点击', () => page.evaluate(async () => {
    const u = [...document.querySelectorAll('#view *')].filter(e => e.children.length === 0 && /条未读/.test(e.textContent));
    if (!u.length) return { noUnread: true };
    u[0].click(); await new Promise(r => setTimeout(r, 200));
    const sel = document.querySelector('select');
    return { text: u[0].textContent.trim(), hash: location.hash, evPid: typeof S !== 'undefined' ? S.dashEvPid : null, selectVal: sel ? sel.value : null };
  }));

  /* W8 大类模式徽标与健康表口径（在 Dashboard 上看 overN 是否=类数） */
  await safe('W8 大类模式 Dashboard 徽标', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-long');
    const lvl = p.targetLevel, ct = p.classTargets, tg = p.targets;
    p.targetLevel = 'asset_class'; p.classTargets = { equity: 60, bond: 40, gold: 0, cash: 0 };
    route();
    const rows = [...document.querySelectorAll('#view table.tb tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
    const mine = rows.find(t => /CN-长钱/.test(t)) || null;
    p.targetLevel = lvl; p.classTargets = ct; p.targets = tg; route();
    return { row: mine };
  }));

  /* W9 归档/删除菜单项 */
  await goto('#/portfolios/view/cn-stable/overview');
  await safe('W9 ⋯ 菜单项', () => page.evaluate(() => {
    const b = [...document.querySelectorAll('button,.btn')].find(e => e.textContent.trim() === '⋯');
    if (!b) return { noMenuBtn: true };
    b.click();
    const items = [...document.querySelectorAll('[class*=menu] *, [class*=drop] *')].map(e => e.textContent.trim()).filter(t => t && t.length < 12);
    return { items: [...new Set(items)].slice(0, 10) };
  }));

  /* W10 删除弹窗文案 */
  await safe('W10 删除弹窗文案', () => page.evaluate(() => {
    let txt = '';
    try { openDelete && openDelete('cn-stable'); } catch (e) { txt = 'ERR ' + e.message.split('\n')[0]; }
    if (!txt) { const m = document.querySelector('[class*=modal],[class*=sheet],[class*=mask]'); txt = m ? m.textContent.replace(/\s+/g, ' ').trim().slice(0, 260) : '(none)'; }
    return { txt };
  }));

  rec('JS 报错', errs.length ? errs : 'none');
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
