# 完成定义（DEFINITION_OF_DONE）


> **本文唯一负责**：所有用户故事（US）与任务（TASK）都必须满足的**共同完成要求**。
> 区别于各卡片自身的 Acceptance Criteria（AC）——AC 是「这一条具体要做成什么」，DoD 是「无论哪条，结案前都要过一遍的底线」。

---

## 1. 适用范围

- **US 验收前**：必须满足 §2 的全部条目；Human 关闭后更新 Story 卡、索引及 `BOARD.md` 投影。
- **TASK 结案前**：必须满足 §3 的全部条目，再按 `STATES.md` §4 由 Human 推进 `Completed`。

> US 的 Status 为 Completed 表示用户价值实现 + 验收通过；**不含代码已合入 `main`**（合入状态归各 TASK 的 `Merged` 字段，由 Human 判定）。目录仅用于组织归档。

---

## 2. 用户故事（US）共同完成要求

| # | 要求 | 说明 |
|---|---|---|
| D-1 | 全部必要 TASK 的 Status 已为 Completed | `Merged` 按实际登记；`—` 表示未判定，不阻止 Story 验收，也不能推断已合入或未合入 |
| D-2 | 故事 AC 逐条满足 | 对照 Story 的“验收条件”节，逐条可观测 |
| D-3 | 验收结果已记录 | Story 的“整体验收记录”已填：日期、验收人、结论；失败项已处理 |
| D-4 | 团队完成标准满足 | 即本文 §3 的任务级 DoD（US 验收时其下 TASK 应已满足） |
| D-5 | 文档同步 | 关联的 `FS-*.md` / `PRD.md` 如因此故事需回写，已回写；Story 索引及 BOARD.md 投影已同步 |
| D-6 | 无遗留 BLOCKER / MAJOR | 审查结论已收敛（BLOCKER 清零；MAJOR 已整改或 Human 明示接受） |

---

## 3. 任务（TASK）共同完成要求

| # | 要求 | 说明 |
|---|---|---|
| T-1 | 实现完成 | 改动清单与 `STATES.md` §2 `Implementing` 退出物证一致 |
| T-2 | 验证完成 | 按改动风险选择相关测试、构建、lint 或静态检查；运行类检查记录实际结果，静态检查记录对象、方法与结果。适用命令见 `DEPLOYMENT.md §7`；未验证项及风险如实记录 |
| T-3 | AC 逐条满足 | 对照任务卡 §3，逐条可观测 |
| T-4 | 审查结论收敛 | 无未决 BLOCKER；MAJOR 已整改或 Human 明示接受。极小文档变更可由 Human 直接独立复核，条件与记录见 `REVIEWER.md` §5.3 |
| T-5 | 文档同步 | 涉及的 `ARCHITECTURE` / `API_CONTRACT` / `DATA_MODEL` / 手册等已更新；有 ExecPlan 时其记录节已填、任务卡仅引用；免计划时任务卡记录节已填 |
| T-6 | 已知妥协已记录 | 改动清单含「已知妥协」（见 `STATES.md` §2 `Reviewing` 退出物证） |

---

## 4. 不在 DoD 范畴（明确排除）

- **合入 `main`**：是 Human 职权，状态单列 `Merged` 字段（见 `STATES.md` §1）。DoD 满足 ≠ 已合入。
- **审查判定词本身**：`Pass`/`Pass with issues`/`Fail` 是 Reviewer 的判定，不是 DoD 条目（见 `REVIEWER.md` §5）。
- **跨模块一致性全量回归**：由 Human 在合入前决定，不强制作为单任务 DoD。

---

完成后收尾：Story 长期保留交付摘要、验收结论、版本及证据入口；过程目录按 [DOCS.md §1.1](../standards/DOCS.md#11-story-交付目录与文档生命周期) 整体归档。归档动作不替代 Human 关闭，也不自动删除唯一证据。

## 5. 维护规则

- 本文件是 DoD 的**唯一归属**；任何卡片、索引、流程文档只引用，不重述。
- 完成要求的实质变更由 Human 决定，并同步现行规则与引用方。
