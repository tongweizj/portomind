# US-004-02 · 3 卡并行开发计划

> **用途**：US-004 三卡（TASK-065 / 066 / 067）同时开发的编排，供 Orchestrator 派发与 3 名 Implementer 各自开工。**位置**：平铺在 [US-004 交付目录](./)，随 Story 整体归档。**创建**：2026-11-06（Planner）。**状态权威**：各 Task / ExecPlan 的 Status 字段为准。

---

## 1. 结论

3 张卡同时开发：**TASK-065 + TASK-066 + TASK-067**，3 名 Implementer 各领一张。这是依赖允许的最大并发（见 §2）。`TASK-068` 等 065 合入后接、`TASK-069` 收尾，不在本并行窗口内。

## 2. 并发上限依据

| 卡 | 改动文件 | 前置依赖 | 可并行 |
|---|---|---|---|
| 065 | `shared/services/portfolio/summary.js` + `portfolio.summary.test.js`（+ 按需 `API_CONTRACT.md`） | 无 | ✅ |
| 066 | `client/src/pages/Dashboard.jsx` + `components/Household/TotalAssetsCard.jsx` + 新增 `components/Dashboard/PortfolioHealthTable.jsx` | 字段可降级（065 未合入时用缺失降级） | ✅ |
| 067 | `client/src/components/PortfolioCard/index.jsx` +（按需共享常量） | 字段可降级 | ✅ |
| 068 | `summary.js` + `alert.controller.js` + 新增 `alertVisibility.js` | **065（同改 `summary.js`）** | ❌ 串行 |
| 069 | `API_CONTRACT.md` + Spec 状态行 | 065 + 068 | ❌ 串行 |

**文件零重叠**：065（shared/server）与 066/067（client）互不触碰；066 与 067 改不同 client 文件。唯一协作点是共享文案常量（§4）。

## 3. 分工与分支

| Implementer | Task | 包 | 分支（worktree） | 验收命令入口 |
|---|---|---|---|---|
| A | TASK-065 | shared + server | `feature/TASK-065` | `npm run test:server` |
| B | TASK-066 | client | `feature/TASK-066` | `npm run build --workspace client` + eslint |
| C | TASK-067 | client | `feature/TASK-067` | `npm run build --workspace client` + eslint |

各自从 up-to-date `main` 开独立 worktree（沿 053/056 惯例）。

## 4. 协作点（唯一）：`driftLabels.js` 共享文案常量

066 与 067 的「待办 / 上次再平衡」文案必须逐字一致（Story AC-18，D-01 解 B）。

- **归属（D-02 已裁，2026-11-06 Human）**：由 **Implementer B（066）拥有** `client/src/constants/driftLabels.js`（健康表四态偏离 + 待办 + 上次再平衡文案），C（067）消费。
- **D-01 已裁（解 B）**：逐字一致只约束「待办/上次再平衡」；卡片 `DriftBadge` 偏离徽标维持两态（P1-1），偏离数据同源取 `stats.drift` 即可，**不要求**偏离徽标与健康表偏离列字面相同。
- **分支时序**：B 先把 `driftLabels.js` 作为纯常量文件（无逻辑、无依赖）建出并**尽早合入 `main`**，C 从含它的 `main` 起分支（或 rebase 后引用）；否则 067 需在本卡内临时内联同文案、验收时比对。

## 5. 时间线（3 卡窗口）

```
T0  三个 implementer 同时开工
       A: TASK-065（先写纯函数单测红→绿，再补聚合）
       B: TASK-066（健康表组件 + Dashboard 插槽 + 分币种小计；字段缺失降级；建 driftLabels.js）
       C: TASK-067（四格：总市值/持仓资产/待办/上次再平衡；字段缺失降级）
T1  B 建 driftLabels.js（D-02：066 拥有）→ 合入 main
T2  C 从 main rebase，消费共享常量
T3  A: TASK-065 合入 main  ← 066/067 完整验收的前置门
T4  B/C: 在 065 字段落地后补真实字段验收（四态偏离、四格真实值）
T5  窗口关闭 → 068（等 A 完成，接在 065 上）→ 069 收尾
```

## 6. 需 Human 裁决（已全部裁决）

| 编号 | 待决 | 结果 | 决策人 |
|---|---|---|---|
| **D-01** | AC-18「偏离文案逐字一致」口径 | ✅ **解 B**（2026-11-06 Human）：逐字一致只约束「待办/上次再平衡」；卡片 `DriftBadge` 偏离徽标维持两态（P1-1），偏离数据同源取 `stats.drift` | Human |
| **D-02** | `driftLabels.js` 归属 | ✅ **066（Implementer B）拥有**（2026-11-06 Human），067 消费 | Human |

> D-01 解 B 的完整三解背景见 [US-004-02 原稿 §6](#) 与 TASK-067 §8；现裁决为解 B，已回写到 TASK-067 卡/计划 §6。

## 7. 状态登记与前置

- 3 份 ExecPlan（065/066/067）均 `Draft`，须 Human 批准（`Draft → Approved` 归 Human，[STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)）。
- 批准后 Orchestrator 登记 `Planning → Implementing` 并派发，建 3 个 worktree。
- 065 是 066/067 完整验收的前置门（T3），但 066/067 可先用「字段缺失降级」开发（见各自计划 §4）。

## 8. 风险

| # | 风险 | 应对 |
|---|---|---|
| R-1 | `driftLabels.js` 两卡各建一份 → 漂移 | §4 定归属 + 尽早合入 main |
| R-2 | 066/067 忘记「字段缺失降级」，等 065 才动 → 拖慢并行 | 各自计划 §4 已写降级口径 |
| R-3 | AC-18 口径（D-01）未裁就做 067 偏离对齐 → 返工 | §6 D-01 先裁，067 偏离对齐排后 |
| R-4 | 065 合入前 066/067 用假字段验收 → 假绿 | T4 强制「065 落地后补真实字段验收」 |

## 9. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-11-06 | 新建 | Planner 编制 3 卡并行开发计划（Human 要求「3 卡并行」） |
| 2026-11-06 | 裁决落盘 | D-01 = 解 B（偏离徽标维持两态、待办/上次再平衡逐字一致）；D-02 = `driftLabels.js` 由 066 拥有。已回写 TASK-067 卡/计划、TASK-066 卡/计划 |
