/* TASK-059 验收脚本（独立于执行方的 _audit.cjs，不复用其用例）
   运行：NODE_PATH=.../node_modules node _verify-059.cjs
   只读原型，不改文件。 */
const { chromium } = require('playwright-core');
const path = require('path');

const HTML = path.resolve(__dirname, 'portomind-prototype.html');
const FILE = 'file:///' + HTML.replace(/\\/g, '/');
const out = [];
function rec(name, val) { out.push({ name, val }); }

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  const goto = async h => { await page.goto(FILE + h); await page.waitForTimeout(200); };
  const safe = async (name, fn) => { try { rec(name, await fn()); } catch (e) { rec(name, 'ERR: ' + e.message.split('\n')[0]); } };

  await goto('#/');

  /* V1 全缺价 + 未到期 */
  await safe('V1 全缺价+未到期 → KPI 状态', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-stable');
    const le = p.lastExecutedAt;
    const bak = p.holdings.map(h => { const a = A(h.sym); const v = a.price; a.price = null; return { a, v }; });
    p.lastExecutedAt = TODAY; p.cfg = { abs: 5, rel: 10, interval: 60, freq: 'monthly' };
    const d = driftOf(p);
    route();
    const kpi = [...document.querySelectorAll('.kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim());
    const rb = kpi.find(t => /再平衡状态/.test(t)) || kpi[4] || null;
    const res = { kind: d.kind, label: d.label, missing: d.missing, kpiText: rb };
    bak.forEach(({ a, v }) => a.price = v); p.lastExecutedAt = le; route();
    return res;
  }));

  /* V2 部分缺价 + 未到期 */
  await safe('V2 部分缺价+未到期 → kind/label', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-stable');
    const a0 = A(p.holdings[0].sym); const v0 = a0.price; a0.price = null;
    const le = p.lastExecutedAt; p.lastExecutedAt = TODAY;
    const d = driftOf(p);
    const res = { kind: d.kind, label: d.label, missing: d.missing, overN: d.overN };
    a0.price = v0; p.lastExecutedAt = le; route();
    return res;
  }));

  /* V3 due 边界 ds == interval */
  await safe('V3 间隔恰好等于阈值', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-stable');
    const le = p.lastExecutedAt, cfg = JSON.parse(JSON.stringify(p.cfg));
    p.lastExecutedAt = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    p.cfg = { abs: 100, rel: 999, interval: 30, freq: 'monthly' };
    const d = driftOf(p); const ds = d.ds;
    route();
    const kpi = [...document.querySelectorAll('.kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim());
    const txt = kpi.find(t => /已到期|配置正常/.test(t)) || null;
    const res = { ds, interval: 30, kind: d.kind, kpiText: txt, selfContradict: !!txt && /(\d+) 天 > 阈值 \1 天/.test(txt) };
    p.lastExecutedAt = le; p.cfg = cfg; route();
    return res;
  }));

  /* V4 Header 按钮组 */
  await goto('#/portfolios/view/cn-stable/overview');
  await safe('V4 Header 按钮组', () => page.evaluate(() => {
    const hd = document.querySelector('.content');
    const btns = [...hd.querySelectorAll('button,.btn')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { first8: btns.slice(0, 8), count: btns.length };
  }));

  /* V5 列表页再平衡入口 */
  await goto('#/portfolios');
  await safe('V5 列表页再平衡入口', () => page.evaluate(() => {
    const els = [...document.querySelectorAll('[onclick]')].filter(e => /rebalance/.test(e.getAttribute('onclick') || ''));
    return els.map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 26), onclick: e.getAttribute('onclick') })).slice(0, 6);
  }));

  /* V6 0 组合：Dashboard 健康表空态（级联清空交易/再平衡，模拟实码语义） */
  await goto('#/');
  await safe('V6 0 组合 Dashboard 空态', () => page.evaluate(() => {
    const pf = PORTFOLIOS.splice(0, PORTFOLIOS.length);
    const tx = TXNS.splice(0, TXNS.length), rb = REBALS.splice(0, REBALS.length);
    let dash = '', listErr = '';
    route();
    dash = document.querySelector('#view').textContent.replace(/\s+/g, ' ');
    let listOk = true;
    try { location.hash = '#/portfolios'; route(); } catch (e) { listOk = false; listErr = e.message.split('\n')[0]; }
    const listText = document.querySelector('#view').textContent.replace(/\s+/g, ' ');
    pf.forEach(p => PORTFOLIOS.push(p)); tx.forEach(t => TXNS.push(t)); rb.forEach(r => REBALS.push(r));
    location.hash = '#/'; route();
    return { dashHasEmpty: /暂无组合/.test(dash), dashHasBtn: /新建组合/.test(dash), listOk, listErr, listHasEmpty: /暂无组合|[＋+] 新建/.test(listText) };
  }));

  /* V7 分币种小计：只留 CNY 组合，看是否还渲染空桶 */
  await goto('#/');
  await safe('V7 分币种空桶', () => page.evaluate(() => {
    const ca = PORTFOLIOS.filter(p => p.ccy !== 'CNY').map(p => ({ p, i: PORTFOLIOS.indexOf(p) }));
    ca.reverse().forEach(({ i }) => PORTFOLIOS.splice(i, 1));
    route();
    const txt = document.querySelector('#view').textContent.replace(/\s+/g, ' ');
    const res = { usdShown: /USD/.test(txt), cadShown: /CAD/.test(txt), hasDashBucket: /—/.test(txt) };
    ca.reverse().forEach(({ p, i }) => PORTFOLIOS.splice(i, 0, p)); route();
    return res;
  }));

  /* V8 持仓 Tab 是否重复 KPI */
  await goto('#/portfolios/view/cn-stable/positions');
  await safe('V8 持仓 Tab KPI 数', () => page.evaluate(() => ({ kpiCount: document.querySelectorAll('.kpi').length, hasTable: !!document.querySelector('table.tb') })));

  /* V9 空持仓目标弹窗 */
  await safe('V9 空持仓目标弹窗', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'ca-long');
    const bak = p.holdings.splice(0, p.holdings.length);
    let txt = '';
    try { openTargetForm('ca-long'); const md = document.querySelector('[class*=modal],[class*=sheet],[id*=modal]'); txt = md ? md.textContent.replace(/\s+/g, ' ').trim().slice(0, 180) : '(no modal found)'; } catch (e) { txt = 'ERR ' + e.message.split('\n')[0]; }
    try { (typeof closeModal === 'function') && closeModal(); } catch (e) {}
    document.querySelectorAll('[class*=mask],[class*=overlay]').forEach(e => e.remove());
    bak.forEach(h => p.holdings.push(h));
    return { text: txt };
  }));

  /* V10 非法 sub */
  await goto('#/portfolios/view/cn-stable/rebalance?sub=bogus');
  await safe('V10 非法 sub 回落', () => page.evaluate(() => {
    const act = [...document.querySelectorAll('[class*=active]')].map(e => e.textContent.trim()).filter(t => t && t.length < 10);
    const head = document.querySelector('#view').textContent.replace(/\s+/g, ' ').slice(0, 300);
    return { activeLabels: act.slice(0, 5), head };
  }));

  /* V11 未知 record */
  await goto('#/portfolios/view/cn-stable/rebalance?sub=history&record=nope');
  await safe('V11 未知 record', () => page.evaluate(() => ({ banner: /该建议不在最近记录中/.test(document.querySelector('#view').textContent), hitRows: document.querySelectorAll('.rb-hit').length })));

  /* V12 basic 回落 */
  await goto('#/portfolios/view/cn-stable/basic');
  await safe('V12 basic 回落', () => page.evaluate(() => ({
    activeLabels: [...document.querySelectorAll('[class*=active]')].map(e => e.textContent.trim()).filter(t => t && t.length < 10).slice(0, 5),
    kpiCount: document.querySelectorAll('.kpi').length,
  })));

  /* V13 健康表徽标 / 行点击 */
  await goto('#/');
  await safe('V13 健康表点击', () => page.evaluate(async () => {
    const badges = [...document.querySelectorAll('#view *')].filter(e => e.children.length === 0 && /条待确认|条未读/.test(e.textContent));
    const res = {};
    if (badges.length) { res.badgeText = badges[0].textContent.trim(); badges[0].click(); await new Promise(r => setTimeout(r, 150)); res.hashAfterBadge = location.hash; }
    else res.noBadge = true;
    location.hash = '#/'; route(); await new Promise(r => setTimeout(r, 80));
    const row = document.querySelector('.rowlink');
    if (row) { row.click(); await new Promise(r => setTimeout(r, 150)); res.hashAfterRow = location.hash; }
    const unread = [...document.querySelectorAll('#view *')].filter(e => e.children.length === 0 && /条未读/.test(e.textContent));
    if (unread.length) { location.hash = '#/'; route(); await new Promise(r => setTimeout(r, 80)); const u2 = [...document.querySelectorAll('#view *')].filter(e => e.children.length === 0 && /条未读/.test(e.textContent))[0]; u2.click(); await new Promise(r => setTimeout(r, 150)); res.hashAfterUnread = location.hash; res.evPidFilter = (typeof S !== 'undefined' && S.dashEvPid) || null; }
    return res;
  }));

  /* V14 大类模式 overN 量纲 */
  await goto('#/portfolios/view/cn-long/overview');
  await safe('V14 大类模式 overN', () => page.evaluate(() => {
    const p = PORTFOLIOS.find(x => x.id === 'cn-long');
    const lvl = p.targetLevel, ct = p.classTargets, tg = p.targets;
    p.targetLevel = 'asset_class'; p.classTargets = { equity: 60, bond: 40, gold: 0, cash: 0 };
    const d = driftOf(p), cls = classDevRows(p), asset = devRows(p);
    const res = {
      overN: d.overN, classRows: cls ? cls.length : null,
      classFlagged: cls ? cls.filter(r => r.flag !== '正常' && r.flag !== '缺价').length : null,
      assetRows: asset ? asset.length : null,
      assetFlagged: asset ? asset.filter(r => !r.missing && r.flag !== '正常').length : null,
    };
    p.targetLevel = lvl; p.classTargets = ct; p.targets = tg; route();
    return res;
  }));

  /* V15 再平衡页配置双入口 */
  await goto('#/portfolios/view/cn-stable/rebalance');
  await safe('V15 再平衡页配置入口', () => page.evaluate(() => {
    const t = document.querySelector('#view').textContent.replace(/\s+/g, ' ');
    return { hasTriggerCard: /触发阈值/.test(t), hasEditCfg: /编辑配置/.test(t), hasPointBack: /再平衡配置/.test(t) };
  }));

  rec('JS 报错', errs.length ? errs : 'none');
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
