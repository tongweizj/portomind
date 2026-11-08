# US-004-04 · Orchestrator 派发记录（2026-11-06，三卡并行）

> **用途**：记录 TASK-065 / TASK-066 / TASK-067 三卡并行的登记依据、worktree、分派对象与后续编排。**位置**：平铺在 [US-004 交付目录](./)，随 Story 整体归档。
> **性质**：本文件是 Orchestrator 的**登记与派发记录**，不是技术方案、不是 Reviewer 结论、不是 Human 批准。

---

## 1. 登记依据

按 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)「Task → Implementing：**当前设计的有效计划批准记录**」。

**计划批准**：2026-11-06，Human 明确确认「我已经批准了」三份 ExecPlan。

> **事实记录**：Orchestrator 核对时，`TASK-065-plan` / `TASK-066-plan` / `TASK-067-plan` 三份文件的状态均为 `Draft` 且**无 Approval 段**；[US-004-02](./US-004-02-3card-parallel-plan.md) §66 与 [US-004-03](./US-004-03-dispatch-checklist.md) 前三条也都标注「须 Human 批准 / 未勾选」。经 Human 当面确认已批准后，由 Orchestrator 据其决定登记，**不是自行批准**，已在各计划的 Approval 段如实写明来源。

## 2. 启动条件核对（逐项）

| # | 条件 | 结果 |
|---|---|---|
| 1 | 三份 ExecPlan 均 `Approved` | ✅ 2026-11-06 Human 确认后登记 |
| 2 | G-1 覆盖缺口：AC-14 `cron-worker` 零改动 | ✅ 已补到 `TASK-065` **AC-06** |
| 2 | G-2 覆盖缺口：AC-05 视口 | ✅ 已补到 `TASK-066` **AC-10** |
| 3 | OQ-01 健康表排序 | ✅ 已裁决「有事的在上」，原型多加的 `unvaluable`/`missing` 两档不采用 |
| 3 | OQ-02 US-004 先行 | ✅ 已裁决，无硬依赖 |
| 3 | D-01 偏离文案（OQ-04） | ✅ 已裁决 **解 B**：逐字一致只约束「待办/上次再平衡」；卡片偏离徽标**维持两态** |
| 3 | D-02 `driftLabels.js` 归属（OQ-05） | ✅ 已裁决：**由 TASK-066（Implementer B）拥有**，TASK-067 消费 |

**结论**：全部满足，可登记。

## 3. 三卡分派表

| Implementer | Task | 包 | 分支 | Worktree | 基线 | 验收命令入口 |
|---|---|---|---|---|---|---|
| **A** | TASK-065 | `shared/` + `server/` | `feature/TASK-065` | `D:/projects/portomind-065` | `main` @ `0189c04` | `npm run test:server` |
| **B** | TASK-066 | `client/` | `feature/TASK-066` | `D:/projects/portomind-066` | `main` @ `0189c04` | `npm run build --workspace client` + eslint |
| **C** | TASK-067 | `client/` | `feature/TASK-067` | `D:/projects/portomind-067` | `main` @ `0189c04` | `npm run build --workspace client` + eslint |

三个 worktree 均从 `0189c04`（含本次批准登记与 G-1/G-2 补丁）切出，创建时工作区干净。

## 4. 三条并行约束（必须传达给三名 Implementer）

### 4.1 065 是 066/067 完整验收的前置门

066/067 **先用「字段缺失降级」开发骨架**，等 065 合入 `main` 后再补真实字段验收。各自计划 §4 已写明降级口径。

- 066 的 AC-02 / AC-03（偏离四态、待办真实值）须在 065 合入后验收
- 067 的四格真实值同理

**开发可并行，验收排队。** 不得在 065 未合入时声称 066/067 的 AC 已满足。

### 4.2 `driftLabels.js` 由 Implementer B（066）拥有

B 先把 `client/src/constants/driftLabels.js` 作为**纯常量文件**建出并**尽早合入 `main`**，C（067）消费。

目的：避免两人各建一份导致漂移，直接违反 US-004 AC-18「文案逐字一致」。

- B：创建该文件，内容只含共享文案常量，不含业务逻辑
- C：**不新建**该文件；若尚未合入，先在自己分支临时引用并在交付说明中标注「待 B 合入后切换」

### 4.3 067 的偏离徽标维持两态（D-01 解 B）

`PortfolioCard` 的偏离徽标**保持两态**（P1-1），**不要**改成健康表的四态文案。偏离数据同源取 `stats.drift`。

## 5. 后续编排（不在本次派发范围）

| Task | 状态 | 条件 |
|---|---|---|
| **TASK-068** | 待派发 | **硬串行**：与 065 同改 `shared/services/portfolio/summary.js`（065 加 `pendingAgg`、068 改 `unreadAgg`），必须等 065 合入 `main` 后启动 |
| **TASK-069** | 待派发 | 收尾：依赖 065 + 068 合入后，更新 `API_CONTRACT.md` 与 Spec 状态行 |

**068 不得与 065 同时派发。**

## 6. 本次登记的动作清单

- [x] 三份计划 `Draft` → `Approved`（含 Approval 段与来源说明）
- [x] 三张任务卡补 `Status: Implementing`（原无 Status 字段，标注「待 Orchestrator 正式登记」）
- [x] Owner 分别填 `Implementer A / B / C`
- [x] 建三个独立 worktree，基线 `0189c04`
- [x] 同步 BOARD：当前格局、US-004 行、进度汇总
- [x] 清理 4 个已合入的旧 worktree（063 / 064 / merge-063 / merge-064）

## 7. 未做的事（边界）

- **未**修改 Story 状态：US-004 仍为 `Planning`。Story → `Implementing` 归 **PM**（[STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)），Orchestrator 不代填。
- **未**写技术方案、未改业务代码。
- **未**替 Reviewer 审查、**未** merge `main`、**未**填 `Merged`（合入与 `Merged` 归 Human）。
- **未**派发 068（硬串行）。
