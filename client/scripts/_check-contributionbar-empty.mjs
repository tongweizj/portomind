// client/scripts/_check-contributionbar-empty.mjs
// TASK-050 Reviewer R-1 定点验证：ContributionBar 空态是否仍渲染口径说明。
//
// 缺陷：`if (list.length === 0) return <EmptyState />;` 提前返回，吞掉了返回 JSX 里的
//       兄弟节点（SCOPE_NOTE 口径说明 + 「组合占比」标题）。
// 场景：portfolioContributions: [] + 全部组合已归档 + 勾选「显示已归档」→ 卡片在、说明没了。
//
// 零写入：全部接口用 page.route 拦截喂构造数据，不碰任何库。
// 运行：node client/scripts/_check-contributionbar-empty.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = path.join(os.tmpdir(), 'portomind-r1');

const SCOPE_NOTE = '分桶与占比仅含未归档组合；已归档组合需在下方卡片中单独查看。';
const TITLE = '组合占比';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

// ── 构造数据 ───────────────────────────────────────────────
const ARCHIVED_CARD = {
  _id: 'p-archived-1',
  name: 'A股-长钱组合',
  description: '已归档的示例组合',
  currency: 'CNY',
  type: '长期',
  accountType: 'taxable',
  archived: true,
  stats: { positionCount: 3, marketValueByCurrency: { CNY: 123456.78 }, drift: null, unreadAlertCount: 0 }
};

const EMPTY_FAMILY = {
  data: {
    asOf: '2026-10-21T12:00:00.000Z',
    totalCny: 0,
    buckets: {},
    fxRates: {},
    portfolioContributions: [],
    recentTransactions: [],
    recentRebalanceRecords: []
  }
};

const NORMAL_FAMILY = {
  data: {
    asOf: '2026-10-21T12:00:00.000Z',
    totalCny: 100000,
    buckets: { CNY: { amount: 100000, cnyValue: 100000, rate: null } },
    fxRates: {},
    portfolioContributions: [
      { portfolioId: 'p1', name: 'A股-稳钱组合', currency: 'CNY', marketValueByCurrency: { CNY: 60000 }, cnyValue: 60000, ratio: 60 },
      { portfolioId: 'p2', name: 'A股-长钱组合', currency: 'CNY', marketValueByCurrency: { CNY: 40000 }, cnyValue: 40000, ratio: 40 }
    ],
    recentTransactions: [],
    recentRebalanceRecords: []
  }
};

/** 统一拦截 /api/**，按 pathname 精确分发（`**` 里的 `*` 不跨 `/`，用判定函数更稳）。 */
async function installRoutes(page, { familyPayload, cards }) {
  await page.route(
    url => url.pathname.startsWith('/api/'),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/api/family/summary') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(familyPayload) });
      }
      if (pathname === '/api/portfolios/summary') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: cards }) });
      }
      // 其余（汇率等）返回空，避免打到真后端
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    }
  );
}

async function gotoList(page) {
  await page.goto(`${BASE}/portfolios`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 15000 });
  // 等任一区块落地，避免读到 loading 骨架
  await page.waitForFunction(() => !document.body.innerText.includes('数据加载中'), { timeout: 15000 });
  await page.waitForTimeout(400);
}

/**
 * 取「组合占比」区块的**区块级**视图。
 * 必须区块级：页面下方「最近交易 / 最近再平衡」在空数据时同样渲染 EmptyState「暂无数据」，
 * 用整页 body 断言 `includes('暂无数据')` 会恒真（本次初版就踩了这个坑，见 B5 首跑 FAIL）。
 */
async function contributionBarScope(page) {
  return page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(el => el.textContent.trim() === '组合占比');
    if (!h) return null;
    const root = h.parentElement;
    return {
      text: root.innerText.replace(/\s+/g, ' ').trim(),
      hasBar: !!root.querySelector('div.h-3.rounded-full'),
      liCount: root.querySelectorAll('li').length,
    };
  });
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const consoleErrors = [];

  try {
    // ═══ 场景 A：目标缺陷场景（全归档 → 占比空、卡片有内容） ═══
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push(String(e)));
      await installRoutes(page, { familyPayload: EMPTY_FAMILY, cards: [ARCHIVED_CARD] });
      await gotoList(page);

      // 勾选「显示已归档」（AC14 的目标场景）
      await page.getByText('显示已归档', { exact: false }).click();
      await page.waitForTimeout(600);

      const body = squash(await page.locator('body').innerText());
      await page.screenshot({ path: path.join(SHOT_DIR, 'A-empty-archived.png') });

      // A1 前置：确实是「卡片有内容、占比为空」
      check('A0 卡片已渲染（场景成立）', body.includes('A股-长钱组合'), `body 含组合名=${body.includes('A股-长钱组合')}`);

      // A1 核心断言：口径说明在空态下仍存在
      check('A1 空态仍显示口径说明（R-1 修复目标）', body.includes(squash(SCOPE_NOTE)));

      // A2 说明只出现一次（不是别处凑巧命中）
      const noteCount = await page.getByText(SCOPE_NOTE, { exact: false }).count();
      check('A2 口径说明恰好 1 处', noteCount === 1, `count=${noteCount}`);

      // A3 「组合占比」标题仍在（AC9 七段结构在空态也完整）
      check('A3 空态仍显示「组合占比」标题', body.includes(TITLE));

      // A4 空态占位仍在 —— 必须区块级，整页搜「暂无数据」会命中下方最近交易/再平衡的空态（恒真）
      const scopeA = await contributionBarScope(page);
      check('A4 空态区块内含「暂无数据」占位', scopeA?.text.includes('暂无数据'), `scope=${JSON.stringify(scopeA)}`);

      // A5 空态不渲染占比条（无数据不该有条）
      check('A5 空态不渲染占比条', scopeA?.hasBar === false, `hasBar=${scopeA?.hasBar}`);

      // A6 空态区块内的口径说明位置正确（标题之下、占位之下）
      check('A6 空态区块内确有口径说明', scopeA?.text.includes(squash(SCOPE_NOTE)));

      await page.close();
    }

    // ═══ 场景 B：回归 —— 正常数据下说明与条/图例都正常 ═══
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push(String(e)));
      await installRoutes(page, {
        familyPayload: NORMAL_FAMILY,
        cards: [{ ...ARCHIVED_CARD, archived: false, name: 'A股-稳钱组合' }]
      });
      await gotoList(page);

      const body = squash(await page.locator('body').innerText());
      await page.screenshot({ path: path.join(SHOT_DIR, 'B-normal.png') });

      check('B1 正常态口径说明仍存在', body.includes(squash(SCOPE_NOTE)));
      const noteCount = await page.getByText(SCOPE_NOTE, { exact: false }).count();
      check('B2 正常态口径说明恰好 1 处', noteCount === 1, `count=${noteCount}`);
      check('B3 正常态图例 2 项', body.includes('A股-稳钱组合') && body.includes('A股-长钱组合') && body.includes('60%') && body.includes('40%'));
      const scopeB = await contributionBarScope(page);
      check('B4 正常态占比条存在且图例 2 项', scopeB?.hasBar === true && scopeB?.liCount === 2, `hasBar=${scopeB?.hasBar} li=${scopeB?.liCount}`);
      check('B5 正常态区块内无 EmptyState', scopeB?.text.includes('暂无数据') === false, `scope=${JSON.stringify(scopeB?.text)}`);

      await page.close();
    }

    // ═══ 场景 C：空态 + 未勾选归档（说明也应在） ═══
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push(String(e)));
      await installRoutes(page, { familyPayload: EMPTY_FAMILY, cards: [] });
      await gotoList(page);
      const body = squash(await page.locator('body').innerText());
      check('C1 空态（无卡片）也显示口径说明 —— OD-3 恒显示', body.includes(squash(SCOPE_NOTE)));
      await page.close();
    }
  } finally {
    await browser.close();
  }

  check('D1 无控制台/页面错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} PASS ===`);
  console.log(`screenshots: ${SHOT_DIR}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
