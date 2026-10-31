# 状态与推进权限

本文唯一维护状态枚举、转换条件、权限与记录来源。角色文件和模板引用本文件，不另定义状态。状态使用 Title Case。

## 1. Status 与 Merged

| 字段 | 回答的问题 | 来源 |
|---|---|---|
| Status | 工作处于哪个阶段 | Story / Task 卡的 Status；ExecPlan 的 Status 节 |
| Merged | 代码是否进入 main | BOARD.md 历史完成 Task 表，由 Human 登记 |

Merged 取值：—（未判定）、Pending（尚未合入）、Merged（已合入，附 SHA / PR）。Human 根据实际合入证据判定，可使用 git merge-base --is-ancestor 验证。Completed 不表示已提交、已合入或已发布。

## 2. Task 状态

Backlog · Planning · Implementing · Reviewing · Blocked · Completed

| 状态 | 含义与条件 |
|---|---|
| Backlog | 已确认立项，问题、范围与 AC 齐备，尚未开始 |
| Planning | 优先级已确认，正在准备方案、依赖与实施依据 |
| Implementing | 实施依据齐备，正在实现、验证或处理返工 |
| Reviewing | 实现交付及可审对象齐备，审查中或等待结案 |
| Blocked | 无法继续；记录缺口、解除负责人、解除条件和原阶段 |
| Completed | 实现、AC 验收及审查收敛，Human 确认关闭 |

### 2.1 判定与完成边界

审查判定词与严重度见 [REVIEWER.md](../roles/REVIEWER.md) §5，不是 Status。Reviewer 提供结论，不关闭 Task。完成标准见 [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md)：BLOCKER 必须解决，MAJOR 须整改或由 Human 明确接受；豁免不得记为验证通过。

### 2.2 Story 状态

Story 复用 Task 六态，不新增枚举。默认只推进一个当前 Story。

| 状态 | Story 含义与条件 |
|---|---|
| Backlog | 已立项，未启动；注明待澄清或可启动 |
| Planning | 已确定优先级，正在完善范围、AC 与任务拆分 |
| Implementing | 必要准备齐备，已启动下挂任务实施 |
| Reviewing | 必要 Task 已完成，材料齐备，进行整体验收 |
| Blocked | 整体交付无法继续；局部 Task 受阻但仍可推进时不自动进入此态 |
| Completed | Story AC 与完成标准满足，Human 确认关闭 |

全部 Task 完成只触发整体验收，不自动关闭 Story。返工回 Implementing，需要重新规划时回 Planning。

### 2.3 取消与恢复

取消由 Human 决定，PM 登记退出记录：日期、事件、原因、Human 决定引用、退出前状态、下挂 Task 处置。保留原 Status，文首标明已取消，移出交付队列，归档至 docs/development/archive/stories/ 并保留链接；不记为 Blocked 或 Completed。

最后一次有效事件为取消时，从六态统计排除。恢复须 Human 明确决定，追加恢复事件，由 PM 登记为 Backlog 或 Planning，恢复队列与链接。保留原退出、验收记录；取消 Story 不自动关闭或取消下挂 Task。

## 3. ExecPlan 状态

Draft · Approved · Implementing · Completed

| 状态 | 条件 |
|---|---|
| Draft | 计划编写或待 Human 评审 |
| Approved | Human 已批准当前设计，可实施 |
| Implementing | 实施、验证或审查中 |
| Completed | 计划工作完成，验证与审查记录齐全 |

计划无单独阻塞或审查状态；阻塞登记在 Task，审查写计划记录。计划进入 Implementing 不使原批准失效。

## 4. 谁可以改变状态

| 对象 / 动作 | 负责人 | 必要依据 |
|---|---|---|
| Task 内容创建 | Planner | 已确认需求；问题、范围、任务 AC、Story AC 关联与依赖 |
| Task → Backlog / Planning | Orchestrator | Human 立项 / 优先级依据；已授权 Story 内常规拆分复用原依据 |
| Task → Implementing | Orchestrator | 当前设计的有效计划批准记录，或 §5 免计划依据 |
| Task → Reviewing | Orchestrator | Implementer 提供改动清单、自测证据、可审对象和已知妥协 |
| Task Reviewing → Implementing / Planning | Orchestrator | Reviewer findings；范围或重大设计变更另按 Human 权限处理 |
| Task → Completed | **只有 Human** | AC、验证、审查及完成标准的证据引用 |
| Task Completed → Implementing / Planning | Human 决定，Orchestrator 登记 | 重开原因、日期、受影响 AC；保留原结案记录 |
| Story → Backlog / Planning | PM | Human 立项 / 优先级依据 |
| Story → Implementing | PM | Planner 准备交接与实际启动记录 |
| Story → Reviewing | PM | 必要 Task 完成及 AC 证据 |
| Story Reviewing → Implementing / Planning | PM | 返工或重新规划依据 |
| Story → Completed | **只有 Human** | Story 整体验收与完成标准 |
| Story 取消、恢复、已完成后重开 | Human 决定，PM 登记 | §2.3 记录；重开进入 Human 指定的 Planning 或 Implementing |
| Task → Blocked 或解除 | Orchestrator | 任一角色可报告缺口、负责人、解除条件和原阶段；解除后回原阶段并引用解决证据 |
| Story → Blocked 或解除 | PM | 任一角色可报告缺口、负责人、解除条件和原阶段；解除后回原阶段并引用解决证据 |
| ExecPlan Draft → Approved | **只有 Human** | 当前设计的明确批准记录 |
| ExecPlan Approved → Implementing | Planner / Implementer | 已开始实施 |
| ExecPlan Implementing → Completed | Planner / Implementer | 实施、验证、审查及收尾记录 |
| ExecPlan Completed → Implementing | Planner / Implementer | Task 已获准重开，返工仍在原批准范围内 |
| ExecPlan → Draft | Planner | 实质设计变更，记录原因并沿用既有批准流程 |
| 合入 main 与 Merged 登记 | **只有 Human** | 实际合入证据 |

状态登记只写字段、依据及看板投影，不自动触发重复审查、测试、归档或 Git 提交。归档是独立的收尾工作。普通返工复用有效批准；重大设计、范围或 AC 变化按原有 Human 权限处理。

## 5. 免 ExecPlan

按 [EXECUTION_PLANS.md](./EXECUTION_PLANS.md) §2 判断。Task 必须引用具体免计划条目，写明实施要点和验证方式。免计划不免除必要验证、审查及 Human 关闭。

## 6. 看板与归档

[BOARD.md](../../BOARD.md) 汇总当前 Story、下挂 Task、Story Backlog、已完成与已退出 Story、未关联任务及历史完成 Task。按编号去重，未知填待确认，不适用填 —。

卡片 Status 为状态权威，目录只组织文件；改变目录不等于改变状态。新 Story 的过程目录在 Human 关闭 Story 后整体归档，单个 Task/计划完成不单独迁出；独立与既有记录沿用原位置。存放与收尾步骤唯一依据 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期)。移动文件保持编号并修复链接；取消项按 §2.3 排除统计。

## 7. 既有记录兼容

### 7.0 适用规则

2026-10-30 前创建且此后未变更 Status 的卡片保留原值；新卡或实际变更 Status 时使用现行枚举。仅修改说明、链接、Updated 日期不触发状态迁移。兼容解释不授予实施或关闭权限。

历史状态映射仅用于读取和统计，不证明现行状态的进入条件已满足，也不构成实施授权。启动或继续执行前，Orchestrator 核对优先级、依赖和有效计划批准或免计划依据；缺失时记录并交负责角色处理。

### 7.1 旧词读取映射

| 旧写法 | 读取为 |
|---|---|
| COMPLETED / Complete / Done / Implemented | Completed |
| BACKLOG | Backlog |
| PLANNING | Planning |
| Draft / Approved（Task 上） | Planning |
| REVIEWED | Reviewing，另查审查判定 |

### 7.2 非法状态

Ready、Exploring、Plan Review、Verifying、Integrating、Human Acceptance 不作为新状态值。Active 是视图词；Review 对应 Reviewing；Released 不等于 Completed；Cancelled 使用退出记录。

## 8. 维护

状态及权限只在本文定义。修改时同步引用方、模板和看板规则；不把任务记录中的个别豁免提升为通用权限，不在规则文件保留裁决过程或修订日志。
