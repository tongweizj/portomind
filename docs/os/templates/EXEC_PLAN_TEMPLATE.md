# TASK-<编号> — <计划名称>

## Status

Status：Draft
Owner：<角色>
Related Task：<任务卡链接>
Related Spec / ADR：<按需链接或 None>
Branch / Base：<分支与基线版本>
Approval：<未批准或 Human 决定引用；须覆盖当前设计>

状态及权限见 [STATES.md](../process/STATES.md)。新Story计划命名 TASK-编号-plan.md，直接放 docs/development/delivery/US-编号/，与对应任务卡平铺存放；位置与收尾见 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期)。独立与既有计划沿用原位置。复制后按实际深度修正相对链接。章节编号固定，不适用项注明原因。

## 1. Intent

<引用 Task 的问题、目标、范围、范围外事项、约束与 AC；不改变需求。>

## 2. Context

<必要背景、依赖、既有决定的链接与适用范围。>

## 3. Repository Findings

<已核实事实、出处、方式、日期；明确未核实项，不把引用写成亲验。>

## 4. Proposed Design

<文件/函数改动、接口与数据形状、兼容性、关键取舍；待决事项放 §6。>

## 5. Work Breakdown

- [ ] W1：<工作、产出与前置依赖>

## 6. Decisions

<本任务需 Human 决定的事项、选项与建议、决定人/日期/依据。未决写明影响；批准后的变更保留记录。>

## 7. Verification

<逐条关联 Task AC 与验证方法、预期结果、覆盖缺口。命令入口见 DEPLOYMENT.md §7；引用有效证据，关键断言包含可失败性验证。>

## 8. Risks

<具体触发条件、影响与应对。>

## 9. Rollback

<按需说明回退、残留数据和不可逆影响；不适用时注明。>

## 10. Implementer Handoff

<下一角色、输入、范围与禁改、授权、依赖、预期产出、停止条件和验证入口。跨角色/会话时填写；有实现后补充实际改动与妥协。>

## 11. Implementation Record

<实际改动、基线与版本、偏差及依据、验证结果、遗留事项。>

## 12. Review Record

<按 [REVIEWER.md](../roles/REVIEWER.md) §7 记录结论、AC 对照、findings、实跑/引用证据、残余风险与独立性。>

## 13. Completion Record

<AC 与验证证据引用、关闭依据、归档与移交。计划完成后仍留在Story过程目录，待Story关闭后整体归档；记录长期沉淀位置及证据入口。Merged 仅引用 Human 登记，不自行判定。>

## 自检

- [ ] Task 与批准依据对应，方案未改变需求。
- [ ] 步骤可执行、依赖明确、AC 有验证方法。
- [ ] 记录可追溯且只存一处，编号与相对链接正确。
