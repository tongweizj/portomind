# 流程与 Agent 执行边界

> 本文负责交接顺序。状态词、转换条件和修改权限唯一归属 [STATES.md](./STATES.md)；角色写入范围见各角色文件。

## 1. 正常交付

1. Human 确定需求与优先级；PM 使用 [Story 模板](../templates/STORY_TEMPLATE.md) 明确用户价值、范围和 AC。场景与 Spec 按需引用。
2. Orchestrator 将 Story 交给 Planner；Planner 创建 Task 内容、覆盖关系及依赖，PM 检查需求覆盖，Orchestrator 登记 Task 状态。
3. Planner 按 [EXECUTION_PLANS.md](./EXECUTION_PLANS.md) §2 判断计划必要性；需要计划的沿用 Human 批准环节，免计划的在任务卡写明依据及验证方法。
4. Orchestrator 检查启动条件后交 Implementer；Implementer 实现、验证并交付证据。
5. Orchestrator 登记 Task 审查阶段并交 Reviewer；极小文档变更可由未参与实现的 Human 按 REVIEWER.md §5.3 直接复核。审查结论与 findings 不自动修改流程状态。
6. Human 根据证据关闭 Task；PM 在必要 Task 完成后汇总 Story 整体验收，Human 关闭 Story。
7. PM 更新 Story 交付摘要、验收依据与需求队列；Orchestrator 按 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期) 整体归档本 Story 的过程目录并同步看板及链接。Completed 不表示已合入或发布。

默认一次推进一个 Story，独立 Task 可不关联 Story；并行任务按依赖及文件写入冲突协调。没有 Spec 不阻止需求交付，免计划也不免除必要验证和审查。

## 2. 返工与阻塞

- 普通审查问题由 Orchestrator 直接交回 Implementer，按 STATES.md §4 登记返工，无须新增批准环节。
- 需要重新设计的交 Planner；扩大范围、改变 AC 或重大设计仍由 Human 决定。
- Story 验收失败时 PM 登记返工；需要重新打开已关闭 Task 时按 STATES.md §4 处理，不能仅搬文件。
- 任一角色报告阻塞及解除依据；Orchestrator 登记 Task 状态，PM 登记 Story 状态。记录缺什么、谁能解、解除条件和恢复阶段；局部阻塞不自动阻塞整个 Story。

## 3. 取消与恢复

沿用 STATES.md §2.3 的退出记录，由 Human 决定、PM 登记；取消项从六态统计排除，下挂 Task 分别确认处置。恢复与重新打开保留历史，按已有权限进行，不增加 Cancelled 状态。

## 4. 记录与验证

新 Story 的过程资料按 DOCS.md §1.1 集中存放。交接默认写已有文档，只有复杂或跨会话确有需要才创建独立文件，不强制每 Story 生成两份交接文档。

Story、Task 的 Status 字段分别为状态唯一来源，目录用于组织归档；看板按编号汇总。任务证据有 ExecPlan 时放计划记录节，否则放任务卡。相同基线、命令、环境且内容未变化的有效证据可以引用，不为状态登记重复运行测试。

PM 整理验收证据，Human 保留关闭、合入和风险接受决定；权限详见 STATES.md §4。宿主工具权限需实际配置，本文件不宣称已提供运行时隔离。
