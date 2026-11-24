/* 英文版原型冒烟脚本：确认 portomind-prototype-en.html 能跑通全流程且界面无中文。
   运行：node _audit-en.cjs
   产出：_audit-en/*.png + PASS/FAIL 列表 + 退出码（有 FAIL 则 1）
   只读，不改原型。 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const MAIN = path.resolve(__dirname, 'portomind-prototype-en.html');
const FILE = 'file:///' + MAIN.replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '_audit-en');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  const r = { name, ok: !!ok, detail: detail === undefined ? '' : String(detail) };
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(results.length).padStart(2, '0')}  ${name}${r.ok ? '' : '   → ' + r.detail}`);
}
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HAN = /[\u4e00-\u9fff]/;

(async () => {
  const src = fs.readFileSync(MAIN, 'utf8');

  /* ===== 静态断言 ===== */
  check('文件存在且非空', src.length > 100000, src.length);
  check('html lang = en', /<html lang="en">/.test(src), '未找到 <html lang="en">');
  check('标题已英译', /<title>PortoMind · Product Prototype v2\.0<\/title>/.test(src), '标题未英译');
  check('界面文案无汉字', !HAN.test(src), '仍存在汉字');
  check('关键标识符未被误改', /refreshBoard\(/.test(src) && /vRebalanceBoard/.test(src) && /safeNext/.test(src), '代码标识符被改动');
  check('行数与中文版一致', src.split('\n').length === fs.readFileSync(path.resolve(__dirname, 'portomind-prototype.html'), 'utf8').split('\n').length, '行数不一致');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const go = async (hash, shot) => {
    await page.goto('about:blank');
    await page.goto(FILE + hash);
    await page.waitForTimeout(320);
    const txt = await page.$eval('#view', (el) => el.innerText).catch(() => '');
    if (shot) await page.screenshot({ path: path.join(OUT, shot + '.png'), fullPage: false });
    return txt;
  };

  /* ===== 路由冒烟 ===== */
  const routes = [
    ['#/', '01-dashboard'],
    ['#/portfolios', '02-portfolios'],
    ['#/portfolios/cn-long/overview', '03-detail-overview'],
    ['#/portfolios/cn-long/rebalance', '04-detail-rebalance'],
    ['#/portfolios/transactions', '05-all-transactions'],
    ['#/prices', '06-watchlist'],
    ['#/instruments', '07-instruments'],
    ['#/instruments/0700.HK', '08-instrument-detail'],
    ['#/alerts/rules', '09-alert-rules'],
    ['#/logs', '10-logs-board'],
    ['#/logs/rebalance', '11-logs-rebalance'],
    ['#/account', '12-account'],
    ['#/system', '13-system'],
    ['#/search', '14-search'],
  ];
  for (const [hash, shot] of routes) {
    const txt = await go(hash, shot);
    check(`路由 ${hash} 渲染非空`, txt.length > 40, `渲染字数 ${txt.length}`);
    check(`路由 ${hash} 无汉字`, !HAN.test(txt), (txt.match(/[\u4e00-\u9fff]+/g) || []).slice(0, 5).join(' / '));
  }

  /* ===== 交互冒烟 ===== */
  await page.goto(FILE + '#/logs');
  await page.waitForTimeout(300);
  const before = await page.$eval('#view', (el) => el.innerText);
  await page.click('button:has-text("Refresh")').catch(() => {});
  await page.waitForTimeout(300);
  const after = await page.$eval('#view', (el) => el.innerText);
  check('看板刷新按钮可点击且重绘', before !== after || /Refreshed/.test(after), '点击后无变化');

  await page.goto(FILE + '#/logs');
  await page.waitForTimeout(280);
  check('看板无执行类动作', !/Execute|Revert|Redo|Trigger manually|Edit threshold/.test(await page.$eval('#view', (el) => el.innerText)), '出现执行类动作');

  console.log(`\n运行时错误 ${errors.length} 条`);
  if (errors.length) console.log(errors.slice(0, 10).map((e) => '  ' + e).join('\n'));
  check('无 JS 运行时错误', errors.length === 0, errors[0] || '');

  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - bad.length}/${results.length} PASS ====`);
  process.exit(bad.length ? 1 : 0);
})();
