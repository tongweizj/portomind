# Story 交付与任务调度

> 更新日期：2026-11-18。本看板**只显示两类内容**：① 当前开发中的 Story（一行 `US-xxx · n/m`）；② 独立维护 Task。其余内容（Story 详情、下挂 Task 明细、开发进度说明、Backlog 队列、已完成索引、进度汇总、Roadmap）不进看板，见 [DOCS.md §1.1](./os/standards/DOCS.md#11-story-交付目录与文档生命周期)。
> 状态与权限唯一依据 [STATES.md](./os/process/STATES.md) §2.2–§4；卡片字段是真相，本文件仅投影。
> **版本基线**：`v1.0.0`（2026-11-08，`release/v1.0` @ `d87f81d`）；US-004 交付单元 B 已随该版本封板。
> 各 Story 的详情与历史：[US-001 readme](./development/delivery/completed/US-001/readme.md) · [US-004 readme](./development/delivery/completed/US-004/readme.md) · [Story 索引](./development/requirements/stories/STORIES.md)。

## 当前开发中的 Story

> **当前无开发中的 Story**（US-001、US-004 均已 `Completed` 并归档）。按规则如实留空；下一个 Story 进入实施后，此处仅显示一行 `US-xxx · n/m`（n = 已完成 Task 数，m = 总 Task 数），详情写该 Story 过程目录的 `readme.md`。

| Story | 进度 | 详情 |
|---|---|---|
| — | — | — |

## 独立维护 Task

> 独立维护任务不关联 Story，状态以各自卡片为准；完成一张即归档一张到 `tasks/completed/`（不迁入 `delivery/`，该目录只属于 Story 过程资料）。**active / completed 计数与清单见 [tasks/readme.md](./development/tasks/readme.md)**。

| Task | 工作 | Status | Priority | 待处理 / 下一步 |
|---|---|---|---|---|
| [TASK-045](./development/tasks/backlog/TASK-045-transaction-query-filters.md) | 交易流水查询与筛选 | Backlog | Medium | 待排期。前置未决：跨组合+时间范围查询无索引前缀（`transaction.js` 复合索引均以 `portfolioId` 开头），需先定索引方案 |
| [TASK-062](./development/tasks/backlog/TASK-062-agent-role-boundary-and-overhead.md) | Agent 角色权限边界与执行开销整改 | Backlog | High | 待审阅范围及裁决；提案未批准，不作为现行规则 |
| [TASK-070](./development/tasks/backlog/TASK-070-dsh-agent-teams-workflow-proposal.md) | 基于 DSH Agent Teams 插件的工作流适配（提案） | Backlog | High（建议，待 Human 定） | 待 Human 审阅范围与 AC；仅机制核对 + 工作流草案，未启用插件、未改规则，不作为现行规则；与 TASK-062 另起新卡不合并 |
| [TASK-073](./development/tasks/active/TASK-073-price-pipeline-p0-data-correctness.md) | 价格链路 P0 代码层修复（symbol 派生与消费统一 / 完整性检查语义） | Implementing | High（建议） | [范围内复审 Pass with issues](./development/tasks/active/TASK-073-price-pipeline-p0-data-correctness-plan.md#12-review-record)，任务索引说明待同步 |
| [TASK-074](./development/tasks/active/TASK-074-price-pipeline-observability-and-robustness.md) | 价格链路观测与健壮性（SUCCEEDED 语义 / 新鲜度 / 熔断 / NOT_FOUND 提示） | Implementing | Medium（建议） | 计划 `Draft` 未批准；D-e 已收敛到 073 D-d、D-f 待裁决 |
| [TASK-075](./development/tasks/active/TASK-075-today-symbol-case-mismatch.md) | 今日行情 29 基金「无数据」：客户端 symbol 未归一化 | Implementing | High（建议） | 计划 `Draft` 未批准；D-h 已裁决（方案 A） |
| [TASK-076](./development/tasks/active/TASK-076-asset-information-completeness-check.md) | 资产信息完整性检查（launchDate 抓取 / 前台可编辑 / 手动检查 / 看板卡片与详情） | Implementing | High（建议） | 计划 `Draft` 未批准；跨 shared / cron-worker / server / client |
| [TASK-078](./development/tasks/active/TASK-078-price-collection-timing-bucketing.md) | 价格采集时刻与归桶修正（P0-3 / P2-8） | Implementing | High（建议） | 计划 `Draft` 未批准；D-a 已裁决（CN 组 ET 12:00） |

---

## 看板维护与交接

- PM 维护当前开发中 Story 的 n/m 进度；Orchestrator 按权限登记 Task 状态。先改权威卡片，再同步看板，不单独在看板推进状态。
- Human 确认优先级 → PM 准备 Story → Orchestrator 分派 Planner → Implementer 实施 → Reviewer 提供结论 → PM 汇总 Story 验收 → Human 关闭。
- Task 明确所属 Story 和覆盖的 AC；状态按卡片投影。必要 Task 完成后进入整体验收，不能自动关闭 Story。
- 每个 Story 的详情、下挂 Task 明细与开发进度说明写在该 Story 过程目录的 `readme.md`（开发中 `delivery/US-<编号>/`，关闭后随目录移到 `delivery/completed/US-<编号>/`）。卡片搬迁时修复链接，保留编号与历史证据。
- 汇总按稳定编号去重，未知写「待确认」；独立维护任务不计入当前 Story。更新看板复用已有证据，不触发额外技术复验。
