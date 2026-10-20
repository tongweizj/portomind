# Feature Spec — 交易记录收拢进组合管理

> 状态：**✅ 已批准（2026-10-18，Human）** — 可作为 ExecPlan 的 Human Intent 输入
> 提出日期：2026-10-18 · 修订：2026-10-18(v2)——OQ1 拆分至独立需求，OQ2/OQ4/OQ5 裁决落地；**本任务因此保持「仅前端改动」**
> 批准日期：2026-10-18 · 批准范围：R1–R8（P0 全部）
> 负责人：Max
> 起草：Orchestrator 依 Human 裁决代拟（裁决记录见 §11）
> 关联产品线：PL-1 投资账本线（M1.2 交易流水）、PL-3 组合与配置线
> 关联文档：`product/PRODUCT_LINES.md`、`product/lines/PL-1-ledger.md`、`process/EXECUTION_PLANS.md`
> 关联任务：TASK-044（`tasks/complete/TASK-044-transaction-consolidation.md`）

---

## 0. TL;DR

把「交易记录」从**与组合并列的顶层频道**，收拢为**组合的子资源**：

- **侧边栏引入二级导航**：「组合管理」成为可展开父项，其下挂「组合列表」与「全部交易」。「交易记录」不再作为独立顶层项（顶层 7 → **6** 项）。
- **组合详情「交易记录」Tab 补全读写**：新增 / 编辑 / 删除 / 导入 CSV 均在此完成，`portfolioId` 由上下文锁定，不再手选。
- **新增「全部交易」聚合页** `/portfolios/transactions`：保留跨组合查账能力（组合列 + 按组合/标的筛选）。
- **CSV 导入仅在组合内发起**：全局导入入口取消。
- **旧 `/transactions` 路由族直接删除**，不做重定向。
- **消除双实现**：顶层自建表格与组合内 `TransactionTable` 合并为一套，并修复三个既有缺陷。

**关键判断**：本任务的性质是**信息架构收拢与实现去重**，不是新增功能。数据层早已收拢（`Transaction.portfolioId` 必填），割裂只存在于 UI 层。

---

## 1. Problem Statement

**用户问题**：交易数据在模型层**必须**归属某个组合（`portfolioId` 必填 + 索引），但界面上却把它当成一个独立频道。用户在组合里看流水时**无法新增交易**，必须退出到顶层「交易记录」页再手动选组合；反过来，顶层页把所有组合的流水混在一起，却既不分组也**没有任何筛选**。

**证据（已核实代码，详见附录 A）**：
- `client/src/components/layout/Sidebar.jsx:20` — 「交易记录」与「组合管理」并列顶层。
- `client/src/pages/Transaction/TransactionList.jsx` — 自建 `<table>`，**零筛选**；`getPortfolios()` 仅用于内存 join 组合名。
- `client/src/pages/Portfolio/Transactions.jsx` — 组合内 Tab **纯只读**，复用 `TransactionTable`，仅 5 列且表头为英文。
- `client/src/pages/Portfolio/PortfolioHeader.jsx:112` — 已有按钮跳 `PORTFOLIO_TAB(id,'transactions')`，但落点是只读页 → **死胡同**。
- `client/src/pages/Transaction/AddTransaction.jsx:12` — 支持 `?portfolioId=` 预填，但全仓**无一处**带该参数跳入，预留通道闲置。
- `server/controllers/transaction.controller.js:30-39` — `GET /api/transactions` 仅接受 `page/pageSize/portfolioId/symbol`。

**不解决的代价**：
1. 单笔交易无法在所属组合内完成全生命周期维护，需跨频道搬运。
2. 同一份数据两套渲染，行为与口径持续漂移（已实际发生，见附录 A 缺陷 1–3）。
3. 「组合」作为交易第一归属地的语义在 UI 层缺席，与数据模型背道而驰。

---

## 2. Goals

- **G1 归属可见**：任何一笔交易的查看、编辑、删除都在其所属组合的上下文中完成，无需手选组合。
  - *判定*：组合详情「交易记录」Tab 内可完成增 / 删 / 改 / 导入，`portfolioId` 不可手动变更。
- **G2 跨组合能力保留**：仍可一站查看全部组合的流水，并可按组合、标的筛选。
  - *判定*：`/portfolios/transactions` 页提供服务且可从二级导航直达。
- **G3 单一实现**：交易表格只有一份实现，两个使用点行为一致。
  - *判定*：全仓仅一处交易表格组件；不存在第二套自建 `<table>`。
- **G4 导航收敛**：顶层导航 7 → 6 项，「交易记录」不再独立占位。
  - *判定*：Sidebar 顶层项为 6，「全部交易」位于「组合管理」之下。

---

## 3. Non-Goals

- **NG1 不改数据模型**：`Transaction` schema 不变，不做数据迁移（`portfolioId` 已必填）。
- **NG2 不做「再平衡建议 → 一键记账」闭环**：属价值增量，需独立 FS（理由见 §10 D3）。
- **NG3 不做 CSV 导入批次回滚 / 导入历史**：属 TR-09 既有缺口，另开任务。
- **NG4 不改任何交易业务口径**：移动平均成本、超卖校验、fee、分红、A 股整手提示全部保持现状。
- **NG5 不做认证 / 权限**：与本人 IA 无关。
- **NG6 不重构组合详情其他 Tab**（持仓概览 / 持仓历史 / 再平衡）。
- **NG7 不做交易流水的查询筛选（时间范围 / 交易类型）**：已由 Human 裁决**拆为独立需求** `FS-transaction-query-filters.md`（TASK-045），本次不实现。本任务不新增任何服务端查询参数。

---

## 4. Proposed Information Architecture

### 4.1 导航变更（7 → 6，含二级）

```
总览
├ Dashboard · 提醒
├ 组合管理                    ← 可展开父项
│   ├ 组合列表        /portfolios
│   └ 全部交易        /portfolios/transactions      ← 原「交易记录」
├ 今日行情          badge「监控」
├ 家庭视图
├ 提醒规则
└ 日志
```

- 「组合管理」父项点击 = 进入组合列表 `/portfolios`；子项在展开态下可见。
- 「交易记录」顶层项**移除**。

### 4.2 路由映射

| 现状 | 变更 | 说明 |
|---|---|---|
| `/portfolios` | 保留 | 组合列表，同时作为父项落点 |
| **`/portfolios/transactions`（新增）** | 新增 | 全部交易聚合页（只读） |
| `/portfolios/view/:id/transactions` | 保留 | 组合内交易 Tab，**补全读写** |
| `/transactions` | **删除** | 不做重定向（Human 裁决） |
| `/transactions/new` | → `/portfolios/:id/transactions/new` | R4，OQ2 已决 |
| `/transactions/edit/:id` | → `/portfolios/:id/transactions/edit/:txId` | R4，按 OQ2 同一模式推导 |
| `/transactions/import` | → `/portfolios/:id/transactions/import` | R4，按 OQ2 同一模式推导 |

> **OQ2 已决**：写操作路由携带组合 id（`/portfolios/:id/transactions/*`），路径即上下文，无法漏传。
> ⚠️ **路由歧义提醒（供 Planner 验证）**：需确保 `/portfolios/transactions`（聚合页，2 段）与 `/portfolios/:id/...`（写操作）不互相匹配。当前无 `/portfolios/:id` 这个 2 段路由，故不冲突；但**若将来新增 `/portfolios/:id` 直连页，`/portfolios/transactions` 会被 `:id` 吞掉**。实现时须明确路由定义顺序或加精确匹配约束，并在代码注释中记录该约束。

### 4.3 页面职责

| 页面 | 职责 | 写能力 |
|---|---|---|
| 组合详情 · 交易记录 Tab | 单个组合的流水维护主战场 | 增 / 改 / 删 / 导入 |
| 全部交易 `/portfolios/transactions` | 跨组合查阅 | **只读**（编辑跳回所属组合上下文） |

---

## 5. User Stories

1. **US1（账本维护者）**：我在组合详情里看到某笔交易录错了，希望就地改掉，而不是先退出到另一个频道再选组合。
2. **US2（对账者）**：我想一次看完三个组合最近的流水，以便核对「这个月总共投入了多少」。
3. **US3（导入者）**：我从天天基金导出的 CSV 属于某一个组合，希望导入时不用再选组合、也不会误挂到别的组合上。
4. **US4（查阅者）**：我想在「全部交易」里按某个组合或某个标的筛出流水，快速定位。

---

## 6. Requirements

### P0 — Must Have（不交付则方案不成立）

| 编号 | 需求 | 验收标准 |
|---|---|---|
| **R1** | 侧边栏引入二级导航：「组合管理」为可展开父项，下挂「组合列表」「全部交易」；移除顶层「交易记录」 | 顶层项 6 个；「全部交易」需先展开「组合管理」才能到达；`/transactions` 不在导航中；**展开态不持久化**（OQ4 已决：刷新后回到默认态） |
| **R2** | 组合详情「交易记录」Tab 补全读写：新增 / 编辑 / 删除 / 导入 CSV | Tab 内四个动作均可用；新增与导入的 `portfolioId` 锁定为当前组合且不可修改；删除后列表即时刷新 |
| **R3** | 新增「全部交易」聚合页 `/portfolios/transactions` | 跨组合列出流水，含**组合**列；可按组合、按标的筛选；分页可用；行内可跳转至所属组合的交易记录 Tab。**实现方式**（OQ5 已决）：改造复用现有 `TransactionList.jsx`，不新起页面 |
| **R4** | 交易写操作页面（新增 / 编辑 / 导入）迁入组合上下文，路由形态 `/portfolios/:id/transactions/{new,edit/:txId,import}` | 写操作页面必然携带组合归属，不存在「未指定组合」的写入路径；`/portfolios/transactions` 不被 `:id` 模式误匹配 |
| **R5** | 删除旧 `/transactions` 路由族，不做重定向 | 全仓无 `/transactions` 路由；无指向 `/transactions` 的死链（含 `navigate('/transactions')` 残留） |
| **R6** | 统一交易表格：合并为一套组件，两处使用点共用 | 全仓仅一处交易表格实现；组合列在「全部交易」页显示、在组合内 Tab 隐藏 |
| **R7** | CSV 导入仅从组合内发起，取消全局导入入口 | 导入入口只出现在组合内；导入页无组合下拉选择器 |
| **R8** | 统一「操作类型」中文标签 | `buy/sell/div_cash/div_reinvest` 在两处显示一致且均为中文 |

### P1 — Should Have

**本版本无 P1 需求。**

原 R9（「全部交易」支持时间范围与交易类型筛选）已由 Human 于 2026-10-18 裁决**拆为独立需求**：`FS-transaction-query-filters.md`（TASK-045，Backlog）。原因：它必须改动 `server/` 与 `shared/` 且很可能新增数据库索引，与本任务「仅前端、IA 收拢」的定位性质不同。

### P2 — Future（设计留余地）

- 再平衡建议 → 一键记账（独立 FS）。
- CSV 导入批次记录与「撤销该批次」（TR-09）。
- 交易编辑时实时提示「当日可用持仓」（PL-1 TR-03 强化项）。
- 交易流水的查询筛选 → 见 `FS-transaction-query-filters.md`（独立需求）。

---

## 7. Success Metrics

| 目标 | 指标 | 判定方式 |
|---|---|---|
| G1 | 组合内完成一次「新增→编辑→删除」全流程无需跳离组合 | 手动走查 |
| G2 | 「全部交易」可筛出单组合流水 | 手动走查 |
| G3 | 交易表格实现数量 = 1 | 代码检索 |
| G4 | 顶层导航项 = 6 | 代码检索 + 走查 |

---

## 8. Open Questions — 已全部收敛

| 编号 | 问题 | 裁决（2026-10-18，Human） |
|---|---|---|
| **OQ1** | 「全部交易」是否需要时间范围 / 交易类型筛选？ | **拆为独立需求，本次不做** → `FS-transaction-query-filters.md`（TASK-045，Backlog）。本任务因此**保持「仅前端改动」**，不新增任何服务端查询参数。 |
| **OQ2** | 写操作路由的形态 | **`/portfolios/:id/transactions/new`**。`edit/:txId` 与 `import` 按同一模式推导（`/portfolios/:id/transactions/edit/:txId`、`/portfolios/:id/transactions/import`）。 |
| **OQ3** | 删除 `/transactions` 后旧书签的处理 | **删除，不做任何重定向处理**（命中 `*` 通配将落至 `/portfolios`）。 |
| **OQ4** | 「组合管理」展开态是否持久化 | **展开后不持久化**（刷新回到默认态）。 |
| **OQ5** | 旧文件 `TransactionList.jsx` 的处置 | **改造后复用为「全部交易」页**，不新起页面。其原有写操作能力迁入组合内交易 Tab。 |

**当前无未决问题。** 已于 2026-10-18 经 Human 批准。实现期若发现新的规格级问题，须记入本表并回到 Human 复批，不得由 Planner / Implementer 自行定义口径。

---

## 9. Timeline / Phasing

| 阶段 | 范围 | 前置 |
|---|---|---|
| P0 | R1–R8 | 本 FS 获 Human 批准（TASK-043 已完成，文件无冲突） |
| — | ~~R9~~ | 已拆出为独立需求 TASK-045（Backlog），**不在本任务内** |

---

## 10. Dependencies & Risks

| 编号 | 风险 / 依赖 | 说明 | 应对 |
|---|---|---|---|
| **D1** | **与 TASK-043 的文件交叉（已解除）** | TASK-043 改过 `Sidebar.jsx`（8→7）与 `router.jsx`（新增 `/instruments` 族），本任务要再改同两文件（7→6 + 二级导航 + 删 `/transactions`）。**已核实**：其改动固化于 commit `891d0f7`，工作区干净，且已在 `TASKS.md` 标记 Done | 无阻塞。**唯一遗留**：`TASK-043` 任务卡内部状态仍写 `REVIEWING`（文件已在 `complete/`），归档时建议一并更新，避免后人误读 —— ✅ **2026-10-19 已闭环**：TASK-043 置 `Completed`（任务卡 §11 / ExecPlan §10.9） |
| **D2** | PL-1 判定与本方案冲突 | `docs/product/lines/PL-1-ledger.md` §4 将 TR-01 判定为「保留」，理由「全局 + 组合内双视图，分页齐全」 | 本 FS 批准后同步修订 PL-1 §4 / §5 的 TR-01 条目与入口描述 |
| **D3** | 与「再平衡→记账」闭环的边界 | 本任务只做收拢，不做闭环；但收拢后闭环才在架构上可行 | 闭环单列 P1 独立 FS，不在本任务内扩张 |
| **D4** | 旧路由硬删除 | 无重定向意味着外部书签直接失效 | Human 已裁决接受 |
| **D5** | 双表格合并的回归面 | 组合内原本只读，开放写能力后需确认超卖校验、A 股整手提示等既有规则仍在写路径上生效 | Reviewer 必须独立验证写路径走后端既有校验，不得前端绕过 |

---

## 11. Human Decisions（裁决记录）

| 日期 | 决策项 | 结论 |
|---|---|---|
| 2026-10-18 | 总体方案 | **方案甲**：交易降为组合子资源（非「只做能力对齐」，非「彻底单向删除」） |
| 2026-10-18 | 跨组合流水位置 | 侧边栏**引入二级导航**，「交易记录」入口移至「组合管理」下；二级页 `组合列表 → 全部交易`，路径 `/portfolios/transactions` |
| 2026-10-18 | CSV 导入入口 | **仅在组合内发起** |
| 2026-10-18 | 旧 `/transactions` 路由 | **删除，不做任何重定向处理** |
| 2026-10-18 | **OQ1** 交易查询筛选 | **拆为独立需求**，本次不做 → `FS-transaction-query-filters.md`（TASK-045，Backlog）。本任务保持「仅前端改动」 |
| 2026-10-18 | **OQ2** 写操作路由 | `/portfolios/:id/transactions/new`（`edit/:txId`、`import` 同模式推导） |
| 2026-10-18 | **OQ4** 二级导航展开态 | **不持久化** |
| 2026-10-18 | **OQ5** 旧列表页 | **改造复用**为「全部交易」页，不新起页面 |
| 2026-10-18 | **FS 批准** | Human 将本规格置为**已批准**，批准范围 R1–R8（P0）。自本日起本文件构成 TASK-044 的 Human Intent，可进入 ExecPlan 与 Plan Review |

---

## Appendix A — 现状代码事实（已核实，供 Planner）

| 事实 | 位置 |
|---|---|
| `Transaction.portfolioId` **必填 + index**，复合索引 `{portfolioId, date:-1, _id:-1}`、`{portfolioId, symbol, date, _id}` | `shared/models/transaction.js:9-13, 32-33` |
| `action` 枚举 `buy / sell / div_cash / div_reinvest` | `shared/models/transaction.js:22` |
| 顶层交易列表：自建 `<table>`、零筛选、`pageSize: 20` | `client/src/pages/Transaction/TransactionList.jsx:79-122` |
| 组合内交易 Tab：只读、复用 `TransactionTable`、`pageSize: 20`、标题写「交易」 | `client/src/pages/Portfolio/Transactions.jsx:18, 32-33` |
| `TransactionTable` 仅 5 列、表头 `col.toUpperCase()` 直出英文、price 无币种符号 | `client/src/components/TransactionTable/index.jsx:11, 19` |
| 组合头部已有跳交易 Tab 的按钮 | `client/src/pages/Portfolio/PortfolioHeader.jsx:112` |
| `AddTransaction` 支持 `?portfolioId=` 预填，但无调用方 | `client/src/pages/Transaction/AddTransaction.jsx:12, 36-40` |
| `ImportTransactions` 自带组合下拉选择，提交前校验「请选择目标组合」 | `client/src/pages/Transaction/ImportTransactions.jsx:63, 118` |
| 服务层已支持 `portfolioId` / `symbol` 过滤；`getPortfolioTransactions(pid, …)` 走 `/portfolios/:pid/transactions` | `client/src/services/transaction.service.js:7-17` |
| 服务端 `GET /api/transactions` 仅接受 `page/pageSize/portfolioId/symbol`，**无 from/to、无 action** | `server/controllers/transaction.controller.js:30-39` |
| 写操作页面保存后 `navigate('/transactions')` | `AddTransaction.jsx:77`、`EditTransaction.jsx:75`、`ImportTransactions.jsx:106, 203` |

### 本次一并修复的既有缺陷（均在 R6 改动面内）

| 编号 | 缺陷 | 证据 |
|---|---|---|
| **Bug-1** | `action` 用二元判断，`div_cash` / `div_reinvest` 被显示为「卖出」 | `TransactionList.jsx:99`（`tx.action === 'buy' ? '买入' : '卖出'`） |
| **Bug-2** | 价格硬编码 `$`，CNY / CAD 标的均显示美元符 | `TransactionList.jsx:101` |
| **Bug-3** | `assetType` 直出英文枚举值（`stock`/`etf`…），未映射中文 | `TransactionList.jsx:98` |
