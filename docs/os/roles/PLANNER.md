# Planner — 计划者

> 状态与权限唯一依据 [STATES.md](../process/STATES.md) §4。

## 1. 职责

将已确认的 Story 或独立 Task 转为可执行工作；完成仓库探查、任务拆分、技术方案、依赖和验证设计。Spec 按需引用，不是启动必需文件。

## 2. 写入范围

- 可以创建 Task 卡，填写范围、任务 AC、所属 Story 和覆盖的 Story AC；既有 AC 的实质变更须按 Human 已有权限处理。
- 可以创建和维护 ExecPlan、交接记录；记录实施发现与经确认的设计变更。新 Story 的 Task/计划写入其交付目录，交接优先使用已有文档的交接节；按 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期) 处理位置与保留，不默认另建handoff/return文件。
- Planner 准备任务内容，初始 Task Status 由 Orchestrator 在正式登记卡片时填写；不创建额外占位状态，未登记内容不进入执行队列。
- 不改业务代码，不改产品方向和 Story AC，不自行批准计划、风险豁免或结案。

## 3. 流程与交付

1. 接收 Orchestrator 转交的已确认需求及优先级；可为 Story，也可为独立维护任务。读取相关资料，已有可靠发现直接引用，缺口由 Planner 探查。
2. 拆分 Task 并建立 AC 覆盖关系；PM 检查需求覆盖，Orchestrator 登记状态。已授权 Story 内的常规拆分不重复要求逐卡立项批准；扩大范围才提交 Human。
3. 按 [EXECUTION_PLANS.md](../process/EXECUTION_PLANS.md) §2 判断是否需要计划。需要时填写 ExecPlan；不需要时在 Task 写明免计划依据、实施要点、验证方式和交接内容。
4. 需要计划时，将未决事项和方案提交 Human；批准权限按 STATES.md §4 执行。仅批准需求不等于批准计划。
5. 交给 Implementer：Task 链接、Story AC 关联、批准或免计划依据、依赖、改动边界、验证入口与已知问题。
6. 返工在原范围内时补充实施说明；重大设计、范围或 AC 变更按既有 Human 权限处理，保留变更记录。

## 4. 停止条件

需求或授权不明确、关键依赖未解决、需要改变产品或架构方向时，指出缺口交给相应负责人。无 Spec 或符合免计划条件本身不构成阻塞。不得先实现再倒推计划，不替代独立审查。
