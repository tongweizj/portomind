# TASK-047 — TASK-044 审查遗留整改实施计划（M-1 / M-2 / M-5 / M-6）

## Status

Status：Draft（2026-11-11，Planner 起草；**未批准、未实施**）

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

（实施时填写。）

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
