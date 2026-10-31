# TASK-<编号> — <任务名称>

## Metadata

| 字段 | 内容 |
|---|---|
| Status | <按 [STATES.md](../process/STATES.md) §2 / §4 登记> |
| Priority / Owner / Type | <优先级 / 负责角色 / 类型> |
| Created / Updated | YYYY-MM-DD / YYYY-MM-DD |
| 所属 Story | <US 编号及链接；独立任务填 None 并说明原因> |
| 覆盖的验收条件 | <US-编号/AC-01；间接支撑说明作用；独立任务填 N/A> |
| Related Product Spec / ADR | <相关章节链接或 None> |
| Execution Plan | <计划链接或 Not required，并在 §7 说明免计划依据> |

新Story任务命名 TASK-编号.md，直接放 docs/development/delivery/US-编号/，不建 tasks/ 子目录；对应计划为同目录 TASK-编号-plan.md。独立及既有任务沿用原位置，详见 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期)。复制后按实际目录深度修正链接；Status 在本卡登记，docs/BOARD.md 作投影。进入实施前补齐 Story 关联和覆盖关系，不复制 Story AC 另作权威。

## 1. 问题

<当前缺陷或缺失能力、受影响用户、不处理的后果。>

## 2. 已核实的事实

<事实、核实方式、日期和文件/输出出处；推测明确标注。极简任务可说明不适用。>

## 3. Acceptance Criteria

- [ ] AC-01：<可观察、可验证的任务完成条件>

任务 AC 归本卡，Story AC 归 Story，ExecPlan 只引用。任务完成不自动表示 Story 验收通过。重要 Bug 应有回归验证；无法覆盖时说明原因与残余风险。

## 4. Scope

<包含的模块、文件和行为；明确范围外事项与必要约束。>

## 5. Risks

<具体触发条件、影响和应对；无则写无。>

## 6. Blocking Dependencies

<依赖、满足情况、负责人及解除条件；无则写无。是否进入 Blocked 按 STATES.md。>

## 7. Coordination Notes

<下一角色、交接输入、边界及需协调事项。免计划时引用 EXECUTION_PLANS.md §2 的具体条目，并写实施要点与验证方式。>

## 8. Open Questions

<需要 Human 决定的问题、选项、建议与影响；无则写无。已决定事项保留日期和依据，不伪造批准。>

## 9. 记录（按需）

本卡完成后在 Story 交付目录内保留，随 Story 整体归档；不自行提前移动到全局 completed/。独立和既有任务按DOCS.md处理。

有 ExecPlan 时只留记录链接；免计划时在这里追加 Implementation Record、Review Record、Completion Record。记录实际改动、版本、验证、偏差、残余问题与结案依据；Reviewer 格式见其角色文件 §7。

## 自检

- [ ] Scope 与任务 AC 明确，Story AC 关联可解析。
- [ ] 批准或免计划依据有效，依赖与待决问题已如实记录。
- [ ] 状态、证据、权限和链接一致，记录未重复存放。
