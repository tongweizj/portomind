# 独立维护 Task · 计数与清单

> 本文件是 `development/tasks/` 的**计数与清单入口**，只作投影，不产生状态、不推进流程。各卡的 `Status` 字段才是状态权威，见 [STATES.md](../../os/process/STATES.md) §2 / §4；存放与收尾规则见 [DOCS.md §1.1](../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)。
> `Active` / `Completed` 在这里是**视图词，不是状态值**（STATES.md §7.2）。
> 任务卡与同编号计划 `TASK-<编号>-plan.md` **成对平铺在同一子目录**，不另设计划目录。

## 计数

| 分类 | 数量 | 口径 |
|---|---:|---|
| **active** | **9** | 未结案的任务卡数：`backlog/` 3 张（待排期）+ `active/` 6 张（**本轮迭代 TASK-073～078**） |
| **completed** | **17** | `completed/` 目录下已结案的**任务卡**数 |

> 统计日期：2026-11-17。
> - 计数按**任务卡**（`TASK-<编号>-*.md` 且不含 `-plan.md`）统计，同目录的 `-plan.md` 计划文件不另计数；这是为了避免计划与卡成对存放后重复计数。
> - 取消项按 [STATES.md §2.3](../../os/process/STATES.md#23-取消与恢复) 排除统计。

## active 清单（9）

> 状态按卡片原文投影；`BACKLOG` 等旧写法按 STATES.md §7.1 读取映射。
> **本轮迭代目标：完成 TASK-073～078（6 张，位于 `active/`）**。这 6 张卡已由 Orchestrator 于 2026-11-17 登记 `Planning`，计划均已批准（`Approved`）；按 [STATES.md §4](../../os/process/STATES.md#4-谁可以改变状态) 先登记状态、批准计划，再进入实施。

### backlog（3，待排期）

| Task | 工作 | Status | Priority | 备注 |
|---|---|---|---|---|
| [TASK-045](./backlog/TASK-045-transaction-query-filters.md) | 交易流水查询与筛选 | `BACKLOG` → Backlog | Medium | 不排期；前置未决：跨组合+时间范围查询无索引前缀 |
| [TASK-062](./backlog/TASK-062-agent-role-boundary-and-overhead.md) | Agent 角色权限边界与执行开销整改 | `Draft` → Planning | High | 待 Human 审阅范围及裁决；提案未批准，不作为现行规则 |
| [TASK-070](./backlog/TASK-070-dsh-agent-teams-workflow-proposal.md) | 基于 DSH Agent Teams 插件的工作流适配（提案） | `Planning` | High（建议） | 待 Human 审阅范围与 AC；未启用插件、未改规则 |

### 本轮迭代（6，TASK-073～078，位于 `active/`）

| Task | 工作 | Status | Priority | 备注 |
|---|---|---|---|---|
| [TASK-073](./active/TASK-073-price-pipeline-p0-data-correctness.md) | 价格链路 P0 代码层修复（symbol 派生与消费统一 / 完整性检查语义） | Implementing | High（建议） | 计划 `Draft` 未批准；D-a～D-d 已裁决；依赖 ADR-003（`Accepted`） |
| [TASK-074](./active/TASK-074-price-pipeline-observability-and-robustness.md) | 价格链路观测与健壮性（SUCCEEDED 语义 / 新鲜度 / 熔断 / NOT_FOUND 提示） | Implementing | Medium（建议） | 计划 `Draft` 未批准；D-e 已收敛到 073 D-d、D-f 待裁决 |
| [TASK-075](./active/TASK-075-today-symbol-case-mismatch.md) | 今日行情 29 基金「无数据」：客户端 symbol 未归一化 | Implementing | High（建议） | 计划 `Draft` 未批准；D-h 已裁决（方案 A）；客户端消费端对齐 |
| [TASK-076](./active/TASK-076-asset-information-completeness-check.md) | 资产信息完整性检查（launchDate 抓取 / 前台可编辑 / 手动检查 / 看板卡片与详情） | Implementing | High（建议） | 计划 `Draft` 未批准；跨 shared / cron-worker / server / client |
| [TASK-077](./active/TASK-077-symbol-historical-data-migration.md) | 历史数据 symbol 归一迁移（按 ADR-003 改写存量） | Implementing | High（建议） | 获批计划已在隔离库执行，D-b 已裁决。见 [独立审查](./active/TASK-077-symbol-historical-data-migration-plan.md#12-review-record) 与 [实施记录](./active/TASK-077-symbol-historical-data-migration-plan.md#11-implementation-record)。 |
| [TASK-078](./active/TASK-078-price-collection-timing-bucketing.md) | 价格采集时刻与归桶修正（P0-3 / P2-8） | Implementing | High（建议） | 计划 `Draft` 未批准；D-a 已裁决（CN 组 ET 12:00） |

## completed

> 17 张已结案任务卡位于 [`completed/`](./completed/)，各自与同编号 `TASK-<编号>-plan.md` 计划成对存放（部分早期任务无计划）。其明细与 `Merged` 登记不在本文件重复；本文件只保留计数，避免与卡片、历史记录形成第二份事实。

## 维护

- 完成一张卡：任务卡与其 `-plan.md` 一起 `active/`（或 `backlog/`）→ `completed/`，active −1、completed +1，同步 [BOARD.md](../../BOARD.md) 的独立 Task 段。
- 新增 / 恢复一张卡：更新本文件计数与清单，先改权威卡片，再同步投影。
- 更新本文件复用已有证据，不触发额外技术复验；汇总按稳定编号去重，未知写「待确认」。
