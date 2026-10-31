# TASK-047 — TASK-044 审查遗留整改（M-1 / M-2 / M-5 / M-6）

## Metadata

**Status:**  
`PLANNING`（范围与关键分叉已由 Human 于 2026-10-19 裁定：M-2 = 方案② 后端拒绝改写；M-3 已拆出至 TASK-048）

**Priority:**  
`High`（由 M-2 决定；其余为 Low，见 §2 分级）

**Owner:**  
待指派（Planner → Implementer → 独立 Reviewer）

**Created:**  
`2026-10-19`

**Updated:**  
`2026-10-19`（Human 裁定 M-2 方案②、M-3 拆出）

**Type:**  
`Follow-up`（TASK-044 独立审查未采纳项）

**Related Product Spec:**  
`docs/development/requirements/specs/completed/FS-transaction-consolidation.md`（✅ 已批准 2026-10-18）—— 本任务属其**验收后整改**，不改需求口径

**Related ADR:**  
`None`

**Execution Plan:**  
待创建

**来源：**  
`docs/development/exec-plans/completed/TASK-044-transaction-consolidation.md` §11（独立审查报告）M-1~M-6。本轮 Implementer **未采纳**（未获授权），由 Orchestrator 于 2026-10-19 立项。

---

## 1. 背景

TASK-044 的独立审查提出 6 条改进建议（M-1~M-6），Implementer 因「无授权、保持改动面最小」全部未采纳。Human 于 2026-10-19 要求评估处置。

本任务收拢其中 **4 条**（M-1 / M-2 / M-5 / M-6）。

- **M-4** 已由 Orchestrator 直接处理，见 §6。
- **M-3** 已按 Human 裁决（2026-10-19）**拆出**为独立任务 `TASK-048`，不在本任务范围。理由：M-3 位于 `pages/Family.jsx`，与本任务的路由/归属守卫无任何文件或逻辑交叠，合并只会让本任务的审查面变大而无收益。

---

## 2. 待整改项（按风险分级）

### P0 — 必修（数据完整性）

| 项 | 问题 | 证据 | 结论 |
|---|---|---|---|
| **M-2** | 编辑页**无条件**把 `portfolioId` 覆盖为 URL 值。若 URL 中的组合 id 与该交易真实归属不符，提交即**静默把交易迁移到另一个组合**，两侧持仓/成本被重算，且无任何提示 | 前端 `client/src/pages/Transaction/EditTransaction.jsx:42-47`（`setForm({...tx, portfolioId})`）、`:82`（`updateTransaction(txId, {...form, portfolioId})`）；后端 `shared/services/transaction.service.js:7`（`portfolioId` 在 `WRITABLE_FIELDS` 中）、`:128`（`normalizeInput(input, existing)` 以入参优先）、`:137`（`findByIdAndUpdate` 直接写回） | **真实缺陷**。已核实后端确实接受归属改写，非仅前端问题 |

**为什么必修**：这是**静默的数据归属变更**——不报错、不提示、不可撤销感知。触发场景：旧书签 / 手工改 URL / 从别的组合复制的链接。危害不在「交易被改坏」，而在「两个组合的持仓与成本被无声重算」，且事后极难归因。

**修法（Human 已于 2026-10-19 裁定 = 方案②：后端拒绝改写，两层生效）**：

| 层 | 要求 | 落点 |
|---|---|---|
| **后端（权威）** | `updateTransaction` 在合并入参前校验：若入参携带的 `portfolioId` 与 `existing.portfolioId` **不一致**，抛 `400` / 业务错误码（建议 `TRANSACTION_PORTFOLIO_IMMUTABLE`），**且不得写入**。归属不可变由数据层保证，不依赖界面 | `shared/services/transaction.service.js:125-142`（校验插在 `:128` 之前；写入时不仅校验、还应保证 `portfolioId` 不进入更新文档） |
| **前端（体验）** | `getTransaction` 返回后若归属不符，**明确报错并中止渲染表单**，不静默改写、不静默放行 | `client/src/pages/Transaction/EditTransaction.jsx:39-48` |

**⚠️ 实现陷阱（必须写进 ExecPlan，否则修完正常编辑会挂）**：

`EditTransaction.jsx:82` 的提交是 `updateTransaction(txId, { ...form, portfolioId })`，其中 `form.portfolioId` 恒等于**路由参数**（`:42-47` 强制覆盖）。也就是说**每次正常编辑都会携带 `portfolioId`**。

因此后端守卫**必须**是「值不一致才拒绝」，**不能**是「出现 `portfolioId` 就拒绝」，也不能靠「把 `portfolioId` 从 `WRITABLE_FIELDS` 删除」了事（`normalizeInput` 走的是同一套字段表，`createTransaction` 依赖它写入归属）。这是本任务最容易做错的一处。


### P1 — 建议修（低风险、改动极小）

| 项 | 问题 | 证据 | 说明 |
|---|---|---|---|
| **M-1** | TASK-044 新引入的 3 条写路由 `/{new, edit/:txId, import}` 使侧边栏**无任何高亮**（改造前 `/transactions/new` 会高亮「交易记录」） | `client/src/components/layout/Sidebar.jsx:22-26`：`isPortfolioListPath` 仅覆盖 `/portfolios`、`/portfolios/new|edit|view`；父项高亮由子项推导（`:117-118`），写路由不匹配任何子项 | **回归**（TASK-044 引入）。一行修复：判定加 `/^\/portfolios\/[^/]+\/transactions/` |
| **M-5** | E2E 脚本两处**恒真断言**，虚增 38/38 的可信度 | `client/scripts/e2e-task-044.mjs`（审查指出的具体行见 §11 原文） | 与我们自己的纪律冲突（「自证循环」「数字类自评不可作证据」）。修 M-1/M-2 时必然要改 E2E，顺带修正成本最低 |
| **M-6** | `verify-transaction-routes.mjs` **复制**路由表而非读取 `router.jsx`，`router.jsx` 漏声明时脚本仍全绿 | `client/scripts/verify-transaction-routes.mjs` | 验证资产失效模式。最低成本：脚本内加一条 grep 校验（把 `router.jsx` 中 `<Route path=` 的声明数与脚本内表比对），或在注释中显式标注需人工同步 |

### 已拆出（不在本任务）

| 项 | 处置 |
|---|---|
| **M-3** | `Family.jsx` 第三处二元 action 映射，`div_cash` / `div_reinvest` 渲染为 `undefined`。**已按 Human 裁决（2026-10-19）拆出为 `TASK-048`**。核实结论：`client/src/pages/Family.jsx:17` 局部 `ACTION_LABELS = { buy, sell }` 仅两值，`:238` 直取导致分红类返回 `undefined`；且 `:237` 的二元染色会把分红染成「绿」（跌色）。`client/src/constants/enums.js:14-19` 已有完整四值 `TRANSACTION_ACTIONS` 可复用 |

---

## 3. Acceptance Criteria

| # | 验收标准 | 对应 |
|---|---|---|
| AC1 | **后端（权威）**：`PUT /api/transactions/:id` 携带与既有记录**不一致**的 `portfolioId` 时，返回 4xx 业务错误（非 500），且**库内记录归属不变**（用真实 DB 读回验证，不接受仅 mock） | M-2 |
| AC2 | **正常编辑不回归**：携带**相同** `portfolioId` 的更新成功提交（`EditTransaction.jsx:82` 每次提交都带该字段，若此条失败则说明守卫写成了「禁止出现该字段」） | M-2 |
| AC3 | **前端（体验）**：URL 组合 id 与真实归属不符时，编辑页显示明确错误并**中止渲染表单**，不得静默改写 | M-2 |
| AC4 | 三条写路由（new / edit / import）下侧边栏「组合管理 → 组合列表」为激活态；`/portfolios/transactions` 仍只高亮「全部交易」 | M-1 |
| AC5 | E2E 中的恒真断言改为真实断言（有失败可能），并重跑通过；脚本顶部注明断言总数与实际通过数 | M-5 |
| AC6 | 路由验证脚本能发现「`router.jsx` 少声明一条路由」的情况（人为删一条验证会失败，验证后还原） | M-6 |
| AC7 | **改动边界**：服务端改动**仅限** `updateTransaction` 的归属守卫（及必要的行为测试）。不得改动 `createTransaction`、`validateLedger`、超卖校验、`fee` 口径、分红语义、A 股整手提示等既有交易业务规则（NG4）。`server/`、`cron-worker/` 无 `.js` 变更 | 边界（已由方案② 放开 `shared/`） |
| AC8 | 独立 Reviewer 复核，**不得**由 Implementer/Orchestrator 自判通过 | 全项 |

---

## 4. Scope

**In Scope**：

- 前端：`client/src/pages/Transaction/EditTransaction.jsx`、`client/src/components/layout/Sidebar.jsx`
- 前端验证资产：`client/scripts/e2e-task-044.mjs`、`client/scripts/verify-transaction-routes.mjs`
- **后端（方案② 授权）：`shared/services/transaction.service.js` 的 `updateTransaction`**，仅限归属不可变守卫；以及覆盖该守卫的行为测试（落点由 Planner 定，建议 `server/test/integration/`，须在**真实 Mongo 语义**下验证 `select()`/写回行为，不得用无视投影的 mock）

**Out of Scope**：

- **不改 `Transaction` schema**（`portfolioId` 仍必填，无字段增删）
- **不改任何其他交易业务口径**：`createTransaction`、`validateLedger`、超卖校验、`fee` 含费/扣费、分红两类语义、A 股整手提示全部保持现状（NG4）
- **不支持「有意迁移归属」**：Human 已裁定归属**不可变**；若将来需要迁移，另立需求走显式确认流程
- 不重做 E2E 覆盖范围（只修恒真断言，不扩张场景）
- 不动 TASK-044 已验收的功能行为（除 M-1/M-2 明确要求者）
- M-3 已拆出至 `TASK-048`；M-4（`docs/readme.md` 索引）已由 Orchestrator 处理，均不在本任务内

---

## 5. Risks

| 编号 | 风险 | 应对 |
|---|---|---|
| **R-1** | ~~仅前端拦截属界面级防护~~ → **已裁决（2026-10-19）= 方案② 后端拒绝改写**。放开 `shared/` 后本任务不再是「纯前端改动」 | 已在 §3 AC7 将边界改写为「服务端改动仅限归属守卫」。风险转为 **R-1b**：见下 |
| **R-1b** | **守卫写成「禁止出现 `portfolioId`」→ 正常编辑全部 400**（`EditTransaction.jsx:82` 每次都带该字段）。这是最高概率的实现错误 | AC2 专门验证「相同 portfolioId 可正常提交」；Reviewer 必须实测正常编辑链路，不能只看新增的拒绝用例 |
| **R-1c** | 守卫放在 `normalizeInput` 之后 → 已无意义（此时已被入参覆盖），或只校验未校验写回文档仍含 `portfolioId` | 校验插在 `:128` 之前（比较入参与 `existing`）；ExecPlan 必须写明校验位置与「`portfolioId` 是否进入更新文档」两个决定 |
| R-2 | ~~若允许「有意迁移」~~ → 已裁定归属**不可变**，无此冲突 | 若未来需要迁移，另立需求；本任务不预留开关 |
| R-3 | M-1 的路径正则可能误吞 `/portfolios/transactions` | 正则用 `/^\/portfolios\/[^/]+\/transactions/`，`transactions` 作为第二段会被匹配——须先排除精确等于 `ROUTES.PORTFOLIO_TX_ALL`，或用「第二段是 24 位 ObjectId」判定 |
| R-4 | M-5/M-6 属验证资产，改它们不改变产品行为，容易被当成「凑数」 | 明确定位：这两项影响的是**我们判断质量的能力**，TASK-043/046 已两次因验证失真踩坑 |
| R-5 | 后端守卫可能破坏既有集成测试（若有用例依赖改写归属） | Implementer 须先跑 `node --test server/test/integration/`，把受影响的用例**如实列出**并说明是「用例在保护错误行为」还是「守卫过严」，不得直接改断言迁就实现 |

---

## 6. 已由 Orchestrator 处理（不在本任务）

| 项 | 处置 |
|---|---|
| **M-4** `docs/readme.md` 未登记新文档 | 已修（2026-10-19）：产品段补 `FS-transaction-consolidation`（已批准）/ `FS-transaction-query-filters`（Backlog），并把 `FS-asset-price-consolidation` 从「草稿·待评审」更正为「已实施」；任务段活跃任务改为 TASK-044 并补 TASK-045/046/047；归档段「活跃执行计划」由已失效的 TASK-003 改为 TASK-044 |
| **PL-1:179 口径不一致** | 已修（2026-10-19）：加注「当前实现失效，见 TASK-046」。理由见下 |

> **关于 PL-1:179 的判断**：审查者认为该处属「需求/设计口径」，故宜与手册并存。**此判断不成立**——该行位于 `## 6. 架构实现明细` → `#### TR-09 CSV 导入功能细节` → 「**后端**（POST /api/transactions/import）：… 2. **幂等去重** …」，描述的是**实现行为**而非需求意图。文档说「已实现幂等」而实际失效，属事实错误，不能靠「口径不同」并存。**不改其需求语义，仅加一行失效标注**，TASK-046 修好后由 PM 删除该标注。

---

## 7. Blocking Dependencies

| 编号 | 依赖 | 状态 | 说明 |
|---|---|---|---|
| **B1** | Human 确认范围 | ✅ **已解除**（2026-10-19） | 裁定：M-3 拆出（`TASK-048`），本任务保留 M-1 / M-2 / M-5 / M-6 |
| **B2** | 归属可变性裁决（原 §5 R-1） | ✅ **已解除**（2026-10-19） | 裁定：**方案② —— 后端拒绝改写 `portfolioId`**。归属不可变，由数据层保证 |
| **B3** | Planner 产出 ExecPlan | ⏳ 未开始 | 现有 `TASK-047` 无 ExecPlan。按纪律，改 `client/` 或 `shared/` 均需 `Approved` ExecPlan 后方可实现 |

> **门槛现状**：B1 / B2 均已解除，唯一阻塞是 B3（尚未起草 ExecPlan）。可随时交 Planner。

---

## 8. Coordination Notes

- Orchestrator 于 2026-10-19 立项，并已完成 M-1 / M-2 的**独立核实**（读源码确认，非采信审查文字）。
- **M-2 的严重性高于审查原文的描述**：审查说「静默迁移」，我核到后端 `updateTransaction` 确实以入参 `portfolioId` 覆盖并在 `findByIdAndUpdate` 中写回（`shared/services/transaction.service.js:128,137`），因此这不是「前端多传了个字段」，而是**后端允许归属被任意改写**。仅修前端只能挡住 UI 路径。
- 未采纳项不再「无授权悬空」：M-1/M-2/M-5/M-6 归本任务，M-3 归 `TASK-048`，M-4 已闭环，PL-1:179 已加注。
- **2026-10-19 Human 裁决（写入本卡）**：
  1. **M-2 = 方案②**：后端拒绝改写 `portfolioId`，归属不可变。因此本任务**放开「零服务端改动」**，允许改 `shared/services/transaction.service.js`，但仅限归属守卫（AC7）。
  2. **M-3 拆出**为 `TASK-048`（Family 页分红标签），与本任务无文件交叠。
- **本次核实到的实现约束（供 Planner，勿遗漏）**：`EditTransaction.jsx:82` 提交恒带 `portfolioId`（值来自路由参数），故后端守卫必须判「**值是否变化**」，不可判「**字段是否存在**」；亦不可简单从 `WRITABLE_FIELDS` 删除该字段（`createTransaction` 共用该表）。详见 §2 M-2 的「实现陷阱」。
