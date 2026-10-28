// client/scripts/e2e-task-058-u2.mjs
//
// TASK-058 U2 / U3 独立验收脚本（真实浏览器 + 真实 Mongo + 真实 server + vite dev）。
//
// 独立性声明：
//   - 本文件由独立 Reviewer（ui-verify）依据 docs/product/specs/FS-authentication.md §7 U2/U3 AC、
//     TASK-058 任务卡 §3 / §10、U2/U3 ExecPlan §1 AC 编写；期望值来自 FS/任务卡，不从实现反推。
//   - 本脚本只做「观察 + 断言」，不修改任何实现源码。
//
// 环境自起（脚本结束时全部清理）：
//   1) 读 server/.env 的 MONGO_URI → 库名改写为临时库 portomind_u2_e2e（护栏：解析出的库名必须精确等于
//      临时库名，否则拒绝执行；只 drop 该临时库，绝不触碰 portomind_dev）；
//   2) spawn `node server.js`（cwd=server，PORT=8080，CORS_ORIGINS 显式补 6600，LOG_DIR 指向 os.tmpdir()）；
//   3) 客户端服务（E2E_CLIENT_MODE=auto|vite|dist，默认 auto）：
//      auto 优先自起 vite dev（cwd=client，strictPort 6600，--configLoader native + Windows realpath 预载补丁）；
//      若 6600 已有可用 vite dev（外部实例）则直接使用、不收尾；若 vite 起不来（本机 DSH 沙箱下 esbuild
//      子进程 spawn EPERM，JSX 无法变换）则回退到 client/dist 生产构建 + 内建 /api 反向代理（同源形态）。
//      E2E_CLIENT_MODE=vite 强制 vite（失败即报错）、=dist 直接用构建产物。
//   4) server 就绪以 HTTP 轮询判定（本机沙箱禁止 Node 子进程 pipe 捕获输出，故子进程 stdio='ignore'）。
//
// 运行：node client/scripts/e2e-task-058-u2.mjs
// 可选环境变量：E2E_BASE（默认 http://localhost:6600）、E2E_SERVER_PORT（默认 8080）、CHROME_PATH、
//   E2E_CLIENT_MODE（auto|vite|dist）、E2E_SMOKE=1（只验证「自起环境 + HTTP 就绪 + Chrome + 清理」机制）。
//
// 退出码：存在任一 FAIL → 1；否则 0。截图目录：os.tmpdir()/portomind-e2e-058。

import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

// ───────────────────────────── 常量 ─────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');
const CLIENT_DIR = path.join(REPO_ROOT, 'client');

const DB_NAME = 'portomind_u2_e2e';
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT || 8080);
const BASE = (process.env.E2E_BASE || 'http://localhost:6600').replace(/\/$/, '');
const API_BASE = `http://127.0.0.1:${SERVER_PORT}`;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = path.join(os.tmpdir(), 'portomind-e2e-058');
const LOG_DIR = path.join(os.tmpdir(), 'portomind-u2-e2e-logs');
const SMOKE = process.env.E2E_SMOKE === '1';
// 仅自起环境 + HTTP 冒烟（不启动 Chrome）：用于验证 server/vite/临时库/temmp 库护栏本身可用。
const SKIP_BROWSER = process.env.E2E_SKIP_BROWSER === '1';

// 测试账号（仅本脚本内常量，不与真实用户口令相关）
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'AdminPass123'; // admin/admin 首登后改成它
const ADMIN_RENAMED = 'admin2'; // 改用户名后的新名
const MEMBER_USER = 'e2e_member';
const MEMBER_PASS = 'MemberPass123'; // 管理员设定的初始密码
const MEMBER_NEW_PASS = 'MemberPass456'; // member 自己改成的新密码
const MEMBER_RESET_PASS = 'MemberReset789'; // 管理员重置后的密码
const ADMIN2_USER = 'e2e_admin2';
const ADMIN2_PASS = 'AdminPass789';

// ───────────────────────────── 结果收集 ─────────────────────────────
const results = [];
const shots = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    check(name, true, detail === undefined ? '' : String(detail));
    return true;
  } catch (error) {
    check(name, false, error && error.message ? error.message : String(error));
    return false;
  }
}

// ───────────────────────────── 通用小工具 ─────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const squash = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function snippet(text, length = 280) {
  const flat = squash(text);
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function bodyText(page) {
  try {
    return await page.locator('body').innerText();
  } catch (_) {
    return '';
  }
}

/** 依次尝试候选 locator，返回第一个「可见」的（页面/弹窗/行均可作为 root）。 */
async function pick(candidates) {
  for (const candidate of candidates) {
    try {
      const locator = typeof candidate === 'function' ? candidate() : candidate;
      const visible = locator.filter({ visible: true });
      if ((await visible.count()) > 0) return visible.first();
    } catch (_) {
      // 试下一个候选
    }
  }
  return null;
}

async function requireVisible(locator, label, timeout = 10000) {
  assert(locator, `找不到元素：${label}`);
  try {
    await locator.waitFor({ state: 'visible', timeout });
  } catch (_) {
    throw new Error(`元素不可见：${label}`);
  }
  return locator;
}

async function expectText(page, matcher, label, timeout = 12000, scope = page) {
  const locator = matcher instanceof RegExp
    ? scope.getByText(matcher).filter({ visible: true })
    : scope.getByText(matcher, { exact: true }).filter({ visible: true });
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
  } catch (_) {
    const text = await bodyText(page);
    throw new Error(`未出现文案「${label}」；当前页面：${snippet(text)}`);
  }
  return squash(await locator.first().innerText().catch(() => ''));
}

/**
 * 找按钮：React 挂载/路由切换是异步的，goto 之后立刻查可能还没渲染（第二轮 AC9b/AC9c 的根因），
 * 因此这里带 deadline 轮询，而不是一次性 count。找不到才返回 null。
 */
async function findButton(root, name, timeout = 8000) {
  const buildCandidates = () => {
    const candidates = [];
    if (typeof name === 'string') {
      candidates.push(() => root.getByRole('button', { name, exact: true }));
      candidates.push(() => root.getByRole('button', { name: new RegExp(escapeRegExp(name)) }));
    } else {
      candidates.push(() => root.getByRole('button', { name }));
    }
    candidates.push(() => root.locator('button').filter({ hasText: name }));
    return candidates;
  };
  const deadline = Date.now() + timeout;
  do {
    const found = await pick(buildCandidates());
    if (found) return found;
    await sleep(150);
  } while (Date.now() < deadline);
  return null;
}

async function clickButton(root, name) {
  const button = await findButton(root, name);
  assert(button, `找不到按钮「${name}」`);
  await button.click();
  return button;
}

/** 取 title 属性（允许 title 挂在按钮/下拉的祖先容器上）。 */
async function attrTitle(locator) {
  const direct = await locator.getAttribute('title').catch(() => null);
  if (direct) return direct;
  for (const xpath of ['xpath=..', 'xpath=../..']) {
    const candidate = locator.locator(xpath).first();
    if (await candidate.count().catch(() => 0)) {
      const title = await candidate.getAttribute('title').catch(() => null);
      if (title) return title;
    }
  }
  return '';
}

async function shot(page, name) {
  try {
    const file = path.join(SHOT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    shots.push(file);
  } catch (_) {
    // 截图失败不影响断言
  }
}

// ───────────────────────────── 环境 / 临时库护栏 ─────────────────────────────
let TEMP_URI = '';

function readEnvValue(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
  if (!match) return null;
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function dbNameOf(uri) {
  const match = String(uri).match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/);
  return match ? match[1] : null;
}

function deriveTempUri(baseUri, dbName) {
  const rewritten = String(baseUri).replace(
    /^(mongodb(?:\+srv)?:\/\/[^/]+\/)[^?]*/,
    `$1${dbName}`
  );
  const parsed = dbNameOf(rewritten);
  if (parsed !== dbName) {
    throw new Error(
      `E2E_REFUSED: 无法把 MONGO_URI 改写到临时库 ${dbName}（实际解析为 ${parsed || '空'}），拒绝执行（不做任何 db 操作）`
    );
  }
  return rewritten;
}

function maskUri(uri) {
  return String(uri).replace(/:\/\/([^:/@]+):([^@]*)@/, '://$1:***@');
}

async function withDb(fn) {
  await mongoose.connect(TEMP_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    return await fn(mongoose.connection.db);
  } finally {
    await mongoose.disconnect();
  }
}

async function dropTempDatabase() {
  const parsed = dbNameOf(TEMP_URI);
  if (parsed !== DB_NAME) {
    throw new Error(`E2E_REFUSED: 拒绝 drop 非临时库（解析为 ${parsed || '空'}）`);
  }
  await withDb((db) => db.dropDatabase());
}

function probePort(port) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForHttp(url, timeout, description) {
  const deadline = Date.now() + timeout;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(400);
  }
  throw new Error(`${description} 未在 ${Math.round(timeout / 1000)}s 内就绪（最后错误：${lastError}；注意：子进程 stdio=ignore，请手工排查端口占用/日志 ${LOG_DIR}）`);
}

function spawnServer(uri) {
  return spawn(process.execPath, ['server.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      MONGO_URI: uri,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'development',
      CORS_ORIGINS: 'http://localhost:6600,http://127.0.0.1:6600',
      LOG_DIR,
      SESSION_TTL_DAYS: '1'
    },
    // 本机 DSH 沙箱禁止 pipe 捕获，统一 ignore；就绪用 HTTP 轮询
    stdio: 'ignore',
    windowsHide: true
  });
}

const VITE_BIN = path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

/**
 * Vite 在 Windows 上第一次 realpath 会 `exec('net use')`，本机 DSH 沙箱下该 spawn 直接 EPERM。
 * 这里用 Node 预载补丁让它的首轮 realpath 抛 EISDIR，从而命中 Vite 自带的 fs.realpathSync 兜底分支。
 * 注意：esbuild 子进程（JSX 变换）在沙箱下必然 EPERM，无法绕过 —— 故 vite 自起失败时回退到
 * `client/dist` 生产构建 + `/api` 反向代理（同一份冻结代码，见脚本头部说明）。
 */
function vitePreloadImportOption() {
  const patch = [
    "import fs from 'node:fs';",
    'const realpathSync = fs.realpathSync;',
    'const native = realpathSync.native;',
    'let first = true;',
    'realpathSync.native = function (target) {',
    '  if (first) {',
    '    first = false;',
    "    const error = new Error('EISDIR: illegal operation on a directory, realpath ' + target);",
    "    error.code = 'EISDIR';",
    '    throw error;',
    '  }',
    '  return native.call(realpathSync, target);',
    '};'
  ].join('\n');
  const base64 = Buffer.from(patch, 'utf8').toString('base64');
  return `--import "data:text/javascript;base64,${base64}"`;
}

function spawnVite(clientPort) {
  const inheritedOptions = (process.env.NODE_OPTIONS || '').trim();
  return spawn(
    process.execPath,
    [VITE_BIN, '--port', String(clientPort), '--strictPort', '--configLoader', 'native'],
    {
      cwd: CLIENT_DIR,
      env: {
        ...process.env,
        // 产品按 ExecPlan F8/D-3 的「同源 /api + Vite proxy」形态验收；
        // client/.env 里的绝对 VITE_API_URL 会让浏览器跨端口直连 8080，而 axios 未设
        // withCredentials → 不会携带 pm_sid cookie（见本轮验收报告的环境发现）。
        VITE_API_URL: '',
        VITE_API_PROXY_TARGET: API_BASE,
        NODE_OPTIONS: `${inheritedOptions} ${vitePreloadImportOption()}`.trim()
      },
      stdio: 'ignore',
      windowsHide: true
    }
  );
}

async function isViteServing(port) {
  try {
    const root = await fetch(`http://127.0.0.1:${port}/`);
    if (!root.ok) return false;
    const html = await root.text();
    if (!html.includes('/@vite/client')) return false;
    const module = await fetch(`http://127.0.0.1:${port}/src/main.jsx`);
    if (!module.ok) return false;
    const code = await module.text();
    return code.length > 100;
  } catch (_) {
    return false;
  }
}

async function waitForViteReady(port, timeout) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const root = await fetch(`http://127.0.0.1:${port}/`);
      if (!root.ok) {
        last = `root HTTP ${root.status}`;
      } else {
        const module = await fetch(`http://127.0.0.1:${port}/src/main.jsx`);
        if (module.ok) return;
        last = `/src/main.jsx HTTP ${module.status}（JSX 变换依赖 esbuild，可能被沙箱拒绝）`;
      }
    } catch (error) {
      last = error.message;
    }
    await sleep(500);
  }
  throw new Error(`vite dev(${port}) 未在 ${Math.round(timeout / 1000)}s 内就绪（最后：${last}）`);
}

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/** 以 client/dist 为根提供 SPA 静态服务，并把 /api/* 反向代理到真实 server（同源形态）。 */
function startStaticProxyServer(clientPort) {
  const distDir = path.normalize(path.join(CLIENT_DIR, 'dist'));
  const apiTarget = new URL(API_BASE);
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) {
      const upstream = http.request(
        {
          hostname: apiTarget.hostname,
          port: Number(apiTarget.port || 80),
          path: request.url,
          method: request.method,
          headers: { ...request.headers, host: apiTarget.host }
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        }
      );
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502);
        response.end('E2E proxy error');
      });
      request.pipe(upstream);
      return;
    }

    try {
      const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${clientPort}`).pathname);
      let filePath = path.normalize(path.join(distDir, pathname));
      if (!filePath.startsWith(distDir)) {
        response.writeHead(403);
        response.end('forbidden');
        return;
      }
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }
      const extension = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        'content-type': STATIC_MIME[extension] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      createReadStream(filePath).pipe(response);
    } catch (_) {
      response.writeHead(500);
      response.end('E2E static server error');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(clientPort, '0.0.0.0', () => resolve(server));
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill();
  } catch (_) {
    // ignore
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5000)
  ]);
  if (child.exitCode === null) {
    // 兜底：本机沙箱里 taskkill 可能 Access denied，失败也不阻断收尾
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch (_) {
      // ignore
    }
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(5000)
    ]);
  }
}

/**
 * 客户端服务就绪策略（优先级）：
 *   1) 6600 已有可用 vite dev（外部实例）→ 直接使用，不收尾（归其启动者）；
 *   2) 自起 vite dev（--configLoader native + 预载补丁）→ 就绪即用；
 *   3) 回退 client/dist 生产构建 + /api 反向代理（本机沙箱下 esbuild EPERM 时的确定性路径）。
 * 可用 E2E_CLIENT_MODE=vite|dist|auto 强制指定（默认 auto）。
 */
async function startClient(clientPort) {
  if (await probePort(clientPort)) {
    if (await isViteServing(clientPort)) {
      console.log(`检测到端口 ${clientPort} 已有可用的 vite dev（外部实例）→ 直接使用，验收结束不 kill 它。`);
      await waitForViteReady(clientPort, 60000);
      return {
        mode: 'external-vite',
        description: `外部 vite dev（沿用 ${clientPort} 已运行实例；由该实例启动者停止）`,
        stop: async () => {}
      };
    }
    throw new Error(
      `E2E_ENV_CONFLICT: 客户端端口 ${clientPort} 被占用，但不是可用的 vite dev（/src/main.jsx 非 200）。请先停止占用进程。`
    );
  }

  const requested = (process.env.E2E_CLIENT_MODE || 'auto').toLowerCase();
  const distIndex = path.join(CLIENT_DIR, 'dist', 'index.html');

  if (requested === 'vite' || requested === 'auto') {
    const child = spawnVite(clientPort);
    try {
      await waitForViteReady(clientPort, requested === 'vite' ? 120000 : 30000);
      return {
        mode: 'vite',
        child,
        description: '自起 vite dev（--configLoader native + Windows realpath 预载补丁）',
        stop: async () => { await stopChild(child); }
      };
    } catch (error) {
      await stopChild(child);
      for (let i = 0; i < 20 && (await probePort(clientPort)); i += 1) await sleep(250);
      if (requested === 'vite') throw error;
      console.warn(`提示：vite dev 自起未就绪（${error.message.split('\n')[0]}）→ 回退 client/dist 静态构建模式。`);
    }
  }

  if (!existsSync(distIndex)) {
    throw new Error(
      'E2E_REFUSED: 找不到 client/dist/index.html，且 vite dev 不可用；请先 `npm run build --workspace client`。'
    );
  }
  const staticServer = await startStaticProxyServer(clientPort);
  await waitForHttp(`http://127.0.0.1:${clientPort}/`, 30000, `dist 静态服务(${clientPort})`);
  return {
    mode: 'dist',
    server: staticServer,
    description: 'client/dist 生产构建 + /api 反向代理（vite dev 在本机沙箱不可用：esbuild spawn EPERM）',
    stop: async () => new Promise((resolve) => staticServer.close(() => resolve()))
  };
}

// ───────────────────────────── 登录 / 表单助手 ─────────────────────────────
async function loginFields(page) {
  const username = await pick([
    () => page.getByLabel(/^用户名[：:]?$/),
    () => page.getByPlaceholder(/^用户名[：:]?$/),
    () => page.locator('input[autocomplete="username"]'),
    () => page.locator('form input[type="text"]')
  ]);
  const password = await pick([
    () => page.getByLabel(/^密码[：:]?$/),
    () => page.getByPlaceholder(/^密码[：:]?$/),
    () => page.locator('input[autocomplete="current-password"]'),
    () => page.locator('form input[type="password"]')
  ]);
  const submit = await pick([
    () => page.getByRole('button', { name: '登录', exact: true }),
    () => page.locator('form button[type="submit"]')
  ]);
  return { username, password, submit };
}

async function waitForLoginForm(page, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const fields = await loginFields(page);
    if (fields.username && fields.password && fields.submit) return fields;
    await sleep(300);
  }
  throw new Error(`登录表单未就绪（期望「用户名」「密码」「登录」）：${snippet(await bodyText(page))}`);
}

async function loginAs(page, username, password) {
  const fields = await waitForLoginForm(page);
  await fields.username.fill(username);
  await fields.password.fill(password);
  await fields.submit.click();
}

/**
 * 等 React 根挂载完成（goto 后立刻操作会撞上「根节点还没渲染」；第二轮 member 段失败即此因）。
 * 只等根节点有子节点，具体内容由各自的 expectText / 轮询助手继续等。
 */
async function waitForReactMount(page, timeout = 15000) {
  await page
    .waitForFunction(
      () => {
        const root = document.getElementById('root');
        return Boolean(root && root.children.length > 0);
      },
      undefined,
      { timeout }
    )
    .catch(() => {});
}

async function waitLoggedIn(page, timeout = 25000) {
  await page.waitForURL((url) => url.pathname !== '/login', { timeout });
  await waitForReactMount(page);
}

async function gotoPath(page, pathname) {
  await page.goto(`${BASE}${pathname}`, { waitUntil: 'domcontentloaded' });
  await waitForReactMount(page);
  await page.waitForTimeout(100);
}

// ───────────────────────────── 顶栏下拉助手 ─────────────────────────────
function menuPanel(page) {
  return page.getByRole('menu').filter({ visible: true }).first();
}

/** 顶栏触发器：同样带 deadline 轮询（路由切换后 AppLayout 可能尚未渲染）。 */
async function menuTrigger(page, timeout = 10000) {
  const deadline = Date.now() + timeout;
  do {
    const trigger = await pick([
      () => page.getByRole('button', { name: '账户菜单' }),
      () => page.locator('[aria-haspopup="menu"]'),
      () => page.locator('header button[aria-label*="账户"]')
    ]);
    if (trigger) return trigger;
    await sleep(150);
  } while (Date.now() < deadline);
  return null;
}

async function openUserMenu(page) {
  const trigger = await menuTrigger(page);
  assert(trigger, '找不到顶栏账户菜单触发器（期望可访问名「账户菜单」）');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
  }
  await requireVisible(menuPanel(page), '顶栏账户下拉面板');
  return trigger;
}

async function closeUserMenu(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
}

async function menuItem(page, name, timeout = 6000) {
  const deadline = Date.now() + timeout;
  do {
    const panel = menuPanel(page);
    if (await panel.count().catch(() => 0)) {
      const item = await pick([
        () => panel.getByRole('menuitem', { name, exact: true }),
        () => panel.getByRole('menuitem', { name: new RegExp(escapeRegExp(name)) }),
        () => panel.locator('button, a, [role="menuitem"]').filter({ hasText: name })
      ]);
      if (item) return item;
    }
    await sleep(120);
  } while (Date.now() < deadline);
  return null;
}

async function menuItemNames(page) {
  const panel = menuPanel(page);
  let items = panel.getByRole('menuitem');
  if ((await items.count().catch(() => 0)) === 0) {
    items = panel.locator('button, a[href]');
  }
  const names = [];
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    names.push(squash(await items.nth(i).innerText().catch(() => '')));
  }
  return names;
}

async function clickMenuItem(page, name) {
  const item = await menuItem(page, name);
  assert(item, `下拉菜单中找不到「${name}」；当前项：${(await menuItemNames(page)).join(' | ')}`);
  await item.click();
}

async function waitUserMenuContains(page, text, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    const trigger = await menuTrigger(page);
    if (trigger) {
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
        await trigger.click().catch(() => {});
        await sleep(250);
      }
      const panel = menuPanel(page);
      if (await panel.isVisible().catch(() => false)) {
        last = squash(await panel.innerText().catch(() => ''));
        if (last.includes(text)) return last;
      }
    }
    await sleep(350);
  }
  throw new Error(`顶栏下拉身份行未在 ${timeout}ms 内显示「${text}」；最后内容：${snippet(last)}`);
}

async function logoutViaMenu(page) {
  await openUserMenu(page);
  await clickMenuItem(page, '退出登录');
  await page.waitForURL((url) => url.pathname === '/login', { timeout: 20000 });
}

// ───────────────────────────── 账户页表单助手 ─────────────────────────────
/** 距离按钮最近的、包含 input 的祖先元素（用于把表单字段与「保存」按钮绑定）。 */
async function inputGroupFor(button) {
  const group = button.locator('xpath=ancestor::*[.//input][1]');
  if ((await group.count().catch(() => 0)) > 0) return group.first();
  return null;
}

/** 改密表单：优先按 label 填，剩余空字段按表单顺序兜底填。 */
async function fillPasswordInputs(group, { current, next, confirm }) {
  const inputs = group.locator('input');
  const total = await inputs.count();
  assert(total >= 2, `改密表单输入框应 ≥2 个，实际 ${total}`);
  const labelText = squash(await group.locator('label').allInnerTexts().catch(() => []));

  const specs = [
    { pattern: /确认.*(密码|口令)|再次.*(密码|口令)|重复.*(密码|口令)/, value: confirm },
    { pattern: /当前.*(密码|口令)|原.*(密码|口令)/, value: current },
    { pattern: /^新.*(密码|口令)$/, value: next }
  ];
  for (const spec of specs) {
    const field = group.getByLabel(spec.pattern).filter({ visible: true }).first();
    if (await field.count().catch(() => 0)) {
      await field.fill(spec.value);
    }
  }

  const order = total >= 3 ? [current, next, confirm] : [current, next];
  for (let i = 0; i < total && i < order.length; i += 1) {
    const input = inputs.nth(i);
    const value = await input.inputValue().catch(() => '');
    if (!value) await input.fill(order[i]);
  }

  const values = await inputs.evaluateAll((nodes) => nodes.map((node) => node.value));
  assert(values.every(Boolean), `改密表单仍有空字段（labels=${labelText}，values=${JSON.stringify(values)}）`);
}

/** 观察短生命周期的「成功提示」文本（Toast/alert 可能在跳转前出现）。 */
async function startTextWatcher(page, key, patternSource) {
  await page.evaluate(({ watcherKey, source }) => {
    window[watcherKey] = [];
    const re = new RegExp(source);
    const record = () => {
      try {
        const match = document.body.innerText.match(re);
        if (match) window[watcherKey].push(match[0].trim());
      } catch (_) {
        // ignore
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    record();
  }, { watcherKey: key, source: patternSource }).catch(() => {});
}

async function readTextWatcher(page, key) {
  try {
    const value = await page.evaluate((watcherKey) => (window[watcherKey] || []).join(' | '), key);
    return squash(value);
  } catch (_) {
    return '';
  }
}

async function waitSession(ctx, predicate, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await ctx.request.get(`${BASE}/api/auth/session`);
      const body = await response.json();
      last = body?.data;
      if (predicate(last)) return last;
    } catch (_) {
      // 继续轮询
    }
    await sleep(300);
  }
  throw new Error(`会话状态未达预期；最后值：${JSON.stringify(last)}`);
}

/** 走 UI 改密（强制态按钮「设定新密码并进入」/ 正常态「保存密码」），返回 {successText, session}。 */
async function performPasswordChange(page, ctx, { current, next, forced }) {
  const buttonName = forced ? '设定新密码并进入' : '保存密码';
  let submit = await findButton(page, buttonName);
  if (!submit) submit = await findButton(page, '保存密码');
  assert(submit, `找不到改密提交按钮（期望「${buttonName}」）`);
  const group = await inputGroupFor(submit);
  assert(group, '找不到改密表单容器');

  await startTextWatcher(page, '__e2ePasswordSuccess', '成功|已更新|已修改|已生效|已设定');
  await fillPasswordInputs(group, { current, next, confirm: next });
  await submit.click();
  await page.waitForTimeout(900);
  const successText = await readTextWatcher(page, '__e2ePasswordSuccess');
  const session = await waitSession(ctx, (data) => data?.authenticated === true && data.user?.mustChangePassword === false);
  return { successText, session };
}

// ───────────────────────────── 用户表格助手 ─────────────────────────────
async function rowByUsername(page, username) {
  const rows = page.getByRole('row');
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const firstCell = row.getByRole('cell').first();
    if ((await firstCell.count().catch(() => 0)) === 0) continue;
    // 自己那一行首格是「用户名 + 你」chip（实测 innerText 为 `admin你`，chip 与用户名之间无空格），
    // 去掉末尾「你」后再精确比较 —— 不能用 startsWith（否则 admin 会误匹配 admin2）。
    const cellText = squash(await firstCell.innerText().catch(() => '')).replace(/\s+/g, '');
    const normalized = cellText.endsWith('你') ? cellText.slice(0, -1) : cellText;
    if (normalized === username) return row;
  }
  throw new Error(`用户表格中找不到「${username}」行`);
}

async function waitRowByUsername(page, username, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      return await rowByUsername(page, username);
    } catch (_) {
      await sleep(400);
    }
  }
  throw new Error(`用户表格中未出现「${username}」行（超时 ${timeout}ms）`);
}

async function tableHeaders(page, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last = { table: null, headers: [] };
  do {
    const table = page.getByRole('table').filter({ visible: true }).first();
    const headers = (await table.count().catch(() => 0)) > 0
      ? (await table.locator('thead th').allInnerTexts()).map(squash)
      : (await page.getByRole('columnheader').allInnerTexts()).map(squash);
    last = { table, headers };
    if (headers.length > 0) return last;
    await sleep(200);
  } while (Date.now() < deadline);
  return last;
}

async function fillCreateUserDialog(dialog, { username, password, role }) {
  const userField = await pick([
    () => dialog.getByLabel(/^用户名[：:]?$/),
    () => dialog.getByPlaceholder(/用户名/),
    () => dialog.locator('input').first()
  ]);
  assert(userField, '新建用户弹窗缺少用户名输入框');
  await userField.fill(username);

  const passwordField = await pick([
    () => dialog.getByLabel(/初始密码/),
    () => dialog.getByLabel(/^密码[：:]?$/),
    () => dialog.getByPlaceholder(/密码/),
    () => dialog.locator('input[type="password"]').first()
  ]);
  assert(passwordField, '新建用户弹窗缺少初始密码输入框');
  await passwordField.fill(password);

  const roleSelect = dialog.locator('select').filter({ visible: true }).first();
  if (await roleSelect.count().catch(() => 0)) {
    // ⚠️ evaluateAll 在浏览器上下文执行，不能引用 Node 侧助手（如 squash），必须内联归一化。
    const options = await roleSelect.locator('option').evaluateAll((nodes) =>
      nodes.map((node) => ({
        value: node.value,
        text: String(node.textContent || '').replace(/\s+/g, ' ').trim()
      }))
    );
    const target = options.find((option) => option.value === role)
      || options.find((option) => (role === 'admin' ? /管理员/.test(option.text) : /成员/.test(option.text)));
    assert(target, `角色下拉找不到「${role}」，实际选项：${JSON.stringify(options)}`);
    await roleSelect.selectOption(target.value);
  }
}

async function submitDialog(dialog, namePattern = /^(创建|新建|确定|保存|提交|重置)/) {
  const submit = await findButton(dialog, namePattern);
  assert(submit, `弹窗缺少提交按钮（期望 ${namePattern}）：${snippet(await dialog.innerText().catch(() => ''))}`);
  await submit.click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) {
    throw new Error(`弹窗未关闭（可能校验失败）：${snippet(await dialog.innerText().catch(() => ''))}`);
  }
}

// ───────────────────────────── 主流程 ─────────────────────────────
async function runBrowserChecks(browser) {
  const pageErrors = [];
  const consoleErrors = [];

  const track = (page, tag) => {
    page.on('pageerror', (error) => pageErrors.push(`[${tag}] pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`[${tag}] ${message.text()}`);
    });
    // 用户停用等操作会用 window.confirm 二次确认（D-10）
    page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });
  };

  const viewport = { width: 1440, height: 900 };
  const ctxAdmin = await browser.newContext({ viewport, locale: 'zh-CN' });
  const pageAdmin = await ctxAdmin.newPage();
  pageAdmin.setDefaultTimeout(12000);
  pageAdmin.setDefaultNavigationTimeout(30000);
  track(pageAdmin, 'admin');

  let ctxAdminB = null;
  let pageAdminB = null;
  let ctxMember = null;
  let pageMember = null;
  let ctxMember2 = null;
  let pageMember2 = null;
  let oldAdminSid = '';

  // ── AC1a + 登录页形态：未登录深链 → /login?next= ──
  await step('AC1a 未登录直访 /portfolios → /login?next=%2Fportfolios，登录页有「PortoMind/用户名/密码/登录」且不套 AppLayout', async () => {
    await gotoPath(pageAdmin, '/portfolios');
    await pageAdmin.waitForURL(
      (url) => url.pathname === '/login' && url.searchParams.get('next') === '/portfolios',
      { timeout: 20000 }
    );
    const fields = await waitForLoginForm(pageAdmin);
    assert(fields.username, '登录页缺少用户名输入框');
    assert(fields.password, '登录页缺少密码输入框');
    const title = await pageAdmin.title();
    const brandVisible = await pageAdmin
      .getByText('PortoMind', { exact: false })
      .filter({ visible: true })
      .first()
      .isVisible()
      .catch(() => false);
    assert(title.includes('PortoMind') || brandVisible, `登录页标题应含「PortoMind」（document.title=${title}）`);
    const asideCount = await pageAdmin.locator('aside').count();
    assert(asideCount === 0, `登录页不应套 AppLayout（不应有侧栏），实际 aside=${asideCount}`);
    const body = squash(await bodyText(pageAdmin));
    assert(!/默认账号/.test(body) && !/admin\s*\/\s*admin/.test(body), '登录页不应提示默认账号（FS §4.1）');
    await shot(pageAdmin, '01-login-deeplink');
    return `url=${pageAdmin.url()}；title=${title}`;
  });

  // ── AC2：错误密码 ──
  await step('AC2 错误密码 → 停留 /login、文案「用户名或密码错误」、无重定向循环', async () => {
    const before = pageAdmin.url();
    await loginAs(pageAdmin, ADMIN_USER, 'definitely-wrong-password');
    await expectText(pageAdmin, /用户名或密码错误/, '用户名或密码错误', 15000);
    await pageAdmin.waitForTimeout(2000);
    assert(pageAdmin.url() === before, `错误密码后 URL 不应变化（期望 ${before}，实际 ${pageAdmin.url()}）`);
    assert(new URL(pageAdmin.url()).pathname === '/login', '错误密码后应留在 /login');
    const body = squash(await bodyText(pageAdmin));
    assert(!body.includes('需要修改密码后才能继续'), '错误密码不应触发强制改密屏');
    await shot(pageAdmin, '02-login-wrong-password');
    return `URL 保持不变：${new URL(pageAdmin.url()).pathname}${new URL(pageAdmin.url()).search}`;
  });

  // ── AC4a：admin/admin 首登 → 强制改密（落 /account，不落 /） ──
  await step('AC4a admin/admin 首登 → 强制改密态（落 /account 且显示「首次登录需修改密码」）', async () => {
    await loginAs(pageAdmin, ADMIN_USER, 'admin');
    await waitLoggedIn(pageAdmin);
    assert(
      new URL(pageAdmin.url()).pathname === '/account',
      `首登 mustChangePassword=true 时应进 /account（FS D10），实际 ${pageAdmin.url()}`
    );
    await expectText(pageAdmin, /首次登录.{0,3}修改密码/, '首登强制改密 banner', 15000);
    await shot(pageAdmin, '03-first-login-forced-account');
    return `url=${new URL(pageAdmin.url()).pathname}`;
  });

  // ── AC4b：强制改密闸门拦截业务路由 ──
  await step('AC4b 强制改密态直访 /portfolios → 「需要修改密码后才能继续」屏（无可跳过入口）', async () => {
    await gotoPath(pageAdmin, '/portfolios');
    await expectText(pageAdmin, /需要修改密码后才能继续/, '强制改密屏', 15000);
    const goButton = await findButton(pageAdmin, '前往修改密码');
    assert(goButton, '强制改密屏缺少「前往修改密码」按钮');
    const body = squash(await bodyText(pageAdmin));
    assert(!body.includes('数据加载失败'), '强制改密闸门应拦在业务页之前，不应渲染业务请求错误');
    await shot(pageAdmin, '04-forced-change-screen');
    return '业务路由被强制改密屏拦截';
  });

  // ── AC4c：强制改密态下拉可用 + 系统设置禁用并说明原因（D-7） ──
  await step('AC4c 强制改密态：顶栏下拉仍可用，「系统设置」保留但禁用 + title「请先完成密码修改」', async () => {
    const trigger = await openUserMenu(pageAdmin);
    assert((await trigger.getAttribute('aria-expanded')) === 'true', '强制改密态下拉应可展开（aria-expanded=true）');
    const names = await menuItemNames(pageAdmin);
    assert(names.length === 4, `admin 下拉动作项应恰 4 个，实际 ${JSON.stringify(names)}`);
    assert(names.includes('账户设置') && names.includes('退出登录'), `强制态下拉应含「账户设置」「退出登录」，实际 ${JSON.stringify(names)}`);
    const systemItem = await menuItem(pageAdmin, '系统设置');
    assert(systemItem, '强制改密态「系统设置」应保留（禁用而非消失）');
    assert(await systemItem.isDisabled(), '强制改密态「系统设置」应为禁用态');
    const title = await attrTitle(systemItem);
    assert(/请先完成密码修改/.test(title), `「系统设置」禁用原因 title 应为「请先完成密码修改」，实际「${title}」`);
    const logoutItem = await menuItem(pageAdmin, '退出登录');
    assert(logoutItem && !(await logoutItem.isDisabled()), '强制态「退出登录」应可用');
    await closeUserMenu(pageAdmin);
    await shot(pageAdmin, '05-forced-user-menu');
    return `下拉项：${names.join(' / ')}；系统设置 title=${title}`;
  });

  // ── AC4d：账户页强制改密形态（含当前密码，D-1） ──
  await step('AC4d 强制改密屏「前往修改密码」→ /account 强制改密表单（当前密码+新密码+确认，按钮「设定新密码并进入」）', async () => {
    await clickButton(pageAdmin, '前往修改密码');
    await pageAdmin.waitForURL((url) => url.pathname === '/account', { timeout: 15000 });
    await expectText(pageAdmin, /账户设置/, '账户设置页标题');
    await expectText(pageAdmin, /首次登录.{0,3}修改密码/, '首登 banner');
    const body = squash(await bodyText(pageAdmin));
    for (const label of ['用户名', '角色', '状态', '上次登录']) {
      assert(body.includes(label), `账户页身份区缺少「${label}」：${snippet(body)}`);
    }
    await expectText(pageAdmin, /修改密码/, '「修改密码」区块');
    const forcedButton = await findButton(pageAdmin, '设定新密码并进入');
    assert(forcedButton, '强制改密态提交按钮应为「设定新密码并进入」');
    const group = await inputGroupFor(forcedButton);
    assert(group, '找不到强制改密表单容器');
    const inputs = group.locator('input');
    const total = await inputs.count();
    assert(total >= 3, `强制改密表单应含「当前密码/新密码/确认新密码」3 个输入框（D-1 必须校验当前密码），实际 ${total}`);
    const labels = squash(await group.locator('label').allInnerTexts().catch(() => []));
    await shot(pageAdmin, '06-forced-account-page');
    return `强制改密表单字段数=${total}（labels=${labels || '未使用 label，按顺序兜底'}）`;
  });

  // ── AC5a：第二浏览器建立同名会话（用于验证改密踢下线） ──
  await step('AC5a 第二浏览器以 admin/admin 建立第二个会话（首登同样强制改密）', async () => {
    ctxAdminB = await browser.newContext({ viewport, locale: 'zh-CN' });
    pageAdminB = await ctxAdminB.newPage();
    pageAdminB.setDefaultTimeout(12000);
    track(pageAdminB, 'adminB');
    await gotoPath(pageAdminB, '/login');
    await loginAs(pageAdminB, ADMIN_USER, 'admin');
    await waitLoggedIn(pageAdminB);
    const session = await waitSession(ctxAdminB, (data) => data?.authenticated === true);
    assert(session.user?.mustChangePassword === true, '第二会话应同样处于强制改密态');
    return `第二会话 url=${new URL(pageAdminB.url()).pathname}`;
  });

  // ── AC5b：强制态改密成功 → 恢复 ──
  await step('AC5b 强制态改密（当前密码 admin → AdminPass123）→ 成功提示 + mustChangePassword=false + 业务页恢复', async () => {
    if (new URL(pageAdmin.url()).pathname !== '/account') await gotoPath(pageAdmin, '/account');
    const { successText, session } = await performPasswordChange(pageAdmin, ctxAdmin, {
      current: 'admin',
      next: ADMIN_PASS,
      forced: true
    });
    assert(session.user?.mustChangePassword === false, '改密后会话 mustChangePassword 应为 false');
    await gotoPath(pageAdmin, '/portfolios');
    await pageAdmin.waitForTimeout(2500);
    const body = squash(await bodyText(pageAdmin));
    assert(!body.includes('需要修改密码后才能继续'), '改密后业务页不应再出现强制改密屏');
    assert(!body.includes('数据加载失败'), `改密后业务页不应报「数据加载失败」：${snippet(body)}`);
    assert(body.length > 40, `改密后业务页应为正常内容：${snippet(body)}`);
    await shot(pageAdmin, '07-after-password-change');
    return `成功提示=${successText || '（未捕获到提示文案，以会话状态为准）'}；业务页恢复`;
  });

  // ── AC5c：改密后另一会话被登出 ──
  await step('AC5c 改密后另一个浏览器同名会话在下一次请求被登出（401 → /login?next=）', async () => {
    await gotoPath(pageAdminB, '/portfolios');
    await pageAdminB.waitForURL((url) => url.pathname === '/login', { timeout: 20000 });
    const url = new URL(pageAdminB.url());
    assert(url.searchParams.get('next') === '/portfolios', `401 跳登录应带 next=/portfolios，实际 ${url.search}`);
    const session = await waitSession(ctxAdminB, (data) => data?.authenticated === false);
    assert(session?.authenticated === false, '第二会话应为未登录');
    await shot(pageAdminB, '08-other-session-evicted');
    return `旧会话被登出，next=${url.searchParams.get('next')}`;
  });

  // ── AC7：已登录访问 /login → / ──
  await step('AC7 已登录访问 /login → 重定向到 /', async () => {
    await gotoPath(pageAdmin, '/login');
    await pageAdmin.waitForURL((url) => url.pathname === '/', { timeout: 20000 });
    return `url=${new URL(pageAdmin.url()).pathname}`;
  });

  // ── AC6：退出登录（清 cookie / 库会话 / 回退键） ──
  await step('AC6 下拉「退出登录」→ 回 /login；cookie 清空、旧 cookie 401、回退键无法回到已登录页', async () => {
    if (new URL(pageAdmin.url()).pathname !== '/') await gotoPath(pageAdmin, '/');
    const cookies = await ctxAdmin.cookies(BASE);
    const sidCookie = cookies.find((cookie) => cookie.name === 'pm_sid');
    assert(sidCookie, '登出前应存在 pm_sid 会话 cookie');
    oldAdminSid = sidCookie.value;

    await logoutViaMenu(pageAdmin);
    const cookiesAfter = await ctxAdmin.cookies(BASE);
    assert(!cookiesAfter.some((cookie) => cookie.name === 'pm_sid'), '登出后浏览器不应保留 pm_sid cookie');

    // 旧 cookie 直接打服务端（绕过浏览器上下文，独立验证会话已在库中失效）
    const oldSessionRes = await fetch(`${API_BASE}/api/auth/session`, { headers: { cookie: `pm_sid=${oldAdminSid}` } });
    const oldSessionBody = await oldSessionRes.json();
    assert(oldSessionBody?.data?.authenticated === false, `旧 cookie 的 session 应为 authenticated=false，实际 ${JSON.stringify(oldSessionBody?.data)}`);
    const oldPortfoliosRes = await fetch(`${API_BASE}/api/portfolios`, { headers: { cookie: `pm_sid=${oldAdminSid}` } });
    assert(oldPortfoliosRes.status === 401, `旧 cookie 访问业务端点应 401，实际 ${oldPortfoliosRes.status}`);

    // 回退键不能回到已登录页面
    await pageAdmin.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await pageAdmin.waitForTimeout(1500);
    await pageAdmin.waitForURL((url) => url.pathname === '/login', { timeout: 10000 }).catch(() => {});
    assert(new URL(pageAdmin.url()).pathname === '/login', `回退后应被守卫拦回 /login，实际 ${pageAdmin.url()}`);
    const body = squash(await bodyText(pageAdmin));
    assert(!body.includes('家庭总资产') && !body.includes('数据加载失败'), '回退后不应显示已登录业务内容');
    await shot(pageAdmin, '09-after-logout');
    return 'cookie 已清、旧 cookie 401、回退被守卫拦截';
  });

  // ── AC1b：深链回跳（用已改密账号验证 FS U2 AC 的「登录后回到原页」） ──
  await step('AC1b 未登录深链 /portfolios → 登录（已改密账号）→ 回到 /portfolios', async () => {
    await gotoPath(pageAdmin, '/portfolios');
    await pageAdmin.waitForURL(
      (url) => url.pathname === '/login' && url.searchParams.get('next') === '/portfolios',
      { timeout: 20000 }
    );
    await loginAs(pageAdmin, ADMIN_USER, ADMIN_PASS);
    await pageAdmin.waitForURL((url) => url.pathname === '/portfolios', { timeout: 25000 });
    await pageAdmin.waitForTimeout(2500);
    const body = squash(await bodyText(pageAdmin));
    assert(!body.includes('需要修改密码后才能继续'), '不应再出现强制改密屏');
    assert(!body.includes('数据加载失败'), `回跳后业务页不应报错：${snippet(body)}`);
    await shot(pageAdmin, '10-deeplink-roundtrip');
    return `url=${new URL(pageAdmin.url()).pathname}`;
  });

  // ── AC3：无 next 落 /（D10） ──
  await step('AC3 未登录访问 / → /login?next=%2F；登录后落 /（Dashboard），不是 /account', async () => {
    await logoutViaMenu(pageAdmin);
    await gotoPath(pageAdmin, '/');
    await pageAdmin.waitForURL(
      (url) => url.pathname === '/login' && url.searchParams.get('next') === '/',
      { timeout: 20000 }
    );
    await loginAs(pageAdmin, ADMIN_USER, ADMIN_PASS);
    await pageAdmin.waitForURL((url) => url.pathname === '/', { timeout: 25000 });
    await pageAdmin.waitForTimeout(2000);
    const title = squash(await pageAdmin.locator('h1').first().innerText().catch(() => ''));
    const body = squash(await bodyText(pageAdmin));
    assert(title.includes('家庭总览') || body.includes('家庭总览'), `登录后应落到 Dashboard，当前 h1=${title}，页面=${snippet(body)}`);
    await shot(pageAdmin, '11-dashboard-landing');
    return `url=/, h1=${title}`;
  });

  // ── AC8：开放重定向防护 ──
  await step('AC8 safeNext：/login?next=//evil.com 与 /login?next=/login 登录后都落 /（无开放重定向）', async () => {
    for (const badNext of ['//evil.com', '/login']) {
      await logoutViaMenu(pageAdmin);
      await pageAdmin.goto(`${BASE}/login?next=${encodeURIComponent(badNext)}`, { waitUntil: 'domcontentloaded' });
      await waitForLoginForm(pageAdmin);
      await loginAs(pageAdmin, ADMIN_USER, ADMIN_PASS);
      await pageAdmin.waitForURL((url) => url.pathname === '/', { timeout: 25000 });
      const landed = new URL(pageAdmin.url());
      assert(landed.host === new URL(BASE).host, `next=${badNext} 不得跳到外站，实际 ${pageAdmin.url()}`);
      assert(landed.pathname === '/', `next=${badNext} 应落 /，实际 ${pageAdmin.url()}`);
    }
    await shot(pageAdmin, '12-safe-next');
    return '两个非法 next 均落 /';
  });

  // ── AC15：session.lastLoginAt + 账户页「上次登录」 ──
  await step('AC15 GET /api/auth/session 的 user.lastLoginAt 非空；/account「上次登录」非空且非「—」', async () => {
    const response = await ctxAdmin.request.get(`${BASE}/api/auth/session`);
    const body = await response.json();
    const user = body?.data?.user;
    assert(user && user.lastLoginAt, `session.user.lastLoginAt 应为非空，实际 ${JSON.stringify(user)}`);

    await gotoPath(pageAdmin, '/account');
    await expectText(pageAdmin, /账户设置/, '账户设置页标题');
    const pageBody = squash(await bodyText(pageAdmin));
    for (const label of ['用户名', '角色', '状态', '上次登录']) {
      assert(pageBody.includes(label), `账户页身份区缺少「${label}」：${snippet(pageBody)}`);
    }
    const lastLogin = await labeledValue(pageAdmin, '上次登录');
    assert(lastLogin, `账户页「上次登录」应为非空值，实际「${lastLogin}」：${snippet(pageBody)}`);
    assert(!/^[—–\-]+$/.test(lastLogin), `账户页「上次登录」不应是占位符「${lastLogin}」`);
    assert(/\d/.test(lastLogin), `账户页「上次登录」应含时间信息，实际「${lastLogin}」`);

    const saveName = await findButton(pageAdmin, '保存用户名');
    const savePassword = await findButton(pageAdmin, '保存密码');
    assert(saveName, '正常态账户页缺少「保存用户名」按钮');
    assert(savePassword, '正常态账户页缺少「保存密码」按钮');
    const hasUsernameBlock = pageBody.includes('修改用户名');
    const hasPasswordBlock = pageBody.includes('修改密码');
    assert(hasUsernameBlock && hasPasswordBlock, '账户页应同时有「修改用户名」「修改密码」区块');
    await shot(pageAdmin, '13-account-normal');
    return `lastLoginAt=${user.lastLoginAt}；页面上次登录=${lastLogin}`;
  });

  // ── AC14：侧栏 4 项 + admin 下拉 4 项 + a11y 收起 ──
  await step('AC14 侧栏恰 4 项且无「退出登录/提醒规则/账户设置」；admin 下拉动作项恰 4 个且顺序固定；Esc/点击外部关闭', async () => {
    await gotoPath(pageAdmin, '/portfolios');
    await pageAdmin.waitForTimeout(1500);
    const aside = pageAdmin.locator('aside').first();
    await requireVisible(aside, '侧栏');
    const navLinks = aside.locator('nav a');
    const navCount = await navLinks.count();
    const navTexts = (await navLinks.allInnerTexts()).map(squash);
    assert(navCount === 4, `侧栏导航项应恰 4 个，实际 ${navCount}（${navTexts.join(' | ')}）`);
    for (const expected of ['Dashboard', '组合管理', '今日行情', '日志']) {
      assert(navTexts.some((text) => text.includes(expected)), `侧栏缺少「${expected}」，实际 ${navTexts.join(' | ')}`);
    }
    const asideText = squash(await aside.innerText());
    assert(!asideText.includes('退出登录'), '侧栏不应有「退出登录」');
    assert(!asideText.includes('提醒规则'), '侧栏不应有「提醒规则」（v1.5 移入下拉）');
    assert(!asideText.includes('账户设置'), '侧栏不应有任何账户入口（D12）');

    const trigger = await openUserMenu(pageAdmin);
    assert((await trigger.getAttribute('aria-expanded')) === 'true', '展开后 aria-expanded 应为 true');
    const names = await menuItemNames(pageAdmin);
    assert(
      JSON.stringify(names) === JSON.stringify(['账户设置', '系统设置', '提醒规则', '退出登录']),
      `admin 下拉动作项应恰为 [账户设置, 系统设置, 提醒规则, 退出登录]，实际 ${JSON.stringify(names)}`
    );
    const menuText = squash(await menuPanel(pageAdmin).innerText());
    assert(menuText.includes(ADMIN_USER) && menuText.includes('管理员'), `下拉身份行应为「用户名 + 管理员」，实际：${snippet(menuText)}`);

    // Esc 关闭
    await pageAdmin.keyboard.press('Escape');
    await pageAdmin.waitForTimeout(400);
    const expandedAfterEsc = await trigger.getAttribute('aria-expanded');
    const menuVisibleAfterEsc = await menuPanel(pageAdmin).isVisible().catch(() => false);
    assert(expandedAfterEsc !== 'true' && !menuVisibleAfterEsc, `Esc 应关闭下拉（aria-expanded=${expandedAfterEsc}, visible=${menuVisibleAfterEsc}）`);

    // 点击外部关闭
    await trigger.click();
    await pageAdmin.waitForTimeout(350);
    await pageAdmin.locator('main').first().click({ position: { x: 6, y: 6 } }).catch(() => {});
    await pageAdmin.waitForTimeout(450);
    assert(!(await menuPanel(pageAdmin).isVisible().catch(() => false)), '点击下拉外部应关闭下拉');
    await shot(pageAdmin, '14-sidebar-and-admin-menu');
    return `侧栏=${navTexts.join('/')}；下拉=${names.join('/')}`;
  });

  // ── AC11a：系统设置页形态 + 唯一启用 admin 保护态 ──
  await step('AC11a /account/users：页头/表头/按钮完整；自己那行无「重置密码」、唯一启用 admin 的停用与降级禁用并说明原因', async () => {
    await gotoPath(pageAdmin, '/account/users');
    await expectText(pageAdmin, /系统设置/, '系统设置页头');
    await pageAdmin.waitForTimeout(1200);
    const { headers } = await tableHeaders(pageAdmin);
    assert(headers.length > 0, `未找到用户表格表头，页面：${snippet(await bodyText(pageAdmin))}`);
    for (const expected of ['用户名', '角色', '状态', '上次登录', '创建时间', '操作']) {
      assert(headers.some((header) => header.includes(expected)), `表头缺少「${expected}」，实际 ${headers.join(' | ')}`);
    }
    assert(headers.some((header) => header.includes('改密')), `表头缺少「改密/待改密」列，实际 ${headers.join(' | ')}`);
    assert(await findButton(pageAdmin, '新建用户'), '缺少「新建用户」按钮');
    assert(await findButton(pageAdmin, '刷新'), '缺少「刷新」按钮');

    const ownRow = await waitRowByUsername(pageAdmin, ADMIN_USER);
    const rowText = squash(await ownRow.innerText());
    assert(!rowText.includes('重置密码'), `自己那一行不应提供「重置密码」（D9），实际：${snippet(rowText)}`);
    assert(rowText.includes('改密码'), `自己那一行应提供「改密码」入口，实际：${snippet(rowText)}`);

    const stopButton = await findButton(ownRow, '停用');
    assert(stopButton, '自己那一行应有「停用」按钮');
    assert(await stopButton.isDisabled(), '唯一启用管理员的「停用」按钮应为禁用态');
    const stopTitle = await attrTitle(stopButton);
    assert(
      /最后一个启用管理员|不能停用自己/.test(stopTitle),
      `停用按钮 title 应说明原因（最后一个启用管理员/不能停用自己），实际「${stopTitle}」`
    );

    const roleSelect = ownRow.locator('select').filter({ visible: true }).first();
    assert((await roleSelect.count().catch(() => 0)) > 0, '自己那一行应有角色下拉');
    assert(await roleSelect.isDisabled(), '唯一启用管理员的角色下拉应为禁用态');
    const roleTitle = await attrTitle(roleSelect);
    assert(/最后一个启用管理员|不可降级/.test(roleTitle), `角色下拉 title 应说明原因，实际「${roleTitle}」`);

    await shot(pageAdmin, '15-account-users');
    return `表头=${headers.join('/')}；停用 title=${stopTitle}；降级 title=${roleTitle}`;
  });

  // ── AC9a：管理员新建 member 用户 ──
  await step('AC9a admin 新建 member（e2e_member）→ 表格出现该行且带「待改密」，并提示对方首登需改密', async () => {
    await startTextWatcher(pageAdmin, '__e2eCreateUserNote', '首次登录需改密|首次登录需要改密|需改密');
    await clickButton(pageAdmin, '新建用户');
    const dialog = await requireVisible(pageAdmin.getByRole('dialog').filter({ visible: true }).first(), '新建用户弹窗');
    await fillCreateUserDialog(dialog, { username: MEMBER_USER, password: MEMBER_PASS, role: 'member' });
    await submitDialog(dialog);
    const memberRow = await waitRowByUsername(pageAdmin, MEMBER_USER);
    const rowText = squash(await memberRow.innerText());
    assert(rowText.includes('待改密'), `新建用户行应显示「待改密」，实际：${snippet(rowText)}`);
    assert(rowText.includes('成员'), `新建用户角色应为「成员」，实际：${snippet(rowText)}`);
    const note = await readTextWatcher(pageAdmin, '__e2eCreateUserNote');
    assert(note, `新建成功后应提示「对方首次登录需改密」（U3-R2），实际未捕获到提示文案`);
    await shot(pageAdmin, '16-created-member');
    return `行内容=${snippet(rowText)}；提示=${note}`;
  });

  // ── AC9b：新账号首登 → 强制改密闸门 → 改密后进入系统 ──
  await step('AC9b 新账号 e2e_member 首登 → 强制改密闸门（业务路由被拦）；member 强制态下拉可用且无「系统设置」；改密后进入系统', async () => {
    ctxMember = await browser.newContext({ viewport, locale: 'zh-CN' });
    pageMember = await ctxMember.newPage();
    pageMember.setDefaultTimeout(12000);
    track(pageMember, 'member');
    await gotoPath(pageMember, '/login');
    await loginAs(pageMember, MEMBER_USER, MEMBER_PASS);
    await waitLoggedIn(pageMember);
    assert(new URL(pageMember.url()).pathname === '/account', `新账号首登应落 /account，实际 ${pageMember.url()}`);
    await expectText(pageMember, /首次登录.{0,3}修改密码/, 'member 首登 banner');

    await gotoPath(pageMember, '/portfolios');
    await expectText(pageMember, /需要修改密码后才能继续/, 'member 强制改密屏');

    await openUserMenu(pageMember);
    const forcedNames = await menuItemNames(pageMember);
    assert(forcedNames.length === 3, `member 下拉动作项应恰 3 个，实际 ${JSON.stringify(forcedNames)}`);
    assert(!forcedNames.includes('系统设置'), 'member 下拉不应有「系统设置」（D6/D13）');
    await closeUserMenu(pageMember);

    await gotoPath(pageMember, '/account');
    const { successText, session } = await performPasswordChange(pageMember, ctxMember, {
      current: MEMBER_PASS,
      next: MEMBER_NEW_PASS,
      forced: true
    });
    assert(session.user?.mustChangePassword === false, 'member 改密后 mustChangePassword 应为 false');
    await gotoPath(pageMember, '/portfolios');
    await pageMember.waitForTimeout(2500);
    const body = squash(await bodyText(pageMember));
    assert(!body.includes('需要修改密码后才能继续'), 'member 改密后应解除强制闸门');
    assert(!body.includes('数据加载失败'), `member 改密后业务页不应报错：${snippet(body)}`);
    await shot(pageMember, '17-member-business');
    return `改密提示=${successText || '（未捕获文案，以会话为准）'}；member 进入系统`;
  });

  // ── AC9c：member 正常态下拉（3 项、无系统设置）+ 侧栏 ──
  await step('AC9c member 下拉恰 3 个动作项（账户设置/提醒规则/退出登录，无系统设置），身份行含用户名+成员；侧栏 4 项无登出', async () => {
    await openUserMenu(pageMember);
    const names = await menuItemNames(pageMember);
    assert(
      JSON.stringify(names) === JSON.stringify(['账户设置', '提醒规则', '退出登录']),
      `member 下拉动作项应恰为 [账户设置, 提醒规则, 退出登录]，实际 ${JSON.stringify(names)}`
    );
    const menuText = squash(await menuPanel(pageMember).innerText());
    assert(menuText.includes(MEMBER_USER) && menuText.includes('成员'), `member 下拉身份行应为「用户名 + 成员」，实际：${snippet(menuText)}`);
    await clickMenuItem(pageMember, '账户设置');
    await pageMember.waitForURL((url) => url.pathname === '/account', { timeout: 15000 });
    await expectText(pageMember, /账户设置/, 'member 账户设置页');

    const aside = pageMember.locator('aside').first();
    await requireVisible(aside, 'member 侧栏');
    const navCount = await pageMember.locator('aside nav a').count();
    assert(navCount === 4, `member 侧栏导航项应恰 4 个，实际 ${navCount}`);
    const asideText = squash(await aside.innerText());
    assert(!asideText.includes('退出登录') && !asideText.includes('提醒规则'), 'member 侧栏不应有「退出登录/提醒规则」');
    await shot(pageMember, '18-member-account');
    return `下拉=${names.join('/')}；侧栏=${navCount} 项`;
  });

  // ── AC10：member 直访 /account/users → 403 屏 ──
  await step('AC10 member 直访 /account/users → 「无权访问用户管理」403 屏（不静默、无用户表格）', async () => {
    await gotoPath(pageMember, '/account/users');
    await expectText(pageMember, /无权访问用户管理/, '403 屏文案', 15000);
    const body = squash(await bodyText(pageMember));
    assert(!body.includes('新建用户'), '403 屏不应渲染用户管理操作');
    const tableCount = await pageMember.getByRole('table').count();
    assert(tableCount === 0, `403 屏不应渲染用户表格，实际 table=${tableCount}`);
    await shot(pageMember, '19-member-403');
    return '403 屏正确';
  });

  // ── AC12：管理员重置 member 密码 → member 现存会话立即失效 ──
  await step('AC12 admin 重置 member 密码 → member 下一次请求即 401 并跳 /login?next=/portfolios（原路径）', async () => {
    // 让 member 停留在业务页，重置后观察其「下一次请求」
    await gotoPath(pageMember, '/portfolios');
    await pageMember.waitForTimeout(1200);

    await gotoPath(pageAdmin, '/account/users');
    await pageAdmin.waitForTimeout(1200);
    const memberRow = await waitRowByUsername(pageAdmin, MEMBER_USER);
    const resetButton = await findButton(memberRow, '重置密码');
    assert(resetButton, 'member 行应有「重置密码」按钮');
    await resetButton.click();
    const dialog = await requireVisible(pageAdmin.getByRole('dialog').filter({ visible: true }).first(), '重置密码弹窗');
    const passwordInputs = dialog.locator('input[type="password"]');
    const inputCount = await passwordInputs.count();
    assert(inputCount >= 1, `重置密码弹窗应有密码输入框，实际 ${inputCount}`);
    for (let i = 0; i < inputCount; i += 1) await passwordInputs.nth(i).fill(MEMBER_RESET_PASS);
    await submitDialog(dialog);

    await pageMember.reload({ waitUntil: 'domcontentloaded' });
    await pageMember.waitForURL((url) => url.pathname === '/login', { timeout: 20000 });
    const url = new URL(pageMember.url());
    assert(url.searchParams.get('next') === '/portfolios', `401 跳登录应保留原路径 next=/portfolios，实际 ${url.search}`);
    await shot(pageMember, '20-member-kicked-out');
    return `member 被踢下线，next=${url.searchParams.get('next')}`;
  });

  // ── D8：停用账号的登录文案（唯一例外） ──
  await step('D8 停用账号后登录 → 明确文案「该账号已停用，请联系管理员」（D8），而非统一错误文案', async () => {
    await gotoPath(pageAdmin, '/account/users');
    await pageAdmin.waitForTimeout(1200);
    const memberRow = await waitRowByUsername(pageAdmin, MEMBER_USER);
    const stopButton = await findButton(memberRow, '停用');
    assert(stopButton, 'member 行应有「停用」按钮');
    await stopButton.click();
    // window.confirm 已由 track() 的 dialog handler 自动接受
    await pageAdmin.waitForTimeout(1500);
    await clickButton(pageAdmin, '刷新');
    await pageAdmin.waitForTimeout(1500);
    const refreshedRow = await waitRowByUsername(pageAdmin, MEMBER_USER);
    const refreshedText = squash(await refreshedRow.innerText());
    assert(/已停用|禁用/.test(refreshedText) || refreshedText.includes('启用'), `停用后行状态应变化，实际：${snippet(refreshedText)}`);

    ctxMember2 = await browser.newContext({ viewport, locale: 'zh-CN' });
    pageMember2 = await ctxMember2.newPage();
    pageMember2.setDefaultTimeout(12000);
    track(pageMember2, 'member2');
    await gotoPath(pageMember2, '/login');
    await loginAs(pageMember2, MEMBER_USER, MEMBER_RESET_PASS);
    await expectText(pageMember2, /该账号已停用，请联系管理员/, '停用账号登录文案', 15000);
    assert(new URL(pageMember2.url()).pathname === '/login', '停用账号不应登录成功');
    await shot(pageMember2, '21-disabled-account-login');
    return '停用账号文案正确且未登录成功';
  });

  // ── AC13：改用户名 → 顶栏即时刷新（无整页刷新）→ 旧名失败 / 新名成功 ──
  await step('AC13 改用户名 admin→admin2：顶栏身份行即时显示新名（无整页刷新）；旧名登录失败、新名可登录', async () => {
    await gotoPath(pageAdmin, '/account');
    await expectText(pageAdmin, /账户设置/, '账户设置页');
    const saveNameButton = await findButton(pageAdmin, '保存用户名');
    assert(saveNameButton, '账户页缺少「保存用户名」按钮');
    const group = await inputGroupFor(saveNameButton);
    assert(group, '找不到改用户名表单容器');
    const input = group.locator('input:not([type="password"])').filter({ visible: true }).first();
    assert((await input.count().catch(() => 0)) > 0, '改用户名表单缺少输入框');
    await input.fill(ADMIN_RENAMED);

    // 用 window 标记证明保存后没有发生整页刷新（FS：顶栏即时刷新，无需刷新页面）
    await pageAdmin.evaluate(() => { window.__e2eNoReloadMarker = 'kept'; });
    await saveNameButton.click();
    const menuText = await waitUserMenuContains(pageAdmin, ADMIN_RENAMED, 15000);
    const marker = await pageAdmin.evaluate(() => window.__e2eNoReloadMarker).catch(() => null);
    assert(marker === 'kept', '改用户名后发生了整页刷新（FS U2 AC：顶栏身份行应即时显示新名，无需刷新页面）');
    await closeUserMenu(pageAdmin);
    await shot(pageAdmin, '22-renamed-user-menu');

    await logoutViaMenu(pageAdmin);
    await gotoPath(pageAdmin, '/login');
    await loginAs(pageAdmin, ADMIN_USER, ADMIN_PASS);
    await expectText(pageAdmin, /用户名或密码错误/, '旧用户名登录失败文案', 15000);
    assert(new URL(pageAdmin.url()).pathname === '/login', '旧用户名不应登录成功');

    await gotoPath(pageAdmin, '/login');
    await loginAs(pageAdmin, ADMIN_RENAMED, ADMIN_PASS);
    await pageAdmin.waitForURL((url) => url.pathname === '/', { timeout: 25000 });
    await shot(pageAdmin, '23-renamed-login');
    return `顶栏即时显示 ${ADMIN_RENAMED}；旧名被拒、新名可登录；身份行=${snippet(menuText)}`;
  });

  // ── AC11b（可选）：第二个 admin 建立后，唯一管理员保护态按服务端事实解除 ──
  await step('AC11b 新建第二个 admin 后，原唯一管理员的「降级」下拉恢复可用（保护态按列表事实解除）', async () => {
    await gotoPath(pageAdmin, '/account/users');
    await pageAdmin.waitForTimeout(1200);
    await clickButton(pageAdmin, '新建用户');
    const dialog = await requireVisible(pageAdmin.getByRole('dialog').filter({ visible: true }).first(), '新建用户弹窗');
    await fillCreateUserDialog(dialog, { username: ADMIN2_USER, password: ADMIN2_PASS, role: 'admin' });
    await submitDialog(dialog);
    await waitRowByUsername(pageAdmin, ADMIN2_USER);
    await clickButton(pageAdmin, '刷新');
    await pageAdmin.waitForTimeout(1500);

    const ownRow = await waitRowByUsername(pageAdmin, ADMIN_RENAMED);
    const roleSelect = ownRow.locator('select').filter({ visible: true }).first();
    assert((await roleSelect.count().catch(() => 0)) > 0, '自己那一行应有角色下拉');
    assert(!(await roleSelect.isDisabled()), '已有第二个启用管理员后，自己的降级下拉应恢复可用');
    await shot(pageAdmin, '24-second-admin');
    return `已创建 ${ADMIN2_USER}，原管理员降级下拉恢复可用`;
  });

  // ── 直接查库：最终状态与密码哈希 ──
  await step('DB 直接查库：admin2 生效、旧用户名已不存在、member 停用且需改密、密码为 bcrypt、会话已吊销', async () => {
    const data = await withDb(async (db) => {
      const users = await db.collection('users').find({}).toArray();
      const sessions = await db.collection('sessions').find({}).toArray();
      return { users, sessions };
    });

    const admin = data.users.find((user) => user.username === ADMIN_RENAMED);
    assert(admin, `库中应存在改名后的 ${ADMIN_RENAMED}`);
    assert(admin.role === 'admin' && admin.active === true, `${ADMIN_RENAMED} 应为启用状态的管理员`);
    assert(admin.mustChangePassword === false, `${ADMIN_RENAMED} 改密后 mustChangePassword 应为 false`);
    assert(typeof admin.passwordHash === 'string' && admin.passwordHash.startsWith('$2'), '密码必须以 bcrypt 哈希存储');
    assert(admin.passwordHash !== ADMIN_PASS, '明文密码不得入库');
    assert(!data.users.some((user) => user.username === ADMIN_USER), `旧用户名 ${ADMIN_USER} 应已不存在（是改名而非新建）`);

    const member = data.users.find((user) => user.username === MEMBER_USER);
    assert(member, `库中应存在 ${MEMBER_USER}`);
    assert(member.active === false, `${MEMBER_USER} 应为停用状态`);
    assert(member.mustChangePassword === true, `管理员重置密码后 ${MEMBER_USER} 应为待改密`);
    assert(typeof member.passwordHash === 'string' && member.passwordHash.startsWith('$2'), 'member 密码必须以 bcrypt 哈希存储');

    const memberSessions = data.sessions.filter((session) => String(session.userId) === String(member._id));
    assert(memberSessions.length === 0, `停用/重置后 member 会话应为 0，实际 ${memberSessions.length}`);

    return `users=${data.users.length} sessions=${data.sessions.length}；成员会话已吊销`;
  });

  // ── 运行时异常 ──
  await step('运行时无页面级 JS 异常（pageerror）', async () => {
    assert(pageErrors.length === 0, `出现 pageerror：${pageErrors.slice(0, 3).join(' | ')}`);
    const unexpectedConsole = consoleErrors.filter((entry) => !/Failed to load resource|401|403|429/.test(entry));
    return `pageerror=0；console.error 共 ${consoleErrors.length} 条（其中非预期 ${unexpectedConsole.length} 条）`;
  });

  await ctxAdmin.close().catch(() => {});
  if (ctxAdminB) await ctxAdminB.close().catch(() => {});
  if (ctxMember) await ctxMember.close().catch(() => {});
  if (ctxMember2) await ctxMember2.close().catch(() => {});
}

/** 读取「上次登录」标签对应的值（兄弟节点 → 父元素文本兜底）。 */
async function labeledValue(page, label) {
  const labelLocator = page.getByText(label, { exact: true }).filter({ visible: true }).first();
  if ((await labelLocator.count().catch(() => 0)) === 0) return '';

  const nextSibling = labelLocator.locator('xpath=following-sibling::*[1]');
  if (await nextSibling.count().catch(() => 0)) {
    const value = squash(await nextSibling.innerText().catch(() => ''));
    if (value) return value;
  }

  const parent = labelLocator.locator('xpath=..');
  if (await parent.count().catch(() => 0)) {
    const value = squash(await parent.innerText().catch(() => '')).replace(label, '').replace(/^[：:]\s*/, '').trim();
    if (value) return value;
  }

  const grandParent = labelLocator.locator('xpath=../..');
  if (await grandParent.count().catch(() => 0)) {
    const value = squash(await grandParent.innerText().catch(() => '')).replace(label, '').replace(/^[：:]\s*/, '').trim();
    if (value) return value;
  }
  return '';
}

// ───────────────────────────── 冒烟模式（仅验证自起环境机制） ─────────────────────────────
async function runSmoke(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await step('SMOKE server(8080) 未登录会话端点 = authenticated:false', async () => {
    const response = await fetch(`${API_BASE}/api/auth/session`);
    const body = await response.json();
    assert(response.ok, `HTTP ${response.status}`);
    assert(body?.data?.authenticated === false, `期望 authenticated=false，实际 ${JSON.stringify(body?.data)}`);
    return '真实 server 就绪';
  });

  await step('SMOKE vite(6600) 能返回 SPA 壳并可启动 Chrome 渲染', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const body = await bodyText(page);
    assert(body.length > 10, `页面内容过少：${snippet(body)}`);
    const title = await page.title();
    assert(title.includes('PortoMind') || body.includes('PortoMind'), `页面/标题应含 PortoMind（title=${title}）`);
    await shot(page, 'smoke-01-root');
    return `title=${title}；body=${snippet(body, 120)}`;
  });

  await step('SMOKE 浏览器可正常打开 /login 路径（不要求页面已实现）', async () => {
    const response = await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForTimeout(1500);
    const title = await page.title();
    return `HTTP=${response ? response.status() : 'n/a'}；url=${page.url()}；title=${title}`;
  });

  await step('SMOKE 无页面级 JS 异常', async () => {
    assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  });

  await ctx.close().catch(() => {});
}

// ───────────────────────────── 无浏览器环境冒烟（验证自起环境的接管链，不启动 Chrome） ─────────────────────────────
async function runEnvApiChecks(client) {
  await step('ENV client 服务返回 SPA 壳', async () => {
    const response = await fetch(`${BASE}/`);
    assert(response.ok, `HTTP ${response.status}`);
    const html = await response.text();
    assert(
      html.includes('PortoMind') || html.includes('/@vite/client'),
      `未返回 SPA 壳：${snippet(html, 200)}`
    );
    return `client mode=${client.mode}`;
  });

  await step('ENV 真实 server 未登录 session = authenticated:false', async () => {
    const response = await fetch(`${API_BASE}/api/auth/session`);
    const body = await response.json();
    assert(body?.data?.authenticated === false, JSON.stringify(body?.data));
    return 'OK';
  });

  await step('ENV admin/admin 真实登录 → 200 + pm_sid cookie + mustChangePassword=true', async () => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: 'admin' })
    });
    const body = await response.json();
    assert(response.status === 200, `登录应 200，实际 ${response.status}（${JSON.stringify(body)}）`);
    assert(body?.data?.user?.mustChangePassword === true, 'mustChangePassword 应为 true');
    const setCookie = response.headers.get('set-cookie') || '';
    assert(setCookie.includes('pm_sid='), `应下发 pm_sid cookie，实际 ${setCookie}`);
    return 'seed + 登录 OK';
  });

  await step('ENV 强制改密闸门：改密前业务端点 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const login = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: 'admin' })
    });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const gated = await fetch(`${API_BASE}/api/portfolios`, { headers: { cookie } });
    const body = await gated.json().catch(() => ({}));
    assert(gated.status === 403, `应 403，实际 ${gated.status}`);
    assert(body?.code === 'PASSWORD_CHANGE_REQUIRED', `code 应为 PASSWORD_CHANGE_REQUIRED，实际 ${body?.code}`);
    return '闸门 OK';
  });
}

// ───────────────────────────── 入口 ─────────────────────────────
async function main() {
  console.log('=== TASK-058 U2/U3 真实浏览器验收（独立 Reviewer） ===');
  console.log(`BASE=${BASE}  API=${API_BASE}  CHROME=${CHROME}`);
  mkdirSync(SHOT_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });

  // 1) 临时库护栏
  const envPath = path.join(SERVER_DIR, '.env');
  let envText = '';
  try {
    envText = readFileSync(envPath, 'utf8');
  } catch (error) {
    throw new Error(`E2E_REFUSED: 读取 ${envPath} 失败：${error.message}`);
  }
  const baseUri = readEnvValue(envText, 'MONGO_URI');
  if (!baseUri) throw new Error('E2E_REFUSED: server/.env 缺少 MONGO_URI');
  TEMP_URI = deriveTempUri(baseUri, DB_NAME);
  console.log(`临时库（已护栏校验）= ${maskUri(TEMP_URI)}`);

  // 2) 端口预检：server 端口必须空闲（避免误连到别人已起的 server）；
  //    客户端端口允许已有可用的 vite dev（外部实例），其余情况由 startClient 处理。
  if (await probePort(SERVER_PORT)) {
    throw new Error(
      `E2E_ENV_CONFLICT: server 端口 ${SERVER_PORT} 已被占用。请先停掉本机已在运行的 server，再重跑（脚本会自起 8080）。`
    );
  }

  // 3) 清空临时库（仅该库）
  try {
    await dropTempDatabase();
    console.log('临时库已清空。');
  } catch (error) {
    throw new Error(`E2E_REFUSED: 无法连接/清空临时库 ${DB_NAME}：${error.message}`);
  }

  const clientPort = Number(new URL(BASE).port || 80);
  let server = null;
  let client = null;
  let browser = null;
  let fatalError = null;

  try {
    server = spawnServer(TEMP_URI);
    console.log(`已 spawn server（${SERVER_PORT}），等待就绪…`);
    await waitForHttp(`${API_BASE}/api/auth/session`, 120000, `server(${SERVER_PORT})`);
    const sessionProbe = await fetch(`${API_BASE}/api/auth/session`).then((response) => response.json());
    if (sessionProbe?.data?.authenticated !== false) {
      throw new Error(`E2E_REFUSED: server 会话端点初始态异常：${JSON.stringify(sessionProbe?.data)}（可能连到了非临时库实例）`);
    }

    client = await startClient(clientPort);
    check('ENV 客户端服务就绪', true, client.description);
    console.log('两端就绪。启动 Chrome…');

    if (SKIP_BROWSER) {
      await runEnvApiChecks(client);
    } else {
      browser = await chromium.launch({ executablePath: CHROME, headless: true });
      if (SMOKE) {
        await runSmoke(browser);
      } else {
        await runBrowserChecks(browser);
      }
    }
  } catch (error) {
    fatalError = error;
    console.error('E2E_CRASH', error.message);
    check('E2E 运行未中断（自起环境 + 浏览器流程）', false, error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (client) await client.stop().catch(() => {});
    await stopChild(server);
    try {
      await dropTempDatabase();
      console.log('临时库已 drop，子进程已停止。');
    } catch (error) {
      console.error(`WARN: 临时库清理失败：${error.message}`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n===== TASK-058 U2/U3 E2E：${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    console.log('FAILED:');
    for (const item of failed) console.log(` - ${item.name} — ${item.detail}`);
  }
  if (shots.length) console.log(`截图（${shots.length} 张）：\n  ${shots.join('\n  ')}`);
  if (fatalError) console.log(`\n致命错误：${fatalError.message}`);

  process.exitCode = failed.length || fatalError ? 1 : 0;
}

main().catch((error) => {
  console.error('E2E_FATAL', error.message);
  process.exitCode = 1;
});
