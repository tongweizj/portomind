// client/scripts/fixtures/task068-fixture.jsx
//
// TASK-068 验收夹具（只用于 client/scripts/verify-task-068.cjs，不属于产品代码）。
// 在真实浏览器内挂载 /logs?tab=assets，用 axios adapter 注入资产总表快照，
// 断言 tab 顺序、四类今日价格状态、基础信息/有效性、admin/member 可见性与三态。

import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import LogViewer from '../../src/pages/LogViewer';
import { AuthContext } from '../../src/components/auth/authContext';
import { api } from '../../src/services/api.client';

const results = [];
const calls = [];
let failures = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error('waitFor timeout');
}

const ITEMS = [
  {
    assetId: 'a-priced', symbol: 'VOO.US', name: 'Vanguard S&P 500 ETF',
    market: 'US', currency: 'USD', launchDate: '2010-09-07T00:00:00.000Z',
    todayPrice: { marketDay: '2026-11-20', status: 'priced', priceDate: '2026-11-20' },
    basicInfo: { complete: true, missingFields: [] },
    validity: { status: 'normal' },
    history: { status: 'unavailable' }
  },
  {
    assetId: 'a-missing', symbol: 'MISS.US', name: 'Missing Price',
    market: 'US', currency: 'USD', launchDate: '2020-01-01T00:00:00.000Z',
    todayPrice: { marketDay: '2026-11-20', status: 'missing', priceDate: null },
    basicInfo: { complete: false, missingFields: ['launchDate'] },
    validity: { status: 'needs_review' },
    history: { status: 'unavailable' }
  },
  {
    assetId: 'a-closed', symbol: 'CLOSED.HK', name: 'Closed Market',
    market: 'HK', currency: 'HKD', launchDate: '2020-01-01T00:00:00.000Z',
    todayPrice: { marketDay: '2026-11-20', status: 'market_closed', priceDate: null },
    basicInfo: { complete: true, missingFields: [] },
    validity: { status: 'needs_review' },
    history: { status: 'unavailable' }
  },
  {
    assetId: 'a-notdue', symbol: '510300.CN', name: '沪深300ETF',
    market: 'CN-SH', currency: 'CNY', launchDate: null,
    todayPrice: { marketDay: '2026-11-20', status: 'not_due', priceDate: null },
    basicInfo: { complete: false, missingFields: ['launchDate'] },
    validity: { status: 'unknown' },
    history: { status: 'unavailable' }
  },
  {
    assetId: 'a-unknown', symbol: 'UNK.US', name: 'Unknown Market Day',
    market: 'US', currency: 'USD', launchDate: '2020-01-01T00:00:00.000Z',
    todayPrice: { marketDay: null, status: 'unknown', priceDate: null },
    basicInfo: { complete: true, missingFields: [] },
    validity: { status: 'unknown' },
    history: { status: 'unavailable' }
  }
];

let mode = 'ok';
let release = null;

function installAdapter() {
  api.defaults.adapter = async (config) => {
    if (config.url !== '/ops-center/assets') {
      throw new Error(`Unexpected request ${config.method} ${config.url}`);
    }
    calls.push(config.url);
    if (mode === 'error') {
      const error = new Error('聚合失败');
      error.config = config;
      error.response = { status: 500, data: { message: '聚合失败' }, headers: {} };
      throw error;
    }
    if (mode === 'loading') {
      await new Promise((resolve) => { release = resolve; });
    }
    const data = mode === 'empty' ? [] : ITEMS;
    return {
      data: { success: true, data, pagination: { page: 1, pageSize: 50, total: data.length } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    };
  };
}

function mount({ role = 'admin', nextMode = 'ok' } = {}) {
  mode = nextMode;
  release = null;
  calls.length = 0;
  installAdapter();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30 * 1000 } }
  });
  const root = createRoot(container);
  root.render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user: { role }, isAdmin: role === 'admin' }}>
        <MemoryRouter initialEntries={['/logs?tab=assets']}>
          <Routes>
            <Route path="/logs" element={<LogViewer />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return {
    container,
    async unmount() {
      root.unmount();
      container.remove();
      await sleep(30);
    }
  };
}

const q = (selector) => document.querySelector(selector);
const qa = (selector) => [...document.querySelectorAll(selector)];
const text = (selector) => q(selector)?.innerText ?? '';
const rowOf = (symbol) => qa('[data-testid="ops-asset-row"]')
  .find((row) => row.querySelector('[data-testid="ops-asset-symbol"]')?.innerText === symbol);

async function waitRows() {
  await waitFor(() => q('[data-testid="ops-asset-table"]') || q('[data-testid="ops-assets-error"]'));
}

async function runScenarios() {
  // ── tab 身份与顺序 ──
  let view = mount();
  await waitRows();
  const tabs = qa('[role="tab"]').map((tab) => tab.innerText);
  check('TASK-068 tab 顺序 = 看板/资产数据/服务器/任务',
    tabs.join('|') === '任务运行看板|资产数据|服务器日志|任务日志', tabs.join('|'));
  check('TASK-068 ?tab=assets 直接选中资产数据',
    q('[role="tab"][aria-selected="true"]')?.innerText === '资产数据');
  check('TASK-068 一次加载只请求一次资产总表', calls.length === 1, `calls=${calls.length}`);

  // ── 表头与四类今日价格状态 ──
  const headers = qa('[data-testid="ops-asset-table"] th').map((th) => th.innerText);
  check('TASK-068 表头含六列',
    headers.join('|') === '资产|今日价格|历史完整度|基础信息|有效性|操作', headers.join('|'));

  const priced = rowOf('VOO.US');
  check('TASK-068 有价：目标市场日 + 状态 + 实际价格日',
    priced?.querySelector('[data-testid="ops-today-market-day"]')?.innerText === '2026-11-20'
      && priced?.querySelector('[data-testid="ops-today-status"]')?.innerText === '有价'
      && priced?.querySelector('[data-testid="ops-today-price-date"]')?.innerText.includes('2026-11-20'),
    priced?.innerText.slice(0, 100));

  const missing = rowOf('MISS.US');
  check('TASK-068 缺价 + 基础信息缺失 + 有效性待核查',
    missing?.querySelector('[data-testid="ops-today-status"]')?.innerText === '缺价'
      && missing?.querySelector('[data-testid="ops-basic-info-missing"]')?.innerText.includes('上市/成立日期')
      && missing?.querySelector('[data-testid="ops-validity"]')?.innerText === '待核查'
      && missing.innerText.includes('资料可能有问题'),
    missing?.innerText.slice(0, 160));

  const closed = rowOf('CLOSED.HK');
  check('TASK-068 休市不作为缺价', closed?.querySelector('[data-testid="ops-today-status"]')?.innerText === '休市');
  const notDue = rowOf('510300.CN');
  check('TASK-068 未到点不作为缺价', notDue?.querySelector('[data-testid="ops-today-status"]')?.innerText === '未到点');
  const unknown = rowOf('UNK.US');
  check('TASK-068 未知目标日显示 — / 无法判断',
    unknown?.querySelector('[data-testid="ops-today-market-day"]')?.innerText === '—'
      && unknown?.querySelector('[data-testid="ops-today-status"]')?.innerText === '无法判断'
      && unknown?.querySelector('[data-testid="ops-validity"]')?.innerText === '无法判断');

  check('TASK-068 历史完整度占位 = 尚未检查',
    qa('[data-testid="ops-history"]').every((el) => el.innerText === '尚未检查'));
  check('TASK-068 admin 每行可见资产编辑链接',
    qa('[data-testid="ops-asset-edit"]').length === ITEMS.length
      && q('[data-testid="ops-asset-edit"]')?.getAttribute('href') === '/instruments/edit/a-priced');
  check('TASK-068 表格不出现 0 兜底',
    !/缺失\/无效：0|无法判断 0|— 0/.test(text('[data-testid="ops-asset-table"]')));
  check('TASK-068 总数取自服务端分页元数据',
    document.body.innerText.includes(`共 ${ITEMS.length} 只 active 资产`));

  await view.unmount();

  // ── member 只读：无编辑/动作入口 ──
  view = mount({ role: 'member' });
  await waitRows();
  check('TASK-068 member 仍可看到资产总表', qa('[data-testid="ops-asset-row"]').length === ITEMS.length);
  check('TASK-068 member 看不到资产编辑链接', qa('[data-testid="ops-asset-edit"]').length === 0);
  await view.unmount();

  // ── 空态 ──
  view = mount({ nextMode: 'empty' });
  await waitFor(() => Boolean(q('[data-testid="ops-assets-empty"]')));
  check('TASK-068 空态可辨识', text('[data-testid="ops-assets-empty"]').includes('暂无 active 资产'));
  await view.unmount();

  // ── 错误态 ──
  view = mount({ nextMode: 'error' });
  await waitFor(() => Boolean(q('[data-testid="ops-assets-error"]')));
  check('TASK-068 错误态可辨识且不伪造数据',
    text('[data-testid="ops-assets-error"]').includes('资产数据加载失败')
      && !q('[data-testid="ops-asset-table"]'));
  await view.unmount();

  // ── 加载态 ──
  view = mount({ nextMode: 'loading' });
  await waitFor(() => Boolean(q('[data-testid="ops-assets-loading"]')));
  check('TASK-068 加载态可辨识', text('[data-testid="ops-assets-loading"]').includes('数据加载中'));
  release?.();
  await waitRows();
  check('TASK-068 加载完成后渲染总表', qa('[data-testid="ops-asset-row"]').length === ITEMS.length);
  await view.unmount();
}

async function main() {
  failures = [];
  try {
    await runScenarios();
  } catch (error) {
    failures = [error?.stack || String(error)];
  }
  const payload = { results, failures };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  document.getElementById('results').textContent = btoa(binary);
}

window.addEventListener('error', (event) => {
  failures.push(`window_error=${event.message}`);
});

main();
