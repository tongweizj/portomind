// client/scripts/verify-task-055.cjs
//
// TASK-055 验收脚本（AC1–AC10；AC11 由外层 build/lint 执行）。
//
// 无新增依赖：
//   - 静态断言：AC6（唯一换算）、不硬编码状态色、不重算目标日；
//   - 浏览器断言：本机 Chrome（headless）+ Vite dev server + 原生 CDP（Node 24 内置 WebSocket）；
//     夹具 client/scripts/fixtures/task055-fixture.jsx 覆盖 AC1–AC9；
//   - AC10：CDP Emulation.setTimezoneOverride 切 UTC+8 / UTC-7，比较目标日文本。
//
// 用法：node client/scripts/verify-task-055.cjs
// 退出码：0 全 PASS；1 有失败；2 运行期错误。

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const CLIENT_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(CLIENT_DIR, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FIXTURE_PATH = '/scripts/fixtures/task055-fixture.html';

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

function staticChecks() {
  const cronDir = path.join(CLIENT_DIR, 'src/components/CronStatus');
  const sourceFiles = walkFiles(cronDir, ['.js', '.jsx']);
  const sources = sourceFiles.map((file) => ({
    file,
    relative: path.relative(CLIENT_DIR, file).split(path.sep).join('/'),
    content: fs.readFileSync(file, 'utf8')
  }));

  // AC6：整个 CronStatus 目录只允许一处 "* 100"
  let conversionCount = 0;
  const conversionFiles = [];
  for (const source of sources) {
    const matches = source.content.match(/\* 100/g) || [];
    if (matches.length > 0) {
      conversionCount += matches.length;
      conversionFiles.push(`${source.relative}:${matches.length}`);
    }
  }
  check('AC6 展示换算在 CronStatus/ 内只有一处（grep "* 100" ≤ 1）', conversionCount === 1, `count=${conversionCount} files=${conversionFiles.join(',')}`);

  const priceSources = sources.filter((source) => /priceDataState\.js$|PriceTaskCard\.jsx$/.test(source.file));
  check('AC6 换算相关文件存在', priceSources.length === 2, priceSources.map((s) => s.relative).join(','));

  const mutationPattern = /dataState\s*\.\s*(expected|fetched|targetMarketDate)\s*=/;
  const mutations = priceSources.filter((source) => mutationPattern.test(source.content));
  check('AC6 不修改业务字段（expected/fetched/targetMarketDate）', mutations.length === 0, mutations.map((s) => s.relative).join(','));

  const hexPattern = /['"]#[0-9a-fA-F]{3,6}['"]/;
  const hardcoded = priceSources.filter((source) => hexPattern.test(source.content));
  check('AC2 价格卡文件无硬编码色值（必须走 statusTone）', hardcoded.length === 0, hardcoded.map((s) => s.relative).join(','));

  const datePattern = /new Date\s*\(|toLocaleDateString|toLocaleTimeString/;
  const dateUsage = priceSources.filter((source) => datePattern.test(source.content));
  check('AC10 价格卡不重算/本地化目标日', dateUsage.length === 0, dateUsage.map((s) => s.relative).join(','));

  const statusPattern = /lastRun\s*\.\s*status|\.status\s*===\s*['"]SUCCEEDED/;
  const statusUsage = priceSources.filter((source) => statusPattern.test(source.content));
  check('AC7 数据态文件不读取 lastRun.status', statusUsage.length === 0, statusUsage.map((s) => s.relative).join(','));
}

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

async function connectCdp(wsUrl) {
  if (typeof globalThis.WebSocket !== 'function') throw new Error('Node WebSocket unavailable');
  const socket = new globalThis.WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('CDP websocket error'));
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    } catch (_) {
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const pendingEntry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) pendingEntry.reject(new Error(message.error.message || 'CDP error'));
    else pendingEntry.resolve(message.result);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      try { socket.close(); } catch (_) { /* noop */ }
    }
  };
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'evaluate failed');
  }
  return response.result ? response.result.value : undefined;
}

async function waitForFixture(cdp) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await evaluate(cdp, 'Boolean(window.__TASK055_READY__)');
    if (ready) return;
    const errorText = await evaluate(
      cdp,
      "document.getElementById('results') ? document.getElementById('results').textContent : ''"
    );
    if (errorText && String(errorText).startsWith('ERROR:')) {
      throw new Error(`fixture error: ${errorText}`);
    }
    await sleep(150);
  }
  const dom = await evaluate(cdp, "document.body ? document.body.innerText.slice(0, 800) : ''");
  throw new Error(`timeout waiting for fixture; body=${dom}`);
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

  const debugPort = await findFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task055-chrome-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  let cdp = null;
  try {
    await waitForUrl(`${base}${FIXTURE_PATH}`);
    await waitForUrl(`${base}/scripts/fixtures/task055-fixture.jsx`);
    await waitForUrl(`${base}/@vite/client`);
    await sleep(700);

    await waitForUrl(`http://127.0.0.1:${debugPort}/json/version`, 30000);
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const pageTarget = targets.find((target) => target.type === 'page');
    if (!pageTarget) throw new Error('no Chrome page target');
    cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    const timezones = ['Asia/Shanghai', 'America/Los_Angeles'];
    const targetTexts = [];
    let payload = null;

    for (const timezone of timezones) {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: timezone });
      await cdp.send('Page.navigate', { url: `${base}${FIXTURE_PATH}` });
      await waitForFixture(cdp);
      const timezoneActual = await evaluate(cdp, 'Intl.DateTimeFormat().resolvedOptions().timeZone');
      const current = await evaluate(cdp, 'window.__TASK055__');
      if (!current || !Array.isArray(current.results)) throw new Error('invalid fixture payload');
      payload = current;
      targetTexts.push({ timezone, timezoneActual, targetText: current.targetText });
    }

    for (const result of payload.results) {
      check(result.name, result.ok, result.detail);
    }

    // AC10：两个时区下目标日文本一致，且与服务器字符串一致
    check(
      'AC10 时区覆盖生效（两个时区实际不同）',
      targetTexts.length === 2 && targetTexts[0].timezoneActual !== targetTexts[1].timezoneActual,
      targetTexts.map((item) => item.timezoneActual).join(' vs ')
    );
    check(
      'AC10 UTC+8 与 UTC-7 下目标日文本一致',
      targetTexts.length === 2 && targetTexts[0].targetText === targetTexts[1].targetText,
      targetTexts.map((item) => `${item.timezone}:${item.targetText}`).join(' | ')
    );
    check(
      'AC10 目标日文本含服务端字符串 2026-10-23',
      targetTexts.every((item) => item.targetText.includes('2026-10-23')),
      targetTexts.map((item) => item.targetText).join(' | ')
    );
  } finally {
    if (cdp) cdp.close();
    killTree(chrome);
    killTree(vite);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function main() {
  staticChecks();
  await browserChecks();
  const failed = results.filter((item) => !item.ok);
  console.log(`\n===== TASK-055 验收：${results.length - failed.length}/${results.length} PASS =====`);
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
