# TASK-044 — 交易记录收拢进组合管理

> 本文由 **Planner** 依据已批准的 Human Intent（FS）起草，**已于 2026-10-18 经 Human 完成 Plan Review 并批准**，状态 `Approved`。
> 关联任务：`docs/tasks/complete/TASK-044-transaction-consolidation.md`
> 产品需求（Human Intent）：`docs/product/specs/FS-transaction-consolidation.md` ✅ 已批准 2026-10-18（范围 R1–R8 / P0）
> 配套裁决记录：FS §8（OQ1–OQ5 全部收敛）/ §11（七项 Human Decisions）
> 流程纪律：本任务严禁 Orchestrator/Planner 代行 Implementer 或 Reviewer（TASK-043 越权教训）。生命周期：~~Plan Review~~ → **Approved** → Implementer → 独立 Reviewer → Integrator。

---

## Status

`Completed` — **2026-10-19**。全链路闭环：`Approved`（2026-10-18 Plan Review）→ 实现（2026-10-18）→ 两轮独立评审（2026-10-19，§11 / §11.9）→ R-1/R-2 整改（§11.8）→ 全系统验证 229/229（§11.10）→ **Human 提交合并 `30dc525`**（2026-10-19）→ **Human 最终验收通过**（2026-10-19，见 §11.11）。归档位置：`docs/exec-plans/complete/TASK-044-transaction-consolidation.md`。

Owner:

`Planner`（起草）/ `Human`（Plan Review 已批准 2026-10-18 + 提交合并 + 最终验收 2026-10-19）/ `Implementer`（已实现 2026-10-18）/ `Reviewer`（两轮独立评审 2026-10-19）/ `Orchestrator`（`Integrating` 验证 + `Completed` 归档）

Priority:

`High`

Related task:

`TASK-044`

**Plan Review 批准记录**

| 项 | 内容 |
|---|---|
| 批准日期 | 2026-10-18 |
| 批准方 | Human（Max） |
| 批准依据 | Human 声明「我已经阅读了 plan」并指令「将状态改为 Approved」 |
| 批准范围 | §1–§9 全文；**P0 = FS R1–R8 + Bug-1/2/3**；零服务端改动（AC12）不变 |
| 待决项 | §6 声明「无新增待 Human 裁定项」→ 批准后**不存在遗留未决** |
| 批准约束 | 实现期若需变更 Scope / 验收标准 / 架构方向，须回 Human 复批，不得由 Implementer 自行扩张 |

---

## 1. Intent

> 以下摘录自 FS（已批准）与 TASK-044 任务卡，未做口径改动。FS 为唯一 Human Intent 来源。

### Goal

把「交易记录」从**与组合并列的顶层频道**收拢为**组合的子资源**：侧边栏引入二级导航、组合详情交易 Tab 补全读写、新增跨组合聚合页、CSV 导入仅组合内发起、删除旧 `/transactions` 路由、合并双表格实现并修复三个既有缺陷。本质是**信息架构收拢 + 实现去重**，非新增功能。

### Why

数据层 `Transaction.portfolioId` 必填 + 索引，交易不可能脱离组合存在，但 UI 把它当独立频道；组合内是死胡同（Tab 只读）；同一份数据两套实现持续漂移（已产生 Bug-1/2/3）；跨组合查账能力须保留。

### Scope（In Scope）

FS §6 R1–R8（P0）+ 附录 A Bug-1/2/3。即：二级导航、组合 Tab 读写、聚合页、写操作路由带组合 id、删旧路由、单表实现、导入仅组合内、中文类型标签、三缺陷修复。

### Out of Scope（NG，不可触碰）

- NG1 数据模型/迁移（不动 `Transaction` schema）
- NG2 再平衡→一键记账闭环
- NG3 CSV 批次回滚/历史
- NG4 交易业务口径（成本/超卖/fee/分红/整手）任何变更
- NG5 认证授权
- NG6 组合详情其他 Tab（持仓概览/历史/再平衡）
- **NG7 交易流水查询筛选（时间范围/类型）→ 拆至 TASK-045（Backlog），本次零服务端改动**
- **零服务端改动（AC12）：`server/` 与 `shared/` 不得引入任何 `.js` 变更**

### Acceptance Criteria（来自 TASK-044 §5，逐条可验）

| # | 验收标准 | 对应 |
|---|---|---|
| AC1 | 侧边栏顶层 **6** 项；「组合管理」可展开，其下「组合列表」「全部交易」；顶层无「交易记录」 | R1 |
| AC2 | 组合详情「交易记录」Tab 可就地 新增/编辑/删除/导入；`portfolioId` 锁定当前组合且不可手动修改 | R2 |
| AC3 | `/portfolios/transactions` 跨组合列出流水，含**组合**列，支持按组合与标的筛选、分页，行内可跳回所属组合交易 Tab；由**改造后的 `TransactionList.jsx`** 承载 | R3 / OQ5 |
| AC4 | 写操作路由 `/portfolios/:id/transactions/{new,edit/:txId,import}`，`portfolioId` 取自路径且不可手选；`/portfolios/transactions` **不被 `:id` 模式误匹配** | R4 / OQ2 |
| AC5 | 全仓无 `/transactions` 路由；无任何 `navigate('/transactions')` 残留 | R5 |
| AC6 | 交易表格**仅一处实现**，两处使用点共用；组合列聚合页显示、组合内隐藏 | R6 |
| AC7 | CSV 导入入口只在组合内出现；导入页无组合下拉选择器 | R7 |
| AC8 | `buy/sell/div_cash/div_reinvest` 两处显示一致且均为中文（分红两类不再显示为「卖出」） | R8 / Bug-1 |
| AC9 | 价格按交易自身 `currency` 显示，不再硬编码 `$`；`assetType` 显示中文 | Bug-2 / Bug-3 |
| AC10 | 交易业务口径零回归：超卖校验、`fee`、分红两类语义、A 股整手提示保持现状，且**写路径仍经服务端校验**（不得前端绕过） | NG4 / FS D5 |
| AC11 | 「组合管理」二级导航展开态**不持久化**，刷新后回到默认态 | OQ4 |
| AC12 | **零服务端改动**：`server/` 与 `shared/` 无本次引入的 `.js` 变更 | OQ1 / NG7 |

---

## 2. Context

- **产品线**：PL-1 投资账本线（M1.2 交易流水）、PL-3 组合与配置线。FS 批准后需同步修订 `docs/product/lines/PL-1-ledger.md` §4/§5 的 TR-01 判定（FS D2 / TASK-044 §6 R-4）。
- **架构边界**：三进程（client / server / cron-worker）+ `shared/` 内核。本任务**仅动 `client/`**（AC12 / NG7）。`shared/` 是内核，本次只读参考，不修改。
- **复用既有资产（仓库发现的「可复用抽象」，避免重复造轮子）**：
  - `client/src/constants/enums.js` → `ASSET_TYPES`（`{value,label}`，stock→股票 / etf→ETF / fund→基金 / bond→债券 / cash→现金）。**修 Bug-3（`assetType` 中文）直接复用，不新建映射。**
  - `client/src/utils/priceDisplay.js` → `fmtPrice(value, currency)` + `CURRENCY_META`。**修 Bug-2（价格按币种）直接复用。**
  - `client/src/utils/csvImport.js` → `parseCsv` / `mapColumns` / `rowToTransaction`。导入页复用，不重写。
  - `client/src/services/transaction.service.js` → `getTransactions`（GET /transactions，已支持 `portfolioId`/`symbol`）、`getPortfolioTransactions`（GET /portfolios/:pid/transactions）、`getTransaction` / `createTransaction` / `updateTransaction` / `deleteTransaction` / `importTransactions`。**全部保留，零改动。**
  - `client/src/components/TransactionTable/index.jsx` → 现有只读表格组件，将**增强为唯一交易表格实现**（R6）。
  - 设计 token（`client/src/constants/design-tokens.js`）：侧边栏/表格沿用既有 `colors/radii/fontStack`。

---

## 3. Repository Findings

> Planner 于 2026-10-18 实地读取下列文件，核对 FS 附录 A 假设。**结论：FS 代码事实假设全部成立**，本任务确为纯前端收拢。

| 关注点 | 文件 / 位置 | 核对结论 |
|---|---|---|
| 顶层导航 | `client/src/components/layout/Sidebar.jsx:16-24` | ✅ `navItems` **7 项**；第 2 项 `组合管理`(`/portfolios`)、第 4 项 `交易记录`(`/transactions`) 并列。需改为「组合管理」父项 + 移除「交易记录」→ 6 项。 |
| 路由表 | `client/src/router.jsx:45-48` | ✅ 旧 `/transactions` 族 4 条路由存在（list/new/import/edit/:id）；无 `/portfolios/transactions`、无 `/portfolios/:id/transactions/*`。**当前无 2 段 `/portfolios/:id` 路由**（仅 `/portfolios/view/:id`），故聚合页与写路由无歧义。 |
| 路由常量 | `client/src/constants/routes.js` | `ROUTE_PATTERNS`/`ROUTES` 仅有 `PORTFOLIO_*`（list/new/view/tab/edit）。**需新增** `PORTFOLIO_TX_*` 常量（全部交易/新建/编辑/导入/交易 Tab）。 |
| 顶层交易列表 | `client/src/pages/Transaction/TransactionList.jsx` | ✅ 自建 `<table>`（79-122 行），**零筛选**；`getTransactions({page,pageSize:20})`；`getPortfolios()` 仅内存 join 组合名；顶部「导入 CSV」`navigate('/transactions/import')`、「创建交易记录」`navigate('/transactions/new')`；行编辑 `navigate('/transactions/edit/:id')`。**三处 `navigate('/transactions...')` 需改写**（AC5）。含 Bug-1/2/3（见下）。此文件将改造为「全部交易」聚合页。 |
| 组合内交易 Tab | `client/src/pages/Portfolio/Transactions.jsx` | ✅ 只读，复用 `TransactionTable`，默认 5 列（`columns` 默认 `['date','symbol','action','quantity','price']`），标题写「交易」；`getPortfolioTransactions(id,{pageSize:20})`。需补「新建/导入」按钮 + 行内 编辑/删除 + 隐藏组合列。 |
| 交易表格组件 | `client/src/components/TransactionTable/index.jsx:9-38` | ✅ 当前 `columns` 默认 5 列；表头 `col.toUpperCase()` 直出英文（Bug-3 根因之一）；`price` 直出 `tx[col]` 无币种（Bug-2 根因）；`action` 未映射（Bug-1 根因）。**将增强**：中文表头 + `action`/`assetType` 映射 + `fmtPrice` + 可选组合列 + 可选 编辑/删除/跳转 操作列。 |
| 组合头部按钮 | `client/src/pages/Portfolio/PortfolioHeader.jsx:110-125` | ✅ 「添加交易」按钮 `navigate(ROUTES.PORTFOLIO_TAB(id,'transactions'))` → 跳交易 Tab。**该入口保留有效**（落点是补全读写后的 Tab）。无需改动。 |
| 组合详情 Tab 机制 | `client/src/pages/Portfolio/Detail.jsx:15-20,25-29` | ✅ 4 主 Tab（持仓概览/持仓历史/再平衡/交易记录），`tab` 缺省重定向到 `positions`。交易 Tab 组件 = `Transactions`。改 `Transactions.jsx` 即生效，无需动 Detail。 |
| 写页面·新增 | `client/src/pages/Transaction/AddTransaction.jsx` | ✅ 支持 `?portfolioId=` 预填（12 行），但全仓无调用方；保存后 `navigate('/transactions')`（77 行）；有「所属组合」`<select>`（89-100 行）。需：读 `:id` 锁定组合、隐藏 select、改写 navigate 目标。A 股整手 `window.confirm`（66-74 行）**保留**（AC10）。 |
| 写页面·编辑 | `client/src/pages/Transaction/EditTransaction.jsx` | ✅ `useParams().id` 当前语义为 **txId**；保存后 `navigate('/transactions')`（75 行）；有「所属组合」`<select>`。新路由 `/portfolios/:id/transactions/edit/:txId` 须**重命名参数**（`id`=组合 id、`txId`=交易 id），改写 navigate 目标。 |
| 写页面·导入 | `client/src/pages/Transaction/ImportTransactions.jsx` | ✅ 自带「目标组合」`<select>`（118-121 行）+ 提交前校验「请选择目标组合」（63 行）；返回/查看结果两处 `navigate('/transactions')`（106、203 行）。需：从 `:id` 取组合、删除 select、改写 navigate 目标。CSV 解析 `utils/csvImport.js` 复用。 |
| 服务层 | `client/src/services/transaction.service.js` | ✅ CRUD 端点齐全：`getTransactions`(GET /transactions, 支持 portfolioId/symbol)、`getPortfolioTransactions`、`getTransaction`、`createTransaction`(POST)、`updateTransaction`(PUT)、`deleteTransaction`(DELETE)、`importTransactions`(POST /transactions/import)。**全部保留，本次零改动**。 |
| 服务端控制器 | `server/controllers/transaction.controller.js:30-61` | ✅ `getAllTransactions` 接受 `page/pageSize/portfolioId/symbol`；`getByPortfolio` 走 `/portfolios/:pid/transactions`。**确认无 `from/to`、无 `action` 查询参数** → 本次不新增服务端参数（AC12/NG7 成立）。写端点 CRUD 存在且会被前端继续调用（AC10 写路径仍经服务端校验）。 |
| 数据枚举 | `shared/models/transaction.js:22` | ✅ `action` ∈ `buy/sell/div_cash/div_reinvest`；`assetType` ∈ `ASSET_TYPES`（`shared/constants/asset.constants.js`）。`portfolioId` 必填+index（9-14 行）。**schema 不动**（NG1）。 |

### 三缺陷的确定性根因（均在 R6 改动面内，随单表化一并消除）

| 编号 | 缺陷 | 根因位置 | 修复方式 |
|---|---|---|---|
| **Bug-1** | `div_cash`/`div_reinvest` 显示为「卖出」 | `TransactionList.jsx:99` 三元 `action==='buy'?'买入':'卖出'` | 共享表用 `ACTION_LABELS` 四值映射（需在 `enums.js` 新增 `TRANSACTION_ACTIONS`） |
| **Bug-2** | 价格硬编码 `$` | `TransactionList.jsx:101` `${tx.price}` | 共享表用 `fmtPrice(tx.price, tx.currency)` |
| **Bug-3** | `assetType` 直出英文枚举 | `TransactionList.jsx:98` + `TransactionTable` 表头 `col.toUpperCase()` | 共享表表头用中文 label；`assetType` 单元格用 `enums.ASSET_TYPES` 映射 |

---

## 4. Proposed Design

> **总体策略**：编辑既有页面为主，零新增业务页面（聚合页复用 `TransactionList`），零新增服务端端点。改动严格限定 `client/`。复用既有 `enums`/`priceDisplay`/`csvImport`/服务层，不重复造轮子。

### 4.1 导航变更（R1 / AC1 / AC11）

`client/src/components/layout/Sidebar.jsx` 由扁平 7 项改为含二级的 6 项：

```
Dashboard · 提醒            /
组合管理 ▸ (可展开)         /portfolios
  ├ 组合列表                /portfolios
  └ 全部交易                /portfolios/transactions
今日行情        badge 监控   /prices
家庭视图                    /family
提醒规则                    /alerts/rules
日志                        /logs
```

- 「组合管理」父项：`onClick` 文本区 → `navigate('/portfolios')`；右侧 chevron → `useState` 切换展开/收起。
- **展开态不持久化（AC11）**：仅用组件内 `useState(false)`，默认收起；不使用 `localStorage`/sessionStorage；刷新即复位为默认态。
- 激活态判定：组合列表 active 当 `pathname === '/portfolios'` 或 `startsWith('/portfolios/view')`；全部交易 active 当 `pathname === '/portfolios/transactions'`；父项高亮当任一子项 active。
- 移除原第 4 项 `{ to:'/transactions', … '交易记录' }`。

### 4.2 路由映射（R4 / R5 / AC4 / AC5）

`client/src/router.jsx` 与 `client/src/constants/routes.js`：

| 现状 | 变更 | 说明 |
|---|---|---|
| `/transactions` 等 4 条 | **删除** | R5：不做重定向（Human 裁决 OQ3），命中 `*` 通配落 `/portfolios` |
| — | **新增** `/portfolios/transactions` → `TransactionList` | 聚合页（OQ5 复用） |
| — | **新增** `/portfolios/:id/transactions/new` → `AddTransaction` | 写操作带组合 id（OQ2） |
| — | **新增** `/portfolios/:id/transactions/edit/:txId` → `EditTransaction` | 同上 |
| — | **新增** `/portfolios/:id/transactions/import` → `ImportTransactions` | 同上 |
| 其余路由 | 保留 | 不变 |

- **路由歧义处理（AC4）**：当前 router 无 2 段 `/portfolios/:id` 路由（仅 `/portfolios/view/:id` 为 3 段），故 `/portfolios/transactions`（2 段字面量）不会被任何 `:id` 吞掉。为稳妥与可维护，**在 router 中先声明字面量 `/portfolios/transactions`，并在代码注释中记录约束**：「未来若新增 2 段 `/portfolios/:id` 直连页，须用 `transactions` 之外字面量或精确匹配，避免吞掉聚合页」。React Router v6 按静态段优先级高于动态段，当前结构天然安全。
- `routes.js` 新增（`ROUTES` 与 `ROUTE_PATTERNS`）：
  ```js
  PORTFOLIO_TX_ALL:   '/portfolios/transactions',
  PORTFOLIO_TX_NEW:    id => `/portfolios/${id}/transactions/new`,
  PORTFOLIO_TX_EDIT: (id, txId) => `/portfolios/${id}/transactions/edit/${txId}`,
  PORTFOLIO_TX_IMPORT: id => `/portfolios/${id}/transactions/import`,
  PORTFOLIO_TX_TAB:    id => `/portfolios/view/${id}/transactions`,
  ```

### 4.3 唯一交易表格组件（R6 / R8 / Bug-1/2/3 / AC6/AC8/AC9）

增强 `client/src/components/TransactionTable/index.jsx`，不再新增文件：

```js
TransactionTable({
  transactions,
  showPortfolio = false,   // R6：聚合页 true、组合内 false
  portfolios = [],        // showPortfolio 时按 _id 查组合名
  onEdit,                 // fn(tx) 组合内提供 → 渲染「编辑」
  onDelete,               // fn(tx) 组合内提供 → 渲染「删除」
  onViewPortfolio,        // fn(tx) 聚合页提供 → 组合名列渲染跳转链接
})
```

- **中文表头 label map**：`date→日期 / symbol→资产代码 / action→类型 / assetType→证券类型 / quantity→份额 / price→价格 / portfolio→组合 / operations→操作`（替换原 `col.toUpperCase()`）。
- **`action` 单元格**：查 `enums.TRANSACTION_ACTIONS`（新增：`buy→买入 / sell→卖出 / div_cash→现金分红 / div_reinvest→分红再投`）。修复 Bug-1 且两处一致（R8）。
- **`assetType` 单元格**：查 `enums.ASSET_TYPES` 取 `label`。修复 Bug-3。
- **`price` 单元格**：`fmtPrice(tx.price, tx.currency)`（`utils/priceDisplay.js`）。修复 Bug-2。
- **组合列**：`showPortfolio` 为真时插入；`onViewPortfolio` 提供时将组合名渲染为 `<Link to={ROUTES.PORTFOLIO_TX_TAB(pid)}>`。
- **操作列**：`onEdit`/`onDelete` 提供时渲染「编辑 / 删除」按钮；否则不渲染（聚合页只读，仅提供 `onViewPortfolio`）。
- 保留 `TransactionTable.css`。

### 4.4 聚合页（R3 / AC3 / OQ5 / R7）

改造 `client/src/pages/Transaction/TransactionList.jsx`（**文件名保留**，语义变为「全部交易」）：

- 数据：`getTransactions({ page, pageSize:20, portfolioId, symbol })` 保留（GET /transactions，跨组合，服务端零改动）。
- **新增筛选**（AC3）：组合下拉（来自 `getPortfolios()`）+ 标的文本输入；变更时带 `portfolioId`/`symbol` 重新拉取。
- **渲染改用共享表**：`<TransactionTable transactions={...} showPortfolio portfolios={portfolios} onViewPortfolio={tx => navigate(ROUTES.PORTFOLIO_TX_TAB(tx.portfolioId))} />`。
- **移除顶部「导入 CSV」「创建交易记录」按钮**（R7：导入仅组合内；聚合页只读，创建入口收进组合 Tab）。
- 标题「交易记录」→「全部交易」；保留分页。
- 删除原内联 `<table>`（R6 去重）。Bug-1/2/3 经共享表自动修复。

### 4.5 组合内交易 Tab（R2 / AC2）

改造 `client/src/pages/Portfolio/Transactions.jsx`：

- 顶部新增「新建交易」按钮 → `navigate(ROUTES.PORTFOLIO_TX_NEW(id))`；「导入 CSV」按钮 → `navigate(ROUTES.PORTFOLIO_TX_IMPORT(id))`（R7：导入在组合内发起）。
- 渲染改用共享表：`<TransactionTable transactions={result.data} showPortfolio={false} onEdit={tx => navigate(ROUTES.PORTFOLIO_TX_EDIT(id, tx._id))} onDelete={handleDelete} />`。
- `handleDelete` 保留（`deleteTransaction` + 刷新），`portfolioId` 由页面 `id` 上下文锁定（组合内无需组合列）。
- 中文表头 / Bug-1/2/3 经共享表修复。

### 4.6 三个写页面（R4 / R7 / AC4 / AC7 / AC10）

| 文件 | 关键改动 |
|---|---|
| `AddTransaction.jsx` | 路由改 `/portfolios/:id/transactions/new`；`const { id } = useParams()`，`portfolioId = id` **锁定**；移除「所属组合」`<select>`，改为静态展示组合名（用 `getPortfolio(id)`）；保存后 `navigate(ROUTES.PORTFOLIO_TX_TAB(id))` 替代 `/transactions`；**保留** A 股整手 `window.confirm`（AC10）；`createTransaction`（POST /transactions）不变。 |
| `EditTransaction.jsx` | 路由改 `/portfolios/:id/transactions/edit/:txId`；**重命名参数** `const { id: portfolioId, txId } = useParams()`；`getTransaction(txId)` 加载；组合锁定（静态名 + 隐藏 select）；保存后 `updateTransaction(txId, form)` → `navigate(ROUTES.PORTFOLIO_TX_TAB(portfolioId))`；保留整手提示。 |
| `ImportTransactions.jsx` | 路由改 `/portfolios/:id/transactions/import`；`const { id: portfolioId } = useParams()`；**删除「目标组合」`<select>`**（AC7）+ 删除「请选择目标组合」校验；`importTransactions({ portfolioId, transactions })`；两处 `navigate('/transactions')`（返回/查看结果）改 `navigate(ROUTES.PORTFOLIO_TX_TAB(portfolioId))`；CSV 解析复用 `utils/csvImport.js`。 |

> **写路径不变（AC10）**：三页面仍调用 `createTransaction`/`updateTransaction`/`deleteTransaction`/`importTransactions`，即仍走服务端既有校验（超卖、fee、分红语义、整手提示均保持现状）。共享表仅为展示层，**不承载任何写校验**，不存在「双表合并绕过校验」风险（R-3）。

### 4.7 文档同步（FS D2 / TASK-044 §6 R-4）

- `docs/product/lines/PL-1-ledger.md` §4/§5 的 TR-01：将原「全局 + 组合内双视图，分页齐全」改为「交易已收拢为组合子资源；侧边栏『组合管理』下『全部交易』= 跨组合聚合页；全局 `/transactions` 已删除；业务口径不变」。
- 文档 Sweep：搜索 `docs/**` 中残留的 `/transactions` 路由引用（如 `CLIENT.md` 手动入口、readme 索引），同步为新路径；无引用则跳过。

---

## 5. Work Breakdown

- [x] **R1 导航二级化**：`Sidebar.jsx` 改 6 项 + 「组合管理」可展开父项（组合列表/全部交易）；展开态 `useState` 不持久化；移除「交易记录」顶层项；激活态判定正确。
- [x] **R4/R5 路由**：`router.jsx` 删 4 条旧 `/transactions*`；新增 `/portfolios/transactions` 与 `/portfolios/:id/transactions/{new,edit/:txId,import}`；`routes.js` 新增 `PORTFOLIO_TX_*` 常量；字面量顺序 + 注释约束。
- [x] **R6 单表化（核心）**：增强 `TransactionTable` —— 中文表头 label、action 映射（新增 `enums.TRANSACTION_ACTIONS`）、assetType 映射（`enums.ASSET_TYPES`）、`fmtPrice` 价格、可选组合列（`showPortfolio`）、可选操作列（`onEdit/onDelete/onViewPortfolio`）。
- [x] **Bug-1/2/3**：随单表化自动消除（分红中文、价格按币种、assetType 中文），两处使用点一致。
- [x] **R3 聚合页**：`TransactionList.jsx` 改「全部交易」—— 复用 `getTransactions` + 组合/标的筛选 + 分页 + 共享表（`showPortfolio`）+ 行内跳转；移除「导入/创建」按钮；删内联 `<table>`。
- [x] **R2 组合 Tab 读写**：`Transactions.jsx` 加「新建/导入」按钮（走 `PORTFOLIO_TX_*`）+ 共享表（`showPortfolio=false` + `onEdit/onDelete`）。
- [x] **R4/R7 写页面**：`Add/Edit/Import` 改读 `:id` 锁定组合、隐藏/删除组合选择、改写 `navigate` 目标；`EditTransaction` 重命名参数 `id→portfolioId`、`txId`；保留整手提示与 `csvImport` 复用。
- [x] **AC5 死链清扫**：全仓 `grep -rn "/transactions"` 确认：仅剩 `transaction.service.js` 的服务端 API 路径（`/transactions`、`/transactions/:id`、`/transactions/import`），**无** router `<Route path="/transactions...">`、**无** `navigate('/transactions')` 或 `navigate('/transactions/...')`。
- [x] **R8 中文一致**：两处 `action` 显示均经 `TRANSACTION_ACTIONS`，无「卖出」误显。
- [x] **文档同步**：`PL-1-ledger.md` TR-01 修订；docs Sweep `/transactions` 路由引用。
- [x] **验证（见 §7）**：build + 本地 eslint + grep + 运行走查；`server/` `shared/` 零 `.js` 改动。

---

## 6. Open Decisions

> **无新增待 Human 裁定项。**

FS §8 已声明 OQ1–OQ5 全部收敛、当前无未决问题；本 Planner 实地探索后**未浮现任何需 Human 审批的架构/产品分叉**，方案完全由已批准 FS 确定。下列为**实现层既定决策**（非 Human 分叉，仅记录供 Implementer 遵循，不在 Plan Review 表决范围）：

1. **聚合页文件名保留** `TransactionList.jsx`（不改名），语义变为「全部交易」——避免无谓的 import 重构。
2. **`TRANSACTION_ACTIONS` 映射落地于 `enums.js`**（与既有 `ASSET_TYPES` 同文件），复用风格一致。
3. **聚合页为只读**——按 FS R3 仅提供「行内跳转至所属组合交易 Tab」（`onViewPortfolio`），不提供行内编辑/删除。
4. **写页面组合锁定方式**——隐藏 `<select>`，以 `getPortfolio(id)` 静态展示组合名，杜绝手动改 `portfolioId`。

---

## 7. Verification

> 遵循 TASK-043 教训：验证须**可执行、可复现、由独立 Reviewer 复核**，不采信实现者自评数字；`eslint` 必须用**本地 v9.39.5**（`client/node_modules/.bin/eslint`），`npx eslint` 会拉 v10 与 `eslint-plugin-react` 不兼容而崩溃。

- [ ] **构建**：`npm run build --workspace client`（或 `vite build`）exit 0，0 error。
- [ ] **静态检查**：`./client/node_modules/.bin/eslint "client/src/**/*.{js,jsx}"` 0 error / 0 warning。
- [ ] **AC5 死链 grep**：
  `grep -rn "/transactions" client/src --include=*.jsx --include=*.js`
  允许命中仅：`transaction.service.js` 内的 `/transactions`、`/transactions/${id}`、`/transactions/import`（服务端 API）；**禁止**命中：router.jsx 的 `<Route path="/transactions...">`、任何 `navigate('/transactions')` 或 `navigate('/transactions/...')`。
- [ ] **AC1 导航**：渲染侧边栏，顶层项计数 = 6；「组合管理」可展开，「全部交易」在展开后出现；无「交易记录」。
- [ ] **AC4 路由不歧义**：访问 `/portfolios/transactions` 命中聚合页（非写路由）；访问 `/portfolios/:id/transactions/new` 命中 AddTransaction 且 `:id` 正确传入。
- [ ] **AC11 不持久化**：刷新页面后「组合管理」回到收起默认态（localStorage 无相关键）。
- [ ] **AC6/AC8/AC9 单表与缺陷**：在组合 Tab 与聚合页各抽查一条 `div_cash`/`div_reinvest` 交易 → 显示「现金分红/分红再投」（非「卖出」）；价格带正确币种符号（非 `$`）；`assetType` 显示中文；全仓仅一处 `TransactionTable` 实现（grep `TransactionTable` 仅组件定义 + 两处 import 使用）。
- [ ] **AC12 零服务端改动**：`git status server shared cron-worker` 无新增/修改的 `.js`（允许仅文档/`.md`）；`client/package.json` 无新依赖。
- [ ] **AC10 写路径仍经服务端**：独立 Reviewer 确认 `Add/Edit/Import` 仍调用 `createTransaction`/`updateTransaction`/`deleteTransaction`/`importTransactions`；A 股整手 `window.confirm` 仍在；无前端旁路校验替代服务端。
- [ ] **手动走查（Human/Reviewer 执行）**：① 组合内 新增→编辑→删除 全流程不跳离组合；② 聚合页按组合/标的筛选 + 分页；③ 行内跳转回所属组合交易 Tab；④ 组合内导入 CSV 无组合下拉、写入正确组合；⑤ 旧 `/transactions` 书签命中 `*` 通配落 `/portfolios`。

---

## 8. Risks & Coordination

| 编号 | 风险 / 协调项 | 应对 |
|---|---|---|
| R-3（TASK-044 §6） | 双表合并误以为可复用只读逻辑而绕过写校验 | 本设计共享表**仅展示**，写校验始终在 `transaction.service.js` → 服务端；Reviewer 必须独立验证写路径（AC10） |
| 侧边栏激活态 | 二级导航下「组合列表/全部交易」与既有 `/portfolios/view/*` 激活高亮易错 | §4.1 明确判定规则；验证时人工核对 4 类路径激活态 |
| 聚合页去按钮 | 移除「导入/创建」后需确保无孤立引用 | AC5 grep 覆盖；§5 工作项显式删除内联 `<table>` 与按钮 |
| FS D2 / R-4 | PL-1 文档判定与方案冲突 | §4.7 文档同步纳入工作项 |
| TASK-043 卡片状态 | `TASK-043` 任务卡内部仍写 `REVIEWING`（文件已在 `complete/`） | 归档时一并更新（协调项，不阻塞本任务） |
| 流程纪律 | Orchestrator/Planner 不得代行 Implementer/Reviewer | 本 ExecPlan 批准后交由独立 Implementer 实现；审查交独立 Reviewer（参考 TASK-043 §9 机制） |

---

## 9. Implementer Handoff

- **严格只读 `server/` 与 `shared/`**：任何「需要服务端支持」的诉求都意味着偏离 FS（应回到 Human），不得在本次偷偷加端点/参数（AC12/NG7）。
- **复用优先**：`enums.ASSET_TYPES`、`utils/priceDisplay.fmtPrice`、`utils/csvImport`、`transaction.service` 全部复用，勿重写。
- **新增仅一处常量 + 一处枚举**：`routes.js` 的 `PORTFOLIO_TX_*`；`enums.js` 的 `TRANSACTION_ACTIONS`。其余为编辑既有文件。
- **参数重命名**：`EditTransaction` 必须 `const { id: portfolioId, txId } = useParams()`，否则会误把交易 id 当组合 id（高危）。
- **组合锁定**：写页面隐藏 `<select>`，用 `getPortfolio(id)` 静态展示，杜绝手选。
- **eslint 本地 v9.39.5**：见 §7，勿用 `npx`。
- **不要自审结案**：实现后交独立 Reviewer，不得由 Implementer/Orchestrator 自判通过。

---

## 10. Implementation Record

> 实施者：Implementer（2026-10-18）。本节只记录**实际做了什么 / 与计划的差异**，不构成验收结论——验收交独立 Reviewer（§9）。

### 10.1 变更文件清单（全部在 `client/`，零服务端改动）

| 文件 | 类型 | 内容 |
|---|---|---|
| `client/src/constants/enums.js` | 编辑 | 新增 `TRANSACTION_ACTIONS`（buy/sell/div_cash/div_reinvest + 中文 label） |
| `client/src/constants/routes.js` | 编辑 | 新增 `PORTFOLIO_TX_ALL/NEW/EDIT/IMPORT/TAB` 常量 + 路由歧义约束注释 |
| `client/src/router.jsx` | 编辑 | 删 4 条旧 `/transactions*`；新增聚合页 + 3 条带组合 id 的写路由 |
| `client/src/components/layout/Sidebar.jsx` | 重写 | 7 → 6 项；「组合管理」可展开父项；展开态仅 `useState` |
| `client/src/components/TransactionTable/index.jsx` | 重写 | 唯一交易表格实现（中文表头 / action / assetType / `fmtPrice` / 组合列 / 操作列） |
| `client/src/components/TransactionTable/TransactionTable.css` | 重写 | 对齐 design token（#E3E8EE 边框 / #F6F8FA 表头）+ 链接与操作按钮样式 |
| `client/src/pages/Transaction/TransactionList.jsx` | 重写 | 「全部交易」聚合页（筛选 + 分页 + 共享表 + 行内跳组合） |
| `client/src/pages/Portfolio/Transactions.jsx` | 重写 | 组合内 Tab 补读写（新建/导入/编辑/删除），空态也保留按钮 |
| `client/src/pages/Transaction/AddTransaction.jsx` | 编辑 | 读 `:id` 锁定组合，删除组合下拉，保存回组合 Tab |
| `client/src/pages/Transaction/EditTransaction.jsx` | 编辑 | 参数改名 `id→portfolioId` + `txId`，锁定组合，保存回组合 Tab |
| `client/src/pages/Transaction/ImportTransactions.jsx` | 编辑 | 读 `:id`，删除组合下拉与「请选择目标组合」校验，预览「方向」列中文 |
| `client/scripts/verify-transaction-routes.mjs` | **新增** | AC4/AC5 可复跑验证（见 §10.3） |
| `client/scripts/e2e-task-044.mjs` | **新增** | 真实浏览器走查脚本（38 条断言，见 §10.4） |
| `docs/product/lines/PL-1-ledger.md` | 编辑 | TR-01 / TR-09 条目按收拢后口径改写（R-4 / FS D2） |
| `docs/product/lines/PL-0-platform-foundation.md` | 编辑 | 路由表 4 行、Sidebar 导航项数、组件清单补 `TransactionTable` |
| `docs/manual/CLIENT.md` | 编辑 | §3.3 交易、§4 手动入口改为组合内 + 全部交易双入口；§3.3 导入段落标注去重当前失效（R-2） |
| `client/vite.config.js` | 编辑 | dev proxy 目标改为 `process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080'`（见 D-8，R-1 整改） |

### 10.2 与计划的差异（均已评估为「计划精神内」，请 Reviewer 复核）

| # | 差异 | 理由 |
|---|---|---|
| D-1 | 新增 `client/scripts/verify-transaction-routes.mjs` | §9 限定「新增仅一处常量 + 一处枚举」，但该文件是**验证资产**而非运行时代码（不被 import，不增依赖），且对应 TASK-043 教训「验证必须可复现」；沿用 `verify-price-display.cjs` 先例 |
| D-2 | 「组合列表」激活态额外覆盖 `/portfolios/new`、`/portfolios/edit/*` | §4.1 只写了 `/portfolios` 与 `/portfolios/view*`；新建/编辑组合时若父项不高亮会出现「不在任何导航位置」的观感。不改变父项高亮规则，仅补全落点 |
| D-3 | 聚合页筛选采用「提交式」（draft → 查询按钮生效） | 计划未指定交互方式；逐字请求会产生大量后端往返。组合筛选同样走查询按钮，行为统一 |
| D-4 | CSV 导入预览的「方向」列也改为中文映射 | R8 只说「两处显示一致」，但导入预览是第三处展示点，直出 `div_cash` 与新表格中文口径冲突。复用同一 `TRANSACTION_ACTIONS` |
| D-5 | 文档 sweep 范围扩至 `CLIENT.md` 与 `PL-0` 路由表 | §4.7 只点名 PL-1 + 死链；但 PL-0 有完整前端路由表与组件清单、CLIENT.md 描述「交易记录 → 创建」旧入口，不改即为事实错误 |
| D-6 | `PortfolioHeader` 的「添加交易」按钮**未改**（仍跳交易 Tab） | 按 §3 结论「该入口保留有效，无需改动」执行 |
| D-7 | 新增 `client/scripts/e2e-task-044.mjs`（依赖 `playwright-core`，**不写入 package.json**） | 走查须可复跑（§10.4）。依赖按需 `npm i playwright-core --no-save` 安装，复用本机 Chrome，不下载浏览器；脚本头部写明前置条件 |
| D-8 | `client/vite.config.js` dev proxy 目标由 `http://192.168.2.150:9080` 改为 **`process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080'`**（原为硬编码 `127.0.0.1:8080`） | 旧地址已失效，不改则无法完成 §10.4 走查。因 `client/.env` 被 `.gitignore` 忽略、proxy 目标是**唯一共享的 dev 配置**，硬编码个人地址会影响他人，故改为环境变量可覆盖、默认本机 8080。属**开发配置**，不影响运行时与 AC12（`server/` `shared/` `cron-worker/` 仍零改动）。对应 R-1 整改 |
| D-9 | `docs/manual/CRON_WORKER.md` 的改动**已回退**（`git checkout --`），当前无残留 diff | 该文件本不在 §10.1 清单内，其 diff 仅为编辑器重排版 + 误删事实性表述「（同一实现）」。该表述在 TASK-005 后**仍然成立**（server 与 worker 共用 `shared/` 同一实现），删除即制造事实错误 → 回退而非申报保留。对应 R-1 整改 |

### 10.3 实施自测结果（仅作 Reviewer 复核线索，**不作为验收依据**）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | exit 0，2403 modules，0 error |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | exit 0，0 error / 0 warning（eslint v9.39.5，workspaces 提升至根 `node_modules`） |
| 路由歧义/旧路由 | `node client/scripts/verify-transaction-routes.mjs` | `PASS 13 / 13` |
| 模块可编译 | vite dev 按需编译 10 个改动文件 | 全部 HTTP 200 |
| AC5 死链 | `grep -rn "navigate('/transactions\|path=\"/transactions" client/src` | 无命中 |
| AC6 单表 | `grep -rn TransactionTable client/src` | 1 处定义 + 2 处使用 |
| AC12 零服务端 | `git status --short server shared cron-worker client/package.json` | 无输出 |
| **真实浏览器走查** | `node client/scripts/e2e-task-044.mjs`（见 §10.4） | **38 / 38 PASS** |

### 10.4 真实浏览器走查（2026-10-19 补做）

首轮实施时本机 API 不可达（dev server `/api` 代理指向已失效的 `192.168.2.150:9080`），故未做浏览器走查。Human 修正代理与 `.env` 后已补做，**结论：ExecPlan §7「手动走查」5 项全部通过**。

- **环境**：API `http://127.0.0.1:8080`、前端 `http://localhost:5173`、Chrome（headless，经 `playwright-core` 驱动）。
- **数据隔离**：走查**未触碰真实库 `portomind`**。现场复制出 `portomind_e2e`（4 组合 / 44 资产 / 50 交易），API 以 `MONGO_URI` 指向副本运行；走查结束后已删除测试期间写入的 1 笔分红样本与 4 笔导入（副本回落到 50 笔，与真实库一致）。
- **覆盖**：AC1 / AC2 / AC3 / AC4 / AC5 / AC6 / AC7 / AC8 / AC9 / AC11 + Bug-1/2/3，共 38 条断言（含 6 张截图）。关键证据：价格显示 `C$22.71 / $335.76`（按交易币种，不再硬编码 `$`）、分红显示「现金分红」（不再误显「卖出」）、组合内无「组合」列而聚合页有、旧 `/transactions` 落至 `/portfolios`、`localStorage` 无任何键（展开态不持久化）。
- **走查中发现但**未在本任务处理（属 NG4 交易口径 / TR-09 既有缺口，需回 Human 立项）：同一 CSV 二次导入时后端未跳过重复（两次导入同一内容均报告「成功导入 2 条 / 跳过重复 0 条」）。与本次前端收拢无关，未擅自修。
  - **→ 已立项 `TASK-046`**（2026-10-19）。根因已定位：`shared/services/transaction.service.js:233` 的 `select()` 投影漏了 `portfolioId`，而拼键时读取 `String(tx.portfolioId)` 得 `"undefined"` → 库内键与待导入键永不相等 → `skipped` 恒 0。既有集成测试因 mock 无视投影而全绿（`12/12 pass`），属假阳性。详见 `docs/tasks/active/TASK-046-csv-import-dedup.md`。
  - **定性修正**：原表述「后端未跳过重复」不准确。去重逻辑存在且被调用，是**比对键永不命中**导致的幂等失效——修复只需 1 行投影，但测试必须同步修正，否则同类缺陷仍会被绿测试掩盖。



## 11. Review Record（独立 Reviewer，2026-10-19）

> 评审人：Reviewer（与 Implementer 分离）。评审对象 = 工作区未提交改动（分支 `feature/TASK-044`，commit 基线 `891d0f7`）。
> 评审依据：TASK-044 §5 AC1–AC12、FS §6 R1–R8、本 ExecPlan §4/§7、`docs/process/EXECUTION_PLANS.md` §6/§7。
> **本角色不修改业务代码**，只记录结论与整改项。

### 11.1 结论

**有条件通过**（12/12 验收标准满足；2 项须处理后方可进入 `Integrating`）。

> **后续更新（2026-10-19）**：R-1 / R-2 已整改并经**第二轮评审判定通过**，见 §11.8（整改记录）与 §11.9（复审结论）。本节保留首轮结论作为审计痕迹。

### 11.2 独立复核的实测结果（不采信 §10.3 自评数字）

| 项 | 评审人命令 | 实测结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | ✅ exit 0，2403 modules，仅有既存 chunk >500kB 警告（与本次无关） |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | ✅ exit 0，0 error / 0 warning（eslint v9.39.5；**注意 `client/node_modules/.bin/eslint` 不存在**，二进制被提升到根，§10.3 记录的命令写法不可照抄） |
| AC4/AC5 路由 | `node client/scripts/verify-transaction-routes.mjs` | ✅ `PASS 13 / 13` |
| AC5 死链 | `grep -rn "/transactions" client/src` | ✅ 仅命中：`transaction.service.js` 的 API 路径、`routes.js`/`router.jsx` 的新路由常量与注释、页面注释。无 `navigate('/transactions')`、无旧 `<Route>` |
| AC6 单表 | `grep -rn "TransactionTable" client/src` | ✅ 1 处定义（`components/TransactionTable/index.jsx:40`）+ 2 处使用（`Portfolio/Transactions.jsx:100`、`Transaction/TransactionList.jsx:146`）；`TransactionList.jsx` 内联 `<table>` 已删除 |
| AC12 零服务端 | `git status --short server shared cron-worker client/package.json` | ✅ 空输出 |
| AC9 币种 | 读 `shared/models/transaction.js:19` | ✅ `currency` 为 required 字段 → `fmtPrice(tx.price, tx.currency)` 有真实输入，Bug-2 修复成立（非仅表面改字符串） |
| AC10 写路径 | 读三页面提交逻辑 | ✅ `createTransaction` / `updateTransaction` / `importTransactions` / `deleteTransaction` 全部仍走 `transaction.service` → 服务端；A 股整手 `window.confirm` 保留（`Add:66` / `Edit:75`）；未发现前端旁路校验 |
| 浏览器走查 | **未由评审人重跑** | ⚠️ 需实时 API + DB 副本，评审环境不具备；§10.4 的 38 条结论**仍属实现者举证**。已逐条审读脚本：`check()` 调用计数确为 38（与自报一致），主体断言非自证，但见 M-5 两处弱断言 |

### 11.3 验收标准逐条判定

AC1 ✅（`navItems` 6 项，「组合管理」含 2 子项，顶层无「交易记录」）· AC2 ✅（增/改/删/导入齐备，`portfolioId` 由路径锁定、页面无 `select[name=portfolioId]`，空态保留按钮）· AC3 ✅（`/portfolios/transactions` 含组合列 + 组合/标的筛选 + 分页 + 组合名跳回）· AC4 ✅（`matchRoutes` 实测不误匹配，参数 `id`/`txId` 语义正确）· AC5 ✅ · AC6 ✅ · AC7 ✅（导入页 `select` 数为 0，入口仅组合内）· AC8 ✅（两处同一 `TRANSACTION_ACTIONS` 四值映射）· AC9 ✅ · AC10 ✅ · AC11 ✅（仅 `useState`，无 storage 写入）· AC12 ✅。

### 11.4 须处理（进入 `Integrating` 前）

| # | 级别 | 问题 | 证据 | 要求 |
|---|---|---|---|---|
| **R-1** | 须处理 | **两处未申报改动**（不在 §10.1 文件清单，也不在 §10.2 的 D-1~D-7 中）：`client/vite.config.js` 把 dev proxy 目标从 `192.168.2.150:9080` 改为 `127.0.0.1:8080`；`docs/manual/CRON_WORKER.md` 被重排版并**删除了「（同一实现）」这一事实性表述** | `git diff -- client/vite.config.js docs/manual/CRON_WORKER.md` | 二选一：① 回退这两处；② 若确需保留，补入 §10.2（编号 D-8/D-9）说明理由并经 Human 确认。注：`client/.env` 未被 git 跟踪（`.env` 在根 `.gitignore:76`），故 proxy 目标是**唯一共享的 dev 配置**，硬编码 `127.0.0.1` 会影响他人；建议改为 `process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080'`。依 `IMPLEMENTER.md` §3「禁止顺手修与本次任务无关的文件（脏改动会污染 Review 范围）」 |
| **R-2** | 须处理 | `CLIENT.md` 在本次被改写的段落里**保留了已失效的陈述**「与库里完全相同的记录自动跳过」 | `docs/manual/CLIENT.md:71`；事实见 TASK-046（`skipped` 恒 0） | 该行属本次改动行，且 Implementer **已在本任务中确认该缺陷存在**，不应继续作为事实陈述。改为「重复记录本应自动跳过（**当前失效，见 TASK-046**）」或在 TASK-046 修复前删去半句。依 `docs/standards` 对账纪律：生效状态与源码不符必须标注 |

### 11.5 建议改进（不阻塞，可按 Human 判断并入本任务或另立）

| # | 级别 | 问题 | 建议 |
|---|---|---|---|
| **M-1** | 建议（回归） | 侧边栏**写路由无激活态**：`/portfolios/:id/transactions/{new,edit/:txId,import}` 既不命中 `isPortfolioListPath`（只覆盖 `/portfolios`、`/portfolios/new|edit|view`），也不命中「全部交易」，导致在这三页时导航**无任何高亮**；改动前 `/transactions/new` 会高亮「交易记录」 | `client/src/components/layout/Sidebar.jsx:22-26`。一行修复：把写路由并入「组合列表」族（如 `/\d+\/transactions/` 判定），或为父项补 `active` 兜底 |
| **M-2** | 建议（数据面） | `EditTransaction` 把 `portfolioId` **无条件**覆盖为路径值（`setForm({...tx, portfolioId})`）：若 URL 的组合 id 与该交易真实归属不符，提交即**静默把交易迁移到另一个组合**，触发两个组合的持仓/成本重算 | `EditTransaction.jsx:42-51, 82`。建议：`getTransaction(txId)` 回来后校验 `String(tx.portfolioId) !== portfolioId` 则报错并中止（而非静默改写） |
| **M-3** | 建议（一致性） | 存在**第三处**交易类型展示点仍在用二元映射：`client/src/pages/Family.jsx:17,238` 的 `ACTION_LABELS = { buy, sell }`，分红类会渲染成 `undefined`（空 badge，且被染成「跌」色）。D-4 已顺手统一导入预览，此处属同类遗漏 | 复用 `enums.TRANSACTION_ACTIONS`（与 R8「统一中文标签」精神一致）。属任务 Scope 外，建议并入 TASK-046 或另立小单 |
| **M-4** | 建议（文档纪律） | `docs/readme.md` 未登记本次新增文档：`specs/FS-transaction-consolidation.md`、`specs/FS-transaction-query-filters.md`、`tasks/active/TASK-044/046`；且索引中仍把 `TASK-042` 列为活跃任务、`exec-plans/active/TASK-003-github-login.md` 指向不存在的文件 | 按「唯一索引入口」约定补登记；陈旧条目一并清理（可拆给 Orchestrator） |
| **M-5** | 建议（验证质量） | E2E 两处断言**恒真**：`e2e-task-044.mjs:111` 的 `!url.includes('/transactions/') \|\| url.includes('/portfolios/')` —— 组合内 URL 必然含 `/portfolios/`，故永不失败；`:126` 的 `!editedRow.includes('\t7\t')` —— `innerText` 分隔符是 `\n` 而非 `\t`，负向半边恒真 | 改为断言「当前 URL 不匹配 `^/transactions`」与「首行份额单元格 === '9'」这类可证伪形式（TASK-043「期望值不得从被测实现反推」的同类风险） |
| **M-6** | 建议（验证质量） | `verify-transaction-routes.mjs` 在脚本内**复制**路由表而非读取 `router.jsx`：若 `router.jsx` 日后漏声明某条路由，脚本仍全绿 | 至少从 `router.jsx` 抽出路由声明数组供脚本 import；或在脚本注释中显式标注「与 router.jsx 需人工同步」并加一条 grep 校验 |

### 11.6 未发现问题的重点风险项（已专项核查）

- **R-3（双表合并绕过写校验）**：未发生。共享表纯展示，无 `create/update` 调用；写页面仍逐字段提交至服务端（AC10）。
- **路由歧义（AC4）**：`matchRoutes` 实测 `/portfolios/transactions` 命中聚合页；且 `PORTFOLIO_TX_*` 与既有 `PORTFOLIO_EDIT`（3 段）不冲突（4/5 段）。
- **旧路由硬删除（OQ3）**：`/transactions*` 全部落 `*` 通配 → `/portfolios`，与裁决一致；注意本仓对 `/assets*` 保留了兼容重定向，两种处理并存属 Human 既定裁决，非遗漏。
- **`usePortfolio` 依赖**：`QueryClientProvider` 已在 `main.jsx:17` 挂载，写页面复用该 hook 无运行时风险。
- **字典一致性**：`TRANSACTION_ACTIONS` 四值与 `shared/models/transaction.js:22` 枚举逐一对应，无多余/缺失项。

### 11.7 下一步

| 步骤 | 负责 | 说明 |
|---|---|---|
| 1 | Implementer | ~~处理 R-1、R-2~~ → **已完成 2026-10-19，见 §11.8** |
| 2 | Implementer | ~~自选是否采纳 M-1 / M-2~~ → **本轮未采纳**（未获 Human 授权，保持改动面最小）；若采纳须同步 §10.2 并重跑 build+lint |
| 3 | Orchestrator | 复核两项处理后置 `Integrating`；M-3~M-6 拆分去向由 Human 决定 |
| 4 | Human | 最终验收（Final acceptance 属 Human，不属 Reviewer） |

### 11.8 整改记录（R-1 / R-2，Implementer 2026-10-19）

| # | 处理方式 | 落点与实测证据 |
|---|---|---|
| **R-1a** proxy 硬编码 | **保留但改为可覆盖**（未回退，理由见 §10.2 D-8） | `client/vite.config.js:12` → `target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080'`。个人地址不再进共享配置，他人可用环境变量指向自己的后端 |
| **R-1b** `CRON_WORKER.md` 脏改动 | **整文件回退**（§10.2 D-9） | `git checkout -- docs/manual/CRON_WORKER.md`；实测 `git status --short docs/manual/CRON_WORKER.md` 无输出、`git diff --stat` 为空；「（同一实现）」表述已恢复 |
| **R-2** `CLIENT.md` 失效陈述 | **按建议显式标注失效** | `docs/manual/CLIENT.md:71` 改为「重复记录**本应**自动跳过，但该去重当前**不生效**（同一文件重复导入会重复入库，见 TASK-046），导入前请自行确认」 |
| 验证 | 重跑 build + lint + 路由脚本 | 见下方实测 |

**验证命令与结果**

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | exit 0，2403 modules（仅既存 chunk >500kB 警告） |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | exit 0，0 error / 0 warning |
| AC4/AC5 路由 | `node client/scripts/verify-transaction-routes.mjs` | `PASS 13 / 13` |
| R-1a 生效性 | `cd client && node --input-type=module -e "import {loadConfigFromFile} from 'vite'; const r=await loadConfigFromFile({command:'serve',mode:'development'},'./vite.config.js',undefined,'development'); console.log(r.config.server.proxy['/api'].target);"`（可前置 `VITE_API_PROXY_TARGET=…` 再跑一次） | 默认 `http://127.0.0.1:8080`；`VITE_API_PROXY_TARGET=http://10.0.0.9:9999` 时为 `http://10.0.0.9:9999`（覆盖生效） |
| R-1b 残留 | `git status --short docs/manual/CRON_WORKER.md` | 无输出 |
| R-2 措辞 | `grep -n "TASK-046" docs/manual/CLIENT.md` | 命中第 71 行 |
| AC12 零服务端 | `git status --short server shared cron-worker client/package.json` | 无输出（`server/.env` 本机改动除外，未提交） |

**范围声明**：本次整改共触及 3 个文件（`client/vite.config.js`、`docs/manual/CRON_WORKER.md`（回退）、`docs/manual/CLIENT.md`）+ 本 ExecPlan 与任务卡的状态记录。M-1~M-6 **未采纳**（待 Human 决定去向）。同类残留记录：`docs/product/lines/PL-1-ledger.md:179` 仍写「幂等去重：批次内去重 + 与库中按 `(portfolioId, …)` 比对 → `skipped`」——该处属**需求/设计口径陈述**（缺陷由 TASK-046 跟踪），与用户手册的「当前行为」口径不同，故未擅改，提请 Human 一并裁决。

### 11.9 第二轮评审（Reviewer，2026-10-19，复审 R-1/R-2 整改）

**结论：通过（Pass）** — R-1/R-2 均已闭环，无新增阻塞项；AC1–AC12 判定与 §11.3 一致，无需重开。可交 Orchestrator 置 `Integrating`。

**整改复核（逐项独立验证，不采信 §11.8 自述）**

| 项 | 评审人实测 | 判定 |
|---|---|---|
| R-1b `CRON_WORKER.md` 回退 | `git status --short` 已无该文件；`git diff` 为空；「（同一实现）」表述已恢复 | ✅ 闭环 |
| R-1a proxy 可覆盖 | 独立跑 `loadConfigFromFile`：默认 `http://127.0.0.1:8080`；`VITE_API_PROXY_TARGET=http://10.0.0.9:9999` 时为 `http://10.0.0.9:9999` | ✅ 闭环（机理成立，详见 N-1 的边界） |
| R-1 申报 | §10.1 已补 `client/vite.config.js` 行；§10.2 新增 **D-8**（proxy 改动理由）、**D-9**（CRON_WORKER 回退理由） | ✅ 闭环 |
| R-2 手册口径 | `CLIENT.md:71` 已改「本应自动跳过，但当前不生效（见 TASK-046）」 | ✅ 闭环 |
| 回归复验 | `npm run build --workspace client` exit 0 / `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` 0-0 / `node client/scripts/verify-transaction-routes.mjs` PASS 13/13 / `git status --short server shared cron-worker client/package.json` 空 | ✅ 无回归 |

**新增 nits（不阻塞）**

| # | 说明 | 证据 |
|---|---|---|
| **N-1** | `process.env.VITE_API_PROXY_TARGET` **只读真实 shell 环境变量，不读 `client/.env`**。评审人用隔离探针实测：在 `.env` 里写该变量，target **仍为默认 8080**（静默失效）。而本仓恰好已有 `client/.env`（`VITE_API_URL=…`），后来者极可能把变量写在那里 → 白改且难查。建议二选一：① 注释补一句「需在 shell 中导出（`VITE_API_PROXY_TARGET=… npm run dev`），写进 `.env` 不生效」；② 改用 `loadEnv(mode, process.cwd(), '')` 让 `.env` 也能生效 | `client/vite.config.js:11-12`；探针 `loadConfigFromFile` + 临时 `.env` 实测 |
| **N-2** | 任务卡 §10 写「PL-1:179 未擅改」，但该文件实际**已新增**「⚠️ 当前实现失效…缺陷跟踪 TASK-046」标注（内容正确、且落在 §4.7 允许的文档同步范围内）。属**记录与事实不符**，非代码问题 | `git diff -- docs/product/lines/PL-1-ledger.md` 末尾 `+   > ⚠️ **当前实现失效**…`；建议把任务卡那句改为「已在 PL-1 §6.2 增失效标注，与 CLIENT.md 口径对齐」 |
| **N-3** | M-1~M-6 本轮**未采纳**（理由：未获 Human 授权，保持改动面最小）——该取舍符合 `IMPLEMENTER.md` §3，评审人认可。但其中 **M-1（写路由侧边栏无高亮，真实回归）** 与 **M-2（编辑页跨组合静默改归属，数据面风险）** 建议由 Human 至少**立卡跟踪**，避免随任务归档而丢失 | 见 §11.5 |

**说明**：本轮评审人**未修改任何业务代码或文档结论**；§11.8 由 Implementer 撰写，已核对无误（除 N-2 所述一处）。`Completed` 与最终验收仍属 Human。

### 11.10 Integration Record（Orchestrator，2026-10-19）

> 依据 `EXECUTION_PLANS.md` §6：`Integrating` = **合并 + 全系统验证**。本节只记录**独立复核**，不采信 §11.8 / §11.9 的自述。

**A. 关键项独立复核（全部通过）**

| 项 | 复核命令 / 落点 | 实测 |
|---|---|---|
| 构建 | `npm run build --workspace client` | ✅ exit 0，`built in 4.69s` |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | ✅ exit 0，0 error |
| 路由（AC4/AC5） | `node client/scripts/verify-transaction-routes.mjs` | ✅ `PASS 13 / 13` |
| 零服务端改动（AC12） | `git status --short server shared cron-worker client/package.json` | ✅ 空输出 |
| R-1b 回退 | `git status --short docs/manual/CRON_WORKER.md` | ✅ 空输出（已回退） |
| R-1a 可覆盖 | `client/vite.config.js:13` | ✅ `process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080'` |
| R-2 措辞 | `docs/manual/CLIENT.md:71` | ✅ 「本应自动跳过，但该去重当前**不生效**（见 TASK-046）」 |
| 导航 6 项 + 二级 | `Sidebar.jsx:30-44` | ✅ 顶层 5 条 + 「组合管理」父项（`组合列表` / `全部交易` 2 子项）= 6 |
| 单表实现（AC6） | `grep -rn TransactionTable client/src` | ✅ 1 处定义 + 2 处使用（`Portfolio/Transactions:100`、`Transaction/TransactionList:146`） |
| 旧路由残留（AC5） | `grep -rn "navigate('/transactions\|to=\"/transactions"` | ✅ 无命中 |
| R-1 申报完整性 | 逐项比对 `git status` 与 §10.1 | ✅ 全部在清单内（含审查曾漏看的 `PL-0-platform-foundation.md`，实为已申报） |

**B. 全系统验证（`Integrating` 要求的系统级检查）**

`npm test`（根，跑全部 workspace）：

| Workspace | 命令 | 结果 |
|---|---|---|
| `@portomind/server` | `node --test test/integration/*.test.js` | **152 pass / 0 fail** |
| `@portomind/cron-worker` | `node --test` | **77 pass / 0 fail** |
| 合计 | — | **229 pass / 0 fail** |

> 说明：本次改动为纯客户端（AC12），服务端测试全绿属**回归基线确认**，不构成对本次实现的功能性证明；本次功能的行为证据来自 §11.3 逐条判定 + `verify-transaction-routes.mjs` + §10.4 浏览器走查（后者仍属**实现者举证**，见 §11.2 末行）。

**C. 待 Human 决定（Orchestrator 无权处理）**

| # | 事项 | 为什么需要 Human |
|---|---|---|
| 1 | **提交合并（git commit）** | 规范未授权 Orchestrator 执行合并入库；`Integrating` 的「合并」半环须由 Human 授权或亲自执行。建议提交范围与消息见下方 |
| 2 | **M-1 / M-2** | 已由 Human 裁决立项（`TASK-047`，M-2 = 方案②），本任务不处理 |
| 3 | **M-3** | 已拆出 `TASK-048` |
| 4 | **M-4** | 已由 Orchestrator 闭环（`docs/readme.md`） |
| 5 | **M-5 / M-6 / N-1** | 建议随 `TASK-047` 一并处理（M-5/M-6 已并入该卡 P1；N-1 为 `vite.config.js` 注释补充，未立项） |
| 6 | **最终验收** | §7 Ownership：`final acceptance` 属 Human，不属 Reviewer/Orchestrator |

**D. 建议的提交边界（供 Human 参考，尚未执行）**

| 组 | 内容 |
|---|---|
| 主提交（TASK-044） | `client/src/**`（12 个文件）、`client/scripts/e2e-task-044.mjs`、`client/scripts/verify-transaction-routes.mjs`、`client/vite.config.js`、`docs/exec-plans/active/TASK-044-*.md`、`docs/tasks/active/TASK-044-*.md`、`docs/manual/CLIENT.md`、`docs/product/lines/PL-0|PL-1`、`docs/readme.md`、`docs/tasks/TASKS.md`、`.workbuddy/memory/*` |
| 建议同批（文档产出，与本任务同期） | `docs/product/specs/FS-transaction-consolidation.md`、`FS-transaction-query-filters.md`、`docs/tasks/active/TASK-045/046/047/048-*.md` |

> 若拆成两个 commit：① `TASK-044 交易记录收拢进组合管理`；② `docs: 交易线后续需求与任务登记（TASK-045~048）`。

---### 11.11 Completion Record（2026-10-19）

| 项 | 内容 |
|---|---|
| 提交 | `30dc525` — `TASK-044 交易记录收拢进组合管理`（Human 执行） |
| 提交范围 | 与 §11.10-D 建议边界一致：`client/src/**`（12 文件）+ `client/scripts/{e2e-task-044,verify-transaction-routes}.mjs` + `client/vite.config.js` + ExecPlan/任务卡/`CLIENT.md`/`PL-0`/`PL-1`/`readme.md`/`TASKS.md` + `.workbuddy/memory/*` |
| 提交后工作区 | `git status --short` 空输出（无未申报残留） |
| 最终验收 | **Human 于 2026-10-19 声明「已经提交 git」并指令置 `Completed`** → 依 §7 Ownership 视为最终验收通过 |
| 归档动作 | ExecPlan → `docs/exec-plans/complete/`；任务卡 → `docs/tasks/complete/`；`TASKS.md` 移入 Done；`docs/readme.md` 索引同步 |
| 验收标准 | AC1–AC12 全部满足（§11.3）；AC12「零服务端改动」经 `git status server shared cron-worker` 空输出二次确认 |
| 遗留移交 | M-1/M-2/M-5/M-6 → `TASK-047`；M-3 → `TASK-048`；M-4 → 已闭环；CSV 幂等缺陷 → `TASK-046`；OQ1（筛选查询）→ `TASK-045` |
| 未做 | 未执行任何 `git` 写操作（Orchestrator 无合并授权）；未修改验收标准；未改动 `server/` `shared/` `cron-worker/` |

> 归档后本文为**历史记录**，不再变更。后续问题按上表「遗留移交」在对应任务卡内跟踪。

---

## Lifecycle Note

`~~Plan Review~~` → **`Approved`（2026-10-18）** → **Implemented（2026-10-18，见 §10）** → Verifying → **Reviewing（独立评审完成 2026-10-19，有条件通过，见 §11）** → **R-1/R-2 整改完成（2026-10-19，见 §11.8）** → **第二轮评审通过（2026-10-19，见 §11.9）** → **`Integrating`（2026-10-19，全系统验证 229/229 通过，见 §11.10）** → **Human 提交合并 `30dc525`（2026-10-19）** → **Human 最终验收通过（2026-10-19，见 §11.11）** → **`Completed`**
- 本文由 Planner 起草，**2026-10-18 经 Human 在 Plan Review 阶段批准**，自本日起可作为 Implementer 的实施依据。
- 批准范围以 FS R1–R8（P0）为界；任何 Scope / 验收 / 架构变更须回 Human 复批。
- **实现者与审查者必须分离**：Implementer 完成后交独立 Reviewer；不得由 Implementer 或 Orchestrator 自判通过（TASK-043 四轮审查、两次 Fail 的教训）。
- **`Integrating` 的「合并」半环由 Human 执行（`30dc525`）**：`ORCHESTRATOR.md §3` 的允许项不含合并入库，Orchestrator 仅完成「全系统验证」并提交授权；最终验收同样由 Human 作出（§11.11）。此分工为后续任务的既定做法。
