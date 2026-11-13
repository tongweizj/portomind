# TASK-047 — TASK-044 审查遗留整改实施计划（M-1 / M-2 / M-5 / M-6）

## Status

Status：Approved（2026-11-11，Human 批准「051、047、046 三份计划」；`Draft → Approved` 归 Human）

Related Task：[TASK-047](../../tasks/completed/TASK-047-review-followups.md)（独立维护任务，无 Story）。

Branch / Base：自 `ee989c7` 起草计划（`git merge-base main HEAD` = `e1730a0`），实施基于 **本地 `main` @ `e1730a0`**，分支 `feature/TASK-047-review-followups`（未 rebase）。

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

### 11.8 返修记录（2026-11-12，独立审查 findings 处置）

审查结论见 §12（`Fail`，2 MAJOR）。本轮只处置 findings，不改 AC / Scope / Status，不写 Reviewer 结论。
基线仍为 `main` @ `e1730a0`；审查记录提交 `a2a404b`；本条记录提交见 §11.9。

#### F-047-1（MAJOR）E2E 断言过期 + 未实跑 —— 已修，已真实运行

**改动**（`client/scripts/e2e-task-044.mjs`）：

| 项 | 改前 | 改后 |
|---|---|---|
| 导航项断言 | `check('AC1 顶层导航项 = 6', navCount === 6)` | `check('AC1 顶层导航项 = 4', navCount === 4)`（与 `Sidebar.navItems` 的 4 个 depth-1 项一致） |
| 汇总输出 | `===== ${x}/${n} PASS =====` | `断言总数 ${n} / 通过 ${x} / 失败 ${f}` |
| 头部说明 | 无断言总数 | 注明「断言总数：38，新增/删除断言须同步更新」 |
| 登录前置 | **无**（脚本写于 TASK-058 认证前） | 新增 S0 登录步骤（`E2E_USERNAME`/`E2E_PASSWORD` 提供时执行，不参与断言计数） |

**额外发现（必须记录，非原审查项）**：脚本原名 `family 家庭视图`/`提醒规则` 的断言**已不存在**（TASK-058 时已清理），
核对后无残留；但脚本**完全没有登录步骤**，而 TASK-058 U2 给所有业务页加了 `RequireAuth`。
首次实跑实测：访问 `/portfolios` 被重定向到 `/login?next=%2Fportfolios`，`navCount = 0`、
`AC1 顶层含「组合管理」` FAIL，随后在「展开组合管理」按钮处 `Timeout 30000ms` 崩溃。
即：**该脚本自 TASK-058 起就无法运行**，仅把 6 改成 4 并不能让它跑通。故补 S0 登录步骤。

**再次发现（属性：这是断言真实性的反向证据，必须记录）**：脚本的「编辑落库」断言原写法
`await page.fill('input[name="quantity"]', '9')` 紧跟 `waitForURL` 执行，而编辑页表单由
`getTransaction` **异步**填充（`EditTransaction.jsx:43-53`），`fill` 先于 `setForm` 发生时，
随后 `setForm({...tx})` 会把刚填的 9 覆盖回原值 7 —— 表现为「编辑保存无效」。
实测：后端 `PUT /api/transactions/:id`（不带 `portfolioId`）返回 200 且库内 `quantity` 由 7 变 9，
即**后端与 TASK-047 守卫均正常**，是脚本的竞态。已改为先 `waitForFunction` 等输入框出现原值 7，
再 `fill('9')`。

**真实运行输出**（本机 `mongod` 8.2.6 独立实例，`portomind_dev`；API `:8080`；Vite `:6600`；Chrome 本机）：

```
已登录：admin（当前 /）
PASS  AC1 顶层导航项 = 4 — 实际 4
PASS  AC1 顶层无「交易记录」 — Dashboard | 组合管理 | 今日行情
监控 | 日志
PASS  AC1 顶层含「组合管理」
PASS  AC11 默认收起（「全部交易」不可见）
PASS  AC1 展开后含「组合列表」「全部交易」 — 组合管理/组合列表/全部交易
PASS  AC11 刷新后回到默认收起态
PASS  AC11 未写 localStorage
PASS  AC6 组合内无「组合」列 — 日期 | 资产代码 | 类型 | 证券类型 | 份额 | 价格 | 操作
PASS  Bug-3 表头全中文 — 日期 | 资产代码 | 类型 | 证券类型 | 份额 | 价格 | 操作
PASS  AC8 类型列均为中文四值 — 买入,现金分红
PASS  Bug-3 证券类型为中文 — ETF
PASS  Bug-2 价格带币种符号 — C$91.20,C$0.50,C$25.10
PASS  AC2 Tab 内存在「新建交易」「导入 CSV」
PASS  AC4 新路由 = /portfolios/:id/transactions/new — http://localhost:6600/portfolios/<id>/transactions/new
PASS  AC2 无「所属组合」下拉
PASS  AC2 组合锁定为当前组合 — 所属组合/CA-家庭RESP组合/资产代码
PASS  AC2 新增后回到组合 Tab 且列表刷新 — 20→20
PASS  AC2 提交后离开写路由、落在组合交易 Tab — /portfolios/view/<id>/transactions
PASS  AC2 新增记录出现在首行
PASS  AC4 编辑路由带组合 id + txId — http://localhost:6600/portfolios/<id>/transactions/edit/<txid>
PASS  AC2 编辑页无「所属组合」下拉
PASS  AC2 编辑落库（份额 7→9） — 份额列=9
PASS  AC2 删除后列表即时刷新 — 20→19
PASS  AC3 页面标题 = 全部交易
PASS  AC3 聚合页含「组合」列 — 日期 | 资产代码 | 类型 | 证券类型 | 份额 | 价格 | 组合
PASS  AC7 聚合页无导入/新建入口
PASS  AC3 分页可用（每页 20） — rows=20, 第 1 / 2 页
PASS  AC3 按组合筛选生效 — 2 行
PASS  AC3 无结果时给空态提示
PASS  AC3 按标的筛选生效 — 20 行
PASS  Bug-1 现金分红显示为「现金分红」
PASS  AC3 组合名可跳回所属组合交易 Tab — http://localhost:6600/portfolios/view/<id>/transactions
PASS  AC7 导入页无组合下拉 — select 数量 0
PASS  AC7 目标组合已锁定展示
PASS  R8 导入预览方向为中文 — 行 代码 方向 份额 价格 费用 日期 状态/2 VAB.TO 买入 ...
PASS  AC7 导入成功（2 条） — 导入结果 成功导入：2 条 跳过重复：0 条
PASS  AC5 旧 /transactions 落至 /portfolios — http://localhost:6600/portfolios
PASS  无 JS 运行时错误

断言总数 38 / 通过 38 / 失败 0
```

退出码 **0**。

**前置条件（可复跑）**：

```bash
# 1) 一个本地 mongod（任意 8.x），库名须含 _dev
#    MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev
# 2) 测试库需有：admin 账号（mustChangePassword=false）、CA-家庭RESP组合 / CA-RRSP组合 /
#    空组合 A股-稳钱组合、VAB.TO 等资产、>=20 条交易（分页断言）
# 3) API：MONGO_URI=... node server.js        （:8080）
# 4) 前端：cd client && npm run dev            （vite :6600，见 vite.config.js）
# 5) 运行：
E2E_BASE=http://localhost:6600 E2E_PORTFOLIO_ID=<RESP组合id> \
E2E_USERNAME=admin E2E_PASSWORD=<密码> \
CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
node client/scripts/e2e-task-044.mjs
```

**残余限制（如实记录）**：
- 脚本断言依赖固定测试数据（组合名、`A股-稳钱组合` 空态、>=20 条交易），**未**做成自动播种；
  换一个空库直接跑会 FAIL。这与原脚本的设计一致（原文件头即写「按需手工准备」），本轮未扩张范围。
- **本 E2E 不覆盖 M-1**：我注入「`/portfolios/transactions` 被组合族误吞」的回归后重跑，
  仍是 38/38 PASS —— 说明现有 38 条断言**没有一条**观察侧栏高亮态。
  M-1 的验证仍只由 §11.4 的谓词实测承担。这是既存覆盖盲区，**不是本轮引入**，记录在此供后续任务处置。

#### F-047-2（MAJOR）真实 DB 证据不可复跑 —— 已修

新增 `server/scripts/verify-portfolio-immutable.cjs`（+ `server/package.json` 脚本 `verify:portfolio-immutable`）：

- 读 `MONGO_URI`（默认 `mongodb://127.0.0.1:27017/portomind_dev`）；
- **写保护**：库名必须匹配 `_dev|_test`，否则拒绝运行；
- 流程：建临时 Portfolio A/B + Asset + 一条归属 A 的交易 → 改归属 → 断言 400 且**真实读回**归属仍为 A
  → 不传 / 传同值均成功且归属不变 → 创建路径仍可写入归属；
- 全部临时数据在 `finally` 中按 `_id` 精确删除，并按 `TAG` 前缀做兜底清扫 + 残留复查；
- 输出 PASS/FAIL 与关键字段值，退出码 0/1。

**真实运行输出**（`portomind_dev`，临时数据用后即删）：

```
db = portomind_dev
tag = VERIFY47_1794495935785

created: portfolio A = 6af5d5bf5c2f3ad7b2d1bb8a | B = 6af5d5bf5c2f3ad7b2d1bb90 | tx = 6af5d5bf5c2f3ad7b2d1bb97

PASS  ① 改归属被拒（400 PORTFOLIO_ID_IMMUTABLE） — status=400 code=PORTFOLIO_ID_IMMUTABLE
PASS  ① 库内归属未变（真实读回） — portfolioId=6af5d5bf5c2f3ad7b2d1bb8a（期望 A=6af5d5bf5c2f3ad7b2d1bb8a）
PASS  ① 数量未被写入 — quantity=10（期望 10）
PASS  ② 不传 portfolioId 更新成功 — quantity=12
PASS  ② 归属仍为 A — portfolioId=6af5d5bf5c2f3ad7b2d1bb8a
PASS  ③ 传相同 portfolioId 更新成功（不得写成「出现即拒」） — quantity=13
PASS  ③ 归属仍为 A — portfolioId=6af5d5bf5c2f3ad7b2d1bb8a
PASS  ④ 创建仍可带 portfolioId 写入 B — portfolioId=6af5d5bf5c2f3ad7b2d1bb90

断言总数 8 / 通过 8 / 失败 0
cleanup: transactions:1 portfolios:2 assets:1
残留检查：transactions=0 assets=0 portfolios=0 => CLEAN
```

退出码 **0**。写保护负向对照（`MONGO_URI=.../portomind`）：

```
VERIFY_FATAL 拒绝在库 "portomind" 上运行：库名必须包含 _dev 或 _test（避免误写生产库）
```
退出码 **1**，符合预期。

#### F-047-3（MINOR）Base SHA 漂移 —— 已修

§Status 的 `Branch / Base` 改为事实描述：自 `ee989c7` 起草计划、基于 `e1730a0` 实施。

#### F-047-4（MINOR）form 残留字段 —— 已按建议处置

保留现状（提交体已白名单过滤，无缺陷），并在 `EditTransaction.jsx` 加注释说明
「`form` 保留服务端字段仅供展示，提交走 `payload` 白名单；`form.market` 被 A 股整手提示使用，不可删」。
未做无收益的重构。

#### 本轮验证

| 命令 | 结果 |
|---|---|
| `npm run test:server` | **252 pass / 0 fail**（未新增用例；本节不改变测试面） |
| `npm run build --workspace client` | ✅ `✓ built` |
| `npm run lint --workspace client` | ✅ `0 errors, 5 warnings`（既存 fixture 警告） |
| `npm run docs:check` | ✅ `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |
| `node client/scripts/verify-transaction-routes.mjs` | ✅ `PASS 16 / 16` |
| `node client/scripts/e2e-task-044.mjs`（真实环境） | ✅ **38/38 PASS，exit 0**（见上） |
| `node server/scripts/verify-portfolio-immutable.cjs` | ✅ **8/8 PASS，DB CLEAN，exit 0**（见上） |

#### 未做 / 边界

- 未改 AC、Scope、Task Status；未写 Reviewer 结论；未合并 `main`。
- 未改 `createTransaction` / `validateLedger` / 超卖 / fee / 分红 / 整手（NG4）。
- 未新增测试用例（findings 未要求）；F-047-1 的覆盖盲区（M-1 无 E2E 断言）已记录，未擅自扩张测试面。

### 11.9 提交

| SHA | 内容 |
|---|---|
| `a2a404b` | `docs(TASK-047): record independent review verdict`（审查记录） |
| 见 `git log -1` | `fix(TASK-047): 返修复审 MAJOR——E2E 断言与登录前置、真实库可复跑验证` |

## 12. Review Record

> 由独立 Reviewer 填写；Implementer 未自评（本卡无自审记录）。判定词不是状态：本章不改变 Task Status，不构成合入许可。

### 12.1 结论

- **判定：FAIL**（AC5 部分不满足，2 条 MAJOR；2 条 MINOR）。
- **重要限定**：P0 的 M-2（归属不可变）实现**正确且经我独立加固验证**，AC1–AC4、AC6–AC8 均满足。判 FAIL 的唯一实质原因是 **AC5 的「重跑通过 + 脚本顶部注明断言总数/通过数」未交付，且该 E2E 脚本在当前提交上必然 FAIL**。若 Human 接受「以静态证明替代重跑」并豁免 AC5 的该子句，本判定可降级为 Pass with issues。
- 审查对象：`feature/TASK-047-review-followups` @ `4940c39`（`git status --porcelain` 为空）。
- 基线：本地 `main` @ `e1730a0`（**不用** `origin/main` @ `22f5f6e`）。
- 改动范围：`git diff --stat main...HEAD` = **7 文件 / +430 −28**，与卡内 Scope 一致；`server/`、`cron-worker/` 无 `.js` 变更（仅新增 `server/test/` 一个用例文件），符合 AC7。
- 未审部分：浏览器点击级走查（本机无 Mongo、无 `playwright-core` 之外的前后端环境，E2E 未执行，见 F-047-1）；`AC1` 的真实 Mongo 读回（无 `mongod`，见 F-047-2）。

### 12.2 AC 逐条判定

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| AC1 | 改归属 → 4xx 业务错误，库内归属不变（真实 DB 读回，不接受仅 mock） | ⚠️ 代码满足，证据链不足（F-047-2） | `transaction.service.js:128-138`；提交的用例为 mock（`transaction.portfolioImmutable.test.js:67-81`）；真实库结论仅见计划 §11.2 文字，不可独立复跑 |
| AC2 | 传**相同** `portfolioId` 正常提交（不得写成「出现即拒」） | ✅ 满足 | 用例 `:98-114`；我用 R-1b 陷阱（改成「出现即拒」）实测该用例**转红** |
| AC3 | URL 归属不符时明确报错并中止渲染表单 | ✅ 满足（静态） | `EditTransaction.jsx:37,46-49,106-123`：`setMismatch(true)` 后 `return`，不 `setForm`，`mismatch` 分支只渲染错误页，不渲染 `<form>` |
| AC4 | 三条写路由高亮「组合列表」；`/portfolios/transactions` 仍只高亮「全部交易」 | ✅ 满足 | `Sidebar.jsx:29-34`；我按同一谓词实测 11 条路径全对（见 §12.3） |
| AC5 | 恒真断言改为可失败断言，**并重跑通过**；脚本顶部注明断言总数与实际通过数 | ❌ 不满足（F-047-1） | 断言可失败化 ✅（两处已改写）；「重跑通过」未见证据且**静态可证必然失败**；脚本顶部无断言总数/通过数 |
| AC6 | 路由校验脚本能发现「`router.jsx` 少声明一条路由」 | ✅ 满足 | 我删 `PORTFOLIO_TX_IMPORT` → `FAIL 2 / 16` exit 1；还原 → `PASS 16 / 16` |
| AC7 | 服务端改动仅限 `updateTransaction` 守卫；不改 `createTransaction`/`validateLedger`/超卖/fee/分红/整手 | ✅ 满足 | `git diff` 中 `WRITABLE_FIELDS`、`createTransaction`、`validateLedger` 零改动；`server/`、`cron-worker/` 无 `.js` 改动 |
| AC8 | 独立 Reviewer 复核，不得自判 | ✅ 满足 | 本记录 |

### 12.3 我独立实跑的证据（不采信 §11 自述）

| 命令 | 结果 |
|---|---|
| `npm run test:server` | **252 pass / 0 fail**（23 文件；`main` 基线 248，新增 4）✅ 与声称一致 |
| `npm run build --workspace client` | `✓ built in 2.76s`（exit 0） |
| `npm run lint --workspace client` | `0 errors, 5 warnings`（既存 fixture 警告） |
| `npm run docs:check` | `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |
| `node client/scripts/verify-transaction-routes.mjs` | `PASS 16 / 16`（exit 0） |
| `git diff --stat main...HEAD` | 7 文件，与卡内 Scope 一致 |

> 环境说明：沙箱默认禁 `child_process.spawn`（`node --test` 报 `spawn EPERM`）。取得真实输出的方法：22 个 `server/test/integration/*.test.js` **逐文件 `node <file>` 直接执行**并累加 `ℹ pass`/`ℹ fail`。

**守卫位置（R-1c）静态核对**：`transaction.service.js:128-138` 的比较语句在 `:139 const data = normalizeInput(input, existing)` **之前**，比较对象是 `existing.portfolioId`（合并前）。符合卡内 R-1c。

**R-1b / R-1c 双重陷阱实测**（我临时改造实现，不改测试）：

| 陷阱 | 改造 | 结果 |
|---|---|---|
| R-1c：守卫挪到合并之后 | 比较 `data.portfolioId` 与自身（等价失效） | `✖ 改归属 → 400` **转红**（1 fail）✅ 能捕获 |
| R-1b：改成「出现字段就拒」 | 删掉 `!==` 值比较 | `✖ 传相同 portfolioId → 200` **转红**（1 fail）✅ 能捕获 |

→ 交付的 4 条用例**确实能区分**这两种最高概率的实现错误，不是凑数。

**M-1 谓词实测**（按 `Sidebar.jsx:29-34` 同一逻辑复刻，11 条路径）：`/portfolios/:id/transactions/{new,edit/:txId,import}`、组合交易 Tab、`/portfolios`、`/portfolios/new|edit|view` 全部 `true`；**`/portfolios/transactions` = `false`**（聚合页不被误吞，仍由 `p === PORTFOLIO_TX_ALL` 独占高亮）；`/transactions`、`/dashboard` = `false`。

**M-6 负向对照**：删 `router.jsx:67` 的 `PORTFOLIO_TX_IMPORT` → `FAIL 2 / 16`（`router.jsx 未声明 PORTFOLIO_TX_IMPORT` + `import 路由未匹配`），exit 1；`cp` 还原后 `PASS 16 / 16`，`git status --porcelain` 为空。

### 12.4 Findings

| # | 严重度 | 位置 | 现象 | 修法方向 |
|---|---|---|---|---|
| F-047-1 | **MAJOR** | `client/scripts/e2e-task-044.mjs:55`；计划 §11.7 | AC5 要求「重跑通过」+「脚本顶部注明断言总数与实际通过数」。① 计划 §11.7 自述**未运行 E2E**，无通过证据；② 脚本首条断言 `check('AC1 顶层导航项 = 6', navCount === 6, …)` 与当前侧栏不符——`navItems` 只有 **4** 个 depth-1 项（Dashboard / 组合管理 / 今日行情 / 日志），每项渲染 1 个 `<nav>` 直接子节点，故 `navCount` 必为 **4**，该断言**必然 FAIL**（`家庭视图`/`提醒规则` 已在 TASK-058 U2 移出侧栏，断言未随之更新）；③ 脚本头部无断言总数/通过数 | 把 `navCount === 6` 改为与当前侧栏一致的 4（或改为断言具体项文本集合，避免再次随导航漂移）；在脚本头部注明「断言总数 38 / 期望通过 38」；在有前后端 + 测试库的环境跑一次并贴真实 `N/38` 输出。**不要**把该断言删掉了事 |
| F-047-2 | **MAJOR** | 计划 §11.2；`server/test/integration/transaction.portfolioImmutable.test.js` | AC1 明写「用真实 DB 读回验证，**不接受仅 mock**」。提交的用例全是 mock（`Transaction.findById`/`findByIdAndUpdate` 被替换）；真实 Mongo 证据只存在于计划 §11.2 的文字（含临时 ID），不可独立复跑，无脚本/无输出快照 | 把真实库验证做成可复跑资产（例如在 `portomind_dev` 上跑的 `server/scripts/verify-portfolio-immutable.cjs`，或用 mongodb-memory-server；本机无 `mongod`，故 `.cjs` + 文档化前置条件更现实），并在计划中贴出可核对的输出 |
| F-047-3 | MINOR | `docs/development/exec-plans/active/TASK-047-review-followups-plan.md:9` | 计划写 `Branch / Base：main @ ee989c7`，实际分支基于 `e1730a0`（`git merge-base main HEAD` = `e1730a0`）。`ee989c7..e1730a0` 之间只有 2 个文档提交，**不影响代码 diff**，但 SHA 记录与事实不符 | 改为 `e1730a0`（或写「自 `ee989c7` 起草、基于 `e1730a0` 实施」） |
| F-047-4 | MINOR | `client/src/pages/Transaction/EditTransaction.jsx:20-32` | `form` 初值仍含 `portfolioId`，且 `setForm({...tx})` 会把服务端返回的 `portfolioId`、`assetType`、`market`、`currency` 等一并留在 form 里（提交时已被显式白名单过滤，**无行为缺陷**）；仅属残留字段 | 可保留（白名单已确保不发送）；若清理，注意 `form.market` 仍被 A 股整手提示使用，不能删 market |

### 12.5 残余风险

1. **前端不再发送 `portfolioId`**，故正常 UI 编辑不会触发后端守卫；守卫对 curl / 旧客户端 / 篡改请求仍是权威防线。两侧同 PR 已消除「后端已拒、前端仍发」的错配（`EditTransaction.jsx:90-99` 只发 7 个可写字段）。
2. `EditTransaction.jsx:46` 用 `String(tx.portfolioId) !== String(portfolioId)` 比较；若后端返回 `portfolioId` 为已填充对象（`.populate()`），该比较会误判为不符并中止编辑。当前 `getTransaction` 不 populate，**无实际风险**，但属脆弱点。
3. M-1 正则 `^\/portfolios\/[^/]+\/transactions` 对 `/portfolios//transactions`（空 id）不匹配，可接受；对 `/portfolios/transactions` 的排除依赖「第二段字面量」这一性质，若将来新增 `/portfolios/transactionsX` 之类路径需重新确认。
4. E2E 脚本整体依赖运行中的前后端 + 测试库，属长期存在的可执行性缺口；本次未改善（F-047-1）。

### 12.6 独立性声明

审查者未参与本任务实现、计划编写或验收脚本编写；未修改任何业务代码、测试、AC 或 Status。§12.3 的临时改造（守卫挪位 / 出现即拒 / 删路由 / 回退 select）均在独立 worktree 副本中进行，已全部还原并逐次以 `git status --porcelain` 为空证净。判定不是合入许可，**Merged 与关闭归 Human**。


### 12.7 复审记录（第二轮，2026-11-12）

**对象**：`feature/TASK-047-review-followups` @ `5a89691`（返修提交 `5a89691`；首轮审查记录提交 `a2a404b`）。基线 `main` @ `e1730a0`。审查开始时 `git status --porcelain` 为空，未审到任何未提交的工作区改动。

**结论**：`Pass with issues` —— **由首轮 `Fail` 升级**（2 条 MAJOR 均已闭环；新增 1 条 MINOR）。判定不是合入许可；Merged 与关闭归 Human。

#### 12.7.1 升级依据（为什么不再是 Fail）

首轮判 `Fail` 的**唯一实质原因**是 AC5：「E2E 恒真断言须重跑通过 + 脚本顶部注明断言总数/通过数」未交付，且该脚本在当前提交上**静态可证必然 FAIL**。这两点在本轮均已解除：

1. 首条断言由 `navCount === 6` 改为 **4**，与 `Sidebar.jsx` 的 `navItems`（4 个 depth-1 项：Dashboard / 组合管理 / 今日行情 / 日志）一致 —— 必然失败的条件消失；
2. 脚本头部注明「断言总数：38」，尾部打印「断言总数 N / 通过 M / 失败 K」，并以 `process.exitCode = failed.length ? 1 : 0` 落退出码。

因此判定的**性质**变了：不再是「AC 不满足」，而是「AC 已满足、但其中一条的运行证据我本人未能复跑」。按 REVIEWER.md §5.1，后者不构成 Fail。

#### 12.7.2 F-047-1 定级：**已修**（非降级、非保留 MINOR）

按任务要求逐项明确：

| 子项 | 判定 | 证据 |
|---|---|---|
| ① 断言 6→4 且标签同步 | ✅ | `navCount === 4`，标签同步改为「AC1 顶层导航项 = 4」；注释说明「家庭视图」「提醒规则」已于 TASK-058 U2 移出侧栏。**不是只改数字**：新增注释解释了为什么当前是 4 |
| ② 头部声明 + 运行结束汇总 + 失败退出码 1 | ✅ | 头注「断言总数：38」；尾部三分量汇总；`process.exitCode` 失败置 1，`main().catch` 亦置 1 |
| ③ 登录前置是真登录 | ✅ | 填 `input[name="username"]` / `input[name="password"]`（已核对 `Login.jsx:122,142` 确有此 name）、点「登录」（`Login.jsx:186` 文案确为「登录」）、等 `waitForURL(!/^\/login/)`。该步骤**不参与断言计数**，且未提供凭据时保持旧行为、仍会暴露未登录的 navCount=0 —— **不是「成功后跳过」或放宽到恒真** |
| ④ 独立复跑 | **未能复跑**（见 12.8.3） | 环境不支持；改按证据强度评估 |
| ⑤ 有无「为跑通削弱断言」 | ✅ 无 | 返修前后 `check(` 调用名集合 **38 → 38，diff 仅 1 行**（`AC1 顶层导航项 = 6` → `= 4`）。AC1 顶层导航、交易路由族断言全部保留 |

**定级理由**：F-047-1 的缺陷是「断言过期 + 缺汇总 + 无法运行」，三者在代码层面均已修复且我逐行核对；唯一缺口是我未能亲自复跑。按 REVIEWER §5.1「证据不足时写无法判定」的边界，此处的证据**并非不足**——见 12.8.3 的证据强度评估，输出不可能来自恒真断言或空跑。故定为**已修**，同时把「未复跑」作为残余说明记录，不上升为 finding。

> 若 Human 要求「必须由 Reviewer 本人实跑」才算闭环，则本条应视为**保留待验**，可在 047 合入前由能起服务的环境补跑一次；这不改变代码层的判定。

#### 12.7.3 F-047-2：引用可复跑脚本，且本审查者已独立复跑通过

**可复跑资产**：`server/scripts/verify-portfolio-immutable.cjs`（入口 `npm run verify:portfolio-immutable --workspace server`，见 `server/package.json:15`）。前置条件只需一个库名含 `_dev`/`_test` 的 Mongo：

```bash
MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev \
  node server/scripts/verify-portfolio-immutable.cjs
```

我在独立库 `portomind_review2_test` 上实跑（未污染 `portomind_dev`）：

```
PASS  ① 改归属被拒（400 PORTFOLIO_ID_IMMUTABLE） — status=400 code=PORTFOLIO_ID_IMMUTABLE
PASS  ① 库内归属未变（真实读回） — portfolioId=6af65d5d…（期望 A=6af65d5d…）
PASS  ① 数量未被写入 — quantity=10（期望 10）
PASS  ② 不传 portfolioId 更新成功 — quantity=12
PASS  ② 归属仍为 A
PASS  ③ 传相同 portfolioId 更新成功（不得写成「出现即拒」） — quantity=13
PASS  ③ 归属仍为 A
PASS  ④ 创建仍可带 portfolioId 写入 B
断言总数 8 / 通过 8 / 失败 0
cleanup: transactions:1 portfolios:2 assets:1
残留检查：transactions=0 assets=0 portfolios=0 => CLEAN
```

退出码 0。逐项核对所要求的性质：

| 要求 | 结论 |
|---|---|
| 写保护（库名须含 `_dev`/`_test`） | ✅ 传 `.../portomind` → `VERIFY_FATAL 拒绝在库 "portomind" 上运行`，exit 1 |
| 真的**读回** `Transaction.findById` 断言归属 | ✅ 断言读的是 `after1.portfolioId` 的实际值，非仅看返回码 |
| 覆盖「同值→成功」「不传→成功」「创建仍可带 portfolioId」 | ✅ ②③④ 三组均在 |
| `finally` 清理（失败也清理） | ✅ 我的负向对照触发 4 FAIL 后仍打印 `cleanup:` 且 `CLEAN` |
| `server/package.json` 有脚本入口 | ✅ `:15` |
| **可证伪性** | ✅ 我把守卫条件注入为 `if (false && …)` → **4 FAIL / exit 1**；还原后恢复 8/8 |

**定级：已修**（且运行证据由我本人取得，非引用实现者自述）。

#### 12.7.4 F-047-1 未能复跑的原因与证据强度评估

**未能复跑**（环境限制，非脚本缺陷）：本沙箱禁止 `child_process.spawn`（`vite` / `esbuild` / `playwright chromium` 均报 `spawn EPERM`），本机无 `mongod`。故无法起「API + 前端 6600 + 浏览器」三件套。

替代评估——以**输出可核对性**取代「实现者说跑过了」：

| 维度 | 判定 | 依据 |
|---|---|---|
| 输出可核对 | 强 | 粘贴输出含 **38 行 PASS**，与脚本 38 个 `check(` 调用数精确一致 |
| 含具体 URL / 文本 | 强 | 每行带实际值：`实际 4`、`Dashboard \| 组合管理 \| 今日行情 \| 日志`、`20→20`、`20→19`、`rows=20, 第 1 / 2 页`、`成功导入：2 条` |
| 截图落盘 | 有，且已逐张查看 | `%TEMP%/portomind-e2e-044/` 下 6 张 PNG（01–06），时间戳与提交时间吻合。我打开 01 / 04 / 06：侧栏确为 4 项、聚合页标题「全部交易」且含「组合」列、20 行、导入结果「成功导入：2 条 / 跳过重复：0 条」。**截图内容与粘贴输出互相印证** |
| 脚本是否可能恒真 | 否 | 断言集合未削弱；「编辑落库」现读表格第 5 列单元格 `=== '9'`，后端未落库必 FAIL |

**结论**：该输出不可能由恒真断言或空跑产生，证据强度足以支持「已真实运行」的判断；但仍如实标注为「本审查者未复跑」。

#### 12.7.5 顺带确认（首轮 MINOR）

| Finding | 本轮判定 |
|---|---|
| F-047-3 Base SHA | **部分修**。§Status 已改为「自 `ee989c7` 起草、基于 `e1730a0` 实施」，与事实相符；但 §11.1 仍写「分支 …（自 `origin/main` `22f5f6e` 起）」，与 `git merge-base main HEAD = e1730a0` 不符，建议一并订正 |
| F-047-4 `form.market` | **已按建议处置**：保留 form 字段并在 `EditTransaction.jsx:21-23` 加注释，明确「提交走 `payload` 白名单」且「`form.market` 被 A 股整手提示使用，不可删」。核对 `:74`、`:126-128` 确在消费 `form.market`，注释与代码一致 |

#### 12.7.6 本轮新增 finding

| # | 严重度 | 现象 | 修法方向 |
|---|---|---|---|
| F-047-5 | **MINOR（与 046 合并后升级为 MAJOR）** | `e2e-task-044.mjs` 的 CSV 导入段**不清理**写入的 2 行（脚本只删了前面新建的那笔交易）。单独在 047 上，第二次导入仍 `imported=2`，断言通过；与 046 的幂等修复合并后，同库重跑第二次导入变 `imported=0/skipped=2`，`AC7 导入成功（2 条）` **必然 FAIL**。即 046 修好幂等后，本 E2E 从「可重复跑」退化为「单次可跑」，而 AC5 原文要求「**重跑**通过」 | 导入断言后按测试日期（2025-09-01 / 09-02）删除该组合的 2 行，或改用随机日期；建议与 046 同批修 |

**验证方式**：我在真实库上用同一段 CSV 对同一组合连导两次，对比「仅 047」与「047+046 合并」两种快照——前者 `imported=2/skipped=0`，后者 `imported=0/skipped=2`。差异仅来自 046 的 `select` 投影修复，因果明确。

#### 12.7.7 本轮我实跑的证据

| 命令 / 动作 | 结果 |
|---|---|
| `node server/scripts/verify-portfolio-immutable.cjs`（独立库） | **8/8 PASS，CLEAN，exit 0** |
| 同上，`MONGO_URI=.../portomind`（写保护） | 拒绝运行，**exit 1** |
| 同上，注入 `if (false && …)` 停用守卫 | **4 FAIL，exit 1**（可证伪） |
| `test:server`（逐文件就地跑并求和） | **252 / 252 pass，0 fail**（与 §11.8 一致；相对 main 248 的 +4 全部来自上一提交新增的 4 条 immutable 用例） |
| E2E 实跑 | **未能复跑**（见 12.8.4） |

#### 12.7.8 残余风险

1. **F-047-5**：E2E 导入段不清理数据，与 046 合并后重跑失败（见 12.8.6）。
2. E2E 依赖固定测试数据（组合名、空组合、≥20 条交易），未自动播种；换空库直接跑会 FAIL。与原脚本设计一致，非本轮引入。
3. E2E **不覆盖 M-1 侧栏高亮**：注入「`/portfolios/transactions` 被组合族误吞」的回归后仍 38/38 PASS。该盲区由 §11.4 的谓词实测承担，属既存缺口。
4. §11.1 的 `origin/main` 表述与事实不符（F-047-3 未彻底修）。

#### 12.7.9 独立性声明

审查者未参与本任务实现、计划编写或验收脚本编写；本轮未修改任何业务代码、测试、AC 或 Status；未 `git add`/`commit`/`push`；未合并 `main`、未填 `Merged`。对 `verify-portfolio-immutable.cjs` 的负向注入（停用守卫）在 `.review-tmp/` 独立快照中进行，已还原并以恢复 8/8 证净；对 E2E 的对照未改动被审文件。判定不是合入许可，**Merged 与关闭归 Human**。

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
