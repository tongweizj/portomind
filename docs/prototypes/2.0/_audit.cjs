/* TASK-059 原型整改 · 断言脚本（不是"看着对"，是 PASS/FAIL）
   运行：node _audit.cjs
   产出：_audit/*.png 截图 + 控制台 PASS/FAIL 汇总 + 退出码（有 FAIL 则 1）
   只读原型文件，不改它。 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const HTML = path.resolve(__dirname, 'portomind-prototype.html');
const FILE = 'file:///' + HTML.replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '_audit');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : detail });
}

(async () => {
  const src = fs.readFileSync(HTML, 'utf8');
  const count = (re) => (src.match(re) || []).length;

  /* ---------- 0. 文件级静态断言（不依赖浏览器） ---------- */
  check('U-02 全文件 lastRebal 计数 = 0', count(/lastRebal/g) === 0, `count=${count(/lastRebal/g)}`);
  check('U-29 全文件「单用户」计数 = 0', count(/单用户/g) === 0, `count=${count(/单用户/g)}`);
  check('U-01 文案不含「不会级联删除」', !/不会级联删除/.test(src));
  check('U-09 配置弹窗无「时间间隔判据」控件', !/时间间隔判据/.test(src));
  check('U-09 AUTO 频率无 off 选项', !/\[\s*'off'\s*,\s*'关闭'\s*\]/.test(src));
  check('U-11 tab key 用 position-history', /'position-history'\s*,\s*'持仓历史'/.test(src) && !/'history'\s*,\s*'持仓历史'/.test(src));
  check('U-03/U-26 全文件 rebTab 计数 = 0', count(/rebTab/g) === 0, `count=${count(/rebTab/g)}`);
  check('U-16 五种触发原因常量齐备', ['NEVER_EXECUTED', 'TIME_INTERVAL_EXCEEDED', 'ABSOLUTE_DEVIATION_EXCEEDED', 'RELATIVE_DEVIATION_EXCEEDED', 'TOTAL_VALUE_ZERO'].every(k => src.includes(k)));

  /* ---------- 起浏览器 ---------- */
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  const goto = async (h) => { await page.goto(FILE + h); await page.waitForTimeout(220); };
  const text = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.textContent.trim() : null;
  }, sel);

  /* ---------- 1. 几何基线（不许劣化） ---------- */
  await goto('#/');
  const dashGeo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.card table.tb tbody tr')];
    const last = rows.length ? rows[rows.length - 1].getBoundingClientRect() : null;
    return {
      scrollH: document.documentElement.scrollHeight,
      healthLastBottom: last ? Math.round(last.bottom) : null,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'dash.png') });
  check('几何 Dashboard scrollH ≤ 994', dashGeo.scrollH <= 994, `now=${dashGeo.scrollH}`);
  check('几何 健康表最后一行 bottom ≤ 900', dashGeo.healthLastBottom !== null && dashGeo.healthLastBottom <= 900, `now=${dashGeo.healthLastBottom}`);

  await goto('#/portfolios/view/cn-long/overview');
  const ovGeo = await page.evaluate(() => {
    const c = document.querySelector('.content');
    return { contentScrollH: c ? c.scrollHeight : null };
  });
  await page.screenshot({ path: path.join(OUT, 'overview.png') });
  check('几何 总览 contentScrollH ≤ 993', ovGeo.contentScrollH !== null && ovGeo.contentScrollH <= 993, `now=${ovGeo.contentScrollH}`);

  await goto('#/portfolios/view/cn-long/rebalance');
  await page.screenshot({ path: path.join(OUT, 'rebalance.png') });
  await goto('#/portfolios');
  await page.screenshot({ path: path.join(OUT, 'list.png') });

  /* ---------- 2. U-05 driftOf 四态 ---------- */
  const dueOnly = await page.evaluate(() => {
    const p = PORTFOLIOS.find((x) => x.id === 'cn-long');
    const bak = JSON.parse(JSON.stringify(p.cfg));
    p.cfg.abs = 100; p.cfg.rel = 999; p.cfg.interval = 1;
    const d = driftOf(p);
    p.cfg = bak;
    return { kind: d.kind, label: d.label, due: d.due, overN: d.overN };
  });
  check('U-05 到期未超阈 → kind=due 且含「已到期」', dueOnly.kind === 'due' && /已到期/.test(dueOnly.label) && dueOnly.due === true, JSON.stringify(dueOnly));

  const neverKind = await page.evaluate(() => {
    // 用不超阈的组合构造（超阈优先于「从未执行」，不能拿 cn-long 测）
    const p = PORTFOLIOS.find((x) => x.id === 'cn-stable');
    const bak = { le: p.lastExecutedAt, abs: p.cfg.abs, rel: p.cfg.rel };
    p.cfg.abs = 100; p.cfg.rel = 999; p.lastExecutedAt = null;
    const d = driftOf(p);
    p.lastExecutedAt = bak.le; p.cfg.abs = bak.abs; p.cfg.rel = bak.rel;
    return { kind: d.kind, label: d.label };
  });
  check('U-05 从未执行态存在（不超阈时）', neverKind.kind === 'never' && /从未/.test(neverKind.label), JSON.stringify(neverKind));

  // 构造 CN-稳钱「必然到期」，检查 5 处渲染面都不再说「配置正常」
  const dueSurfaces = await page.evaluate(() => {
    const p = PORTFOLIOS.find((x) => x.id === 'cn-stable');
    p.lastExecutedAt = '2026-08-27'; p.cfg.interval = 1;
    const out = { drift: driftOf(p).kind };
    // 1) KPI
    out.kpi = (() => { const t = document.createElement('div'); t.innerHTML = kpiRow(p); return t.textContent; })();
    // 2) 目标 vs 实际 卡头
    out.overview = (() => { const t = document.createElement('div'); t.innerHTML = tabOverview(p, driftOf(p)); return t.textContent; })();
    // 3) 再平衡页 banner
    out.rebSugg = (() => { const t = document.createElement('div'); t.innerHTML = rebSugg(p, driftOf(p)); return t.textContent; })();
    return out;
  });
  await goto('#/');
  const dashDueChip = await page.evaluate(() => {
    const p = PORTFOLIOS.find((x) => x.id === 'cn-stable');
    p.lastExecutedAt = '2026-08-27'; p.cfg.interval = 1;
    const tr = [...document.querySelectorAll('.card table.tb tbody tr')].find((r) => r.textContent.includes('CN-稳钱'));
    return tr ? tr.querySelector('.chip') ? tr.querySelector('.chip').textContent.trim() : null : null;
  });
  await goto('#/portfolios');
  const listDueChip = await page.evaluate(() => {
    const p = PORTFOLIOS.find((x) => x.id === 'cn-stable');
    p.lastExecutedAt = '2026-08-27'; p.cfg.interval = 1;
    const cards = [...document.querySelectorAll('.pcard')];
    const c = cards.find((x) => x.textContent.includes('CN-稳钱'));
    const chips = c ? [...c.querySelectorAll('.chip')].map((x) => x.textContent.trim()) : [];
    return chips;
  });
  check('U-05 到期态：健康表/卡片/KPI 均不出现「配置正常」',
    dashDueChip && !/配置正常/.test(dashDueChip) && /已到期/.test(dashDueChip)
    && !listDueChip.some((t) => t === '配置正常')
    && !/配置正常/.test(dueSurfaces.kpi)
    && !/配置正常/.test(dueSurfaces.overview)
    && !/配置正常/.test(dueSurfaces.rebSugg),
    JSON.stringify({ dashDueChip, listDueChip, kpiNormal: /配置正常/.test(dueSurfaces.kpi), ovNormal: /配置正常/.test(dueSurfaces.overview), rbNormal: /配置正常/.test(dueSurfaces.rebSugg) }));
  check('U-05 再平衡页 banner 不再说「当前配置在阈值内」', !/当前配置在阈值内/.test(dueSurfaces.rebSugg));

  /* ---------- 3. U-07 待办点击不被行覆盖 ---------- */
  await goto('#/');
  await page.locator('.card table.tb tbody tr a', { hasText: '条待确认' }).first().click();
  await page.waitForTimeout(300);
  const afterTodoClick = await page.evaluate(() => location.hash);
  check('U-07 点「N 条待确认」落 ?sub=suggestions', /sub=suggestions/.test(afterTodoClick), afterTodoClick);

  await goto('#/');
  const unreadClick = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('.card table.tb tbody tr')].find((r) => r.textContent.includes('条未读'));
    if (!tr) return { ok: false, reason: 'no unread link' };
    const a = [...tr.querySelectorAll('a')].find((x) => x.textContent.includes('条未读'));
    a.click();
    return { ok: true, pid: S.dashEvPid, hash: location.hash };
  });
  check('U-07 点「N 条未读」写入组合筛选', unreadClick.ok && !!unreadClick.pid, JSON.stringify(unreadClick));

  /* ---------- 4. U-03 子 Tab URL 化 ---------- */
  await goto('#/portfolios/view/cn-long/rebalance');
  await page.getByText('再平衡历史', { exact: true }).click();
  await page.waitForTimeout(280);
  const hashAfterHist = await page.evaluate(() => location.hash);
  await page.reload();
  await page.waitForTimeout(280);
  const segAfterReload = await page.evaluate(() => (document.querySelector('.seg-btn.on') || {}).textContent || null);
  check('U-03 点历史后 hash 含 sub=history', /sub=history/.test(hashAfterHist), hashAfterHist);
  check('U-03 刷新后仍激活「再平衡历史」', segAfterReload === '再平衡历史', segAfterReload);

  /* ---------- 5. U-04 ?record= 精确落点 ---------- */
  await goto('#/');
  await page.locator('.ev-row', { hasText: '再平衡建议待确认' }).first().click();
  await page.waitForTimeout(300);
  const hashAfterEv = await page.evaluate(() => location.hash);
  const hitInfo = await page.evaluate(() => ({
    hit: document.querySelectorAll('.rb-hit').length,
    detailRows: document.querySelectorAll('.rb-detail tbody tr').length,
    // 只查 #view 内的横幅（body.textContent 会把 <script> 源码算进来，恒真）
    notFoundBanner: [...document.querySelectorAll('#view .banner')].some((x) => /该建议不在最近记录中/.test(x.textContent)),
  }));
  check('U-04 带锚点事件 → sub=history & record=', /sub=history/.test(hashAfterEv) && /record=r1/.test(hashAfterEv), hashAfterEv);
  check('U-04 命中行高亮 + 明细展开行数 = 3', hitInfo.hit === 1 && hitInfo.detailRows === 3 && hitInfo.notFoundBanner === false, JSON.stringify(hitInfo));

  await goto('#/portfolios/view/cn-long/rebalance?sub=history');
  const noHit = await page.evaluate(() => ({
    hit: document.querySelectorAll('.rb-hit').length,
    notFoundBanner: [...document.querySelectorAll('#view .banner')].some((x) => /该建议不在最近记录中/.test(x.textContent)),
  }));
  check('U-04 负向对照：无 record= 不高亮、不提示不在记录中', noHit.hit === 0 && noHit.notFoundBanner === false, JSON.stringify(noHit));

  await goto('#/portfolios/view/cn-long/rebalance?sub=history&record=zzz');
  const notFound = await page.evaluate(() =>
    [...document.querySelectorAll('#view .banner')].some((x) => /该建议不在最近记录中/.test(x.textContent)));
  check('U-04 未知 record → 提示「该建议不在最近记录中」', notFound === true, String(notFound));

  /* ---------- 6. U-12 basic 回落总览 ---------- */
  await goto('#/portfolios/view/cn-long/basic');
  const basicTab = await page.evaluate(() => (document.querySelector('.tab.on') || {}).textContent || null);
  check('U-12 #/view/:id/basic → 激活「总览」', basicTab === '总览', basicTab);

  check('U-11/U-12 Tab key 集合固定 5 项', /overview.*positions.*position-history.*rebalance.*transactions/.test(
    (src.match(/const tabs = \[\[[\s\S]*?\]\];/) || [''])[0].replace(/\s+/g, '')
  ), (src.match(/const tabs = \[\[[\s\S]*?\]\];/) || [''])[0].slice(0, 120));

  /* ---------- 7. U-01 删除弹窗文案 ---------- */
  await goto('#/portfolios/view/cn-long/overview');
  const delText = await page.evaluate(() => { openDelPortfolio('cn-long'); return document.getElementById('modal').textContent; });
  const delNeed = ['永久删除', '交易记录', '再平衡记录', '不可恢复', '提醒将不再显示'];
  check('U-01 删除文案含 5 要素且无反向表述',
    delNeed.every((k) => delText.includes(k)) && !/不会级联删除/.test(delText),
    JSON.stringify(delNeed.map((k) => [k, delText.includes(k)])));
  await page.evaluate(() => closeModal());

  /* ---------- 8. U-02 Header 三个组合空态/有值 ---------- */
  const headerChips = {};
  for (const pid of ['cn-stable', 'cn-long', 'ca-long']) {
    await goto('#/portfolios/view/' + pid + '/overview');
    headerChips[pid] = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.chip')].map((x) => x.textContent.trim());
      return chips.find((t) => t.startsWith('最近再平衡')) || null;
    });
  }
  check('U-02 Header 有值/有值/从未 三者各显一次',
    /2026-10-14/.test(headerChips['cn-stable'] || '') &&
    /2026-08-27/.test(headerChips['cn-long'] || '') &&
    /从未/.test(headerChips['ca-long'] || ''),
    JSON.stringify(headerChips));

  /* ---------- 9. U-06 大类目标不是"保存即正常" ---------- */
  const classMode = await page.evaluate(() => {
    const p = PORTFOLIOS.find((x) => x.id === 'cn-long');
    const bak = { t: p.targets, tl: p.targetLevel, ct: p.classTargets };
    p.classTargets = { equity: 60, bond: 40, gold: 0, cash: 0 };
    p.targetLevel = 'asset_class'; p.targets = null;
    const rows = classDevRows(p);
    const d = driftOf(p);
    const out = {
      rows: rows.map((r) => ({ name: r.name, target: r.target, actual: +r.actual.toFixed(2), abs: +r.abs.toFixed(2), flag: r.flag })),
      hasNonZero: rows.some((r) => Math.abs(r.abs) > 0.001),
      overN: d.overN, kind: d.kind,
      flaggedClasses: rows.filter((r) => r.flag !== '正常').length,
      zeroTargetZeroActual: (() => { const r = rows.find((x) => x.target === 0 && x.actual === 0); return r ? r.flag : null; })(),
    };
    p.targets = bak.t; p.targetLevel = bak.tl; p.classTargets = bak.ct;
    return out;
  });
  check('U-06 大类目标 60/40 vs 实际 80/20 → 非零偏离且判超阈',
    classMode.hasNonZero && classMode.overN > 0 && classMode.kind === 'over', JSON.stringify(classMode));
  check('U-06 overN = 超标「标的」数（FS B8 量纲）；大类模式表内另有类数，两者允许不等',
    classMode.hasNonZero && classMode.overN === 4 && classMode.flaggedClasses === 3 && classMode.kind === 'over',
    `overN=${classMode.overN} flaggedClasses=${classMode.flaggedClasses}`);
  check('U-06 目标 0 且实际 0 的类不误报（相对偏离无意义）', classMode.zeroTargetZeroActual === '正常', String(classMode.zeroTargetZeroActual));

  /* ---------- 10. U-21 健康表偏离列文案 ---------- */
  await goto('#/');
  const devCols = await page.evaluate(() => {
    return [...document.querySelectorAll('.card table.tb tbody tr')].map((tr) => {
      const tds = tr.querySelectorAll('td');
      return tds.length >= 3 ? tds[2].textContent.trim() : '';
    });
  });
  const overDevCols = devCols.filter((t) => /超阈/.test(t));
  check('U-21 「偏离」列 = 「N 项超阈」（无变体）',
    overDevCols.length > 0 && overDevCols.every((t) => /^\d+ 项超阈$/.test(t)), JSON.stringify(devCols));

  /* ---------- 11. U-28 Dashboard 页头两按钮，提醒卡内无立即评估 ---------- */
  const headBtns = await page.evaluate(() => [...document.querySelectorAll('.page-head .btn')].map((b) => b.textContent.trim()));
  const evCardHasEval = await page.evaluate(() => {
    const h = [...document.querySelectorAll('.card-h')].find((x) => x.textContent.includes('待处理提醒'));
    return h ? /立即评估/.test(h.textContent) : null;
  });
  check('U-28 页头有「立即评估」「规则管理」', headBtns.some((t) => /立即评估/.test(t)) && headBtns.some((t) => /规则管理/.test(t)), JSON.stringify(headBtns));
  check('U-28 提醒卡内无「立即评估」（无双入口）', evCardHasEval === false, String(evCardHasEval));

  /* ---------- 12. U-09 配置弹窗选项集合 ---------- */
  await goto('#/portfolios/view/cn-long/overview');
  const cfgOpts = await page.evaluate(() => {
    openCfg('cn-long');
    const opts = [...document.querySelectorAll('#cfgFreq option')].map((o) => o.value);
    const hasTimeOn = !!document.getElementById('cfgTimeOn');
    closeModal();
    return { opts, hasTimeOn };
  });
  check('U-09 频率选项 = daily/weekly/monthly（无 off）',
    JSON.stringify(cfgOpts.opts) === JSON.stringify(['daily', 'weekly', 'monthly']), JSON.stringify(cfgOpts));
  check('U-09 无「时间间隔判据」开关', cfgOpts.hasTimeOn === false, String(cfgOpts.hasTimeOn));

  /* ---------- 13. U-17 缺价保护（构造） ---------- */
  const missingCase = await page.evaluate(() => {
    const p = PORTFOLIOS.find((x) => x.id === 'cn-long');
    const a = A('510500');
    const bak = a.price; a.price = null;
    const rows = devRows(p);
    const target = document.querySelector('#view') ? null : null;
    const html = tabOverview(p, driftOf(p));
    a.price = bak;
    const m = rows.find((r) => r.sym === '510500');
    return { flag: m.flag, abs: m.abs, footer: /项缺最新价，未能参与偏离判定/.test(html), mvOk: isFinite(pValue(p)) };
  });
  check('U-17 缺价行 → 偏离「—」且表尾提示，总市值不被污染',
    missingCase.flag === '缺价' && missingCase.abs === null && missingCase.footer === true && missingCase.mvOk === true,
    JSON.stringify(missingCase));

  /* ---------- 15. 二轮验收回归（TASK-059 V-1~V-5 / VI 级 + TASK-060 N-2） ---------- */
  // V-1a 全缺价 + 未到期：必须落「无法估值」，绝不能「配置正常」
  await page.goto(FILE + '#/portfolios/view/cn-stable/overview'); await page.waitForTimeout(250);
  const v1a = await page.evaluate(() => {
    const p = P('cn-stable');
    const bak = p.holdings.map((h) => A(h.sym).price);
    const lx = p.lastExecutedAt;
    p.holdings.forEach((h) => { A(h.sym).price = null; });
    p.lastExecutedAt = '2026-10-26';           // 必然未到期
    route();
    const d = driftOf(p);
    const kpi = (document.querySelector('#view .kpi:last-child') || {}).textContent || '';
    const r = { kind: d.kind, label: d.label, kpiNormal: /配置正常/.test(kpi), kpi: kpi.replace(/\s+/g, ' ').trim() };
    p.holdings.forEach((h, i) => { A(h.sym).price = bak[i]; }); p.lastExecutedAt = lx; route();
    return r;
  });
  check('V-1a 全缺价 → 「无法估值」（不得报「配置正常」）',
    v1a.kind === 'unvaluable' && v1a.kpiNormal === false && /无法估值/.test(v1a.kpi), JSON.stringify(v1a));

  // V-1b 1/4 缺价：必须落「部分缺价」，且不得在页面上假报「N 项超阈」
  const v1b = await page.evaluate(() => {
    const p = P('cn-stable');
    const h0 = p.holdings[0], bak = A(h0.sym).price;
    A(h0.sym).price = null;
    const d = driftOf(p); route();
    const html = document.getElementById('view').innerHTML;
    const r = { kind: d.kind, label: d.label, missing: d.missing, overChip: /项超阈/.test(html), chip: /部分缺价/.test(html) };
    A(h0.sym).price = bak; route();
    return r;
  });
  check('V-1b 部分缺价 → 「部分缺价」且不出现「N 项超阈」',
    v1b.kind === 'missing' && v1b.missing === 1 && v1b.overChip === false && v1b.chip === true, JSON.stringify(v1b));

  // V-2 点「N 条未读」：DOM 必须真的重绘（不能只改内部状态）
  await page.goto(FILE + '#/'); await page.waitForTimeout(250);
  const v2 = await page.evaluate(() => {
    const before = document.getElementById('view').innerHTML;
    const u = [...document.querySelectorAll('#view *')].filter((e) => e.children.length === 0 && /条未读/.test(e.textContent))[0];
    if (!u) return { noUnread: true };
    u.click();
    const sel = document.querySelector('#view select');
    return { selVal: sel ? sel.value : null, redrawn: document.getElementById('view').innerHTML !== before };
  });
  check('V-2 「N 条未读」点击后用户可见结果变化（下拉生效 + DOM 重绘）',
    v2.selVal === 'cn-long' && v2.redrawn === true, JSON.stringify(v2));

  // V-4 边界到期：ds == interval 时文案不得写成「N 天 > 阈值 N 天」
  await page.goto(FILE + '#/portfolios/view/cn-stable/overview'); await page.waitForTimeout(250);
  const v4 = await page.evaluate(() => {
    const p = P('cn-stable');
    const lx = p.lastExecutedAt, iv = p.cfg.interval;
    p.lastExecutedAt = '2026-10-06'; p.cfg.interval = 20;   // 20 天整，恰好等于阈值
    route();
    const txt = ((document.querySelector('#view .kpi:last-child') || {}).textContent || '').replace(/\s+/g, ' ').trim();
    const r = { txt, bad: /天 > 阈值/.test(txt), good: /已达 20 天（阈值 20 天）/.test(txt) };
    p.lastExecutedAt = lx; p.cfg.interval = iv; route();
    return r;
  });
  check('V-4 到期文案用「已达 N 天（阈值 M 天）」，不再出现「N 天 > 阈值 N 天」',
    v4.good === true && v4.bad === false, JSON.stringify(v4));

  // V-5 目标 == 实际：绝对偏离不得渲染成「-0.0」
  const v5 = await page.evaluate(() => {
    const p = P('cn-stable');
    const bak = p.targets ? JSON.parse(JSON.stringify(p.targets)) : null;
    const rows = devRows(p);
    const total = pValue(p);
    p.holdings.forEach((h) => { p.targets[h.sym] = +(h.qty * A(h.sym).price / total * 100).toFixed(4); });
    const r2 = devRows(p);
    const negZero = r2.filter((r) => r.abs !== null && (Object.is(r.abs, -0) || (r.abs < 0 && r.abs > -0.05))).length;
    const rendered = tabOverview(p, driftOf(p));
    if (bak) p.targets = bak; else delete p.targets;
    route();
    return { negZero, renderedNegZero: /-0\.0/.test(rendered) };
  });
  check('V-5 目标=实际时绝对偏离不产生「-0.0」',
    v5.negZero === 0 && v5.renderedNegZero === false, JSON.stringify(v5));

  // VI-1 Topbar 是「位置」、页内是「标题」，4 屏不得同名
  const vi1 = await page.evaluate(async () => {
    const shots = [
      ['#/portfolios/view/cn-long/overview', 1],
      ['#/portfolios', 1],
      ['#/prices', 1],
      ['#/alerts', 1],
    ];
    const out = [];
    for (const [h] of shots) {
      location.hash = h;
      await new Promise((r) => setTimeout(r, 60));
      const tb = (document.getElementById('tbTitle').textContent || '').replace(/\s+/g, ' ').trim();
      const ph = ((document.querySelector('#view .ph-title') || {}).textContent || '').replace(/\s+/g, ' ').trim();
      out.push({ h, tb, ph, same: tb === ph });
    }
    return out;
  });
  check('VI-1 Topbar 与页内标题不同名（组合总览/组合列表/行情/提醒规则 四屏）',
    vi1.every((x) => x.ph && !x.same), JSON.stringify(vi1));

  // VI-2 非总览 Tab 不再背 130px 组合标题卡
  await page.goto(FILE + '#/portfolios/view/cn-long/positions'); await page.waitForTimeout(250);
  const vi2 = await page.evaluate(() => {
    const slim = document.querySelectorAll('#view .detail-slim').length;
    const firstTableY = Math.round((document.querySelector('#view table') || { getBoundingClientRect: () => ({ top: 0 }) }).getBoundingClientRect().top);
    return { slim, firstTableY, hasBigCard: document.querySelectorAll('#view .card .ph-title').length };
  });
  check('VI-2 非总览 Tab 用单行身份条，表格进入首屏（< 350px）',
    vi2.slim === 1 && vi2.hasBigCard === 0 && vi2.firstTableY < 350, JSON.stringify(vi2));

  // VI-3 组合列表「最近交易」必须有表头
  await page.goto(FILE + '#/portfolios'); await page.waitForTimeout(250);
  const vi3 = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#view .card')].find((c) => /最近交易/.test(((c.querySelector('.card-t') || {}).textContent || '')));
    if (!card) return { noCard: true };
    const t = card.querySelector('table');
    return { ths: t.querySelectorAll('thead th').length };
  });
  check('VI-3 「最近交易」表有完整表头（6 列）', vi3.ths === 6, JSON.stringify(vi3));

  // VI-6 组合交易记录 Tab 只有一个主按钮（不再「添加交易 + 新建交易」双入口）
  await page.goto(FILE + '#/portfolios/view/cn-long/transactions'); await page.waitForTimeout(250);
  const vi6 = await page.evaluate(() => [...document.querySelectorAll('#view .btn-pri')].map((b) => b.textContent.trim()));
  check('VI-6 交易记录 Tab 恰 1 个主按钮（无同义双入口）', vi6.length === 1, JSON.stringify(vi6));

  // VI-23 硬编码色只剩 token 定义处（出现次数 ≤ 2：:root 定义 + JS token 镜像）
  const vi23 = { brand: count(/#635BFF/g), surf: count(/#EEEDFF/g), border: count(/#E3E8EE/g) };
  check('VI-23 硬编码色不再散落（三色均 ≤ 2 处，仅 token 定义与镜像）',
    vi23.brand <= 2 && vi23.surf <= 2 && vi23.border <= 2, JSON.stringify(vi23));

  // N-2（TASK-060）safeNext 必须拒绝协议相对地址与反斜杠变体
  const n2 = await page.evaluate(() => ({
    evil: safeNext('//evil.example.com'),
    slash: safeNext('/\\evil.example.com'),
    ok: safeNext('/portfolios'),
    nested: safeNext('/x?next=/y'),
  }));
  check('N-2 safeNext 拒绝 //host 与 /\\ 变体，正常站内路径仍放行',
    n2.evil === null && n2.slash === null && n2.ok === '/portfolios' && n2.nested === null, JSON.stringify(n2));

  /* ---------- 14. 无 JS 报错 ---------- */
  check('无 JS 报错', errs.length === 0, errs.join(' | '));

  await browser.close();

  /* ---------- 汇总 ---------- */
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log('\n===== TASK-059 原型整改断言 =====');
  results.forEach((r, i) => {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(i + 1).padStart(2, '0')}. ${r.name}${r.detail ? '   [' + r.detail + ']' : ''}`);
  });
  console.log(`\n合计 ${results.length} 条 · PASS ${pass} · FAIL ${fail}`);
  fs.writeFileSync(path.join(OUT, 'assertions.json'), JSON.stringify(results, null, 2));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL(harness)', e); process.exit(1); });
