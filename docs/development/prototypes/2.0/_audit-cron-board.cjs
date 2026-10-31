/* TASK-061 任务运行看板 · 断言脚本
   覆盖：AC1~AC11（docs/development/tasks/completed/TASK-061-cron-board-prototype.md §6）
   运行：node _audit-cron-board.cjs
   产出：_audit-cron/*.png 截图 + PASS/FAIL 逐条输出 + 退出码（有 FAIL 则 1）
   只读，不改原型。 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const MAIN = path.resolve(__dirname, 'portomind-prototype.html');
const FILE = 'file:///' + MAIN.replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '_audit-cron');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  const r = { name, ok: !!ok, detail: detail === undefined ? '' : detail };
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(results.length).padStart(2, '0')}  ${name}${r.ok ? '' : '   → ' + r.detail}`);
}
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BAN = /执行|撤销|重做|手动触发|编辑阈值/;

(async () => {
  const src = fs.readFileSync(MAIN, 'utf8');
  const count = (re) => (src.match(re) || []).length;

  /* ===== 静态断言 ===== */
  check('AC8 源码无 setInterval（不轮询）', !/setInterval\s*\(/.test(src), '发现 setInterval');
  check('AC8 刷新按钮调用 refreshBoard', /onclick="refreshBoard\(\)"/.test(src), '未找到刷新按钮');
  check('S.logs.tab 默认 = board', /logs:\{\s*tab:'board'/.test(src), '默认值不是 board');
  check('R-2 旧 tab key（runs/logs 分支）已移除', !/f\.tab==='runs'/.test(src) && !/f\.tab==='logs'/.test(src), '仍存在旧 key');
  check('AC11 侧栏「日志」入口未被改动', /id="nav-logs"[^>]*onclick="go\('#\/logs'\)"/.test(src), 'nav-logs 被改');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const nav = async (hash) => {
    await page.goto('about:blank');
    await page.goto(FILE + hash);
    await page.waitForTimeout(300);
  };

  /* ===== AC1 默认落看板 + tab 顺序 ===== */
  await nav('#/logs');
  const tabs = await page.$$eval('#view .seg-btn', els => els.map(e => ({ t: e.textContent.trim(), on: e.classList.contains('on') })));
  check('AC1 tab 恰 3 个且顺序正确',
    tabs.length === 3 && tabs.map(x => x.t).join('|') === '任务运行看板|任务日志|服务器日志',
    JSON.stringify(tabs.map(x => x.t)));
  check('AC1 默认选中第一个 tab（看板）', tabs[0] && tabs[0].on === true, JSON.stringify(tabs));
  await page.screenshot({ path: path.join(OUT, 'board.png'), fullPage: true });

  /* ===== AC2 总览条 ===== */
  const ov = await page.evaluate(() => {
    const hl = [...document.querySelectorAll('#view .cron-overview .hl')];
    return {
      dots: document.querySelectorAll('#view .cron-overview .hl .dot').length,
      names: hl.map(e => e.textContent.trim()),
      badge: (document.querySelector('#view .cron-overview .chip') || {}).textContent,
      badgeCls: (document.querySelector('#view .cron-overview .chip') || {}).className,
      snap: document.querySelector('#view .toolbar .count').textContent.trim(),
    };
  });
  check('AC2 总览条恰好 5 个健康灯', ov.dots === 5, `dots=${ov.dots}`);
  check('AC2 健康灯含任务名', ov.names.join('|') === '价格同步|完整性检查|提醒评估|汇率同步|再平衡分发', ov.names.join('|'));
  check('AC2 整体徽章 = 需关注（c-amber）', ov.badge === '需关注' && /c-amber/.test(ov.badgeCls || ''), `${ov.badge} / ${ov.badgeCls}`);
  check('AC2 快照时间文案就位', /更新于 2026-10-26 09:35/.test(ov.snap), ov.snap);

  /* ===== AC3 五张卡 ===== */
  const cards = await page.$$eval('#view .cron-card', els => els.map(e => ({
    name: (e.querySelector('.ph-title') || {}).textContent,
    chip: (e.querySelector('.head-row .chip') || {}).textContent,
    chipCls: (e.querySelector('.head-row .chip') || {}).className,
    lastRun: (e.querySelector('.muted') || {}).textContent,
    runState: (e.querySelector('.run-state') || {}).textContent,
    knum: (e.querySelector('.knum') || {}).textContent,
    bar: !!e.querySelector('.pbar'),
    nan: /NaN/.test(e.textContent),
    actions: [...e.querySelectorAll('.card-actions .link')].map(a => a.textContent.trim()),
  })));
  check('AC3 渲染 5 张任务卡', cards.length === 5, `cards=${cards.length}`);
  check('AC3 每卡有任务名 + 上次运行 + 数据态 chip + 运行态副行',
    cards.every(c => c.name && /上次运行/.test(c.lastRun || '') && c.chip && /运行态/.test(c.runState || '')),
    JSON.stringify(cards.map(c => [c.name, c.chip, c.runState])));
  check('AC3 数据态着色：价格/完整性=amber，提醒/汇率=green，再平衡=amber',
    cards.map(c => (c.chipCls.match(/c-(green|amber|red|gray)/) || [])[1]).join('|') === 'amber|amber|green|green|amber',
    cards.map(c => c.chipCls).join(' | '));
  check('AC3 无 NaN（progress 为空的任务不画 bar 也不算百分比）',
    cards.every(c => !c.nan) && cards.filter(c => c.bar).length === 2,
    `NaN=${cards.filter(c => c.nan).length} bars=${cards.filter(c => c.bar).length}`);
  check('AC3 progress=null 的三张卡不画进度条',
    cards.filter(c => ['提醒评估', '汇率同步', '再平衡分发'].includes(c.name)).every(c => !c.bar),
    JSON.stringify(cards.map(c => [c.name, c.bar])));
  check('AC3 每张卡都有「查看日志」入口', cards.every(c => c.actions.includes('查看日志')), JSON.stringify(cards.map(c => c.actions)));

  /* ===== AC4 价格卡数据态为主信号 ===== */
  const pcard = cards.find(c => c.name === '价格同步');
  check('AC4 价格卡显示目标上一开市日 + 38/40 · 95%',
    /目标 2026-10-25（上一开市日）：38\/40 · 95%/.test(pcard.knum), pcard.knum);
  const pnote = await page.$eval('#view .cron-card .note', e => e.textContent);
  check('AC4 价格卡 note 标出 0700.HK 超时未采', /0700\.HK/.test(pnote), pnote);
  check('AC4 价格卡数据态 chip = 关注（amber）且运行态 SUCCEEDED 在副行（反「全绿误导」）',
    pcard.chip === '关注' && /c-amber/.test(pcard.chipCls) && /运行态 SUCCEEDED/.test(pcard.runState),
    `${pcard.chip} / ${pcard.chipCls} / ${pcard.runState}`);

  /* ===== AC5 图例 ===== */
  const legend = await page.$eval('#view .cron-legend', e => e.textContent);
  check('AC5 图例存在且声明与行情红涨绿跌无关', /红涨绿跌/.test(legend) && /无关/.test(legend), legend.slice(0, 80));
  check('AC5 图例四态齐备', ['好', '关注', '坏', '跳过/未跑'].every(t => legend.includes(t)), legend.slice(0, 120));

  /* ===== AC6 再平衡卡 + 详情页 ===== */
  const rcard = cards.find(c => c.name === '再平衡分发');
  check('AC6 再平衡卡关键数字「到期 2 / 生成 1 / 失败 1」', /到期 2 \/ 生成 1 \/ 失败 1/.test(rcard.knum), rcard.knum);
  check('AC6 再平衡卡有「查看详情」', rcard.actions.includes('查看详情'), JSON.stringify(rcard.actions));
  await page.click('#view .cron-card:last-child .card-actions .link:nth-child(2)');
  await page.waitForTimeout(320);
  const hash = await page.evaluate(() => location.hash);
  check('AC6 「查看详情」进 /logs/rebalance', hash === '#/logs/rebalance', hash);
  await page.screenshot({ path: path.join(OUT, 'rebalance.png'), fullPage: true });

  const rb = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#view .tb tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
    return {
      rows,
      selects: document.querySelectorAll('#view .toolbar .select').length,
      ro: (document.querySelector('#view .cron-ro') || {}).textContent || '',
      crumb: (document.querySelector('#view .crumbs .link') || {}).textContent || '',
      btns: [...document.querySelectorAll('#view button, #view a')].map(e => e.textContent.trim()),
      bars: document.querySelectorAll('#view .pbar').length,
    };
  });
  check('AC6 详情页逐组合 3 行', rb.rows.length === 3, `rows=${rb.rows.length}`);
  check('AC6 三行内容正确（CN-长钱生成 3 / CN-稳钱 FAILED·SYMBOL_NOT_FOUND / CA-长钱 跳过）',
    /CN-长钱/.test(rb.rows[0].join()) && /3/.test(rb.rows[0].join()) &&
    /CN-稳钱/.test(rb.rows[1].join()) && /SYMBOL_NOT_FOUND/.test(rb.rows[1].join()) && /FAILED/.test(rb.rows[1].join()) &&
    /CA-长钱/.test(rb.rows[2].join()) && /SKIPPED/.test(rb.rows[2].join()),
    JSON.stringify(rb.rows));
  check('AC6 4 个筛选器（日期/组合/状态/频率）', rb.selects === 4, `selects=${rb.selects}`);
  check('AC6 有只读声明', /只读/.test(rb.ro) && /组合域/.test(rb.ro), rb.ro.slice(0, 60));
  check('AC6 面包屑可返回看板', /返回看板/.test(rb.crumb), rb.crumb);
  check('AC9 详情页无执行/撤销/重做类控件', rb.btns.every(t => !BAN.test(t)), JSON.stringify(rb.btns.filter(t => BAN.test(t))));

  /* ===== AC7 两个原始视图零回归 ===== */
  await nav('#/logs');
  await page.click('#view .seg-btn:nth-child(2)');
  await page.waitForTimeout(300);
  const taskRows = await page.$$eval('#view .tb tbody tr', els => els.length);
  const firstTask = await page.$eval('#view .tb tbody tr td', e => e.textContent.trim());
  check('AC7 任务日志行数 = TASKRUNS 长度（7）', taskRows === 7, `rows=${taskRows}`);
  check('AC7 任务日志首行仍是 daily-price-sync', firstTask === 'daily-price-sync', firstTask);
  await page.click('#view .seg-btn:nth-child(3)');
  await page.waitForTimeout(300);
  const logLines = await page.$$eval('#view .log-line', els => els.length);
  check('AC7 服务器日志行数 = LOGLINES 长度（9）', logLines === 9, `lines=${logLines}`);
  await page.screenshot({ path: path.join(OUT, 'server-log.png'), fullPage: true });

  /* ===== AC8 手动刷新 ===== */
  await nav('#/logs');
  const before = await page.$eval('#view .toolbar .count', e => e.textContent);
  await page.click('#view .toolbar .btn');
  await page.waitForTimeout(320);
  const after = await page.$eval('#view .toolbar .count', e => e.textContent);
  check('AC8 「↻ 刷新」按钮生效（快照时间推进）', before !== after && /更新于/.test(after), `${before} → ${after}`);

  /* ===== AC9 全频道只读（负向对照：先塞假按钮确认能失败） ===== */
  await nav('#/logs');
  const boardBtns = await page.$$eval('#view button, #view a', els => els.map(e => e.textContent.trim()));
  check('AC9 看板无执行/撤销/重做类控件', boardBtns.every(t => !BAN.test(t)), JSON.stringify(boardBtns.filter(t => BAN.test(t))));
  await page.evaluate(() => {
    const d = document.createElement('button'); d.textContent = '执行再平衡'; d.id = 'fakeBan';
    document.querySelector('#view').appendChild(d);
  });
  const poisoned = await page.$$eval('#view button, #view a',
    els => els.map(e => e.textContent.trim()).filter(t => /执行|撤销|重做|手动触发|编辑阈值/.test(t)));
  check('AC9 负向对照：注入假按钮后断言确实会失败', poisoned.length === 1 && poisoned[0] === '执行再平衡', JSON.stringify(poisoned));
  await page.evaluate(() => { const f = document.getElementById('fakeBan'); if (f) f.remove(); });

  /* ===== AC10 视觉 / token / 溢出 ===== */
  const vis = await page.evaluate(() => {
    const bar = document.querySelector('#view .pbar-f');
    const link = document.querySelector('#view .link');
    const card = document.querySelector('#view .cron-card');
    return {
      barW: bar ? getComputedStyle(bar).backgroundColor : '',
      linkC: link ? getComputedStyle(link).color : '',
      cardBorder: card ? getComputedStyle(card).borderColor : '',
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      grid: !!document.querySelector('#view .cron-grid'),
    };
  });
  check('AC10 进度条用主色 #635BFF', vis.barW === 'rgb(99, 91, 255)', vis.barW);
  check('AC10 链接用主色 #635BFF', vis.linkC === 'rgb(99, 91, 255)', vis.linkC);
  check('AC10 卡片边框用 --border #E3E8EE', vis.cardBorder === 'rgb(227, 232, 238)', vis.cardBorder);
  check('AC10 无横向溢出', vis.overflow === true, 'scrollWidth > clientWidth');
  check('AC10 看板用 .cron-grid 网格', vis.grid === true, '未使用 grid');

  /* ===== 深链 ===== */
  await nav('#/logs/rebalance?portfolio=cn-long&date=2026-10-25');
  const deep = await page.evaluate(() => ({
    rows: document.querySelectorAll('#view .tb tbody tr').length,
    date: document.querySelector('#view .toolbar .select').value,
    text: document.querySelector('#view .tb tbody').textContent,
  }));
  check('OQ8 深链 ?portfolio=cn-long 生效（只剩 1 行）', deep.rows === 1 && /CN-长钱/.test(deep.text), `rows=${deep.rows}`);
  check('OQ8 深链 ?date= 生效', deep.date === '2026-10-25', deep.date);

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'assertions.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} PASS · ${failed.length} FAIL ====`);
  process.exit(failed.length ? 1 : 0);
})();
