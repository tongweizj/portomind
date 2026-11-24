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
    todayPrice: { marketDay: '2026-11-21', status: 'market_closed', priceDate: null },
    basicInfo: { complete: true, missingFields: [] },
    validity: { status: 'needs_review' },
    history: { status: 'unavailable' }
  },
  {
    assetId: 'a-notdue', symbol: '510300.CN', name: '沪深300ETF',
    market: 'CN-SH', currency: 'CNY', launchDate: null,
    todayPrice: { marketDay: '2026-11-23', status: 'not_due', priceDate: null },
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
    queryClient,
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

  check('TASK-068 无可用运行的历史完整度 = 尚未检查',
    qa('[data-testid="ops-history"]').every((el) => el.innerText === '尚未检查'));
  check('TASK-068 admin 每行可见资产编辑链接',
    qa('[data-testid="ops-asset-edit"]').length === ITEMS.length
      && q('[data-testid="ops-asset-edit"]')?.getAttribute('href') === '/instruments/edit/a-priced');
  check('TASK-068 表格不出现 0 兜底',
    !/缺失\/无效：0|无法判断 0|— 0/.test(text('[data-testid="ops-asset-table"]')));
  check('TASK-068 总数取自服务端分页元数据',
    document.body.innerText.includes(`共 ${ITEMS.length} 只资产`));

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

  // ── TASK-069 筛选/搜索/排序/分页：只发服务端参数 ──
  view = mount();
  await waitRows();
  const requests = [];
  api.defaults.adapter = async (config) => {
    const params = config.params || {};
    requests.push({ ...params });
    const empty = params.search === 'NONE';
    const data = empty ? [] : ITEMS.slice(0, 1);
    const total = empty ? 0 : 120;
    return {
      data: {
        success: true,
        data,
        pagination: {
          page: Number(params.page || 1),
          pageSize: Number(params.pageSize || 50),
          total
        }
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    };
  };
  const setSelect = (testid, value) => {
    const element = q(`[data-testid="${testid}"]`);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const setInput = (testid, value) => {
    const element = q(`[data-testid="${testid}"]`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

  setSelect('ops-filter-market', 'CN-SH');
  await waitFor(() => requests.length >= 1 && requests.at(-1).market === 'CN-SH');
  check('TASK-069 市场筛选进入服务端参数且回到第 1 页',
    requests.at(-1).market === 'CN-SH' && requests.at(-1).page === 1);

  setInput('ops-search-input', 'VOO');
  q('form').requestSubmit();
  await waitFor(() => requests.length >= 2 && requests.at(-1).search === 'VOO');
  check('TASK-069 搜索进入服务端参数', requests.at(-1).search === 'VOO' && requests.at(-1).page === 1);

  const missingTypeValues = ['validity', 'today_price', 'basic_info', 'history_gap'];
  for (let index = 0; index < missingTypeValues.length; index += 1) {
    const value = missingTypeValues[index];
    setSelect('ops-filter-missing-type', value);
    await waitFor(() => requests.length >= 3 + index && requests.at(-1).missingType === value);
    check(`TASK-069 缺失类型 ${value} 进入服务端参数`, requests.at(-1).missingType === value);
  }

  setSelect('ops-sort-by', 'symbol');
  await waitFor(() => requests.length >= 7 && requests.at(-1).sortBy === 'symbol');
  setSelect('ops-sort-order', 'desc');
  await waitFor(() => requests.length >= 8 && requests.at(-1).sortOrder === 'desc');
  check('TASK-069 排序字段与方向进入服务端参数',
    requests.at(-1).sortBy === 'symbol' && requests.at(-1).sortOrder === 'desc');

  setSelect('ops-filter-active', 'all');
  await waitFor(() => requests.length >= 9 && requests.at(-1).active === 'all');
  check('TASK-069 启用状态=全部进入服务端参数', requests.at(-1).active === 'all');

  setSelect('ops-filter-active', 'false');
  await waitFor(() => requests.length >= 10 && requests.at(-1).active === 'false');
  check('TASK-069 启用状态=停用进入服务端参数', requests.at(-1).active === 'false');

  setSelect('ops-page-size', '10');
  await waitFor(() => requests.length >= 11 && requests.at(-1).pageSize === 10);
  await waitFor(() => text('[data-testid="ops-pagination-info"]').includes('第 1 / 12 页'));
  q('[data-testid="ops-pagination-next"]').click();
  await waitFor(() => requests.length >= 12 && requests.at(-1).page === 2);
  check('TASK-069 翻页只改 page 参数并渲染服务端分页元数据',
    requests.at(-1).page === 2 && text('[data-testid="ops-pagination-info"]').includes('第 2 / 12 页'));

  setInput('ops-search-input', 'NONE');
  q('form').requestSubmit();
  await waitFor(() => requests.length >= 13 && requests.at(-1).search === 'NONE');
  await waitFor(() => Boolean(q('[data-testid="ops-assets-empty"]')));
  check('TASK-069 筛选无结果时显示可辨识空态，并回到第 1 页',
    requests.at(-1).page === 1
      && text('[data-testid="ops-assets-empty"]').includes('没有匹配的资产'));
  await view.unmount();

  // ── TASK-070 历史三态与刷新 ──
  view = mount();
  await waitRows();
  const checkedAt = '2026-11-24T07:30:00.000Z';
  const historyItems = ITEMS.map((item, index) => {
    if (index === 0) {
      return { ...item, history: { status: 'checked', checkedAt, expected: 240, actual: 238, missing: 2, ratio: 238 / 240 } };
    }
    if (index === 1) {
      return { ...item, history: { status: 'unknown', checkedAt, expected: null, actual: null, missing: null, ratio: null } };
    }
    return item;
  });
  api.defaults.adapter = async (config) => {
    if (config.url !== '/ops-center/assets') throw new Error(`Unexpected request ${config.url}`);
    return {
      data: { success: true, data: historyItems, pagination: { page: 1, pageSize: 50, total: historyItems.length } },
      status: 200, statusText: 'OK', headers: {}, config
    };
  };
  await view.queryClient.invalidateQueries({ queryKey: ['ops-center-assets'] });
  await waitFor(() => Boolean(q('[data-testid="ops-history"][data-status="checked"]')));
  const checkedRow = qa('[data-testid="ops-asset-row"]')[0];
  check('TASK-070 checked 显示已采/应有/缺失/完整率/检查时间',
    checkedRow.querySelector('[data-testid="ops-history-actual"]')?.innerText === '238'
      && checkedRow.querySelector('[data-testid="ops-history-expected"]')?.innerText === '240'
      && checkedRow.querySelector('[data-testid="ops-history-missing"]')?.innerText === '2'
      && checkedRow.querySelector('[data-testid="ops-history-ratio"]')?.innerText === '99.2%'
      && checkedRow.querySelector('[data-testid="ops-history-checked-at"]')?.innerText.includes('2026'));
  const unknownRow = qa('[data-testid="ops-asset-row"]')[1];
  check('TASK-070 unknown 显示无法判断且不伪造 0%',
    unknownRow.querySelector('[data-testid="ops-history"]')?.getAttribute('data-status') === 'unknown'
      && unknownRow.innerText.includes('无法判断')
      && !unknownRow.innerText.includes('0%'));
  const unavailableRow = qa('[data-testid="ops-asset-row"]')[2];
  check('TASK-070 unavailable 显示尚未检查',
    unavailableRow.querySelector('[data-testid="ops-history"]')?.getAttribute('data-status') === 'unavailable'
      && unavailableRow.innerText.includes('尚未检查'));
  await view.unmount();

  // admin 刷新：202 -> 轮询 RUNNING -> SUCCEEDED -> 刷新资产
  view = mount();
  await waitRows();
  let polls = 0;
  const refreshRequests = [];
  api.defaults.adapter = async (config) => {
    refreshRequests.push({ method: config.method, url: config.url });
    if (config.method === 'post' && config.url === '/ops-center/integrity-check') {
      return {
        data: { success: true, data: { runId: 'run-70', taskName: 'price-integrity-check', status: 'RUNNING', startedAt: checkedAt } },
        status: 202, statusText: 'Accepted', headers: {}, config
      };
    }
    if (config.url === '/ops-center/assets') {
      return {
        data: { success: true, data: historyItems, pagination: { page: 1, pageSize: 50, total: historyItems.length } },
        status: 200, statusText: 'OK', headers: {}, config
      };
    }
    if (config.url === '/ops-center/task-runs/run-70') {
      polls += 1;
      const done = polls >= 2;
      return {
        data: { success: true, data: {
          runId: 'run-70', taskName: 'price-integrity-check', runKey: 'manual:x', trigger: 'MANUAL',
          status: done ? 'SUCCEEDED' : 'RUNNING', stale: false, startedAt: checkedAt,
          progress: { completed: done ? 2 : 1, total: 2, updatedAt: checkedAt },
          counts: { totalCount: 2, successCount: done ? 2 : 0, failureCount: 0 },
          failures: [], result: { assets: [] }
        } },
        status: 200, statusText: 'OK', headers: {}, config
      };
    }
    throw new Error(`Unexpected request ${config.method} ${config.url}`);
  };
  const assetsBeforeRefresh = refreshRequests.filter((request) => request.url === '/ops-center/assets').length;
  q('[data-testid="ops-integrity-refresh"]').click();
  await waitFor(() => Boolean(q('[data-testid="ops-integrity-progress"]')));
  check('TASK-070 admin 可触发刷新并显示进度',
    refreshRequests.some((request) => request.url === '/ops-center/integrity-check')
      && text('[data-testid="ops-integrity-progress"]').includes('已完成 1 / 2'));
  await waitFor(() => text('[data-testid="ops-integrity-result"]').includes('检查完成'), 6000);
  await waitFor(
    () => refreshRequests.filter((request) => request.url === '/ops-center/assets').length > assetsBeforeRefresh,
    4000
  );
  check('TASK-070 刷新终态后显示完成并回读资产总表',
    refreshRequests.filter((request) => request.url === '/ops-center/assets').length > assetsBeforeRefresh);
  await view.unmount();

  // 409 冲突可辨识
  view = mount();
  await waitRows();
  api.defaults.adapter = async (config) => {
    const error = new Error('conflict');
    error.config = config;
    error.response = {
      status: 409,
      data: { message: 'price-integrity-check is already running', code: 'TASK_ALREADY_RUNNING' }
    };
    throw error;
  };
  q('[data-testid="ops-integrity-refresh"]').click();
  await waitFor(() => Boolean(q('[data-testid="ops-integrity-error"]')));
  check('TASK-070 409 冲突按稳定 code 显示明确错误', text('[data-testid="ops-integrity-error"]').includes('已有检查在运行'));
  await view.unmount();


  // ── TASK-071 今日价格同步 ──
  view = mount();
  await waitRows();
  const syncGroups = qa('[data-testid="ops-price-sync-group"] option').map((option) => option.value);
  check('TASK-071 同步范围包含全部 active / CN-HK / US-CA',
    JSON.stringify(syncGroups) === JSON.stringify(['', 'CN', 'US_CA']));

  const syncRequests = [];
  let pricePolls = 0;
  api.defaults.adapter = async (config) => {
    syncRequests.push({ method: config.method, url: config.url, data: config.data });
    if (config.url === '/ops-center/price-sync') {
      return {
        data: { success: true, data: { runId: 'run-71', taskName: 'daily-price-sync', status: 'RUNNING', startedAt: checkedAt } },
        status: 202, statusText: 'Accepted', headers: {}, config
      };
    }
    if (config.url === '/ops-center/assets') {
      return {
        data: { success: true, data: historyItems, pagination: { page: 1, pageSize: 50, total: historyItems.length } },
        status: 200, statusText: 'OK', headers: {}, config
      };
    }
    if (config.url === '/ops-center/task-runs/run-71') {
      pricePolls += 1;
      const done = pricePolls >= 2;
      return {
        data: { success: true, data: {
          runId: 'run-71', taskName: 'daily-price-sync', runKey: 'manual:x', trigger: 'MANUAL',
          status: done ? 'SUCCEEDED' : 'RUNNING', stale: false, startedAt: checkedAt,
          progress: { completed: done ? 2 : 1, total: 2, updatedAt: checkedAt },
          counts: { totalCount: 2, successCount: done ? 2 : 0, failureCount: 0 },
          failures: [], result: { assets: [] }
        } },
        status: 200, statusText: 'OK', headers: {}, config
      };
    }
    throw new Error(`Unexpected request ${config.method} ${config.url}`);
  };
  setSelect('ops-price-sync-group', 'CN');
  const assetsBeforeSync = syncRequests.filter((request) => request.url === '/ops-center/assets').length;
  q('[data-testid="ops-price-sync"]').click();
  await waitFor(() => Boolean(q('[data-testid="ops-price-sync-progress"]')));
  check('TASK-071 admin 可触发 CN-HK 同步并显示进度',
    syncRequests.some((request) => request.url === '/ops-center/price-sync'
      && JSON.parse(request.data).marketGroup === 'CN')
      && text('[data-testid="ops-price-sync-progress"]').includes('已完成 1 / 2'));
  await waitFor(() => text('[data-testid="ops-price-sync-result"]') === '同步完成', 6000);
  await waitFor(
    () => syncRequests.filter((request) => request.url === '/ops-center/assets').length > assetsBeforeSync,
    4000
  );
  check('TASK-071 同步终态后回读资产总表',
    text('[data-testid="ops-price-sync"]').includes('同步今日价格')
      && syncRequests.filter((request) => request.url === '/ops-center/assets').length > assetsBeforeSync);
  await view.unmount();

  view = mount({ role: 'member' });
  await waitRows();
  check('TASK-070 member 看不到刷新按钮', !q('[data-testid="ops-integrity-refresh"]'));
  check('TASK-071 member 看不到价格同步按钮', !q('[data-testid="ops-price-sync"]'));
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
