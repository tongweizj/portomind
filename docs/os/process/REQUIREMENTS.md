# 需求拆分与编写规则

## 1. 需求模型

产品目标 → User Story → Task。场景用于补充用户背景，Spec 用于共享或复杂产品规则，均按需创建。简单需求可用一条 Story 和一张 Task；独立 Bug、技术债、流程或文档任务可以不关联 Story。

## 2. 编写与拆分

- PM 使用 [STORY_TEMPLATE.md](../templates/STORY_TEMPLATE.md) 编写用户价值、范围、AC、依赖及待决策事项。
- Story 是可独立交付和验收的用户能力；接口、数据库、页面等实施工作通常作为 Task。
- Planner 使用 [TASK_TEMPLATE.md](../templates/TASK_TEMPLATE.md) 建卡，填写所属 Story、覆盖的 Story AC、任务自身 AC、依赖及验证方式；PM 检查需求覆盖。
- Orchestrator 按 [STATES.md](./STATES.md) §4 登记任务初始状态，已授权 Story 范围内的常规拆分不重复审批。实质范围变更仍由 Human 决定。
- ExecPlan 的必要性按 [EXECUTION_PLANS.md](./EXECUTION_PLANS.md) §2 判断，计划挂在 Task 上，不要求每个 Story 或 Task 都创建计划。

## 3. 编号与关联

SCN、US、TASK 各自使用全局递增、不复用的编号。引用同时记录编号和实际文件链接；移动文件保持编号不变并修复链接。Story AC 使用 AC-01 等稳定编号；Task 使用完整 US 编号/AC 编号避免混淆。

## 4. 单一归属与目录

状态及权限唯一归属 [STATES.md](./STATES.md)。Story、Task 的状态分别以卡片 Status 字段为准，ExecPlan 以其 Status 节为准；目录和索引只作组织与投影。

Story AC 归 Story，Task AC 归 Task；Spec 的共享规则通过链接引用。ExecPlan 引用 Task AC，不改变验收口径。

目录与文档生命周期唯一归属 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期)。新 Story 的 Task、ExecPlan 和必要交接文件平铺在 development/delivery/US-<编号>/，按任务编号或交接序号排序；Story 文档本身长期保留在 development/requirements/stories/。独立与既有记录沿用原位置，不复制共享任务。

不因目录移动推断状态变化，不为状态词新增目录。旧模板 US_TEMPLATE.md 仅保留跳转，正式模板只有 STORY_TEMPLATE.md。
