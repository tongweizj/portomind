/* 生成 README 需要的 8 张英文版界面截图（docs/development/prototypes/en/）。
   依据 README「Screenshots」表约定的文件名与路由；1440×900 逻辑尺寸，2× 导出。
   data-demo 节点（演示注记/预填账号）是走查提示、不进产品，截图统一隐藏。
   运行：node _shots-en.cjs */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const FILE = 'file:///' + path.resolve(__dirname, 'portomind-prototype-en.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'en');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  ['en-dashboard.png', '#/'],
  ['en-portfolio-list.png', '#/portfolios'],
  ['en-portfolio-overview.png', '#/portfolios/view/cn-long/overview'],
  ['en-portfolio-positions.png', '#/portfolios/view/cn-long/positions'],
  ['en-rebalance.png', '#/portfolios/view/cn-long/rebalance', "genRebal('cn-long')"],
  ['en-transactions.png', '#/portfolios/transactions'],
  ['en-instruments.png', '#/instruments'],
  ['en-price-history.png', '#/prices'],
];

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  for (const [name, hash, pre] of SHOTS) {
    await page.goto('about:blank');
    await page.goto(FILE + hash);
    await page.waitForTimeout(340);
    if (pre) { await page.evaluate(pre); await page.waitForTimeout(340); }
    await page.addStyleTag({ content: '[data-demo]{display:none !important} .toast{display:none !important}' });
    await page.screenshot({ path: path.join(OUT, name) });
    const han = await page.$eval('#view', (el) => (el.innerText.match(/[\u4e00-\u9fff]+/g) || []).join('/')).catch(() => 'ERR');
    console.log(`${name}  ${hash}  ${han ? '残留中文:' + han : '无中文'}`);
  }
  await browser.close();
  console.log('\n输出目录 ' + OUT);
})();
