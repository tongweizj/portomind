# Story 交付与任务调度

> 更新日期：2026-11-18。本文件**不维护独立 Task 的状态清单**：独立 Task 的 Status、Priority、下一步只在各自卡片正文维护（卡片 Status 是唯一权威，见 [STATES.md](./os/process/STATES.md) §2 / §4），本文件只留导航入口。
> 本文件只显示两类内容：① 当前开发中的 Story（一行 `US-xxx · n/m`，Story 级进度）；② 独立 Task 的目录导航。其余内容不进看板，见 [DOCS.md §1.1](./os/standards/DOCS.md#11-story-交付目录与文档生命周期)。
> **版本基线**：`v1.0.0`（2026-11-08，`release/v1.0` @ `d87f81d`）；US-004 交付单元 B 已随该版本封板。
> 导航：[各 Story 详情与历史](#当前开发中的-story) · [Story 索引](./development/requirements/stories/STORIES.md) · [独立 Task 目录与导航](./development/tasks/readme.md) · [US-001 readme](./development/delivery/completed/US-001/readme.md) · [US-004 readme](./development/delivery/completed/US-004/readme.md)。

## 当前开发中的 Story

> **当前无开发中的 Story**（US-001、US-004 均已 `Completed` 并归档）。按规则如实留空；下一个 Story 进入实施后，此处仅显示一行 `US-xxx · n/m`（n = 已完成 Task 数，m = 总 Task 数，随 Story 阶段更新，**不是逐 Task 状态同步**），详情写该 Story 过程目录的 `readme.md`。

| Story | 进度 | 详情 |
|---|---|---|
| — | — | — |

## 独立维护 Task

> **本文件不列出、不同步独立 Task 的状态清单**。独立 Task 不关联 Story，其状态只在卡片正文维护；按目录查找即可：
>
> - [`tasks/active/`](./development/tasks/active/) —— 正在推进
> - [`tasks/backlog/`](./development/tasks/backlog/) —— 待排期、未启动
> - [`tasks/completed/`](./development/tasks/completed/) —— 已结案
>
> 目录结构与命名说明见 [tasks/readme.md](./development/tasks/readme.md)。完成一张卡时，卡与同编号计划一起 `active/`（或 `backlog/`）→ `completed/`，**无需更新本文件**。

---

## 看板维护与交接

- 本文件只投影 Story 级进度（n/m）与导航；**独立 Task 状态不在此维护，也不在此推进任何状态**。
- Human 确认优先级 → PM 准备 Story → Orchestrator 分派 Planner → Implementer 实施 → Reviewer 提供结论 → PM 汇总 Story 验收 → Human 关闭。状态与权限见 [STATES.md](./os/process/STATES.md) §4。
- 每个 Story 的详情、下挂 Task 明细与开发进度说明写在该 Story 过程目录的 `readme.md`（开发中 `delivery/US-<编号>/`，关闭后随目录移到 `delivery/completed/US-<编号>/`）。卡片搬迁时修复链接，保留编号与历史证据。
- 汇总按稳定编号去重，未知写「待确认」；独立维护任务不计入当前 Story。各文件只保留自己的投影，不相互复制 Task 状态正文。
