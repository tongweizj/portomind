# 执行计划

## 1. 目的

ExecPlan 保存复杂 Task 的技术方案与实施证据，使工作可以跨会话交接。需求与 Task AC 仍归任务卡。

## 2. 何时需要计划

跨模块、显著重构、架构变更、数据库迁移、安全敏感改动、外部集成、新依赖、复杂依赖，或重大技术不确定性需要计划。并行工作存在文件冲突或复杂依赖、跨会话需要持久实施说明以安全交接时，也需要计划。

仅因 PM、Planner、Implementer、Reviewer 由不同角色或 Agent 承担，或仅有常规跨会话交接，不自动要求计划；按实施风险、依赖复杂度和交接所需信息判断。

拼写修正、小型文档或 UI 调整、根因与修法明确的简单 Bug、低风险单文件改动通常免计划。免计划任务在卡片记录具体依据、实施范围、验证方法及交接；不新增固定文件数门槛。

无法安全交接的工作应编写计划。免计划不免除验证、独立审查和关闭要求。

## 3. 位置

新 Story 的计划命名 TASK-<编号>-plan.md，与 TASK-<编号>.md 任务卡平铺在 docs/development/delivery/US-<编号>/；Human 关闭 Story 后随整个目录移到 delivery/completed/US-<编号>/，不因单张计划完成提前移走。独立维护及既有计划沿用原命名和目录；位置与生命周期唯一规则见 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期)。

## 4. 文档关系

Task 卡维护需求、Scope、AC、Status、Owner、Priority 与依赖；BOARD.md 只作调度投影。计划维护技术方案、发现、步骤、验证及记录。需共享的产品规则引用 Spec；无 Spec 不阻止计划或任务。

## 5. 需求与批准

从 Human 已确认的 Story 或独立任务出发。需求批准不等于实施方案批准；计划批准应明确覆盖当前设计。范围、AC、产品行为或重大架构方向变更须提交 Human，保留变更依据。普通实施细节和范围内返工不重复审批。

## 6. 生命周期

状态与转换权限见 [STATES.md](./STATES.md) §3 / §4。起草时填模板 §1–§9 中适用内容，必要交接写 §10；批准后实施。验证与审查属于计划实施过程，不另设状态。完成时记录 §11–§13，Completed 不表示已合入。

## 7. 角色协作

PM 提供 Story；Orchestrator 协调启动及任务状态；Planner 编写技术计划；Implementer 实施并验证；Reviewer 提供独立审查；Human 批准方案、接受允许的风险并决定关闭及合入。角色写入范围见 [roles](../roles)，状态权限只见 STATES.md §4。

实现者不能为自己的改动出具独立审查结论。极小文档变更可由 Human 直接独立复核，条件及记录见 [REVIEWER.md](../roles/REVIEWER.md) §5.3。交接和状态登记复用有效证据，不自行重复验证。

## 8. 模板与记录

使用 [EXEC_PLAN_TEMPLATE.md](../templates/EXEC_PLAN_TEMPLATE.md)，新计划保留章节编号，不适用项标明原因：

| 章节 | 内容 |
|---|---|
| §1 Intent | 引用需求目标、范围、约束和 Task AC |
| §2 Context / §3 Findings | 必要背景、核实事实与未知项 |
| §4 Design / §5 Breakdown | 技术设计、步骤、依赖和产出 |
| §6 Decisions | 本任务需 Human 决定的事项及批准依据 |
| §7 Verification | AC 与验证方法对应；命令入口见 DEPLOYMENT.md §7 |
| §8 Risks / §9 Rollback | 具体风险，按需填写回退与不可逆影响 |
| §10 Handoff | 下一角色所需输入、边界、依赖、证据 |
| §11 Implementation Record | 实际改动、偏差、验证、遗留 |
| §12 Review Record | 审查结论、findings 与证据 |
| §13 Completion Record | 结案依据、归档、移交 |

记录追加，不静默改写已批准设计掩盖偏差。有计划时 Task 只引用记录；免计划时记录直接放 Task。交接默认写已有文档的交接节，独立交接文件按需创建，不强制额外文件。审查内容格式见 [REVIEWER.md](../roles/REVIEWER.md) §7。

## 9. 规则维护

本文只定义执行计划工作方式。状态见 STATES.md，完成标准见 [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md)，验证命令见 [DEPLOYMENT.md](../../handbook/ops/DEPLOYMENT.md) §7。
