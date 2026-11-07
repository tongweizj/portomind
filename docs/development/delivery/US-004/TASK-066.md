# TASK-066 — Dashboard 组合健康表 + 总资产卡分币种小计（FS B6～B13）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Completed（2026-11-06，Human 确认检验通过）**：独立 Reviewer 判定 **`Pass with issues`**，无 BLOCKER、无未决 MAJOR（F-01 MAJOR 已由 `353d583` 整改并复审收敛），4 项 MINOR 记录在案。**`Merged` = `af1f4d2`**（2026-11-06 **PR #42**：`Merge pull request #42 from tongweizj/feature/TASK-066`；`git merge-base --is-ancestor f8903c3 main` = 是，合入前分支已以 `f8903c3` merge 最新 `main`） |
| Priority / Owner / Type | `High` / Reviewer（待指派） / `Feature`（纯客户端） |
| Created / Updated | 2026-11-05 / 2026-11-06 |
| 所属 Story | [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) |
| 覆盖的验收条件 | US-004/AC-05～AC-13 |
| Related Product Spec / ADR | [FS-portfolio-ia-cleanup](../../requirements/specs/FS-portfolio-ia-cleanup.md) §4.3（Dashboard 线框）、§6.2（B6～B13）、§7（AC24～AC32）、§10（R-5） |
| Execution Plan | [Approved：TASK-066-plan](./TASK-066-plan.md)（2026-11-06 Human 确认批准） |

## 1. 问题

首屏现在只有「总资产卡 + 提醒事件列表」：总资产回答「我家多少钱」，提醒回答「有什么事」，但**没有任何东西回答「哪个账户不对劲、该先动哪个」**。需要在总资产卡与「待处理提醒」之间加一张「组合健康」表（组合 / 市值 / 偏离 / 待办 / 上次再平衡），并在总资产卡内加一行分币种小计。

## 2. 已核实的事实（2026-11-05 亲读 `main` 源码）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | Dashboard 已在用 `usePortfolios()`（`:76`），`queryKey: ['portfolios-summary']` 与列表页同缓存 → 健康表**零新增请求** | `client/src/pages/Dashboard.jsx:76`、`client/src/hooks/usePortfolios.js:20` |
| F-02 | 页面结构：`TotalAssetsCard`（`:109`）→「待处理提醒」标题（`:112`）→ 筛选栏 → 事件列表 | `client/src/pages/Dashboard.jsx:108-146` |
| F-03 | `TotalAssetsCard` 用 `useFamilySummary()`（`queryKey: ['family-summary']`），`data.buckets` 形如 `{CNY:{amount,cnyValue,rate},...}` | `client/src/components/Household/TotalAssetsCard.jsx:16`、`shared/services/familySummary.service.js:47-93` |
| F-04 | 健康表列定义、四态「偏离」取值优先级、排序规则见 Spec §4.3（待办 → 超阈 → 到期 → `createdAt` 倒序，OQ-01 未裁） | `FS-portfolio-ia-cleanup.md` §4.3 |

## 3. Acceptance Criteria

- [ ] AC-01：「组合健康」区块位于总资产卡与「待处理提醒」之间；5 列（组合 / 市值 / 偏离 / 待办 / 上次再平衡）3 行；数据源复用 `usePortfolios()`，**零新增请求**（对比改动前 Network 基线，对应 US-004/AC-17 的请求数口径）。
- [ ] AC-02：「偏离」列四态各有一条构造用例：① 仅超阈 → 「N 项超阈」且 N = `overThresholdCount`（负向对照：`triggeredThresholds.length === 2` 但只覆盖 1 个标的 → 显示「1 项超阈」）；② 仅 `dueByTime` → 「已到期（N 天）」且 N = 距今天数；③ 皆无 → 「正常」；④ 无目标 → 「未设目标」（对应 US-004/AC-07）。
- [ ] AC-03：「待办」列点击「N 条待确认」跳 `/portfolios/view/:id/rebalance?sub=suggestions`；点击「N 条未读」跳 `/` 并把组合筛选设为该 `portfolioId`；点徽标**不**触发整行跳转（`stopPropagation`，对应 US-004/AC-08）。
- [ ] AC-04：行排序按「**有事的在上**」实现（OQ-01 已裁决，2026-11-05 Human）：`待办数>0` → `needsRebalance`（超阈）→ `dueByTime`（已到期）→ `createdAt` 倒序兜底。比较函数为**全序**（同分稳定），刷新后顺序不变（对应 US-004/AC-09）。
- [ ] AC-05：已归档组合不出现（负向对照：`includeArchived` 打开时 `/portfolios` 可见）；0 个组合时显示空态与「新建组合」按钮，不出现只有表头的空表格（对应 US-004/AC-10、AC-12）。
- [ ] AC-06：`summary` 请求失败（`route.abort()`）时健康表显示局部错误态，总资产卡与提醒列表**仍正常渲染**（对应 US-004/AC-11）。
- [ ] AC-07：总资产卡内新增一行分币种小计：按 `buckets` 逐币种显示，`null` 桶显示「—」，币种顺序固定 `CNY → USD → CAD → HKD`，其余按字母序追加；无数据时该行整体不渲染（对应 US-004/AC-05、AC-06）。
- [ ] AC-08：提醒区（筛选 / 标记已读 / 忽略 / 立即评估 / 规则管理）行为与改动前一致，逻辑零改动（对应 US-004/AC-13）。
- [ ] AC-09：`npm run build --workspace client` exit 0；eslint 0 error。
- [ ] AC-10：1440×900 视口下打开 Dashboard，**不滚动即可见**：总资产金额、分币种小计一行、健康表 3 行（对应 US-004/AC-05 的视口条件，PM G-2 缺口补）。

## 4. Scope

**In Scope**

- `client/src/pages/Dashboard.jsx`：在 `TotalAssetsCard` 与「待处理提醒」之间插入「组合健康」区块
- `client/src/components/Household/TotalAssetsCard.jsx`：加分币种小计一行
- 新增健康表组件（如 `client/src/components/Dashboard/PortfolioHealthTable.jsx`），自管 loading / 局部 error / empty

**Out of Scope**

- 不改 `shared/`、`server/`、`cron-worker/`
- 不改 `PortfolioCard` 四格（属 TASK-067）
- 不改 `PortfolioCard` 徽标按 `dueByTime` 显示「待再平衡」（P1-1，不在本期）
- 汇率面板迁出 `/portfolios`（Spec NG-4）

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **同源分裂**：健康表「偏离/待办」与组合卡各算一套 → 「卡片说正常、表说 2 项超阈」 | 本卡只做展示派生，数据全部取 `stats`，与 TASK-067 同源；文案与 TASK-067 逐字一致 |
| R-2 | **排序抖动**：比较函数非全序时刷新顺序漂移 | AC-04 用 `createdAt` 倒序兜底；构造 3 组合断言顺序稳定 |
| R-3 | **局部错误隔离**：`summary` 失败若整页白屏 | 沿用 `TotalAssetsCard` 已验证的隔离模式（组件内 catch，不向上抛） |

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| B1 | 前置 TASK-065：四字段（`lastExecutedAt`/`pendingRebalanceCount`/`dueByTime`/`overThresholdCount`）落地后才可完整渲染 | 待办理（可用「字段缺失降级」先做骨架，但验收需真实字段） |
| B2 | OQ-01 / OQ-02 均已裁决（见 §8） | ✅ 已满足 |

## 7. Coordination Notes

**免计划依据**（EXECUTION_PLANS.md §2）：纯客户端单包改动，无架构 / 契约 / schema / 依赖变更，无跨包文件冲突；实施风险低、依赖清晰，交接所需信息本卡已齐。**实施要点**：复用 `usePortfolios()`（同一 `queryKey`，零新增请求）；健康表组件自管 loading/error/empty；排序按 OQ-01 裁决实现（未裁前按 Spec §4.3 推荐）。**验证方式**：构造数据覆盖 AC-02 四态（含负向对照）、AC-04 全序、AC-06 局部错误态、AC-07 币种顺序与 `null` 桶；`npm run build --workspace client` + eslint。

## 8. Open Questions

- **OQ-01**：✅ 已裁决（2026-11-05 Human）——「**有事的在上**」（`待办数>0 → 超阈 → 到期 → createdAt 倒序`）；原型多加的 `unvaluable` / `missing` 两档**不采用**。
- **OQ-02**：✅ 已裁决（2026-11-05 Human）——本 Story 与 US-003 **无硬依赖**、本 Story 先行；本卡 AC-03「待办」跳转 `?sub=suggestions` 在 US-003 AC-11 落地前落到默认子 Tab（行为等价）。
- **D-02**：✅ 已裁决（2026-11-06 Human）——本卡（Implementer B）**拥有**共享文案常量 `client/src/constants/driftLabels.js`（健康表四态偏离 + 「待办/上次再平衡」文案），TASK-067 消费。
- **D-01**：✅ 已裁决（2026-11-06 Human，解 B）——逐字一致只约束「待办/上次再平衡」，偏离徽标维持两态（属 TASK-067 口径，本卡健康表偏离列仍为四态）。

## Orchestrator 交付接收记录（2026-11-06）

依据 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)：「Task → Reviewing：Implementer 提供改动清单、自测证据、可审对象和已知妥协」。四项齐备，故登记 `Implementing` → **`Reviewing`**。

| 项 | 事实 |
|---|---|
| Worktree | `D:/projects/portomind-066` |
| 分支 / 提交 | `feature/TASK-066` @ **`353d583`**（F-01 整改）；此前 `7cdefa0`（健康表）、`4e26dca`（`driftLabels.js`）、`67298c4`（merge `main` @ `8b863f0`） |
| 改动规模 | 新增 `PortfolioHealthTable.jsx`（217 行）、`verify066.cjs`、`driftLabels.js`、`priceDisplay.js` 的 `lastRebalanceDateStr`（唯一 UTC 实现，066/067 共用）；改 `TotalAssetsCard.jsx` / `Dashboard.jsx` / `PortfolioCard/index.jsx`（同源日期与文案）/ 计划 §11 |
| 范围核对 | `server/` `shared/` `cron-worker/` **零改动** ✓ |
| 自测证据 | 计划 §11；整改后 `verify066.cjs` **34/34 PASS**（首轮 29/29 + 5 条 F-01 单元格级断言），build exit 0、eslint 0/0 |

**Orchestrator 独立复验（本轮全部亲跑）**

| 项 | 结果 |
|---|---|
| `npm run build`（client） | **exit 0**（2.82s）✓ |
| `eslint "src/**/*.{js,jsx}"` | **exit 0** ✓ |
| `verify066.cjs`（启 vite @ 6601 后跑） | **29/29 PASS**，含 5 处负向对照 ✓ |
| D-02 归属 | `client/src/constants/driftLabels.js` 由 `4e26dca` 建立，健康表 `:29` import 它 ✓ |
| 零新增请求 | `PortfolioHealthTable.jsx` 不自行调接口，数据由 `Dashboard.jsx` 的 `usePortfolios()` 传入 ✓ |
| AC-03 点击隔离 | `stopPropagation` 在 `:182` / `:194` ✓ |

**验收脚本的取证特征（须告知 Reviewer）**：`verify066.cjs` 依赖本地 vite dev server（`VERIFY_BASE`，默认 `http://localhost:6601`）+ 本机 Chrome（`CHROME_PATH`），用 `page.route` 拦截 `/api/**` 注入 mock 快照。**不是连真实后端**。Orchestrator 本轮用 `../node_modules/.bin/vite --port 6601` 启动后复跑，跑完已关闭服务、worktree 干净。

**⚠️ 065 已合入，降级态前提解除**：本卡计划 §4 原要求「065 未合入用字段缺失降级」。065 现已合入 `main`（`6f556aa`），四字段在位，故 AC-02/AC-04 的**真实字段验收已可完成**（脚本用的 mock 也含四字段）。Reviewer 需确认实现没有残留不必要的降级掩盖。

**未做的事**：未改 AC / Scope / 代码；未替 Reviewer 出具判定；未提交合入、未填 `Merged`、未关闭。本节与 §12 按 Human 2026-11-06「066 已检验通过」指令与 Reviewer §12 记录登记。

**结案登记（2026-11-06，Orchestrator）**：独立 Reviewer 判定 **`Pass with issues`**（无 BLOCKER、无未决 MAJOR），按 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Reviewing → Completed`。计划同步 `Approved → Completed`，§13 Completion Record 已补。**合入登记（2026-11-06，Human）**：经 **PR #42** 合入 `main`，合并提交 **`af1f4d2`**（`Merge pull request #42 from tongweizj/feature/TASK-066`）；`git merge-base --is-ancestor f8903c3 main` = 是。**`Merged` = `af1f4d2`**。

## 12. Review Record

**独立审查结论：`Pass with issues`**（2026-11-06，独立 Reviewer；**无 BLOCKER / 无未决 MAJOR**；4 项 MINOR 不阻塞）。

- **首轮**（`7cdefa0`）：AC-05～AC-13 逐条满足（`verify066` 29/29 + 自建探针 19/19 + 点击探针补 AC-08 + 3 负向对照），但发现 **F-01（MAJOR）**：健康表用本地时区格式化 `lastExecutedAt` 且带 `（N 天前）` 后缀，与 067 卡片 UTC 日期可能相差一天。**Human 裁决 R2 = Option A（去后缀）、R1 = 唯一 UTC formatter 两卡共用**。
- **复审**（`353d583`，整改后）：F-01 **已整改复检通过、收敛** —— `priceDisplay.js:71 lastRebalanceDateStr` 为唯一 UTC 实现，066 `:81` 与 067 `:54` 共用；去后缀、`null → 从未`。复审实跑：build exit 0、eslint 0/0、`verify066.cjs` **34/34**（含 5 条新增 F-01 断言）、**自建双时区探针 4/4**（Toronto / Asia-Shanghai / UTC 同一 `2026-09-07T00:00:00Z` → 两视图均 `2026-09-07`、`null` 均「从未」、跨时区文本完全一致）；负向对照 NEG-A（改回本地 getters）/ NEG-B（回加后缀）均 FAIL 后还原。067 的 `driftLabels` 内联副本与 D-02 TODO 亦随之消除。
- **mock 取证局限（F-03，MINOR）**：`verify066` 全部断言用 `page.route` 注入构造快照，非真实后端/DB 端到端；上线前建议用真实 dev 库复核字段值与视口。
- 完整证据、逐条 AC、Findings、负向对照、DoD T-1～T-6 见 [TASK-066-plan.md §12 Review Record](./TASK-066-plan.md#12-review-record)。未改 Task Status、未标 Completed、未合入或填 Merged；关闭与合入登记归 Human。
