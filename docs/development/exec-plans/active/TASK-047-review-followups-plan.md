# TASK-047 — TASK-044 审查遗留整改实施计划（M-1 / M-2 / M-5 / M-6）

## Status

Status：Approved（2026-11-11，Human 批准「051、047、046 三份计划」；`Draft → Approved` 归 Human）

Related Task：[TASK-047](../../tasks/active/TASK-047-review-followups.md)（独立维护任务，无 Story）。

Branch / Base：`main` @ `ee989c7`。实施时从最新 `main` 开 `feature/TASK-047-review-followups`。

Approval：**未批准**。`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。

## 1. Intent

收拢 TASK-044 审查遗留 4 项：

- **M-2（P0，数据完整性）**：编辑交易可静默把交易迁到另一个组合 → 必须由**后端**拒绝归属改写（Human 2026-10-19 裁定「方案②」）；
- **M-1（P1，回归）**：TASK-044 新增的 3 条交易写路由使侧栏无高亮；
- **M-5（P2，证据）**：`e2e-task-044.mjs` 两处恒真断言；
- **M-6（P2，证据）**：`verify-transaction-routes.mjs` 复制路由表而非读取 `router.jsx`。

M-3 已拆出（TASK-048，已完成）；M-4 已由 Orchestrator 处理。

## 2. Context

- 交易编辑页把 URL 的 `portfolioId` 强制写入表单，并在提交时一并发送。
- 后端 `updateTransaction` 走 `normalizeInput(input, existing)`，入参优先，因此归属被改写。
- 侧栏父项高亮由子项推导，`isPortfolioListPath` 只覆盖 `/portfolios`、`new`、`edit`、`view`。
- 两张验证脚本（E2E / 路由校验）存在断言缺陷，导致「绿」不可信。

## 3. Repository Findings（2026-11-11 亲读）

| # | 事实 | 落点 |
|---|---|---|
| F-01 | `WRITABLE_FIELDS` 含 `portfolioId` | `shared/services/transaction.service.js:7` |
| F-02 | 更新时入参优先合并 | `:126-137`（`normalizeInput(input, existing)` → `findByIdAndUpdate`） |
| F-03 | 编辑页**无条件**用路由 id 覆盖 `portfolioId` | `client/src/pages/Transaction/EditTransaction.jsx:42-47`、`:82` |
| F-04 | 侧栏判定不覆盖交易写路由 | `client/src/components/layout/Sidebar.jsx:22-27` |
| F-05 | E2E 脚本两处恒真断言 | `client/scripts/e2e-task-044.mjs`（审查 §11 已定位行） |
| F-06 | 路由校验脚本复制路由表 | `client/scripts/verify-transaction-routes.mjs` |

## 4. Proposed Design

### 4.1 M-2：后端归属守卫（权威层）

**守卫位置**：`updateTransaction` 中，**在 `normalizeInput` 之前**，且使用 `existing` 做比较：

```js
// 伪代码：必须在 normalizeInput 之前
if (input.portfolioId !== undefined && String(input.portfolioId) !== String(existing.portfolioId)) {
  throw businessError(400, 'PORTFOLIO_ID_IMMUTABLE', 'portfolioId cannot be changed; move the transaction by recreating it');
}
```

三条硬约束（卡内 R-1b / R-1c 明示）：

1. **不能**写成「出现 `portfolioId` 就拒绝」——前端每次编辑都会带该字段，会 400 全挂；
2. **不能**靠「从 WRITABLE_FIELDS 删除 `portfolioId`」——创建路径仍需它；
3. 校验必须在合并入参**之前**，否则已被覆盖。

### 4.2 M-2：前端配合（体验层）

- `EditTransaction.jsx` 提交时不再把 URL 的 `portfolioId` 强塞给接口（或改为发送 `tx.portfolioId`）。
- 若 `getTransaction` 返回的 `portfolioId` 与 URL 不符：**明确报错并中止渲染**，不静默改写。
- 两侧同 PR 提交，避免「后端已拒、前端仍发」造成编辑全挂。

### 4.3 M-1：侧栏高亮

```js
const isPortfolioListPath = (pathname) =>
  pathname === ROUTES.PORTFOLIO_LIST
  || pathname.startsWith('/portfolios/new')
  || pathname.startsWith('/portfolios/edit')
  || pathname.startsWith('/portfolios/view')
  || /^\/portfolios\/[^/]+\/transactions/.test(pathname);
```

注意：`/portfolios/transactions`（全部交易聚合页）第二段就是 `transactions`，**不得**被该正则命中（正则要求 `[^/]+` 在 `transactions` 之前，天然排除；需在手工验证中确认）。

### 4.4 M-5 / M-6：验证资产修正

- `e2e-task-044.mjs`：把两处恒真断言改为可失败断言（如断言具体 URL/元素数量，错误实现必须 FAIL）。
- `verify-transaction-routes.mjs`：改为**读取** `client/src/router.jsx`（正则提取 `<Route path=...>`）后与期望集合比对；
  漏声明时脚本必须 FAIL。允许跳过动态段的参数名差异，但不得硬编码整张表。
- 两项均不改产品行为，只改验证可信度。

## 5. Work Breakdown

### W1 · M-2 后端守卫 + 测试（1.5h）

- [ ] 在 `updateTransaction` 加入归属不可变校验（位置见 §4.1），错误码 `PORTFOLIO_ID_IMMUTABLE`、状态 400。
- [ ] 测试（`server/test/integration/transaction.enhanced.test.js` 或新文件）：
  - 改归属 → 400；
  - 不传 `portfolioId` → 200，归属不变；
  - 传相同 `portfolioId` → 200，归属不变；
  - 创建路径仍可用（POST 带 `portfolioId` → 201）。
- **先验红**：在未修复代码上跑「改归属 → 400」用例必须失败，存档红/绿两次输出。

### W2 · M-2 前端配合（1h）

- [ ] `EditTransaction.jsx`：提交体不再覆盖 `portfolioId`；归属不符时中止并提示。
- [ ] 手工验证：组合 A 的交易，用组合 B 的 URL 打开编辑 → 明确报错、不渲染可提交表单；正常编辑仍可保存。

### W3 · M-1 侧栏高亮（0.5h）

- [ ] 修改 `isPortfolioListPath`（§4.3）。
- [ ] 手工验证：进入 `/portfolios/:id/transactions/{new,edit/:txId,import}` 时侧栏「组合」族高亮；
      `/portfolios/transactions` 时高亮的是「全部交易」而非组合父项。

### W4 · M-5 / M-6 验证资产（1h）

- [ ] `e2e-task-044.mjs` 两处断言可失败化；
- [ ] `verify-transaction-routes.mjs` 改为读取 `router.jsx` 派生期望集合；
- [ ] 负向对照：临时从 `router.jsx` 删一条交易路由 → 校验脚本必须 FAIL；还原后 PASS。

### W5 · 验证与交接（0.5h）

- [ ] `npm run test:server`（248 + 新增，全绿）；`npm run build --workspace client`；`npm run lint --workspace client`；`npm run docs:check`；
- [ ] `node client/scripts/verify-transaction-routes.mjs` 通过；
- [ ] 计划 §11 写实施记录；提交 + PR。

## 6. Decisions

| # | 事项 | 决定 | 依据 |
|---|---|---|---|
| D-1 | M-2 修法 | **后端拒绝改写**（值不一致才拒），前端同步不再强塞 URL 归属 | Human 2026-10-19 裁定方案② |
| D-2 | 是否预留「有意迁移」开关 | **不预留** | 卡内 R-2：归属不可变；未来需要另立需求 |
| D-3 | M-5/M-6 是否算「凑数」 | **要做** | 它们决定「绿是否可信」；卡内 R-4 已说明定位 |

## 7. Verification

| AC | 方法 | 预期 |
|---|---|---|
| M-2 | W1 四条用例 + 先验红 | 改归属 400；其余 200；旧实现上红 |
| M-2 前端 | W2 手工 | 归属不符即报错；正常编辑可保存 |
| M-1 | W3 手工四条路径 | 写路由高亮；聚合页不被误吞 |
| M-5 | W4 负向对照 | 错误实现能 FAIL |
| M-6 | W4 删路由负向对照 | 脚本能发现漏声明 |
| 回归 | 全量 `test:server` | 248 + 新增全绿 |

## 8. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| R-1b 守卫写成「禁止出现 portfolioId」 | 正常编辑全 400 | W1 必须含「传相同值 → 200」用例 |
| R-1c 守卫放在 normalizeInput 之后 | 校验失效 | 代码评审明确位置；用例「改归属 → 400」可捕获 |
| R-3 正则误吞 `/portfolios/transactions` | 聚合页高亮错误 | 正则含 `[^/]+`；手工验证该路径 |
| R-5 既有测试依赖改写归属 | 测试需调整 | 先跑 `node --test server/test/integration/`，逐个评估，不盲目改断言 |
| 前后端不同步 | 编辑页全挂 | 同一 PR 提交；W2 手工验证先于合并 |

## 9. Rollback

分 W1（后端+测试）与 W2（前端）两个提交；任一失败可单独 revert。无 schema/迁移变更。

## 10. Implementer Handoff

- **输入**：本计划 §4 的守卫位置与三条硬约束、§5 步骤、卡内 M-1/M-2/M-5/M-6 条目；
- **授权**：须 Human 批准本计划；
- **边界**：不改归属语义（不可变）、不预留学生开关、不改 API 契约其他字段、不改 E2E 的通过标准以「凑绿」；
- **产出**：W1～W5 提交 + §11 记录 + 独立审查。

## 11. Implementation Record

### 11.1 基线（2026-11-11）

- `git rev-parse main` = `e1730a00f1ae3925d42474a022921c42c9505c77`；分支 `feature/TASK-047-review-followups`（自 `origin/main` `22f5f6e` 起）。
- 四项基线：`test:server` 248 pass；`build` ✓；`lint` 0 error / 5 warning；`docs:check` 141 文档 / 1438 链接 / ERROR 0。
- 环境：默认沙箱禁用 `child_process.spawn`（`node --test` / esbuild 报 `spawn EPERM`），下述输出为放开该限制后的真实结果。

### 11.2 W1 · M-2 后端守卫（权威层）

`shared/services/transaction.service.js` `updateTransaction`，**插在 `normalizeInput` 之前**：

```js
if (input && input.portfolioId !== undefined &&
    String(input.portfolioId) !== String(existing.portfolioId)) {
  throw businessError(400, 'PORTFOLIO_ID_IMMUTABLE', '...');
}
const data = normalizeInput(input, existing);
```

三条硬约束的落实：

| 约束 | 落实 |
|---|---|
| ① 不能「出现就拒绝」 | 判 `String(input.portfolioId) !== String(existing.portfolioId)`；同值放行 |
| ② 不能从 `WRITABLE_FIELDS` 删 `portfolioId` | `WRITABLE_FIELDS` **零改动**，创建路径照常 |
| ③ 必须在合并入参之前 | 校验语句位于 `normalizeInput` 调用之前 |

新增测试 `server/test/integration/transaction.portfolioImmutable.test.js`（4 条）。

**先验红**（未加守卫的实现）：

```
✖ M-2 更新时改归属 → 400 PORTFOLIO_ID_IMMUTABLE，且不写库
✔ M-2 不传 portfolioId → 200 且归属不变
✔ M-2 传相同 portfolioId → 200 且归属不变（编辑页每次都带该字段）
✔ M-2 创建路径仍可用：带 portfolioId 创建成功（不得从 WRITABLE_FIELDS 删除）
ℹ tests 4  ℹ pass 3  ℹ fail 1
```

即：旧实现确实接受归属改写（该用例失败），而其余 3 条通过，说明用例定位准确、不是「全红凑数」。

**加守卫后**：`ℹ tests 4  ℹ pass 4  ℹ fail 0`。

**真实 Mongo 实测**（`portomind_dev`，临时组合 A/B + 临时资产，用后即删）——满足卡内 AC1「不接受仅 mock」：

```
created tx in portfolio A = 6f00000000000000000000a1 | id = 6af497d030b976fea68ab58b
① 改归属结果 = {"status":400,"code":"PORTFOLIO_ID_IMMUTABLE"} (期望 400 PORTFOLIO_ID_IMMUTABLE)
   库内归属 = 6f00000000000000000000a1 (期望 A = 6f00000000000000000000a1)
   数量 = 10 (期望 10，未被写入)
② 不传 portfolioId → quantity = 12 | 库内归属 = A (不变)
③ 传相同 portfolioId → quantity = 13 | 库内归属 = A (不变)
④ 创建带 portfolioId 成功 = true
cleanup done
```

### 11.3 W2 · M-2 前端配合

`client/src/pages/Transaction/EditTransaction.jsx`：

- **不再用 URL 的 `portfolioId` 覆盖**表单：`setForm({ ...tx, date })`，归属以服务端返回为准。
- **归属不符则中止渲染**：`String(tx.portfolioId) !== String(portfolioId)` → `setMismatch(true)`，渲染「无法编辑该交易」提示页（含「交易归属不可修改；如需迁移，请重新创建」），**不渲染表单**。
- **提交体不再携带 `portfolioId`**：显式白名单 `{symbol, action, quantity, price, fee, date, notes}`。
  这样后端守卫与前端提交**同时**满足「值不一致才拒」与「正常编辑不 400」。

> 说明：因同一 PR 已让前端不再发送 `portfolioId`，后端守卫对**正常编辑**不再是必经路径；但守卫仍是权威防线（curl / 旧客户端 / 篡改请求都会被拒）。

**手工验证范围说明**：本机未启动前后端 dev server，未做浏览器点击级走查（见 §11.7 未验证项）；
逻辑正确性由真实库后端实测（§11.2）+ 前端分支判定代码审读覆盖。

### 11.4 W3 · M-1 侧栏高亮

`client/src/components/layout/Sidebar.jsx` `isPortfolioListPath` 增加：

```js
|| /^\/portfolios\/[^/]+\/transactions/.test(pathname)
```

谓词实测（9 条用例，含边界）：

| 路径 | 期望 | 实际 |
|---|---|---|
| `/portfolios/64b1/transactions/new` | 高亮组合 | ✅ true |
| `/portfolios/64b1/transactions/edit/abc` | 高亮组合 | ✅ true |
| `/portfolios/64b1/transactions/import` | 高亮组合 | ✅ true |
| `/portfolios/view/64b1/transactions` | 高亮组合 | ✅ true |
| `/portfolios` | 高亮组合 | ✅ true |
| `/portfolios/transactions` | **不**被组合项吞（归「全部交易」） | ✅ false |
| `/portfolios/transactions/x` | 不吞 | ✅ false |
| `/` | 不高亮 | ✅ false |
| `/prices` | 不高亮 | ✅ false |

另确认「全部交易」子项判定 `p === PORTFOLIO_TX_ALL`：`/portfolios/transactions` → true；
`/portfolios/64b1/transactions/new` → false（互不抢占）。

### 11.5 W4 · M-5 / M-6 验证资产

**M-5** `client/scripts/e2e-task-044.mjs` 两处恒真断言已改为可证伪：

| 原断言 | 问题 | 改为 |
|---|---|---|
| `!url.includes('/transactions/') \|\| url.includes('/portfolios/')` | 组合内 URL 必含 `/portfolios/`，恒真 | `/^\/portfolios\/view\/[a-f0-9]+\/transactions$/.test(pathname)` |
| `editedRow.includes('9') && !editedRow.includes('\t7\t')` | `innerText` 分隔符是 `\n`，负向半边恒真 | 首行第 5 列（份额）单元格 `=== '9'` |

负向对照（用旧断言 vs 新断言跑「停留在写路由」这一错误实现）：

```
old: true  (恒真，错误实现也通过)
new: false (能捕获)
NEW ASSERTION IS FALSIFIABLE
```

**M-6** `client/scripts/verify-transaction-routes.mjs` 已重写：不再手抄路由表，改为
`readFileSync(client/src/router.jsx)` + 正则提取 `<Route path=...>`（支持字面量与 `ROUTE_PATTERNS.X` 两种写法），
派生 `ROUTES_TABLE` 后再用 `matchRoutes` 实测；并新增 `expectDeclared()` 直接断言 4 条交易路由均已声明。
`*` 兜底通配被显式排除（否则「旧 /transactions 未被声明」的断言永远失败）。

**负向对照**（临时从 `router.jsx` 删除 `PORTFOLIO_TX_IMPORT` 一行）：

```
FAIL 2 / 16
  ✗ router.jsx 未声明 PORTFOLIO_TX_IMPORT (/portfolios/:id/transactions/import)
  ✗ /portfolios/6712ab34cd56ef7890123456/transactions/import → tx-import｜未匹配任何路由
```

还原后：`PASS 16 / 16`，且 `git diff client/src/router.jsx` 为空（已确认还原干净）。

### 11.6 W5 · 验证输出

| 命令 | 结果 |
|---|---|
| `npm run test:server` | ✅ `tests 252 / pass 252 / fail 0`（248 + 新增 4） |
| `npm run build --workspace client` | ✅ `✓ built in 2.83s` |
| `npm run lint --workspace client` | ✅ `0 errors, 5 warnings`（既存 fixture 警告） |
| `npm run docs:check` | ✅ `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |
| `node client/scripts/verify-transaction-routes.mjs` | ✅ `PASS 16 / 16`（负向对照见 §11.5） |

> 过程中曾出现一次 lint 失败（`'_omit' is assigned a value but never used`），已改为显式字段白名单后转绿，
> 未以 eslint-disable 绕过。

### 11.7 偏差与未验证项

- **无方案偏差**。
- **未验证（如实记录）**：未启动 dev server，未做浏览器点击级的 M-1 高亮与 M-2 归属不符页走查；
  M-1 由谓词单测式实测覆盖，M-2 由真实 Mongo 服务层实测覆盖。E2E 脚本本身未运行（依赖运行中的前后端 + 测试库）。
- 未改 `createTransaction` / `validateLedger` / 超卖 / fee / 分红 / 整手提示（NG4 边界）；
  `server/`、`cron-worker/` 无 `.js` 变更。
- 未改 API 契约、HTTP 路径与响应结构；未改 `Transaction` schema。
- AC8（独立 Reviewer）待 Reviewer 执行。

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
