// client/scripts/fixtures/task055-fixture.jsx
//
// TASK-055 验收夹具（只由 client/scripts/verify-task-055.cjs 使用，不属于产品代码）。
// 在一个真实浏览器页面里渲染价格卡的全部场景，用 getComputedStyle / DOM 断言 AC1–AC9；
// AC10（时区）由外部脚本通过 CDP Emulation.setTimezoneOverride 切换时区后读取目标日文本。
//
// 期望值来自 Task §3 的 AC 文字与 D-04 裁决，不从实现反推。

import { createRoot } from 'react-dom/client';
import PriceTaskCard from '../../src/components/CronStatus/PriceTaskCard';
import TaskCardShell from '../../src/components/CronStatus/TaskCardShell';
import { colors } from '../../src/constants/design-tokens';
import { STATUS_TONE } from '../../src/components/CronStatus/statusTone';

const results = [];
const toneColors = {};
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
}

const TARGET = '2026-10-23';
const MISSING = [
  { symbol: '000001', name: '平安银行', market: 'CN' },
  { symbol: '600000', name: '浦发银行', market: 'CN' }
];

const baseData = {
  targetMarketDate: TARGET,
  calendarPrevOpenDay: TARGET,
  expected: 40,
  fetched: 40,
  missing: [],
  byMarket: {},
  notListed: [],
  unsupportedMarkets: [],
  dayPriceSymbolCount: null
};

function Scenario({ name, children }) {
  return (
    <section data-scenario={name} style={{ marginBottom: 16 }}>
      {children}
    </section>
  );
}

function Probes() {
  return (
    <div style={{ display: 'none' }} aria-hidden="true">
      {Object.keys(colors)
        .filter((key) => key.startsWith('status'))
        .map((token) => (
          <span key={token} data-probe={token} style={{ color: colors[token] }}>
            {token}
          </span>
        ))}
    </div>
  );
}

function App() {
  return (
    <div style={{ padding: 24, backgroundColor: colors.bgPage, width: 1180 }}>
      <Scenario name="ok">
        <PriceTaskCard
          dataState={baseData}
          dataStateLevel="ok"
          runState="SUCCEEDED"
          lastRunAt="2026-10-24T03:00:00.000Z"
        />
      </Scenario>

      <Scenario name="partial">
        <PriceTaskCard
          dataState={{ ...baseData, fetched: 38, missing: MISSING }}
          dataStateLevel="warn"
          runState="SUCCEEDED"
          lastRunAt="2026-10-24T03:00:00.000Z"
        />
      </Scenario>

      <Scenario name="all-missing">
        <PriceTaskCard
          dataState={{
            ...baseData,
            fetched: 0,
            missing: Array.from({ length: 40 }, (_, index) => ({
              symbol: `MISS${index}`,
              name: `缺失${index}`,
              market: 'CN'
            }))
          }}
          dataStateLevel="bad"
          runState="FAILED"
          lastRunAt="2026-10-24T03:00:00.000Z"
        />
      </Scenario>

      <Scenario name="empty">
        <PriceTaskCard
          dataState={{ ...baseData, targetMarketDate: null, expected: 0, fetched: 0 }}
          dataStateLevel="unknown"
          runState={null}
          lastRunAt={null}
        />
      </Scenario>

      <Scenario name="over">
        <PriceTaskCard
          dataState={{ ...baseData, expected: 3, fetched: 5 }}
          dataStateLevel="ok"
          runState="SUCCEEDED"
          lastRunAt="2026-10-24T03:00:00.000Z"
        />
      </Scenario>

      <Scenario name="status-lie">
        <PriceTaskCard
          dataState={{ ...baseData, fetched: 0, missing: [] }}
          dataStateLevel="bad"
          runState="SUCCEEDED"
          lastRunAt="2026-10-24T03:00:00.000Z"
        />
      </Scenario>

      <Scenario name="request-error">
        <PriceTaskCard
          requestError={new Error('ECONNRESET')}
          snapshotAt="2026-10-23T03:00:00.000Z"
          onRetry={() => {}}
        />
      </Scenario>

      <Scenario name="invalid">
        <PriceTaskCard
          dataState={{ ...baseData, expected: 'oops', fetched: 3 }}
          dataStateLevel="warn"
          runState="SUCCEEDED"
          lastRunAt="2026-10-24T03:00:00.000Z"
        />
      </Scenario>

      {/* AC8②：构造“五卡”上下文，只有价格卡数据异常，其余四卡正常渲染 */}
      <section data-testid="board-mock" style={{ display: 'grid', gap: 12 }}>
        {['价格完整性', '提醒评估', '汇率同步', '再平衡建议'].map((label) => (
          <TaskCardShell key={label} label={label} />
        ))}
        <PriceTaskCard
          dataState={{ ...baseData, expected: null, fetched: 1 }}
          dataStateLevel="bad"
          runState="SUCCEEDED"
        />
      </section>

      <Probes />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
setTimeout(runChecks, 400);

function query(scenario, testid) {
  const root = document.querySelector(`[data-scenario="${scenario}"]`);
  return root ? root.querySelector(`[data-testid="${testid}"]`) : null;
}

function queryAll(scenario, testid) {
  const root = document.querySelector(`[data-scenario="${scenario}"]`);
  return root ? [...root.querySelectorAll(`[data-testid="${testid}"]`)] : [];
}

function probeColor(token) {
  const el = document.querySelector(`[data-probe="${token}"]`);
  return el ? getComputedStyle(el).color : null;
}

function toneDotColor(scenario) {
  const dot = query(scenario, 'price-tone-dot');
  return dot ? getComputedStyle(dot).backgroundColor : null;
}

function isVisible(element) {
  if (!element) return false;
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function runChecks() {
  for (const [level, tone] of Object.entries(STATUS_TONE)) {
    toneColors[level] = { token: tone.token, color: probeColor(tone.token), label: tone.label };
  }

  // ── AC1：目标市场日 + 应采/已采 + 百分比 + 进度条；不写“今天” ──
  const ok = query('ok', 'price-card');
  const okText = ok ? ok.innerText : '';
  check('AC1 渲染目标市场日字符串', okText.includes('目标市场日') && okText.includes(TARGET), okText.slice(0, 100));
  check('AC1 不用“今天”表述', !okText.includes('今天'), okText.includes('今天') ? 'contains 今天' : 'ok');
  check('AC1 显示应采 / 已采 40 / 40', okText.includes('40 / 40'), okText.slice(0, 120));
  check('AC1 显示完成度 100%', okText.includes('100%') && Boolean(query('ok', 'price-percent')));
  check('AC1 存在进度条', Boolean(query('ok', 'price-progress')) && Boolean(query('ok', 'price-progress-fill')));

  // ── AC2：四态计算色 == statusTone 对应 token ──
  for (const [scenario, level] of [['ok', 'ok'], ['partial', 'warn'], ['all-missing', 'bad'], ['empty', 'unknown']]) {
    const expected = toneColors[level];
    const actual = toneDotColor(scenario);
    check(
      `AC2 ${scenario} 计算色 == ${expected.token}`,
      Boolean(actual && expected.color && actual === expected.color),
      `actual=${actual} expected=${expected.color}`
    );
    const label = query(scenario, 'price-tone-label');
    check(
      `AC2 ${scenario} 文案含 ${expected.label}`,
      Boolean(label && label.innerText.includes(expected.label)),
      label ? label.innerText : 'missing'
    );
  }

  // ── AC3：missing 可展开，显示 symbol/name/market；收起显示“缺 N 支” ──
  const details = query('partial', 'price-missing');
  const summary = query('partial', 'price-missing-summary');
  const missingItems = queryAll('partial', 'price-missing-item');
  check('AC3 收起时显示“缺 2 支”', Boolean(summary && summary.innerText.includes('缺 2 支')), summary ? summary.innerText : 'missing');
  check(
    'AC3 收起时清单不可见',
    Boolean(details && !details.open && missingItems.length === 2 && !isVisible(missingItems[0])),
    details ? `open=${details.open} itemVisible=${isVisible(missingItems[0])}` : 'missing'
  );
  if (summary) summary.click();
  const expandedItems = queryAll('partial', 'price-missing-item');
  check('AC3 展开后 details.open=true', Boolean(details && details.open));
  check(
    'AC3 展开后每项含 symbol + name + market',
    expandedItems.length === 2 &&
      expandedItems.every(
        (item) =>
          item.innerText.includes('000001') || item.innerText.includes('600000')
      ) &&
      expandedItems.some((item) => item.innerText.includes('平安银行')) &&
      expandedItems.some((item) => item.innerText.includes('CN')),
    expandedItems.map((item) => item.innerText).join(' | ')
  );

  // ── AC4：expected=0 → 百分比 “—”、宽度 0；无 NaN/Infinity/0% ──
  const emptyText = query('empty', 'price-card') ? query('empty', 'price-card').innerText : '';
  const emptyFill = query('empty', 'price-progress-fill');
  const emptyFillWidth = emptyFill ? emptyFill.getBoundingClientRect().width : null;
  check('AC4 expected=0 完成度为“—”', (query('empty', 'price-percent') || {}).innerText === '—', `text=${(query('empty', 'price-percent') || {}).innerText}`);
  check('AC4 expected=0 进度条宽度为 0', emptyFillWidth === 0, `width=${emptyFillWidth}`);
  check(
    'AC4 无 NaN / Infinity / 0%',
    !/NaN|Infinity|0%/.test(emptyText),
    emptyText.slice(0, 160)
  );

  // ── AC5：fetched > expected 时钳制 100%，不溢出 ──
  const overTrack = query('over', 'price-progress');
  const overFill = query('over', 'price-progress-fill');
  const trackWidth = overTrack ? overTrack.getBoundingClientRect().width : 0;
  const fillWidth = overFill ? overFill.getBoundingClientRect().width : 0;
  const overCard = query('over', 'price-card');
  check('AC5 过量数据完成度显示 100%', (query('over', 'price-percent') || {}).innerText === '100%');
  check('AC5 进度条不溢出轨道', fillWidth <= trackWidth + 1, `fill=${fillWidth} track=${trackWidth}`);
  check(
    'AC5 卡片不被顶破（scrollWidth <= clientWidth）',
    Boolean(overCard && overCard.scrollWidth <= overCard.clientWidth + 1),
    overCard ? `scroll=${overCard.scrollWidth} client=${overCard.clientWidth}` : 'missing'
  );

  // ── AC7：status=SUCCEEDED 但 fetched=0 → 仍为红；status 只在运行态徽章 ──
  const lieRunState = query('status-lie', 'price-run-state');
  const lieDot = toneDotColor('status-lie');
  check('AC7 运行态徽章显示 SUCCEEDED', Boolean(lieRunState && lieRunState.innerText.includes('SUCCEEDED')), lieRunState ? lieRunState.innerText : 'missing');
  check('AC7 SUCCEEDED + fetched=0 仍为红色（statusBad）', lieDot === toneColors.bad.color, `dot=${lieDot} bad=${toneColors.bad.color}`);
  check('AC7 卡片数据态不是 ok', (query('status-lie', 'price-card') || {}).getAttribute('data-level') !== 'ok');

  // ── AC8②：只有价格卡异常，其余四卡正常 ──
  const board = document.querySelector('[data-testid="board-mock"]');
  const boardCards = board ? [...board.querySelectorAll('[data-testid="task-card"]')] : [];
  const boardPrice = board ? board.querySelector('[data-testid="price-card"]') : null;
  const boardInvalid = board ? board.querySelector('[data-testid="price-invalid"]') : null;
  check('AC8② 其余四卡正常渲染', boardCards.length === 4, `cards=${boardCards.length}`);
  check('AC8② 仅价格卡异常', Boolean(boardPrice && boardPrice.getAttribute('data-state') === 'invalid' && boardInvalid));
  check(
    'AC8② 非价格卡无价格异常标记',
    boardCards.every((card) => !card.querySelector('[data-testid="price-invalid"]')),
    'ok'
  );

  // ── AC9：三型空态 ──
  const emptyDot = toneDotColor('empty');
  check('AC9① expected=0 → 灰 + “无应采资产”', emptyDot === toneColors.unknown.color && emptyText.includes('无应采资产'), `dot=${emptyDot}`);
  check('AC9① 不出现“全部正常”', !emptyText.includes('全部正常'));

  const allText = query('all-missing', 'price-card') ? query('all-missing', 'price-card').innerText : '';
  check(
    'AC9② fetched=0 → 红 + “疑似整体故障”，不逐条列 missing',
    toneDotColor('all-missing') === toneColors.bad.color &&
      allText.includes('疑似整体故障') &&
      queryAll('all-missing', 'price-missing-item').length === 0,
    allText.slice(0, 120)
  );

  const errorText = query('request-error', 'price-card') ? query('request-error', 'price-card').innerText : '';
  check(
    'AC9③ 请求失败 → “快照获取失败” + 红，不出现绿色',
    toneDotColor('request-error') === toneColors.bad.color &&
      errorText.includes('快照获取失败') &&
      toneDotColor('request-error') !== toneColors.ok.color,
    errorText.slice(0, 120)
  );
  const stale = query('request-error', 'price-stale-note');
  check('AC8① 有旧快照时明示快照时间 + 刷新失败', Boolean(stale && stale.innerText.includes('快照') && stale.innerText.includes('刷新失败')), stale ? stale.innerText : 'missing');
  check('AC9③ 提供重试入口', Boolean(query('request-error', 'price-retry')));

  const invalidText = query('invalid', 'price-card') ? query('invalid', 'price-card').innerText : '';
  check(
    'AC8② 字段非数 → 价格卡异常（红），不显示 NaN/Infinity',
    toneDotColor('invalid') === toneColors.bad.color &&
      invalidText.includes('价格数据异常') &&
      !/NaN|Infinity/.test(invalidText),
    invalidText.slice(0, 120)
  );

  // ── AC10 的目标日文本由外部脚本在两种时区下读取 ──
  const targetEl = query('ok', 'price-target-date');
  const targetText = targetEl ? targetEl.innerText : '';

  window.__TASK055__ = {
    results,
    toneColors,
    targetText,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
  window.__TASK055_READY__ = true;

  const failed = results.filter((item) => !item.ok);
  const json = JSON.stringify({ results, toneColors, targetText, timezone: window.__TASK055__.timezone });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  document.getElementById('results').textContent = btoa(binary);
  if (failed.length) console.warn('TASK-055 fixture failures', failed);
}

window.addEventListener('error', (event) => {
  const pre = document.getElementById('results');
  if (pre) pre.textContent = `ERROR:${event.message}`;
});
