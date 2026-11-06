# TASK-066 — Dashboard 组合健康表 + 总资产卡分币种小计（FS B6～B13）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | Implementing（2026-11-06，计划已 `Approved`；Orchestrator 登记，Implementer B 实施） |
| Priority / Owner / Type | `High` / Implementer B / `Feature`（纯客户端） |
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
