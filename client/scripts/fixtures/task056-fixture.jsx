// client/scripts/fixtures/task056-fixture.jsx
//
// TASK-056 验收夹具（不属于产品代码，只由 client/scripts/verify-task-056.cjs 使用）。
// 目的：在真实浏览器里渲染 BoardShell / StatusLegend，用 getComputedStyle 取计算色，
// 逐条验证 AC2（计算色 == token）、AC4（首屏可见）、AC5（非颜色标识）、AC6（灰 ≠ 正常）、AC7（对比度）。
//
// 断言不硬编码 hex/rgb/oklch：token 一侧通过隐藏探针元素（style.color = colors[token]）
// 取得浏览器归一化后的计算色，再与被测元素的计算色做字符串比较。

import { createRoot } from 'react-dom/client';
import BoardShell from '../../src/components/CronStatus/BoardShell';
import { colors } from '../../src/constants/design-tokens';
import { STATUS_TONE, getStatusTone } from '../../src/components/CronStatus/statusTone';

const results = [];
const contrast = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
}

function Probe({ token }) {
  return (
    <span data-probe={token} style={{ color: colors[token] }}>
      {token}
    </span>
  );
}

function App() {
  const unknownTone = getStatusTone('unknown');
  return (
    <div style={{ padding: 24, backgroundColor: colors.bgPage }}>
      <BoardShell />
      {/* 映射层 unknown 样例：证明「无 taskrun」用灰 + 未运行/暂无记录，而非成功 */}
      <div
        data-testid="unknown-sample"
        style={{ marginTop: 16, color: unknownTone.color, fontSize: 12 }}
      >
        <span data-testid="unknown-sample-label">{unknownTone.label}</span>
        <span data-testid="unknown-sample-note">暂无记录</span>
      </div>
      <div style={{ display: 'none' }} aria-hidden="true">
        {Object.keys(colors)
          .filter((key) => key.startsWith('status') || key === 'bgCard' || key === 'bgPage')
          .map((token) => (
            <Probe key={token} token={token} />
          ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
setTimeout(runChecks, 400);

function computedColorOfToken(token) {
  const el = document.querySelector(`[data-probe="${token}"]`);
  return el ? getComputedStyle(el).color : null;
}

function parseRgb(value) {
  const match = String(value).match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return parts.slice(0, 3);
}

function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

function runChecks() {
  const legend = document.querySelector('[data-testid="status-legend"]');
  const items = legend ? [...legend.querySelectorAll('[data-testid="legend-item"]')] : [];

  // ── AC2：4 个样本各渲染一次，计算色 == 对应 token 的计算色 ──
  check('AC2 图例恰好渲染 4 个状态样本', items.length === 4, `count=${items.length}`);
  const seenComputedColors = new Set();
  for (const item of items) {
    const level = item.getAttribute('data-status');
    const tone = STATUS_TONE[level];
    const swatch = item.querySelector('[data-testid="legend-swatch"]');
    const actual = swatch ? getComputedStyle(swatch).backgroundColor : null;
    const expected = tone ? computedColorOfToken(tone.token) : null;
    seenComputedColors.add(String(actual));
    check(
      `AC2 ${level} 计算色 == ${tone ? tone.token : 'missing'} token 计算色`,
      Boolean(actual && expected && actual === expected),
      `actual=${actual} expected=${expected}`
    );
  }
  check('AC2 四种状态计算色互不相同', seenComputedColors.size === 4, [...seenComputedColors].join(' | '));

  // ── AC4：首屏可见 + 文案显式说明与行情页无关 ──
  const rect = legend ? legend.getBoundingClientRect() : null;
  check(
    'AC4 图例首屏可见（无需滚动）',
    Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight),
    rect ? `top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)} innerHeight=${window.innerHeight}` : 'no legend'
  );
  const legendText = legend ? legend.innerText : '';
  check(
    'AC4 文案写明「红=坏、绿=好」且与行情页红涨绿跌无关',
    legendText.includes('红=坏、绿=好') && legendText.includes('行情页'),
    legendText.slice(0, 160)
  );

  // ── AC5：每种状态都有文字/图标（不依赖颜色） ──
  const expectedLabels = { ok: '正常', warn: '需关注', bad: '失败', unknown: '未运行' };
  for (const item of items) {
    const level = item.getAttribute('data-status');
    const icon = item.querySelector('[data-testid="legend-icon"]');
    const text = item.innerText || '';
    check(
      `AC5 ${level} 含文字「${expectedLabels[level]}」且图标非空`,
      text.includes(expectedLabels[level]) && Boolean(icon && icon.textContent.trim()),
      `text=${text}`
    );
  }

  // ── AC6：灰 ≠ 正常；无 taskrun 场景不出现成功语义 ──
  const grid = document.querySelector('[data-testid="task-card-grid"]');
  const gridText = grid ? grid.innerText : '';
  const cards = grid ? [...grid.querySelectorAll('[data-testid="task-card"]')] : [];
  check(
    'AC6 无 taskrun 场景：5 卡均为 unknown 灰态',
    cards.length === 5 && cards.every((card) => card.getAttribute('data-state') === 'unknown'),
    `cards=${cards.length}`
  );
  check(
    'AC6 卡片区不出现「正常 / 全部良好」',
    !gridText.includes('正常') && !gridText.includes('全部良好'),
    gridText.slice(0, 120)
  );
  const badge = cards[0] ? cards[0].querySelector('[data-testid="run-state"]') : null;
  const badgeBg = badge ? getComputedStyle(badge).backgroundColor : null;
  const pageBg = computedColorOfToken('bgPage');
  check(
    'AC6 卡片运行态徽章为中性灰（与 bgPage 计算色一致）',
    Boolean(badgeBg && pageBg && badgeBg === pageBg),
    `badgeBg=${badgeBg} pageBg=${pageBg}`
  );
  const unknownTone = getStatusTone('unknown');
  check(
    'AC6 unknown 映射 = statusIdle + 未运行（未映射成成功）',
    unknownTone.token === 'statusIdle' && unknownTone.label === '未运行' && unknownTone.level !== 'ok',
    `token=${unknownTone.token} label=${unknownTone.label}`
  );
  const sample = document.querySelector('[data-testid="unknown-sample"]');
  const sampleColor = sample ? getComputedStyle(sample).color : null;
  const idleColor = computedColorOfToken('statusIdle');
  check(
    'AC6 无记录样例为灰色且文案含「未运行 / 暂无记录」',
    Boolean(sampleColor && idleColor && sampleColor === idleColor) &&
      Boolean(sample && sample.innerText.includes('未运行') && sample.innerText.includes('暂无记录')),
    `color=${sampleColor} text=${sample ? sample.innerText : ''}`
  );

  // ── TASK-053 结构回归：新增图例行不得破坏 053 已验收断言 ──
  const board = document.querySelector('[data-testid="board-shell"]');
  const healthDots = [...document.querySelectorAll('[data-testid="health-dot"]')];
  check(
    '053 回归：总览条恰好 5 灯且状态全为 unknown',
    healthDots.length === 5 && healthDots.every((dot) => dot.getAttribute('data-state') === 'unknown'),
    'dots=' + healthDots.length
  );
  check(
    '053 回归：1 个整体徽章 + 1 行快照位',
    document.querySelectorAll('[data-testid="overall-badge"]').length === 1 &&
      document.querySelectorAll('[data-testid="snapshot-at"]').length === 1
  );
  const boardText = board ? board.innerText : '';
  const badTokens = ['undefined', 'NaN', 'Invalid Date', 'null'].filter((token) => boardText.includes(token));
  check('053 回归：board-shell 无 undefined/NaN/Invalid Date/null', badTokens.length === 0, badTokens.join(','));
  const sixRegions = ['card-title', 'run-state', 'last-run', 'data-ratio', 'key-metric', 'anomaly-entry'];
  check(
    '053 回归：五卡六区域各 5 个',
    sixRegions.every((id) => document.querySelectorAll('[data-testid="' + id + '"]').length === 5)
  );
  const dotColors = healthDots.map((dot) => {
    const span = dot.querySelector('span');
    return span ? getComputedStyle(span).backgroundColor : '';
  });
  const isGreenish = (value) => {
    const match = String(value).match(/rgba?(([^)]+))/);
    if (!match) return false;
    const [r, g, b] = match[1].split(/[,s/]+/).filter(Boolean).map(Number);
    return g > r + 25 && g > b + 25;
  };
  check('053 回归：5 个健康灯无绿色（骨架不得暗示成功）', dotColors.length === 5 && dotColors.every((color) => !isGreenish(color)));

  // ── AC7：4 token 作文字色在 bgCard 上的对比度（浏览器计算色 + WCAG 公式） ──
  const bg = parseRgb(computedColorOfToken('bgCard'));
  for (const [level, tone] of Object.entries(STATUS_TONE)) {
    const fg = parseRgb(computedColorOfToken(tone.token));
    const ratio = fg && bg ? contrastRatio(fg, bg) : null;
    contrast.push({
      level,
      token: tone.token,
      fg: computedColorOfToken(tone.token),
      bg: computedColorOfToken('bgCard'),
      ratio: ratio ? Number(ratio.toFixed(2)) : null
    });
    check(
      `AC7 ${level} / ${tone.token} 对比度 ≥ 4.5:1`,
      Boolean(ratio && ratio >= 4.5),
      `ratio=${ratio ? ratio.toFixed(2) : 'n/a'}`
    );
  }

  const payload = { results, contrast, viewport: { width: window.innerWidth, height: window.innerHeight } };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  document.getElementById('results').textContent = btoa(binary);
}

window.addEventListener('error', (event) => {
  const pre = document.getElementById('results');
  if (pre) pre.textContent = `ERROR:${event.message}`;
});
