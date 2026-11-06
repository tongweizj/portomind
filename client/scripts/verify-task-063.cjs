// client/scripts/verify-task-063.cjs
//
// TASK-063 验收脚本：
//   1. 静态只读/请求边界断言；
//   2. 启动 Vite + 本机 Chrome（--dump-dom），运行
//      client/scripts/fixtures/task063-fixture.jsx 的 27 条 AC1–AC7 断言。
// 不新增依赖；不连真实后端（fixture 用 axios adapter 注入快照）。

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const CLIENT_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(CLIENT_DIR, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FIXTURE_PATH = '/scripts/fixtures/task063-fixture.html';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function read(relative) {
  return fs.readFileSync(path.join(CLIENT_DIR, relative), 'utf8');
}

function staticChecks() {
  const cronDir = path.join(CLIENT_DIR, 'src/components/CronStatus');
  const files = fs.readdirSync(cronDir)
    .filter((name) => name.endsWith('.js') || name.endsWith('.jsx'))
    .map((name) => ({ name, content: fs.readFileSync(path.join(cronDir, name), 'utf8') }));
  const hook = read('src/hooks/useCronStatus.js');
  const service = read('src/services/cronStatus.service.js');

  const mutationHits = [...files, { name: 'hooks/useCronStatus.js', content: hook }]
    .filter((file) => /useMutation|api\.(post|put|patch|delete)\s*\(/.test(file.content));
  check('AC8 /logs 看板子树无 useMutation / 写 API 调用', mutationHits.length === 0,
    mutationHits.map((file) => file.name).join(','));

  check('AC8 数据层只有 GET /cron/status', /api\.get\(CRON_STATUS_ENDPOINT\)/.test(service)
    && !/api\.(post|put|patch|delete)/.test(service));

  const intervalLines = hook.split(/\r?\n/).filter((line) => line.includes('refetchInterval'));
  check('AC5 查询显式关闭自动轮询', intervalLines.length === 1 && intervalLines[0].includes('false'),
    intervalLines.join(' | '));

  check('AC5 查询显式关闭窗焦/重连/重挂自动拉取',
    /refetchOnWindowFocus:\s*false/.test(hook)
      && /refetchOnReconnect:\s*false/.test(hook)
      && /refetchOnMount:\s*false/.test(hook));

  const newFiles = [
    'src/components/CronStatus/CronBoard.jsx',
    'src/components/CronStatus/DataTaskCard.jsx',
    'src/components/CronStatus/taskDataViews.js',
    'src/hooks/useCronStatus.js',
    'src/services/cronStatus.service.js'
  ];
  const zeroFallbacks = newFiles.filter((file) => /\|\|\s*0\b/.test(read(file)));
  check('未知值不出现 || 0 兜底', zeroFallbacks.length === 0, zeroFallbacks.join(','));

  const priceCard = read('src/components/CronStatus/PriceTaskCard.jsx');
  check('AC6 价格卡不发请求（只消费 props）', !/api\.|useQuery|fetch\(/.test(priceCard));
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

async function waitForUrl(url, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) { /* retry */ }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}`);
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
  const vite = spawn(
    process.execPath,
    [path.join(ROOT_DIR, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: CLIENT_DIR, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let viteLog = '';
  vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'task063-chrome-'));
  try {
    await waitForUrl(`${base}${FIXTURE_PATH}`);
    await waitForUrl(`${base}/scripts/fixtures/task063-fixture.jsx`);
    await waitForUrl(`${base}/@vite/client`);
    await sleep(500);

    let dom;
    try {
      dom = execFileSync(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1440,900',
        '--virtual-time-budget=60000',
        '--run-all-compositor-stages-before-draw',
        `--user-data-dir=${profile}`,
        '--dump-dom',
        `${base}${FIXTURE_PATH}`
      ], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
    } catch (error) {
      throw new Error(`chrome failed: ${error.message}\nvite:${viteLog.slice(-1000)}`);
    }

    const match = dom.match(/<pre id="results">([A-Za-z0-9+/=]+)<\/pre>/);
    if (!match) throw new Error(`fixture produced no results; dom tail=${dom.slice(-2000)}`);
    const payload = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    if (payload.failures && payload.failures.length > 0) {
      throw new Error(`fixture crashed: ${payload.failures.join(' | ')}`);
    }
    for (const result of payload.results) {
      check(result.name, result.ok, result.detail);
    }
  } finally {
    killTree(vite);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function main() {
  staticChecks();
  await browserChecks();
  const failed = results.filter((item) => !item.ok);
  console.log(`\n===== TASK-063 验收：${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    for (const item of failed) console.log(` - ${item.name} — ${item.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error('CRASH', error && error.stack ? error.stack : error);
  process.exitCode = 2;
});
