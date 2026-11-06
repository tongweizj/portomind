// client/scripts/fixtures/task063-fixture.jsx
//
// TASK-063 验收夹具（只用于 client/scripts/verify-task-063.cjs，不属于产品代码）。
// 真实浏览器内挂载 CronBoard，替换 axios adapter 返回可控 /api/cron/status 快照，
// 断言 AC1–AC7；请求计数同时证明「一次读取 + 手动刷新 + 无轮询」。

import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CronBoard from '../../src/components/CronStatus/CronBoard';
import BoardShell from '../../src/components/CronStatus/BoardShell';
import { api } from '../../src/services/api';

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

function run(taskName, over = {}) {
  return {
    taskName,
    runKey: `2026-10-23`,
    trigger: 'SCHEDULED',
    status: 'SUCCEEDED',
    rawStatus: 'SUCCEEDED',
    startedAt: '2026-10-23T07:00:00.000Z',
    endedAt: '2026-10-23T07:00:01.000Z',
    durationMs: 1000,
    totalCount: 1,
    successCount: 1,
    failureCount: 0,
    ...over
  };
}

function task(taskName, over = {}) {
  return {
    taskName,
    lastRun: run(taskName),
    lastSkip: null,
    stale: false,
    contractReady: true,
    dataStateLevel: 'ok',
    notes: [],
    dataState: {},
    ...over
  };
}

function makeSnapshot(overrides = {}) {
  const tasks = [
    task('daily-price-sync', {
      dataState: {
        targetMarketDate: '2026-10-23',
        calendarPrevOpenDay: '2026-10-23',
        expected: 40,
        fetched: 40,
        missing: [],
        byMarket: {},
        notListed: [],
        unsupportedMarkets: [],
        dayPriceSymbolCount: null
      },
      lastSkip: {
        taskName: 'daily-price-sync',
        runKey: '2026-10-23',
        reason: 'ALREADY_RUNNING',
        skippedAt: '2026-10-23T03:00:05.000Z',
        trigger: 'SCHEDULED'
      }
    }),
    task('price-integrity-check', {
      lastSkip: {
        taskName: 'price-integrity-check',
        runKey: '2026-10-23',
        reason: 'DUPLICATE_RUN_KEY',
        skippedAt: '2026-10-23T07:00:05.000Z',
        trigger: 'MANUAL'
      },
      dataState: {
        expectedCount: 40,
        actualCount: 40,
        missingCount: 0,
        completenessRatio: 1,
        skippedNoLaunchDate: 1,
        gapAssets: []
      }
    }),
    task('alert-evaluate', {
      dataState: { evaluated: 12, created: 0, archived: 0, failed: 0 }
    }),
    task('fx-rate-sync', {
      dataState: {
        fxCount: 3,
        currencies: {
          USD: { ok: true, rateToCny: 7.13 },
          CAD: { ok: true, rateToCny: 5.21 },
          HKD: { ok: true, rateToCny: 0.92 }
        }
      }
    }),
    task('rebalance-check', {
      dataState: {
        due: 2,
        totalPortfolios: 4,
        generatedCount: 1,
        skippedCount: 2,
        perPortfolio: [
          { portfolioId: 'p1', due: true, needsRebalance: true, suggestionsCount: 2, recordId: 'r1', status: 'SUCCEEDED' },
          { portfolioId: 'p2', due: true, needsRebalance: false, suggestionsCount: 0, recordId: null, status: 'SUCCEEDED' },
          { portfolioId: 'p3', due: false, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'SUCCEEDED' },
          { portfolioId: 'p4', due: false, needsRebalance: null, suggestionsCount: null, recordId: null, status: 'SUCCEEDED' }
        ]
      }
    })
  ];

  return {
    generatedAt: '2026-10-23T07:00:10.000Z',
    timezone: 'America/Toronto',
    staleThresholdHours: 48,
    tasks,
    ...overrides
  };
}

function mount(snapshot, { fail = false } = {}) {
  calls.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  api.defaults.adapter = async (config) => {
    calls.push(config.url);
    if (fail) {
      const error = new Error('Network Error');
      error.config = config;
      throw error;
    }
    return {
      data: { success: true, data: snapshot },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    };
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60 * 1000 } }
  });
  const root = createRoot(container);
  root.render(
    <QueryClientProvider client={queryClient}>
      <CronBoard />
    </QueryClientProvider>
  );
  return {
    container,
    queryClient,
    unmount() {
      root.unmount();
      container.remove();
    }
  };
}

function q(selector) {
  return document.querySelector(selector);
}
function qa(selector) {
  return [...document.querySelectorAll(selector)];
}
function text(selector) {
  const el = q(selector);
  return el ? el.innerText : '';
}
function card(label) {
  return q(`article[aria-label="${label}"]`);
}

async function waitLoaded() {
  await waitFor(() => Boolean(q('[data-testid="price-card"]')) || Boolean(q('[data-testid="cron-error"]')));
}

async function runScenarios() {
  // ── 正常快照 ──
  const normal = mount(makeSnapshot());
  await waitLoaded();
  await waitFor(() => text('[data-testid="overall-badge"]').includes('全部正常'));
  const priceCards = qa('[data-testid="price-card"]');
  const dataCards = qa('[data-testid="task-card"]');
  check('AC1 五卡真实渲染（1 price + 4 data）', priceCards.length === 1 && dataCards.length === 4,
    `price=${priceCards.length} data=${dataCards.length}`);
  check('AC1 总览绑定真实快照且五项全 ok 才全部正常', text('[data-testid="overall-badge"]').includes('全部正常')
    && text('[data-testid="snapshot-at"]').includes('2026-10-23T07:00:10.000Z'));
  const dotStates = qa('[data-testid="health-dot"]').map((dot) => dot.getAttribute('data-state'));
  check('AC1 五灯取真实 dataStateLevel', dotStates.length === 5 && dotStates.every((state) => state === 'ok'),
    JSON.stringify(dotStates));

  const priceText = text('[data-testid="price-card"]');
  check('AC1 价格卡显示目标日/应采已采/完成度', priceText.includes('2026-10-23')
    && text('[data-testid="price-percent"]') === '100%');
  const integrity = card('价格完整性');
  check('AC2 完整性卡显示 expected/actual/missing/跳过',
    Boolean(integrity) && integrity.innerText.includes('应采 / 实际')
      && integrity.innerText.includes('40 / 40')
      && integrity.innerText.includes('跳过（无 launchDate）'), integrity ? integrity.innerText.slice(0, 120) : 'missing');
  const alert = card('提醒评估');
  check('AC2 提醒卡零命中不判失败', Boolean(alert)
    && alert.innerText.includes('零命中属正常')
    && alert.innerText.includes('新建'), alert ? alert.innerText.slice(0, 120) : 'missing');
  const fx = card('汇率同步');
  check('AC2 汇率显示可证明观测 + 不证明方向', Boolean(fx)
    && fx.innerText.includes('USD')
    && fx.innerText.includes('本次写入成功')
    && fx.innerText.includes('不证明汇率方向正确'), fx ? fx.innerText.slice(0, 160) : 'missing');
  const rebalance = card('再平衡建议');
  check('AC3 再平衡显示到期分母/生成/未超阈',
    Boolean(rebalance)
      && rebalance.innerText.includes('到期 2')
      && rebalance.innerText.includes('生成建议')
      && rebalance.innerText.includes('未超阈'), rebalance ? rebalance.innerText.slice(0, 160) : 'missing');
  check('AC4 lastSkip 与 lastRun 分离（价格 + 数据卡）',
    text('[data-testid="price-last-skip"]').includes('最近跳过')
      && Boolean(integrity && integrity.querySelector('[data-testid="last-skip"]')));
  check('AC4 lastSkip 缺失时整体省略（不显示空占位）',
    !card('提醒评估').querySelector('[data-testid="last-skip"]'));
  check('AC6 首次只发一次 cron/status 请求（价格卡不二次请求）', calls.length === 1, `calls=${calls.length}`);

  // 手动刷新：只加一次请求，generatedAt 更新
  api.defaults.adapter = async (config) => {
    calls.push(config.url);
    return {
      data: { success: true, data: makeSnapshot({ generatedAt: '2026-10-23T08:00:00.000Z' }) },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    };
  };
  q('[data-testid="cron-refresh"]').click();
  await waitFor(() => text('[data-testid="snapshot-at"]').includes('2026-10-23T08:00:00.000Z'));
  check('AC5 手动刷新更新 generatedAt', text('[data-testid="snapshot-at"]').includes('08:00:00'));
  check('AC5 刷新只多一次请求', calls.length === 2, `calls=${calls.length}`);
  await sleep(1200);
  check('AC5 无自动轮询（静置后请求数不变）', calls.length === 2, `calls=${calls.length}`);
  normal.unmount();

  // ── 缺失任务 / unknown / 契约未就绪 → 不得全部正常 ──
  const missingSnapshot = makeSnapshot();
  missingSnapshot.tasks = missingSnapshot.tasks.filter((item) => item.taskName !== 'rebalance-check');
  const missing = mount(missingSnapshot);
  await waitLoaded();
  await waitFor(() => text('[data-testid="overall-badge"]').length > 0);
  check('AC1 缺任务不显示全部正常', !text('[data-testid="overall-badge"]').includes('全部正常'),
    text('[data-testid="overall-badge"]'));
  check('AC1 缺任务卡按 unknown 占位', Boolean(card('再平衡建议'))
    && card('再平衡建议').getAttribute('data-level') === 'unknown');
  missing.unmount();

  // ── 契约未就绪 / 无运行 / 零目标 ──
  const emptySnapshot = makeSnapshot();
  emptySnapshot.tasks = emptySnapshot.tasks.map((item) => {
    if (item.taskName === 'price-integrity-check') {
      return { ...item, lastRun: null, dataStateLevel: 'unknown', dataState: { expectedCount: null, actualCount: null, missingCount: null, completenessRatio: null, skippedNoLaunchDate: null, gapAssets: [] } };
    }
    if (item.taskName === 'alert-evaluate') {
      return { ...item, contractReady: false, dataStateLevel: 'unknown', dataState: { evaluated: null, created: null, archived: null, failed: null } };
    }
    if (item.taskName === 'daily-price-sync') {
      return { ...item, dataStateLevel: 'unknown', dataState: { ...item.dataState, targetMarketDate: null, expected: 0, fetched: 0 } };
    }
    if (item.taskName === 'rebalance-check') {
      return { ...item, contractReady: false, dataStateLevel: 'unknown', dataState: { due: null, totalPortfolios: null, generatedCount: null, skippedCount: null, perPortfolio: [] } };
    }
    return item;
  });
  const empty = mount(emptySnapshot);
  await waitLoaded();
  await waitFor(() => text('[data-testid="overall-badge"]').length > 0);
  check('AC4 无运行记录空态', Boolean(card('价格完整性')) && card('价格完整性').innerText.includes('暂无运行记录'));
  check('AC4 契约未就绪空态', Boolean(card('提醒评估')) && card('提醒评估').innerText.includes('结果契约未就绪'));
  check('AC4 零目标百分比「—」且无 0%', text('[data-testid="price-percent"]') === '—'
    && !text('[data-testid="price-card"]').includes('0%'));
  check('AC3 无父结果不推断未到期', Boolean(card('再平衡建议'))
    && card('再平衡建议').innerText.includes('无父结果，未到期未知')
    && !card('再平衡建议').innerText.includes('到期 0'));
  check('AC4 空态总览不显示全部正常', !text('[data-testid="overall-badge"]').includes('全部正常'),
    text('[data-testid="overall-badge"]'));
  empty.unmount();

  // ── 单卡格式异常只影响该卡 ──
  const malformedSnapshot = makeSnapshot();
  malformedSnapshot.tasks = malformedSnapshot.tasks.map((item) => (
    item.taskName === 'price-integrity-check'
      ? { ...item, dataState: { expectedCount: null, actualCount: null, missingCount: null } }
      : item
  ));
  const malformed = mount(malformedSnapshot);
  await waitLoaded();
  await waitFor(() => text('[data-testid="overall-badge"]').length > 0);
  check('AC7 单卡格式异常只标记该卡', Boolean(card('价格完整性'))
    && card('价格完整性').getAttribute('data-level') === 'bad'
    && card('提醒评估').getAttribute('data-level') === 'ok'
    && card('再平衡建议').getAttribute('data-level') === 'ok');
  check('AC7 总览因单卡异常不显示全部正常', !text('[data-testid="overall-badge"]').includes('全部正常'));
  malformed.unmount();

  // ── 整体失败（无快照）→ 五卡统一降级 ──
  const failed = mount(null, { fail: true });
  await waitFor(() => Boolean(q('[data-testid="cron-error"]')));
  check('AC5 整体失败五卡统一降级', qa('[data-testid="price-card"]').length === 1
    && qa('[data-testid="task-card"]').length === 4
    && qa('[data-testid="task-card"]').every((item) => item.getAttribute('data-level') === 'bad'));
  check('AC5 整体失败不显示全部正常', !text('[data-testid="overall-badge"]').includes('全部正常'),
    text('[data-testid="overall-badge"]'));
  check('AC5 整体失败可重试', Boolean(q('[data-testid="cron-refresh"]')));
  failed.unmount();

  // ── 刷新失败但有旧快照 → 保留旧数据并标过时 ──
  const oldSnapshot = makeSnapshot();
  const stale = mount(oldSnapshot);
  await waitLoaded();
  api.defaults.adapter = async (config) => {
    calls.push(config.url);
    const error = new Error('Network Error');
    error.config = config;
    throw error;
  };
  q('[data-testid="cron-refresh"]').click();
  await waitFor(() => Boolean(q('[data-testid="cron-stale-warning"]')));
  check('AC5 旧快照刷新失败明示过时且保留旧数据',
    text('[data-testid="cron-stale-warning"]').includes('时快照') &&
      Boolean(q('[data-testid="price-card"]')) &&
      text('[data-testid="overall-badge"]').includes('刷新失败'));
  stale.unmount();

  // ── 053 默认骨架回归：不传 props 时仍为五个 TaskCardShell + 六区域 ──
  const shellContainer = document.createElement('div');
  document.body.appendChild(shellContainer);
  const shellRoot = createRoot(shellContainer);
  shellRoot.render(<BoardShell />);
  await waitFor(() => qa('[data-testid="task-card"]').length >= 5);
  await sleep(50);
  const shellCards = [...shellContainer.querySelectorAll('[data-testid="task-card"]')];
  const shellIds = ['card-title', 'run-state', 'last-run', 'data-ratio', 'key-metric', 'anomaly-entry'];
  check('053 默认 BoardShell 五卡结构未回退', shellCards.length === 5
    && shellIds.every((id) => shellContainer.querySelectorAll(`[data-testid="${id}"]`).length === 5));
  check('053/056 默认总览五灯仍为 unknown + 图例保留',
    shellContainer.querySelectorAll('[data-testid="health-dot"]').length === 5
      && [...shellContainer.querySelectorAll('[data-testid="health-dot"]')].every((dot) => dot.getAttribute('data-state') === 'unknown')
      && shellContainer.innerText.includes('状态图例'));
  shellRoot.unmount();
  shellContainer.remove();

  // ── 汇率非全成功：只显示可证明的观测，失败/仅观测分开 ──
  const mixedFx = makeSnapshot();
  mixedFx.tasks = mixedFx.tasks.map((item) => (
    item.taskName === 'fx-rate-sync'
      ? {
        ...item,
        dataStateLevel: 'warn',
        dataState: {
          fxCount: 3,
          currencies: {
            USD: { ok: true, rateToCny: 7.13 },
            CAD: { ok: false, rateToCny: null },
            HKD: { ok: null, rateToCny: 0.92 }
          }
        }
      }
      : item
  ));
  const mixedFxBoard = mount(mixedFx);
  await waitLoaded();
  await waitFor(() => text('[data-testid="overall-badge"]').length > 0);
  check('AC2 汇率失败/仅观测分别展示且不冒充成功', Boolean(card('汇率同步'))
    && card('汇率同步').innerText.includes('同步失败')
    && card('汇率同步').innerText.includes('仅观测')
    && card('汇率同步').innerText.includes('不证明')
    && !card('汇率同步').innerText.includes('CAD 5'));
  check('AC2 汇率非全成功总览不是全部正常', !text('[data-testid="overall-badge"]').includes('全部正常'));
  mixedFxBoard.unmount();

  // ── 再平衡显式失败：展示异常组合原因 ──
  const rebalanceFailed = makeSnapshot();
  rebalanceFailed.tasks = rebalanceFailed.tasks.map((item) => (
    item.taskName === 'rebalance-check'
      ? {
        ...item,
        dataStateLevel: 'bad',
        dataState: {
          ...item.dataState,
          perPortfolio: item.dataState.perPortfolio.map((row) => (
            row.portfolioId === 'p2'
              ? { ...row, status: 'FAILED', failureReason: 'DB_TIMEOUT', needsRebalance: null, suggestionsCount: null }
              : row
          ))
        }
      }
      : item
  ));
  const rebalanceFailedBoard = mount(rebalanceFailed);
  await waitLoaded();
  await waitFor(() => text('[data-testid="overall-badge"]').length > 0);
  check('AC3 再平衡显式失败与异常原因可见', Boolean(card('再平衡建议'))
    && card('再平衡建议').innerText.includes('失败')
    && card('再平衡建议').innerText.includes('DB_TIMEOUT'));
  check('AC3 再平衡失败总览不是全部正常', !text('[data-testid="overall-badge"]').includes('全部正常'));
  rebalanceFailedBoard.unmount();

  // ── 僵尸 RUNNING → stale 展示，不全部正常 ──
  const staleRun = makeSnapshot();
  staleRun.tasks = staleRun.tasks.map((item) => (
    item.taskName === 'daily-price-sync'
      ? { ...item, stale: true, lastRun: { ...item.lastRun, status: 'STALE', rawStatus: 'RUNNING' } }
      : item
  ));
  const staleBoard = mount(staleRun);
  await waitLoaded();
  await waitFor(() => text('[data-testid="overall-badge"]').length > 0);
  check('AC4 僵尸基于 API stale 标记展示', text('[data-testid="price-card"]').includes('超时未完成'));
  check('AC4 stale 不让总览全部正常', !text('[data-testid="overall-badge"]').includes('全部正常'));
  staleBoard.unmount();
}

window.addEventListener('error', (event) => {
  failures.push(`window_error=${event.message}`);
});

setTimeout(async () => {
  try {
    await runScenarios();
  } catch (error) {
    failures.push(error && error.message ? error.message : String(error));
    failures.push(`body=${document.body ? document.body.innerText.slice(0, 800) : 'no body'}`);
    failures.push(`root=${document.getElementById('root') ? document.getElementById('root').innerHTML.slice(0, 800) : 'no root'}`);
  }
  const failed = results.filter((item) => !item.ok);
  const payload = { results, failures };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  document.getElementById('results').textContent = btoa(binary);
}, 100);
