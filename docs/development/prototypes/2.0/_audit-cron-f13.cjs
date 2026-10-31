/* TASK-061 · F1~F3 整改专项断言（执行方补强，独立于 Reviewer 的 _audit-cron-board.cjs）
   F1 跨 tab mock 同口径（看板 CRON_STATUS ↔ 任务日志 TASKRUNS ↔ 服务器日志 LOGLINES）
   F2 再平衡详情页操作列两个链接有间距
   F3 完整性检查 note 分述「缺口」与「无 launchDate 跳过」两类
   运行：node _audit-cron-f13.cjs
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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const nav = async (h) => { await page.goto('about:blank'); await page.goto(FILE + h); await page.waitForTimeout(300); };

  /* ========== F1-a：从详情页 FAILED 行点「查看原始日志」，不得反看到 SUCCEEDED ========== */
  await nav('#/logs/rebalance');
  await page.click('#view .tb tbody tr:nth-child(2) .act-cell .link:nth-child(1)'); // CN-稳钱 行
  await page.waitForTimeout(320);
  const fromFailed = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#view .tb tbody tr')];
    return {
      hash: location.hash,
      count: rows.length,
      task: (rows[0] && rows[0].children[0].textContent || '').trim(),
      chip: (rows[0] && rows[0].children[1].textContent || '').trim(),
      chipCls: (rows[0] && rows[0].children[1].querySelector('.chip') || {}).className || '',
      summary: (rows[0] && rows[0].children[4].textContent || '').trim(),
    };
  });
  check('F1-a 详情页跳转后落在任务日志（#/logs）', (fromFailed.hash || '').indexOf('#/logs') === 0, fromFailed.hash);
  check('F1-a 过滤结果恰 1 行且是 rebalance-suggestions:cn-stable',
    fromFailed.count === 1 && fromFailed.task === 'rebalance-suggestions:cn-stable',
    `${fromFailed.count} 行 / ${fromFailed.task}`);
  check('F1-a ★从 FAILED 行点进去看到的状态仍是 FAILED（不再反看 SUCCEEDED）',
    fromFailed.chip === 'FAILED' && /c-red/.test(fromFailed.chipCls), `${fromFailed.chip} / ${fromFailed.chipCls}`);
  check('F1-a 摘要给出失败原因 SYMBOL_NOT_FOUND', /SYMBOL_NOT_FOUND/.test(fromFailed.summary), fromFailed.summary);

  /* ========== F1-b：价格同步规模两套口径一致 ========== */
  await nav('#/logs?tab=board');
  await page.click('#view .cron-card:nth-child(1) .card-actions .link:nth-child(1)'); // 价格同步「查看日志」
  await page.waitForTimeout(320);
  const price = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#view .tb tbody tr')];
    const r = rows[0] || {};
    return {
      count: rows.length,
      task: (r.children && r.children[0].textContent || '').trim(),
      chip: (r.children && r.children[1].textContent || '').trim(),
      chipCls: (r.children && r.children[1].querySelector('.chip') || {}).className || '',
      summary: (r.children && r.children[4].textContent || '').trim(),
    };
  });
  check('F1-b 价格同步日志行摘要 = 成功 38 · 失败 2（与看板 38/40 同源）',
    price.count === 1 && price.task === 'daily-price-sync' && /成功 38 · 失败 2/.test(price.summary),
    `${price.task} / ${price.summary}`);
  check('F1-b 价格同步状态不再是「全绿 SUCCEEDED」', price.chip === 'PARTIAL' && /c-amber/.test(price.chipCls), `${price.chip} / ${price.chipCls}`);

  /* ========== F1-c：完整性 / 提醒 / CA-长钱 逐项对齐 ========== */
  await nav('#/logs?tab=task');
  const all = await page.$$eval('#view .tb tbody tr', els => els.map(tr => ({
    task: tr.children[0].textContent.trim(),
    chip: tr.children[1].textContent.trim(),
    chipCls: tr.children[1].querySelector('.chip').className,
    summary: tr.children[4].textContent.trim(),
  })));
  const by = (k) => all.find(x => x.task === k) || {};
  check('F1-c 完整性检查摘要 = 检查 43 · 完整 40 · 缺口 2 · 跳过 1',
    /检查 43 · 完整 40 · 缺口 2 · 跳过 1/.test(by('price-integrity-check').summary || ''), by('price-integrity-check').summary);
  check('F1-c 提醒评估摘要 = 命中 3（与看板「命中 3 条提醒」一致）',
    /命中 3/.test(by('alert-evaluate').summary || ''), by('alert-evaluate').summary);
  check('F1-c CA-长钱 = SKIPPED（与看板一致，不再 SUCCEEDED）',
    by('rebalance-suggestions:ca-long').chip === 'SKIPPED' && /c-gray/.test(by('rebalance-suggestions:ca-long').chipCls || ''),
    `${by('rebalance-suggestions:ca-long').chip} / ${by('rebalance-suggestions:ca-long').chipCls}`);
  check('F1-c CN-长钱 = SUCCEEDED 且仍生成 3 笔（与看板一致）',
    by('rebalance-suggestions:cn-long').chip === 'SUCCEEDED' && /生成 3/.test(by('rebalance-suggestions:cn-long').summary || ''),
    `${by('rebalance-suggestions:cn-long').chip} / ${by('rebalance-suggestions:cn-long').summary}`);
  /* 状态 chip 四态着色（连带项：introduce PARTIAL/SKIPPED 后不能还是二元色） */
  check('F1-c 状态 chip 四态着色：SUCCEEDED=绿 / PARTIAL=黄 / FAILED=红 / SKIPPED=灰',
    /c-green/.test(by('fx-rate-sync').chipCls || '') && /c-amber/.test(by('daily-price-sync').chipCls || '') &&
    /c-red/.test(by('rebalance-suggestions:cn-stable').chipCls || '') && /c-gray/.test(by('rebalance-suggestions:ca-long').chipCls || ''),
    all.map(x => `${x.task}:${x.chip}:${x.chipCls}`).join(' | '));
  /* 状态筛选下拉补至四态 */
  const opts = await page.$$eval('#view .toolbar select option', els => els.map(e => e.value));
  check('F1-c 状态筛选下拉补至四态（SUCCEEDED/PARTIAL/FAILED/SKIPPED）',
    ['', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED'].every(v => opts.includes(v)), JSON.stringify(opts));
  /* 筛选可用：选 SKIPPED 只剩 1 行 */
  await page.selectOption('#view .toolbar select', 'SKIPPED');
  await page.waitForTimeout(300);
  const skippedRows = await page.$$eval('#view .tb tbody tr', els => els.length);
  check('F1-c 选 SKIPPED 后只剩 1 行（筛选真的生效）', skippedRows === 1, `rows=${skippedRows}`);

  /* ========== F1-d：服务器日志三处数字同步 ========== */
  await nav('#/logs?tab=server');
  const logs = await page.$$eval('#view .log-line', els => els.map(e => e.textContent));
  const joined = logs.join('\n');
  check('F1-d 服务器日志：同步 40 个启用资产（原 14）', /开始同步 40 个启用资产/.test(joined), '未找到 40');
  check('F1-d 服务器日志：新增 3 条提醒（原 1）', /新增 3 条提醒/.test(joined), '未找到 3');
  check('F1-d 服务器日志：缺口标的与看板一致（000191、510510）', /缺口 2（000191、510510）/.test(joined), '未找到 000191、510510');
  check('F1-d 服务器日志不再出现旧口径的「0700.HK、AAPL」缺口写法', !/0700\.HK、AAPL/.test(joined), '仍存在旧写法');
  check('F1-d 服务器日志行数仍为 9（原始视图零回归）', logs.length === 9, `lines=${logs.length}`);

  /* ========== F2：再平衡详情页操作列间距 ========== */
  await nav('#/logs/rebalance');
  const act = await page.evaluate(() => {
    const cell = document.querySelector('#view .act-cell');
    if (!cell) return { has: false };
    const ls = [...cell.querySelectorAll('.link')];
    const r = ls.map(l => l.getBoundingClientRect());
    return {
      has: true, gap: getComputedStyle(cell).gap,
      count: ls.length,
      space: r.length === 2 ? Math.round(r[1].left - r[0].right) : -1,
      sameRow: r.length === 2 ? Math.abs(r[0].top - r[1].top) < 4 : false,
    };
  });
  check('F2 操作列两个链接包在 .act-cell 内', act.has === true && act.count === 2, JSON.stringify(act));
  check('F2 两链接有实际间距（≥ 8px，不再粘连）', act.space >= 8, `space=${act.space}px gap=${act.gap}`);
  check('F2 两链接同行不换行', act.sameRow === true, '两链接不在同一行');
  await page.screenshot({ path: path.join(OUT, 'rebalance-f13.png'), fullPage: true });

  /* ========== F3：完整性 note 分述两类问题 ========== */
  await nav('#/logs?tab=board');
  const note = await page.$$eval('#view .cron-card', els => {
    const c = els.find(e => /完整性检查/.test(e.textContent));
    return c ? (c.querySelector('.note') || {}).textContent || '' : '';
  });
  check('F3 完整性 note 分述「缺口」与「无 launchDate 跳过」（不再混写为因果）',
    /缺口：000191、510510/.test(note) && /另有 1 个无 launchDate 被跳过/.test(note), note);
  check('F3 note 不再出现「（无 launchDate，跳过 1）」旧混写', !/（无 launchDate，跳过 1）/.test(note), note);

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'assertions-f13.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\n==== F1~F3 专项：${results.length - failed.length}/${results.length} PASS · ${failed.length} FAIL ====`);
  process.exit(failed.length ? 1 : 0);
})();
