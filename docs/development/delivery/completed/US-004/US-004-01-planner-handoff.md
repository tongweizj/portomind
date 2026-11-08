# US-004-01 · Planner 交接：并行开发方案

> **用途**：为 Orchestrator 排期与 Implementer 派发提供并行方案依据。**位置**：平铺在 [US-004 交付目录](./)，随 Story 整体归档（见 [DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)）。
> **创建**：2026-11-05（Planner）。**状态权威**：各 Task 卡 / ExecPlan 的 Status 字段为准，本文件不登记状态。

---

## 1. 结论（TL;DR）

5 张卡**可部分并行**，不是全并行。核心：**065 → 068 硬串行**；**066 ∥ 067 可并行（先定共享文案常量归属）**；**066/067 开发可并行、验收被 065 门控**；**069 收尾**。

## 2. 依赖矩阵

| Task | 改动文件 | 关键冲突 / 依赖 |
|---|---|---|
| [TASK-065](./TASK-065.md) | `shared/services/portfolio/summary.js` + 测试 | 产出四字段（066/067 消费） |
| [TASK-066](./TASK-066.md) | `Dashboard.jsx` + `TotalAssetsCard.jsx` + 新增 `PortfolioHealthTable.jsx` | 消费 065 字段；与 067 共享「偏离」文案 |
| [TASK-067](./TASK-067.md) | `PortfolioCard/index.jsx` | 消费 065 字段；与 066 文案逐字一致 |
| [TASK-068](./TASK-068.md) | `summary.js`（`unreadAgg`）+ `alert.controller.js` + 新增 `alertVisibility.js` | **与 065 改同一个 `summary.js`** |
| [TASK-069](./TASK-069.md) | `API_CONTRACT.md` + Spec 状态行 | 依赖 065 字段形状落定 |

## 3. 三档结论

### 3.1 硬串行（不能并行）：065 → 068

两者都改 `shared/services/portfolio/summary.js` 的 `computeSummary`——065 加 `pendingAgg`，068 改 `unreadAgg`，是同一函数相邻区域。即使各自 worktree，合并也冲突；且 068 的 `unreadAgg` 改动逻辑上叠在 065 的 `pendingAgg` 上下文上。

**处置**：[TASK-068 计划 §6](./TASK-068-plan.md) 已写「065 先合入，068 叠加」。泳道内串行，禁止 068 抢在 065 合入 `main` 前改 `summary.js`。

### 3.2 可并行但需对齐：066 ∥ 067

纯客户端、改**不同文件**（066 动 Dashboard/总资产卡，067 动 PortfolioCard），无文件冲突。**唯一协作点**：Spec R-10 / US-004 AC-18 要求卡片与健康表「偏离」文案**逐字一致**。若各写一份常量，必然漂移 → 违反 AC-18。

**处置**：提前定一个共享常量文件（建议 `client/src/constants/driftLabels.js`），由**一张卡拥有、另一张卡消费**。本交接文件 §5 把「归属」标为待决（见 §5 D-01）。

### 3.3 验收被门控（可并行开发、不可并行验收）：066/067 依赖 065

066/067 可先用「字段缺失降级态」起骨架（计划 §4 已注明降级口径），但要真正过 AC（四态偏离、四格真实值），必须等 065 的四字段落到 `stats` 上。

**处置**：开发可并行，验收排队——066/067 的 AC-02/AC-03（偏离四态、待办真实值）验收须在 065 合入 `main` 之后。

## 4. 推荐并行方案（两条泳道 + 收尾）

```
泳道 A（shared/server，串行）:  065 ──► 068
泳道 B（client，并行）:         066 ══╗
                                  ║   (共享 driftLabels 常量，先定 owner)
                                 067 ══╝
收尾（docs）:  069（等 065+068 合入）
```

- **泳道 A 与泳道 B 文件零重叠**，可同时开跑。
- **实际最大并发**：`065`、`066`、`067` 三张可同时起（065 走 shared，066/067 走 client 不同文件）；`068` 等 065；`069` 最后。
- **066/067 先导动作**：先决定 `driftLabels.js` 归谁建，避免两人都建同文件冲突（见 §5 D-01）。
- **worktree 惯例**：每张卡各自从 up-to-date `main` 开独立 worktree；对**不重叠文件**可干净合并；065/068 这种**同文件改动**必须锁在同一上游顺序里串行。

## 5. 待决事项（不代拍板）

| 编号 | 待决 | 影响 | 建议 | 决策人 |
|---|---|---|---|---|
| **D-01** | `driftLabels.js` 由 TASK-066 还是 TASK-067 拥有 | 决定 066/067 谁能先起、谁等对方产出 | 由 TASK-066（健康表先行、字段语义更全）拥有，067 消费 | Human / Orchestrator |
| D-02 | 泳道 A、B 是否同时启动（受限于工作区/人力） | 决定最大并发度 | 至少 065 + 066（或 067）可先起 | Orchestrator |

## 6. 给 Orchestrator 的排期建议

1. 批准 5 份 ExecPlan（`Draft → Approved` 归 Human）。
2. 启动顺序：**065 先行**（是 066/067 的字段前置，也是 068 的前置）。
3. 若人力允许，**065 + 066 + 067 三张并发**（066/067 用降级态开发，先定 D-01 归属）。
4. **068 等 065 合入 `main` 后启动**（同文件叠加）。
5. **069 收尾**（065 + 068 合入后）。
6. US-004 作为「预研 Story」可与 US-001（开发中）并存（[DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) + AGENTS.md §7「一个开发中 + 一个预研」）；当 US-004 需进入 Implementing（成为「当前 Story」）时，须先等 US-001 关闭并归档。`docs:check` 现已放宽为「delivery 根目录最多保留两个 Story 目录」，当前 0 ERROR。

## 7. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-11-05 | 新建 | Planner 编制并行方案交接（Human 要求「把并行方案写成单独的 planner」） |
