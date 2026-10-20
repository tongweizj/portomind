// client/scripts/verify-transaction-routes.mjs
// TASK-044 AC4 / AC5 的可复跑验证：用 react-router 自身的 matchRoutes 校验真实路由表。
//
// 为什么不用「人眼看 router.jsx」：AC4 的核心风险是 `/portfolios/transactions`（2 段字面量）
// 被 `/portfolios/:id/...` 类模式吞掉，这取决于 React Router 的段优先级实现，必须实测。
//
// 运行：node client/scripts/verify-transaction-routes.mjs
import { matchRoutes } from 'react-router';
import { ROUTE_PATTERNS } from '../src/constants/routes.js';

// 与 client/src/router.jsx 中声明的交易相关路由保持一一对应（顺序也照抄）
const ROUTES_TABLE = [
  { path: ROUTE_PATTERNS.PORTFOLIO_TX_ALL, id: 'tx-all' },
  { path: ROUTE_PATTERNS.PORTFOLIO_TX_NEW, id: 'tx-new' },
  { path: ROUTE_PATTERNS.PORTFOLIO_TX_EDIT, id: 'tx-edit' },
  { path: ROUTE_PATTERNS.PORTFOLIO_TX_IMPORT, id: 'tx-import' },
  { path: ROUTE_PATTERNS.PORTFOLIO_LIST, id: 'portfolio-list' },
  { path: ROUTE_PATTERNS.PORTFOLIO_NEW, id: 'portfolio-new' },
  { path: ROUTE_PATTERNS.PORTFOLIO_EDIT, id: 'portfolio-edit' },
  { path: ROUTE_PATTERNS.PORTFOLIO_VIEW, id: 'portfolio-view' },
  { path: ROUTE_PATTERNS.PORTFOLIO_TAB, id: 'portfolio-tab' },
];

const PID = '6712ab34cd56ef7890123456';
const TXID = '6712ff34cd56ef78901234aa';

let pass = 0;
const failures = [];

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

// —— AC4：聚合页与写路由互不误匹配 ——
expectMatch('/portfolios/transactions', 'tx-all');
expectMatch(`/portfolios/${PID}/transactions/new`, 'tx-new', { id: PID });
expectMatch(`/portfolios/${PID}/transactions/import`, 'tx-import', { id: PID });
expectMatch(`/portfolios/${PID}/transactions/edit/${TXID}`, 'tx-edit', { id: PID, txId: TXID });

// —— 组合自身路由未受影响 ——
expectMatch('/portfolios', 'portfolio-list');
expectMatch('/portfolios/new', 'portfolio-new');
expectMatch(`/portfolios/edit/${PID}`, 'portfolio-edit', { id: PID });
expectMatch(`/portfolios/view/${PID}`, 'portfolio-view', { id: PID });
expectMatch(`/portfolios/view/${PID}/transactions`, 'portfolio-tab', { id: PID, tab: 'transactions' });

// —— AC5：旧 /transactions 路由族已不存在（生产环境由 `*` 通配兜底跳 /portfolios）——
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
