// client/scripts/verify-task-068.cjs
//
// TASK-068 验收脚本：
//   1. 静态断言：tab 顺序、资产数据面板只读、服务层只有 GET、未知值不补 0；
//   2. 启动 Vite + 本机 Chrome（--dump-dom），运行
//      client/scripts/fixtures/task068-fixture.jsx 的浏览器断言。
// 不新增依赖；不连真实后端与 MongoDB（adapter 注入资产总表快照）。

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const CLIENT_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(CLIENT_DIR, '..');
// 本机默认路径；WSL 下 Node 无法直接 spawn Windows 盘符路径，回退到 /mnt/c 挂载点。
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'
].find((candidate) => fs.existsSync(candidate)) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FIXTURE_PATH = '/scripts/fixtures/task068-fixture.html';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function read(relative) {
  return fs.readFileSync(path.join(CLIENT_DIR, relative), 'utf8');
}

function staticChecks() {
  const tabs = read('src/constants/logTabs.js');
  const boardAt = tabs.indexOf("key: 'board'");
  const assetsAt = tabs.indexOf('key: LOG_TAB_ASSETS');
  const serverAt = tabs.indexOf("key: 'server'");
  const taskAt = tabs.indexOf("key: 'task'");
  check('TASK-068 tab 顺序常量 = 看板/资产数据/服务器/任务',
    boardAt >= 0 && assetsAt > boardAt && serverAt > assetsAt && taskAt > serverAt,
    `${boardAt},${assetsAt},${serverAt},${taskAt}`);
  check('TASK-068 资产数据 key 固定为 assets', /LOG_TAB_ASSETS = 'assets'/.test(tabs));

  const viewer = read('src/pages/LogViewer.jsx');
  check('TASK-068 资产 tab 挂载独立面板',
    /activeTab === LOG_TAB_ASSETS/.test(viewer) && /<AssetDataPanel \/>/.test(viewer));
  check('TASK-068 原始日志分支只接受 server/task',
    /RAW_LOG_TAB_KEYS\.includes\(activeTab\)/.test(viewer)
      && !/activeTab !== DEFAULT_LOG_TAB/.test(viewer));

  const service = read('src/services/ops-center.service.js');
  const postCalls = (service.match(/\bapi\.post\(/g) || []).length;
  const getCalls = (service.match(/\bapi\.get\(/g) || []).length;
  check('TASK-070/071/072/074 数据层只含资产 GET 与白名单任务端点',
    getCalls === 2 && postCalls === 4
      && /api\.get\(OPS_CENTER_ASSETS_ENDPOINT/.test(service)
      && /api\.post\(INTEGRITY_CHECK_ENDPOINT, \{\}\)/.test(service)
      && /api\.post\(PRICE_SYNC_ENDPOINT/.test(service)
      && /api\.post\(`\$\{ASSET_BACKFILL_ENDPOINT\}\/\$\{assetId\}\/price-backfill`/.test(service)
      && /api\.get\(`\$\{TASK_RUNS_ENDPOINT\}\/\$\{runId\}`\)/.test(service)
      && !/api\.(put|patch|delete)/.test(service));

  const panel = read('src/components/OpsCenter/AssetDataPanel.jsx');
  const backfillControl = read('src/components/OpsCenter/AssetBackfillControl.jsx');
  const backfillHook = read('src/hooks/useAssetBackfill.js');
  const batchControl = read('src/components/OpsCenter/BatchBackfillControl.jsx');
  const batchHook = read('src/hooks/useBatchBackfill.js');
  check('TASK-070/071/072/074 资产面板不直接写 API，刷新/同步/补采经专用入口',
    !/useMutation|api\.(post|put|patch|delete)/.test(panel)
      && /useIntegrityRefresh\(\)/.test(panel)
      && /usePriceSync\(\)/.test(panel)
      && /<AssetBackfillControl asset=\{asset\} \/>/.test(panel)
      && /<BatchBackfillControl assetIds=\{\[\.\.\.selectedIds\]\} \/>/.test(panel));
  check('TASK-072 补采控件不直接写 API，mutation 经专用 hook',
    !/useMutation|\bapi\.(get|post|put|patch|delete)\(/.test(backfillControl)
      && /useAssetBackfill\(\)/.test(backfillControl)
      && /backfillAsset\(/.test(backfillHook));
  check('TASK-074 批量控件不直接写 API，预览/启动经专用 hook',
    !/useMutation|\bapi\.(get|post|put|patch|delete)\(/.test(batchControl)
      && /useBatchBackfill\(\)/.test(batchControl)
      && /previewBatchBackfill/.test(batchHook)
      && /startBatchBackfill/.test(batchHook));
  check('TASK-068 编辑链接仅 admin 可见', /isAdmin \?/.test(panel) && /instruments\/edit\//.test(panel));
  check('TASK-068 缺失/未知值不补 0', !/\|\|\s*0\b/.test(panel) && !/\|\|\s*0\b/.test(service));
  check('TASK-068 无可用运行的历史完整度仍回退 unavailable',
    /'unavailable'/.test(panel) && panel.includes('尚未检查'));

  const hook = read('src/hooks/useOpsCenterAssets.js');
  check('TASK-069 查询参数进入 queryKey 与服务端请求',
    /queryKey: \['ops-center-assets', params\]/.test(hook)
      && /getAssetsOverview\(params\)/.test(hook));
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

// WSL 下调用 Windows Chrome 时，--user-data-dir 必须是 Windows 可识别的路径；
// 传 /tmp/... 会被 Chrome 静默忽略并导致 --dump-dom 无输出。
function makeChromeProfile() {
  const isWindowsChrome = /^\/mnt\/[a-z]\//i.test(CHROME);
  if (!isWindowsChrome) {
    return { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'task068-chrome-')), chromeArg: null };
  }
  const windowsTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8' }).trim();
  const windowsProfile = `${windowsTemp}\\task068-chrome-${process.pid}-${Date.now()}`;
  const wslProfile = windowsProfile
    .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
    .replace(/\\/g, '/');
  fs.mkdirSync(wslProfile, { recursive: true });
  return { dir: wslProfile, chromeArg: windowsProfile };
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

  const profile = makeChromeProfile();
  try {
    await waitForUrl(`${base}${FIXTURE_PATH}`);
    await waitForUrl(`${base}/scripts/fixtures/task068-fixture.jsx`);
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
        `--user-data-dir=${profile.chromeArg || profile.dir}`,
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
    try { fs.rmSync(profile.dir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function main() {
  staticChecks();
  await browserChecks();
  const failed = results.filter((item) => !item.ok);
  console.log(`\n===== TASK-068 验收：${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    for (const item of failed) console.log(` - ${item.name} — ${item.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error('CRASH', error && error.stack ? error.stack : error);
  process.exitCode = 2;
});
