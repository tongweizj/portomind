# 独立维护 Task · 目录导航

> 本文件是 `development/tasks/` 的**纯导航入口**，**不维护、不同步任何 Task 状态或计数**。各卡片的 `Status` 字段是唯一权威，见 [STATES.md](../../os/process/STATES.md) §2 / §4；存放与收尾规则见 [DOCS.md §1.1](../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)。
> 任务卡与同编号计划 `TASK-<编号>-<描述>-plan.md` **成对平铺在同一子目录**，不另设计划目录。

## 目录

| 目录 | 用途 | 状态在哪里查 |
|---|---|---|
| [`active/`](./active/) | 正在推进的独立 Task 卡与计划 | 各卡片 `Status` 字段 |
| [`backlog/`](./backlog/) | 待排期、未启动的独立 Task | 各卡片 `Status` 字段 |
| [`completed/`](./completed/) | 已结案的独立 Task 卡与计划 | 各卡片 `Status` / 结案记录 |

## 命名

- 任务卡：`TASK-<编号>-<描述>.md`
- 计划：`TASK-<编号>-<描述>-plan.md`，与任务卡成对、同目录
- 同一编号有多个计划时用描述段区分，不可只用编号（见 [DOCS.md §1.1](../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)）

## 维护

- 完成一张卡：任务卡与其 `-plan.md` 一起 `active/`（或 `backlog/`）→ `completed/`。**不更新本文件，也不更新 [BOARD.md](../../BOARD.md)**。
- 新增 / 恢复一张卡：按命名规则落卡即可，无需登记到本文件。
- 状态查询直接读卡片；本文件只解释目录怎么找、文件怎么命名，不复制任何状态正文。
