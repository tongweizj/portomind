// client/scripts/verify-task-056.cjs
//
// TASK-056 验收脚本（AC1～AC8；AC9 由 build/lint 在外层执行）。
//
// 设计：
//   - 静态断言（AC1/AC3/AC8）：直接扫描源码，期望值来自 Task §3 与计划 §10.1；
//   - 浏览器断言（AC2/AC4/AC5/AC6/AC7）：启动 Vite 开发服务器 + 本机 Chrome（headless --dump-dom），
//     由 client/scripts/fixtures/task056-fixture.jsx 在真实页面里用 getComputedStyle 取计算色。
//   - 不新增依赖：只使用 Node 内置模块 + 本机已安装的 Chrome；playwright-core 不可用。
//
// 用法：
//   node client/scripts/verify-task-056.cjs              # 全量
//   node client/scripts/verify-task-056.cjs --static-only  # 只跑 AC1/AC3/AC8（用于 AC3 负向对照）
//   CHROME_PATH=... node client/scripts/verify-task-056.cjs
//
// 退出码：0 全部 PASS；1 有失败；2 运行期错误（浏览器/服务器启动失败等）。

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const CLIENT_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(CLIENT_DIR, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const STATIC_ONLY = process.argv.includes('--static-only');
const FIXTURE_PATH = '/scripts/fixtures/task056-fixture.html';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function walkFiles(dir, extensions) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
    }
  }
  return out;
}

function posixRelative(file) {
  return path.relative(CLIENT_DIR, file).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// 静态断言：AC1 / AC3 / AC8
// ---------------------------------------------------------------------------
function staticChecks() {
  const tokensSource = fs.readFileSync(path.join(CLIENT_DIR, 'src/constants/design-tokens.js'), 'utf8');
  const names = ['statusOk', 'statusWarn', 'statusBad', 'statusIdle'];
  const missing = names.filter((name) => !new RegExp(`\\b${name}\\s*:`).test(tokensSource));
  check('AC1 design-tokens 新增 4 个系统状态 token', missing.length === 0, `missing=${missing.join(',') || 'none'}`);

  const statusValues = names
    .map((name) => (tokensSource.match(new RegExp(`\\b${name}\\s*:\\s*'([^']+)'`)) || [])[1])
    .filter(Boolean);
  check('AC1 4 个状态 token 均为独立色值（互不相同）', new Set(statusValues).size === 4, statusValues.join(','));
  check(
    'AC1 未复用行情 token：status 值与 up/down 不同名不同值',
    !/status\w*\s*:\s*colors\.(up|down)/.test(tokensSource) &&
      tokensSource.includes("up: '#DF1B41'") &&
      tokensSource.includes("down: '#0E9F6E'") &&
      !statusValues.includes('#DF1B41') &&
      !statusValues.includes('#0E9F6E'),
    `status=${statusValues.join(',')}`
  );

  // AC3：看板子树不得出现行情语义 token / Tailwind 涨跌色
  const cronFiles = walkFiles(path.join(CLIENT_DIR, 'src/components/CronStatus'), ['.js', '.jsx']);
  const forbiddenPattern = /colors\.(up|down)\b|text-red-500|text-emerald-500/g;
  const ac3Hits = [];
  for (const file of cronFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(forbiddenPattern)) {
      ac3Hits.push(`${posixRelative(file)}:${match[0]}`);
    }
  }
  check('AC3 CronStatus/ 零引用行情语义 token（colors.up|down / text-red-500 / text-emerald-500）', ac3Hits.length === 0, ac3Hits.join(', ') || '0 matches');

  // AC8：up/down 消费方集合与基线完全一致（7 文件 13 处）
  const BASELINE = {
    'src/pages/Account.jsx': 1,
    'src/pages/AccountUsers.jsx': 3,
    'src/pages/Asset/AssetDetail.jsx': 2,
    'src/pages/Asset/AssetList.jsx': 1,
    'src/components/portfolio/KpiCards.jsx': 2,
    'src/components/portfolio/PositionOverview.jsx': 1,
    'src/utils/priceDisplay.js': 3
  };
  const srcFiles = walkFiles(path.join(CLIENT_DIR, 'src'), ['.js', '.jsx']);
  const consumers = {};
  for (const file of srcFiles) {
    const relative = posixRelative(file);
    const count = fs.readFileSync(file, 'utf8').split(String.fromCharCode(10)).filter((line) => line.includes('colors.up') || line.includes('colors.down')).length;
    if (count > 0) consumers[relative] = count;
  }
  const expectedKeys = Object.keys(BASELINE).sort();
  const actualKeys = Object.keys(consumers).sort();
  const sameFiles = JSON.stringify(expectedKeys) === JSON.stringify(actualKeys);
  const sameCounts = expectedKeys.every((key) => consumers[key] === BASELINE[key]);
  const total = Object.values(consumers).reduce((sum, value) => sum + value, 0);
  check(
    'AC8 colors.up/down 消费方集合与基线完全一致（7 文件 13 处）',
    sameFiles && sameCounts && total === 13,
    `files=${actualKeys.length} total=${total} ${sameFiles ? '' : `keys=${actualKeys.join(',')}`}`
  );
}

// ---------------------------------------------------------------------------
// 浏览器断言：AC2 / AC4 / AC5 / AC6 / AC7
// ---------------------------------------------------------------------------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForUrl(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}: ${lastError}`);
}

function killTree(child) {
  if (!child || child.killed) return;
  try {
    execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (__) { /* noop */ }
  }
}

async function browserChecks() {
  const port = await findFreePort();
  const base = `http://127.0.0.1:${port}`;
  const viteBin = path.join(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) throw new Error(`vite not found: ${viteBin}`);
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME}`);

  const vite = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: CLIENT_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let viteLog = '';
  vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task056-chrome-'));
  try {
    await waitForUrl(`${base}${FIXTURE_PATH}`);
    // 预热 Vite 模块转换 / 依赖优化，避免 Chrome 首访拿到 504 Outdated Optimize Dep
    await waitForUrl(`${base}/scripts/fixtures/task056-fixture.jsx`);
    await waitForUrl(`${base}/@vite/client`);
    await sleep(800);

    const chromeArgs = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`,
      '--window-size=1440,900',
      '--virtual-time-budget=15000',
      '--dump-dom',
      `${base}${FIXTURE_PATH}`
    ];

    let dom = '';
    try {
      dom = execFileSync(CHROME, chromeArgs, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 90000 });
    } catch (error) {
      throw new Error(`chrome failed: ${error.message}\nchrome stderr:\n${(error.stderr || '').slice(-2000)}`);
    }

    const match = dom.match(/<pre id="results">([A-Za-z0-9+/=]+)<\/pre>/);
    if (!match) {
      throw new Error(`fixture produced no results. dom tail:\n${dom.slice(-3000)}\nvite log tail:\n${viteLog.slice(-1500)}`);
    }
    const payload = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    if (payload === null || !Array.isArray(payload.results)) throw new Error('invalid fixture payload');

    for (const result of payload.results) {
      check(result.name, result.ok, result.detail);
    }
    console.log('\nAC7 对比度实测（浏览器计算色 + WCAG 公式，背景 = bgCard）：');
    for (const row of payload.contrast) {
      console.log(`  ${row.level.padEnd(7)} ${row.token.padEnd(10)} fg=${row.fg} bg=${row.bg} ratio=${row.ratio}`);
    }
    console.log(`  视口：${payload.viewport.width}x${payload.viewport.height}`);
  } finally {
    killTree(vite);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function main() {
  staticChecks();
  if (!STATIC_ONLY) await browserChecks();

  const failed = results.filter((item) => !item.ok);
  console.log(`\n===== TASK-056 验收：${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    console.log('FAILED:');
    for (const item of failed) console.log(` - ${item.name} — ${item.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error('CRASH', error && error.stack ? error.stack : error);
  process.exitCode = 2;
});
