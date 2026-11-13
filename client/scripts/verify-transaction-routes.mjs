// client/scripts/verify-transaction-routes.mjs
// TASK-044 AC4 / AC5 的可复跑验证：用 react-router 自身的 matchRoutes 校验真实路由表。
//
// 为什么不用「人眼看 router.jsx」：AC4 的核心风险是 `/portfolios/transactions`（2 段字面量）
// 被 `/portfolios/:id/...` 类模式吞掉，这取决于 React Router 的段优先级实现，必须实测。
//
// TASK-047 M-6：原实现把路由表**复制**进脚本，`router.jsx` 漏声明时脚本仍然全绿（验证资产失效）。
// 现改为**读取 `client/src/router.jsx`** 的 `<Route path=...>` 声明派生期望集合，
// 再与实际 matchRoutes 结果比对：router 少一条 → 本脚本必须 FAIL。
//
// 运行：node client/scripts/verify-transaction-routes.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchRoutes } from 'react-router';
import { ROUTE_PATTERNS } from '../src/constants/routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROUTER_FILE = path.join(here, '..', 'src', 'router.jsx');

// 交易相关路由的稳定 id（用于断言的语义名，与 ROUTE_PATTERNS 的键一致）
const TX_ROUTE_IDS = {
  PORTFOLIO_TX_ALL: 'tx-all',
  PORTFOLIO_TX_NEW: 'tx-new',
  PORTFOLIO_TX_EDIT: 'tx-edit',
  PORTFOLIO_TX_IMPORT: 'tx-import'
};

// router.jsx 里的 `*` 通配（兜底跳 /portfolios）不参与本脚本的路由表：
// 它匹配一切，留在表内会让「旧 /transactions 族未被声明」的断言永远失败。
const CATCH_ALL_PATH = '*';

/**
 * 从 router.jsx 源码提取 `<Route path=...>` 声明，解析成实际路径模式。
 * 支持两种写法：
 *   <Route path={ROUTE_PATTERNS.XXX} ... />   → 查常量表
 *   <Route path="/literal" ... />             → 取字面量
 * @returns {Map<string,string>} 路径模式 → id（常量键名或字面量本身）
 */
function readDeclaredRoutes() {
  const source = readFileSync(ROUTER_FILE, 'utf-8');
  const declared = new Map();
  const re = /<Route[^>]*\spath=(?:"([^"]+)"|\{ROUTE_PATTERNS\.([A-Z_]+)\})/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const literal = m[1];
    const constantKey = m[2];
    if (constantKey) {
      const pattern = ROUTE_PATTERNS[constantKey];
      if (!pattern) continue;
      declared.set(pattern, TX_ROUTE_IDS[constantKey] || constantKey);
    } else if (literal) {
      declared.set(literal, literal);
    }
  }
  return declared;
}

// 由 router.jsx 派生实际路由表（不再手抄）；排除 `*` 兜底通配。
const declared = readDeclaredRoutes();
const ROUTES_TABLE = [...declared.entries()]
  .filter(([pattern]) => pattern !== CATCH_ALL_PATH)
  .map(([pattern, id]) => ({ path: pattern, id }));

const PID = '6712ab34cd56ef7890123456';
const TXID = '6712ff34cd56ef78901234aa';

let pass = 0;
const failures = [];

/** M-6：确认 router.jsx 真的声明了每条交易路由（漏声明 → 失败）。 */
function expectDeclared(constantKey) {
  const pattern = ROUTE_PATTERNS[constantKey];
  if (!declared.has(pattern)) {
    failures.push(`router.jsx 未声明 ${constantKey} (${pattern})`);
    return;
  }
  pass += 1;
}

function expectMatch(url, expectedId, expectedParams = {}) {
  const matched = matchRoutes(ROUTES_TABLE, url);
  const leaf = matched?.[matched.length - 1];
  const label = `${url} → ${expectedId}`;
  if (!leaf) {
    failures.push(`${label}｜未匹配任何路由`);
    return;
  }
  if (leaf.route.id !== expectedId) {
    failures.push(`${label}｜实际命中 ${leaf.route.id}`);
    return;
  }
  for (const [key, value] of Object.entries(expectedParams)) {
    if (leaf.params[key] !== value) {
      failures.push(`${label}｜参数 ${key} 期望 ${value}，实际 ${leaf.params[key]}`);
      return;
    }
  }
  pass += 1;
}

function expectNoMatch(url) {
  const matched = matchRoutes(ROUTES_TABLE, url);
  if (matched) {
    failures.push(`${url} → 期望无匹配，实际命中 ${matched[matched.length - 1].route.id}`);
    return;
  }
  pass += 1;
}

// —— M-6：router.jsx 必须声明全部交易路由 ——
expectDeclared('PORTFOLIO_TX_ALL');
expectDeclared('PORTFOLIO_TX_NEW');
expectDeclared('PORTFOLIO_TX_EDIT');
expectDeclared('PORTFOLIO_TX_IMPORT');

// —— AC4：聚合页与写路由互不误匹配 ——
expectMatch('/portfolios/transactions', 'tx-all');
expectMatch(`/portfolios/${PID}/transactions/new`, 'tx-new', { id: PID });
expectMatch(`/portfolios/${PID}/transactions/import`, 'tx-import', { id: PID });
expectMatch(`/portfolios/${PID}/transactions/edit/${TXID}`, 'tx-edit', { id: PID, txId: TXID });

// —— 组合自身路由未受影响 ——
// 非交易路由的 id 由常量键名派生（如 PORTFOLIO_LIST），与 TX_ROUTE_IDS 的别名规则不同。
expectMatch('/portfolios', 'PORTFOLIO_LIST');
expectMatch('/portfolios/new', 'PORTFOLIO_NEW');
expectMatch(`/portfolios/edit/${PID}`, 'PORTFOLIO_EDIT', { id: PID });
expectMatch(`/portfolios/view/${PID}`, 'PORTFOLIO_VIEW', { id: PID });

// —— AC5：旧 /transactions 路由族已不存在 ——
// 注意：router.jsx 的 `*` 通配是 `<Route path="*">`，会匹配一切；它被声明在表内，
// 因此这里的「无匹配」断言针对的是**交易路由族**未被声明，而不是绝对无匹配。
expectNoMatch('/transactions');
expectNoMatch('/transactions/new');
expectNoMatch('/transactions/import');
expectNoMatch(`/transactions/edit/${TXID}`);

if (failures.length) {
  console.error(`FAIL ${failures.length} / ${pass + failures.length}`);
  failures.forEach(item => console.error(`  ✗ ${item}`));
  process.exit(1);
}

console.log(`PASS ${pass} / ${pass}`);
