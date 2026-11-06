# US-004 · 提示词存档（Prompts）

> **用途**：集中保存 US-004 交付全程使用 / 产出的 Agent 提示词，供回溯、复用与研究。
> **位置**：本文件平铺在 US-004 交付目录内，随 Story 整体归档（见 [DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)）。
> **维护**：新增提示词 = 追加一节（P-编号）+ 更新顶部索引 + 在文末「变更记录」登记一行。不要删改已发布条目，只追加版本说明。

## 索引

| 编号 | 标题 | 目标角色 | 触发时机 / 用途 | 状态 |
|---|---|---|---|---|
| P-01 | Planner 拆分 US-004 | Planner | 把 US-004 拆成可独立实施 / 验收的 Task 卡 | 已使用 |
| P-02 | 登记 US-004 为预研 Story | PM | 把 US-004 从 Backlog 推进到 Planning，同步看板，整理 OQ | 待使用 |
| P-03 | 实施 Task 并提交 git | Implementer | 实施指定 Task、验证并提交 git（含提交规范） | 待使用 |
| P-04 | 派发 US-004 三卡并行开发 | Orchestrator | 登记 TASK-065/066/067 为 Implementing，建 worktree，分派 3 名 Implementer | 已使用（2026-11-06） |
| P-05 | 实施 TASK-065（shared + server 四字段） | Implementer A | 在 `portomind-065` worktree 实施 summary 四字段、验证、提交 | 待使用 |
| P-06 | 实施 TASK-066（Dashboard 健康表 + 分币种小计） | Implementer B | 在 `portomind-066` worktree 实施健康表；含 `driftLabels.js` 先合入职责 | 待使用 |
| P-07 | 实施 TASK-067（PortfolioCard 四格） | Implementer C | 在 `portomind-067` worktree 实施四格；消费 B 的 `driftLabels.js` | 待使用 |

> 状态取值：`草稿` / `待使用` / `已使用` / `已废弃`。

## 条目格式约定

每节固定四块，便于快速定位与直接复制：

1. **元信息** —— 目标角色、用途、前置条件、创建 / 更新时间。
2. **提示词正文** —— 用代码块包裹，可整体复制后直接发给对应角色。
3. **备注** —— 使用注意、已知局限、需要 Human 裁决的前置项（可选）。

---

## P-01 · Planner 拆分 US-004

### 元信息

| 项 | 内容 |
|---|---|
| 目标角色 | Planner |
| 用途 | 把 US-004 拆成可独立实施 / 验收的 Task 卡，并回写 Story §6 |
| 前置条件 | Story 已由 PM 登记 `Planning`；OQ-01 / OQ-02 建议先向 Human 确认 |
| 创建 / 更新 | 2026-11-05 |
| 状态 | 已使用（2026-11-05 Planner 按此拆出 TASK-065～TASK-069 并回写 Story §6） |

### 提示词正文

```text
# Planner 提示词：拆分 US-004 为 Task

## 你的角色与目标

你是本项目的 Planner。你的唯一任务：把 US-004（Dashboard 组合健康表）拆分为可独立实施与验收的 Task 卡，并同步回 Story 卡 §6 的「关联 Task 与验收覆盖」表。不要开始写 ExecPlan 正文、不要写代码、不要改 Story 的范围与 AC、不要登记任何状态（状态登记归 Orchestrator / PM，见 STATES.md §4）。

## 开工前必读（按顺序）

1. US-004 Story 卡：docs/development/requirements/stories/active/US-004-dashboard-portfolio-health.md —— 范围、AC-01～AC-20、DEP/OQ
2. docs/os/process/REQUIREMENTS.md —— 拆分规则、编号规则、Task 与 Story AC 的关系
3. docs/os/templates/TASK_TEMPLATE.md —— Task 卡格式（每张卡必须照此写）
4. docs/os/process/EXECUTION_PLANS.md §2 —— 判断哪些 Task 需要 ExecPlan
5. docs/development/requirements/specs/FS-portfolio-ia-cleanup.md —— §6.2（B1～B16）、§7（交付单元 B 的 AC20～AC36 / AC41～AC42）、§10、§11（HD 系列、R-7、B8a 作废），是 Story 的产品规则源头
6. docs/os/process/STATES.md §2 / §4 —— Task 状态枚举与「谁可以改变状态」（你只建卡内容，不填 Status 推进）

## 拆分必须遵守的硬规则

1. 编号：Task 编号全局递增、不复用。按 docs/BOARD.md 当前最大号顺延确定；当前最大已登记号是 TASK-064，US-004 的 Task 预计从 TASK-065 起连续编号。立项才占号——把新卡写进 docs/development/delivery/US-004/ 才算数。
2. 目录：Task 卡直接放 docs/development/delivery/US-004/，命名 TASK-<编号>.md，平铺、不建子目录；对应计划将来命名 TASK-<编号>-plan.md（本轮只建卡，不建计划）。
3. Story AC 归 Story，Task AC 归 Task：每张 Task 卡在「覆盖的验收条件」里写 US-004/AC-xx，并另写任务自身的 AC（可观察、可验证，不要照抄 Story AC、不要写「功能正常」这类空话）。一个 Task 可覆盖多个 Story AC，一个 Story AC 可被多个 Task 支撑。
4. ExecPlan 判断：US-004 改 shared/services/portfolio/summary.js + 服务端契约 + alertEvent 查询层，属多模块 + 契约变更——涉及服务端 / 共享内核的 Task 必须标记「需 Approved ExecPlan」（对应 DEP-04）。纯客户端、零服务端改动的 Task 按 EXECUTION_PLANS §2 写明免计划依据，不要无脑全挂计划。
5. 依赖如实写：把 Story §5 的 DEP-01～DEP-04 与 OQ-01～OQ-03 落到对应 Task 的依赖 / 待决项里，不要自行「解决」OQ。

## US-004 的既定拆分骨架（Story §6 已给方向，以此为基础细化，不要推翻）

Story 卡 §6 已列出 5 个工作单元，请据此拆卡，并为每张卡补全：问题、已核实事实、任务 AC、Scope、风险、依赖、待决问题：

| 工作单元 | 对应 Spec | 覆盖 Story AC | 说明 |
|---|---|---|---|
| summary 四字段（lastExecutedAt / pendingRebalanceCount / drift.dueByTime / drift.overThresholdCount） | B1、B2、B3、B4 | AC-01～AC-04 | 服务端 + shared，必挂 ExecPlan；注意 N+1 禁令与「两个 N 不可混用」 |
| Dashboard 健康表 + 分币种小计 | B6～B13 | AC-05～AC-13 | 客户端为主；排序依赖 OQ-01 |
| PortfolioCard 四格 | B15 | AC-17、AC-18 | 零请求零服务端改动，与健康表同源 |
| 删组合后事件查询层过滤（隐藏非删除） | B16 | AC-19 | 服务端查询层，三处口径一致，必挂 ExecPlan |
| 契约文档同步 | B5 | AC-16 | 更新 API_CONTRACT.md summary 示例 + Spec 状态行 / §11 记录 |

特别注意：AC-20（独立 Reviewer 复核）是整体交付要求，不是某一张 Task 的 AC，不要拆成单独卡。

## 每张 Task 卡必须包含（对照 TASK_TEMPLATE.md）

- Metadata：Status 留空写「待 Orchestrator 登记」、Priority/Owner/Type、所属 Story（US-004 及链接）、覆盖的验收条件（US-004/AC-xx）、Related Spec 章节、Execution Plan（「需 Approved ExecPlan」或「免计划 + §7 写依据」）
- §1 问题 / §2 已核实的事实（基于 Story 卡与 Spec 写，推测要明确标注）/ §3 任务 AC（可勾选 - [ ]）/ §4 Scope（含范围外）/ §5 Risks / §6 Blocking Dependencies / §7 Coordination Notes / §8 Open Questions（OQ 直接列这里，标「待 Human 决定」，不编造答案）

## 完成后交付物

1. docs/development/delivery/US-004/ 下若干张 TASK-<编号>.md（编号连续、内容完整、链接相对路径正确）
2. 更新 Story 卡 US-004-...md 的 §6 表，把「待确认」行替换为实际 Task 编号与链接
3. 一条简短回交说明：列出每张卡的编号、覆盖的 AC、是否需要 ExecPlan、以及仍需 Human 决策的 OQ 清单（尤其 OQ-01 排序档位、OQ-02 与 US-003 顺序）——这些不要在拆卡时替他拍板

## 禁止事项

- 不修改 Story 的 AC、范围、优先级、DEP/OQ 结论
- 不预写已过期的任务编号（一律按 BOARD 当前最大号顺延）
- 不把 OQ 当成已决定、不伪造 Human 批准
- 不越权登记 Task 状态（那是 Orchestrator 的权限）
- 不在客户端 Task 里塞服务端改动，反之亦然（保持边界清晰，便于并行）
```

### 备注

- 本提示词不代 Human 裁决 OQ-01（健康表排序档位）、OQ-02（与 US-003 的实施顺序），这两项会阻塞部分 Task 的依赖。
- 正式使用前，先让 PM 按 STATES.md §4 把 Story 从 `Backlog` 推进到 `Planning`（`Story → Backlog / Planning` 是 PM 权限）。

---

## P-02 · 登记 US-004 为预研 Story

### 元信息

| 项 | 内容 |
|---|---|
| 目标角色 | PM |
| 用途 | 把 US-004 登记为「预研 Story」（Backlog → Planning），核对 Task 覆盖，同步看板，整理 OQ |
| 前置条件 | 新治理规则已生效（DOCS.md §1.1：允许一个开发中 Story + 一个预研 Story）；US-004 已由 Planner 拆出 TASK-065～TASK-069 |
| 创建 / 更新 | 2026-11-05 |
| 状态 | 待使用 |

### 提示词正文

```text
# PM 提示词：登记 US-004 为预研 Story 并同步看板

## 你的角色与目标

你是本项目的 PM。你的任务：按新治理规则，把 US-004 登记为「预研 Story」（Status 从 Backlog 推进到 Planning），核对 Planner 已拆 Task 的覆盖，同步 BOARD.md，并把待 Human 裁决的 OQ 整理成可决策的选项。不要改 Story 的 AC / 范围，不替 Human 拍板 OQ，不登记 Task 状态（那是 Orchestrator 的权限）。

## 开工前必读

1. docs/os/standards/DOCS.md §1.1 —— 新规则：delivery 根目录最多保留两个 Story 目录（一个当前 Story 开发中 + 一个预研 Story 做前期准备）
2. docs/os/process/STATES.md §2.2 / §4 —— 预研 Story 的 Status 为 Planning；Story → Backlog / Planning 是 PM 权限
3. docs/os/roles/PRODUCT_MANAGER.md —— 你的职责与写入范围
4. US-004 Story 卡：docs/development/requirements/stories/active/US-004-dashboard-portfolio-health.md
5. docs/BOARD.md —— Story Backlog 表（需同步）
6. Planner 已拆的卡：docs/development/delivery/US-004/ 下 TASK-065～TASK-069

## 背景（现状）

US-004 原 Status 为 Backlog（排队中），但 Planner 已提前拆出 TASK-065～TASK-069 并回写 Story §6。按新规则，US-004 可作为「预研 Story」存在——前提是 PM 先把它登记为 Planning。当前 US-001 是「当前 Story」（开发中），US-004 是那个「预研 Story」。

## 你要做的事

1. 登记状态：把 US-004 Story 卡的 Status 从 Backlog 改为 Planning（Story 卡 §1 基本信息），并写一句依据（新规则：预研 Story 由 PM 登记 Planning）。
2. 核对覆盖：检查 TASK-065～TASK-069 是否覆盖 Story AC-01～AC-20 全部。尤其注意：AC-20（独立 Reviewer 复核）是整体交付要求、不单拆卡；AC-14（`cron-worker` 零改动）是否有人承接——若遗漏，记录为缺口交回，不自行补卡。
3. 同步看板：在 BOARD.md 的 Story Backlog 表里，把 US-004 的「准备情况」从排队措辞改为「预研中（已拆 5 卡，待登记实施）」，并保持 US-001 仍是唯一「当前 Story」。核对顶部说明行是否与新规则一致。
4. 整理 OQ 提请 Human：把 OQ-01（健康表排序档位）、OQ-02（与 US-003 实施顺序）整理成带选项、带影响、带建议的决策请求，交 Human 裁决；不要替他决定。

## 边界（禁止）

- 不改 Story 的 AC、范围、优先级、DEP/OQ 结论
- 不登记 Task 状态（那是 Orchestrator 的权限）
- 不替 Human 裁决 OQ-01 / OQ-02
- 不把「预研」写成「实施中」——预研 Story 不进入 Implementing
```

### 备注

- 这是「补登记」：卡已拆，但 Story 状态仍是 Backlog。PM 先把状态补到 Planning，看板与规则才算自洽。
- OQ-01（排序档位）会阻塞 TASK-066（健康表排序），OQ-02（顺序）影响与 US-003 的交接节奏，需 Human 先裁决。

---

## P-03 · 实施 Task 并提交 git

### 元信息

| 项 | 内容 |
|---|---|
| 目标角色 | Implementer |
| 用途 | 在指定 Task 就绪后实现、验证、交付，并按规范提交 git（通用模板，使用时替换 Task 编号） |
| 前置条件 | 目标 Task 依赖已解除；有 ExecPlan 的须 `Approved`，免计划的须在卡内写明依据 |
| 创建 / 更新 | 2026-11-05 |
| 状态 | 待使用 |

### 提示词正文

```text
# Implementer 提示词：实施 Task 并提交 git（US-004）

## 你的角色与目标

你是本项目的 Implementer。你的任务：在指定 Task 就绪（依赖解除、批准或免计划依据有效）后，实现、验证并交付，并把改动提交到 git。提交 git 是本提示词的重点——必须遵守分支与提交规范，且不越权合入 main。

## 开工前必读

1. docs/os/roles/IMPLEMENTER.md —— 你的职责、写入范围、停止条件
2. docs/os/standards/GIT.md —— 分支命名、提交信息、review 前要求（重点 §3 / §4 / §6 / §7 / §8）
3. docs/os/process/STATES.md §4 —— 状态权限（Task 状态由 Orchestrator 登记；合入 main 与 Merged 登记归 Human）
4. 目标 Task 卡：docs/development/delivery/US-004/TASK-<编号>.md
5. 若有 ExecPlan：TASK-<编号>-plan.md（Approved 后方可实施）

## git 提交规范（重点，逐条遵守）

1. 分支：从最新 main 切出 feature/TASK-<编号>[-<短描述>]；一个 Task 一个分支；不要直接改 main。
2. 提交信息：`<type>(<scope>): <summary>`，正文引用 TASK-<编号>。type 用 feat / fix / refactor / test / docs / chore 等；聚焦单 Task，不混无关重构 / 格式化 / 依赖升级。
3. 提交前：跑相关测试与 lint / build（沿用 DEPLOYMENT.md §7 的命令入口），移除无关生成改动，如实披露已知失败。
4. 边界：你只 commit 到 feature 分支（可 push 到 remote）。**不 merge 到 main、不改 main、不填 Merged**——合入 main 与 Merged 登记是 Human 的权限。不自审、不宣布结案。

## 实施流程

1. 核对：Task / Story 关联、依赖、有效批准或免计划依据。计划首次实施须 Approved。
2. 实施：按计划或免计划要点改动，记录进度；重大偏差交 Planner / Human，不自行扩 Scope。
3. 验证：执行与改动相关的验证，引用未变化基线的有效证据；不把构建成功当整体验收。
4. 交付：给出改动清单、可审版本 / 工作区快照、AC 证据、已知妥协与未验证项，交 Orchestrator 登记 Reviewing。

## 边界（禁止）

- 不改 Human Intent、Story / Task AC、不扩 Scope
- 不自行登记 Task Reviewing / Completed（归 Orchestrator / Human）
- 不 merge main、不填 Merged、不自审、不隐瞒验证失败
```

### 备注

- 这是通用模板：使用时把 `<编号>` 替换为目标 Task（TASK-065～TASK-069 之一）。
- git 提交边界严格对齐 STATES.md §4：合入 main 与 `Merged` 登记只有 Human 能做，Implementer 只负责在 feature 分支提交（可 push）。

---

## P-04 · 派发 US-004 三卡并行开发

### 元信息

| 项 | 内容 |
|---|---|
| 目标角色 | Orchestrator |
| 用途 | 登记 TASK-065/066/067 为 `Implementing`，建 3 个 worktree，分派 3 名 Implementer 并行开发 |
| 前置条件 | 3 份 ExecPlan 已 `Approved`（Human 批准）；AC 覆盖缺口已闭合（G-1/G-2 由 Planner 补齐）；OQ-01/OQ-02/D-01/D-02 均已裁决 |
| 创建 / 更新 | 2026-11-06 |
| 状态 | 待使用 |

### 提示词正文

```text
# Orchestrator 提示词：派发 US-004 三卡并行开发

## 你的角色与目标

你是本项目的 Orchestrator。你的任务：把 US-004 的三张任务卡（TASK-065 / TASK-066 / TASK-067）登记为 `Implementing` 并分派给三名 Implementer 并行开发。你只做状态登记、启动条件核对、worktree 准备与分派——不写技术方案、不改业务代码、不替 Reviewer 审查、不代 Human 合入。

## 开工前必读（按顺序）

1. docs/os/roles/ORCHESTRATOR.md —— 你的职责与权限
2. docs/os/process/STATES.md §2 / §4 —— Task 状态枚举与「谁可以改变状态」（Task → Implementing 归你，但须有有效计划批准）
3. docs/os/process/EXECUTION_PLANS.md §2 / §5 —— 计划批准要求
4. docs/development/delivery/US-004/US-004-02-3card-parallel-plan.md —— 3 卡并行的编排方案（分工、分支、协作点、时间线）
5. 三张 Task 卡与计划：TASK-065 / TASK-066 / TASK-067 的 .md 与 -plan.md
6. US-004 Story 卡 §5 / §6 —— 已裁决 OQ 与 AC 覆盖关系

## 启动条件核对（逐项确认后登记）

1. 三份 ExecPlan（TASK-065-plan / TASK-066-plan / TASK-067-plan）是否均已 `Approved`（由 Human 批准）。**未批准的卡不得登记 Implementing**。
2. AC 覆盖缺口是否已闭合：G-1（AC-14 cron-worker 零改动）已由 Planner 补到 TASK-065 AC-06、TASK-068 AC-07；G-2（AC-05 视口）已补到 TASK-066 AC-10。核对 Story §6 确认。
3. 待决项是否已清：OQ-01（排序=有事的在上）、OQ-02（US-004 先行）、D-01（偏离文案解 B）、D-02（driftLabels.js 由 066 拥有）均已裁决。任一未裁决，停下上报 Human，不得先斩后奏。

## 分派方案（3 卡并行）

| Implementer | Task | 包 | 分支（worktree） | 验收命令入口 |
|---|---|---|---|---|
| A | TASK-065 | shared + server | feature/TASK-065 | npm run test:server |
| B | TASK-066 | client | feature/TASK-066 | npm run build --workspace client + eslint |
| C | TASK-067 | client | feature/TASK-067 | npm run build --workspace client + eslint |

## 你要做的事

1. 登记状态：按 STATES.md §4，把 TASK-065 / TASK-066 / TASK-067 三张卡的 Status 登记为 `Implementing`（依据：各计划已 Approved），Owner 分别填 Implementer A/B/C。先改权威卡片，再同步 BOARD.md 投影。
2. 建 worktree：从最新 main 分别建 feature/TASK-065、feature/TASK-066、feature/TASK-067 三个独立 worktree（沿 053/056 惯例），每个 worktree 只含对应 Task 的改动。
3. 分派：给三名 Implementer 各自的 Task 卡 + ExecPlan 链接、AC 覆盖关系、依赖、改动边界、验证入口。强调三条并行约束：
   - **065 是 066/067 完整验收的前置门**：066/067 先用「字段缺失降级」开发骨架，等 065 合入 main 后补真实字段验收（见各自计划 §4）。
   - **driftLabels.js 由 Implementer B（066）拥有**（D-02）：B 先把 `client/src/constants/driftLabels.js` 作为纯常量文件建出并尽早合入 main，C（067）消费；避免两人各建一份。
   - **067 的偏离徽标维持两态**（D-01 解 B）：不改成健康表四态文案。
4. 登记 US-004 Story：确认 Story 是否需由 PM 推进（Story → Implementing 归 PM，不归你）；你只登记下挂 Task，不代 PM 改 Story 状态。
5. 记录与回交：在交付目录追加交接记录（或复用 US-004-02 文档），写清登记依据、三个 worktree、分派对象、以及「068 等 065 合入后接、069 收尾」的后续编排。

## 边界（禁止）

- 不写技术方案、不改业务代码（那是 Implementer / Planner 的职责）
- 不替 Human 批准计划（计划 Approval 必须 Human 已给）
- 不替代 Reviewer 做独立审查
- 不 merge main、不填 Merged（合入归 Human）
- 不把 068 与 065 同时派发（两者同改 shared/services/portfolio/summary.js，硬串行）
```

### 备注

- **关键串行点**：TASK-068 与 TASK-065 都改 `shared/services/portfolio/summary.js` 的 `computeSummary`，必须 065 合入后 068 再开工——本提示词只派发 065/066/067，068/069 留待 065 合入后另行编排。
- 若 Human 尚未批准三份计划，本提示词不得使用；先提示 Human 批准。
- 3 卡并行是依赖上限（065+066+067），实际人力不足 3 人时按 Implementer 数递减。

---

## P-05 · 实施 TASK-065（shared + server 四字段）

### 元信息

| 项 | 内容 |
|---|---|
| 目标角色 | Implementer A |
| 用途 | 在 `portomind-065` worktree 实施 `summary` 四字段，验证并提交 |
| 前置条件 | `TASK-065-plan` 已 `Approved`；worktree 与分支 `feature/TASK-065` 已建（基线 `0189c04`） |
| 创建 / 更新 | 2026-11-06 |
| 状态 | 待使用 |

### 提示词正文

```text
你是本项目的 Implementer A，负责 TASK-065。独立会话。

## 工作目录（已为你建好）

  D:/projects/portomind-065      ← 你的 worktree，全程在这里工作
  分支 feature/TASK-065，基线 main @ 0189c04

开工先回报：
  cd D:/projects/portomind-065
  git branch --show-current    # feature/TASK-065
  git rev-parse --short HEAD   # 0189c04
  git status --porcelain       # 应空
  node -v / npm -v
  # worktree 无 node_modules，自行 npm ci 并说明理由

不得改动主工作区 D:/projects/portomind，也不得碰其他两个 worktree
（portomind-066 / portomind-067 由 B、C 使用）。

## 必读

1. docs/development/delivery/US-004/TASK-065.md §3 —— AC-01~AC-06，验收唯一依据
2. docs/development/delivery/US-004/TASK-065-plan.md —— §3 事实、§4 设计、§7 验证
3. docs/development/delivery/US-004/US-004-04-dispatch-record-2026-11-06.md —— 派发记录
4. shared/services/portfolio/summary.js —— 主要改动对象
5. server/test/integration/portfolio.summary.test.js —— 既有测试
6. docs/handbook/technical/API_CONTRACT.md 的 GET /api/portfolios/summary

不要全量通读 docs/。

## 你的任务

在 `stats` 上补四个字段：
- `lastExecutedAt`（Date | null）—— 入参已有，**不得为此新增查询**
- `pendingRebalanceCount`（整数，默认 0）
- `drift.dueByTime`（布尔）
- `drift.overThresholdCount`（整数）

`drift === null` 时，后两字段不出现（不可读）。

## 硬约束（AC 明文，逐条都对得上）

- **AC-02 语义不扩义**：某组合仅时间维度触发时，必须同时满足
  `drift.needsRebalance === false`、`drift.triggeredThresholds === []`、
  `drift.dueByTime === true`。三项一起断言。
- **AC-03 批量聚合**：`pendingRebalanceCount` 用**一次**
  `$match + $group by portfolioId` 聚合（`status:'PENDING'`）。
  **严禁**在 `portfolios.map` 内逐组合 countDocuments。
  `EXECUTED` / `REVOKED` 不计入。
- **AC-04 不复算**：`overThresholdCount` 从 `evaluateThresholds` 已返回的
  `details` 派生，**不得**逐组合复算。
  在 10 个组合的构造数据上断言：
  - `RebalanceRecord` 查询次数 ≤ 11（1 次聚合 + 每组合 1 次 lastExecuted 既有查询）
  - `countDocuments` 调用次数 = 0
  **不靠耗时判定**，靠调用次数。
- **AC-06 不碰 cron-worker**：交付后 `git status cron-worker` 必须空输出。

## 验证

  cd D:/projects/portomind-065
  npm run test:server

AC-05 要求新增单测覆盖 AC-01~AC-04 边界（含三项同断言、
EXECUTED/REVOKED 排除、查询次数断言）；既有
`portfolio.summary.test.js` 与 `portfolio.archived.test.js` 不得回归。

至少对 AC-02、AC-03、AC-04 各做一次负向对照：
- AC-02：把 `dueByTime` 也从 `needsRebalance` 派生 → 断言应失败
- AC-03：改成逐组合 countDocuments → 查询次数断言应失败
- AC-04：改成逐组合复算 → 复算检测应失败

## 交付物

1. 改动文件清单 + SHA256
2. AC-01~AC-06 逐条结果（实测输出）
3. 负向对照记录
4. 查询次数实测（证明 AC-03/AC-04）
5. `git status cron-worker` 空输出证明
6. 已知妥协与未验证项
7. 在 TASK-065-plan.md §11 填实施记录
8. 提交到 feature/TASK-065（正文带 TASK-065）

**不要**改 Task 状态、不要 merge main、不要填 Merged。

## 停下上报

- 发现必须改 cron-worker/ 才能满足 AC
- 发现 `details` 不足以派生 `overThresholdCount`
- 发现既有测试必须弱化才能通过
- 需要新增依赖
```

### 备注

- **AC-03 / AC-04 是调用次数断言，不是耗时断言** —— 这是本卡最容易走偏的地方。用 `countDocuments` 调用计数与 `RebalanceRecord` 查询计数判定，不靠跑得快不快。
- AC-06 的 `git status cron-worker` 空输出要单独取证，它是 US-004/AC-14 的唯一承接点（PM 的 G-1 缺口）。

---

## P-06 · 实施 TASK-066（Dashboard 健康表 + 分币种小计）

### 元信息

| 项 | 内容 |
|---|---|
| 目标角色 | Implementer B |
| 用途 | 在 `portomind-066` worktree 实施健康表与分币种小计；**并拥有 `driftLabels.js`** |
| 前置条件 | `TASK-066-plan` 已 `Approved`；worktree 已建；065 尚未合入（用降级态开发） |
| 创建 / 更新 | 2026-11-06 |
| 状态 | 待使用 |

### 提示词正文

```text
你是本项目的 Implementer B，负责 TASK-066。独立会话。

## ⚠️ 你有一个额外职责：driftLabels.js 归你

US-004-02 / D-02 已裁决：`client/src/constants/driftLabels.js`
**由你（066）拥有**，TASK-067 的 Implementer C 消费。

**请优先完成这一步并尽早合入 main**，否则 C 会卡住：
1. 先建出 `client/src/constants/driftLabels.js`
   —— **纯常量文件**，只含共享文案，不含业务逻辑
2. 提交并告知 Orchestrator，由 Orchestrator 协调合入
3. 再继续 066 的主体工作

如果 C 在你合入前已开工，他那边会先临时引用并在交付说明标注
「待 B 合入后切换」——你不需要为此改设计。

## 工作目录

  D:/projects/portomind-066      ← 你的 worktree
  分支 feature/TASK-066，基线 main @ 0189c04

开工先回报：
  cd D:/projects/portomind-066
  git branch --show-current && git rev-parse --short HEAD && git status --porcelain
  node -v / npm -v；worktree 无 node_modules，自行 npm ci 并说明理由

不得改动主工作区，不得碰 portomind-065 / portomind-067。

## 必读

1. docs/development/delivery/US-004/TASK-066.md §3 —— AC-01~AC-10
2. docs/development/delivery/US-004/TASK-066-plan.md —— §3 事实、§4 设计、§7 验证
3. docs/development/delivery/US-004/US-004-04-dispatch-record-2026-11-06.md
4. client/src/pages/Dashboard.jsx、client/src/components/Household/TotalAssetsCard.jsx
5. client/src/hooks/usePortfolios.js
6. client/src/constants/design-tokens.js（配色复用，不自建）

## ⚠️ 065 尚未合入：先用降级态开发

你依赖 TASK-065 新增的四个字段（`lastExecutedAt` /
`pendingRebalanceCount` / `drift.dueByTime` / `drift.overThresholdCount`），
但 065 由 Implementer A 并行开发，**尚未合入 main**。

**做法**：按计划 §4 的「字段缺失降级」口径开发骨架——
字段不存在时显示降级态（「—」「从未」「未知」），不崩、不显示 0。

**验收边界（必须如实标注）**：
- AC-02 的偏离四态、AC-04 的排序真实值，**须在 065 合入 main 后补验**
- 本轮可用 mock 数据验证渲染逻辑，但**不得声称端到端已验证**
- 交付时单独列一节写明「待 065 合入后补验的项」

## 硬约束

- **AC-01 零新增请求**：数据源复用 `usePortfolios()`，对比改动前 Network 基线
- **AC-02 四态各一条构造用例**，含负向对照：
  `triggeredThresholds.length === 2` 但只覆盖 1 个标的 → 显示「1 项超阈」
- **AC-03 点击不冒泡**：点徽标不触发整行跳转（`stopPropagation`）
- **AC-04 排序全序**：`待办数>0` → `needsRebalance` → `dueByTime` → `createdAt` 倒序。
  比较函数必须是**全序**（同分稳定），刷新后顺序不变
- **AC-05 已归档不出现**；0 个组合显示空态 + 「新建组合」按钮，
  **不出现只有表头的空表格**
- **AC-06 局部失败隔离**：`summary` 请求 abort 时健康表局部错误态，
  总资产卡与提醒列表**仍正常渲染**
- **AC-07 分币种小计**：`null` 桶显示「—」，顺序 `CNY → USD → CAD → HKD`，
  其余按字母序；无数据时该行整体不渲染
- **AC-08 提醒区零改动**：筛选/已读/忽略/立即评估/规则管理行为不变
- **AC-10 视口**：1440×900 下不滚动即可见——总资产金额、分币种小计一行、健康表 3 行

## 验证

  cd client && npm run build
  cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"

另需实测并记录：
- 请求次数（证明 AC-01/AC-04 零新增）
- 1440×900 视口截图或断言（AC-10）
- AC-02 四态 + 负向对照
- AC-06 abort 场景

至少对 AC-02、AC-04、AC-06 各做一次负向对照。

## 交付物

1. 改动文件清单 + SHA256
2. AC-01~AC-10 逐条结果
3. **「待 065 合入后补验」的清单**（单独一节）
4. 负向对照记录
5. 请求次数前后对比
6. 已知妥协与未验证项
7. 在 TASK-066-plan.md §11 填实施记录
8. 提交到 feature/TASK-066（正文带 TASK-066）

**不要**改 Task 状态、不要 merge main、不要填 Merged。

## 停下上报

- 发现必须改 shared/ 或 server/ 才能满足 AC
- 发现 `usePortfolios` 的现有数据不足以渲染四态
- 需要新增依赖
```

### 备注

- **`driftLabels.js` 必须先合入**，否则 C 只能临时引用、后续返工。建议单独一个提交，便于 Orchestrator 优先协调合入。
- 065 未合入期间，AC-02/AC-04 只能用 mock 验证渲染分支；**不得声称端到端通过**，须在交付里单列待补验项。

---

## P-07 · 实施 TASK-067（PortfolioCard 四格）

### 元信息

| 项 | 内容 |
|---|---|
| 目标角色 | Implementer C |
| 用途 | 在 `portomind-067` worktree 实施组合卡四格；消费 B 的 `driftLabels.js` |
| 前置条件 | `TASK-067-plan` 已 `Approved`；worktree 已建；065 未合入、B 的常量文件可能未合入 |
| 创建 / 更新 | 2026-11-06 |
| 状态 | 待使用 |

### 提示词正文

```text
你是本项目的 Implementer C，负责 TASK-067。独立会话。

## 工作目录

  D:/projects/portomind-067      ← 你的 worktree
  分支 feature/TASK-067，基线 main @ 0189c04

开工先回报：
  cd D:/projects/portomind-067
  git branch --show-current && git rev-parse --short HEAD && git status --porcelain
  node -v / npm -v；worktree 无 node_modules，自行 npm ci 并说明理由

不得改动主工作区，不得碰 portomind-065 / portomind-066。

## 必读

1. docs/development/delivery/US-004/TASK-067.md §3 —— AC-01~AC-04
2. docs/development/delivery/US-004/TASK-067-plan.md
3. docs/development/delivery/US-004/US-004-04-dispatch-record-2026-11-06.md
4. client/src/components/PortfolioCard/index.jsx —— 唯一改动文件
5. client/src/hooks/usePortfolios.js

## ⚠️ 两个依赖方，注意处理

### ① driftLabels.js 由 Implementer B（066）拥有

D-02 已裁决：该文件归 B 建，你**不新建**。

- 先检查 main 上是否已有 `client/src/constants/driftLabels.js`
- **有** → 直接 import 消费
- **没有** → 在你分支里临时定义文案（或按 B 约定的结构预引用），
  并在交付说明中**明确标注**「待 B 的 driftLabels.js 合入后切换为 import」
- **绝不**自己新建同名文件，否则两人各建一份必然冲突，直接撞 AC-03

### ② 065 尚未合入：字段不可用

四格依赖的字段（`marketValueByCurrency` 已有；
`positionCount` 已有；`pendingRebalanceCount` / `lastExecutedAt` /
`stats.drift` 由 065 新增）中，后三个**可能不存在**。

按计划 §4 的降级口径：字段缺失显示「—」/「从未」，不崩、不显示 0。

## 你的任务

在 `PortfolioCard` 新增四格：
- 总市值（`marketValueByCurrency` 分币种并列，**不跨币种合计**）
- 持仓资产（`positionCount`）
- 待办（`pendingRebalanceCount` + `unreadAlertCount`）
- 上次再平衡（`lastExecutedAt` → `YYYY-MM-DD`，`null` → 「从未」）

## 硬约束

- **AC-02**：待办为 0 显示「—」；上次再平衡无值显示「从未」，
  **DOM 中 grep 不到「暂无」**
- **AC-03 同源（D-01 解 B，最易做错）**：
  - 与健康表（066）的「待办」「上次再平衡」文案**逐字一致**
    （「N 条待确认」/「N 条未读」/「从未」/`YYYY-MM-DD`）
  - 「偏离」数据同源取 `stats.drift`（不各算一套）
  - **但卡片 `DriftBadge` 徽标维持现状两态**
    （「偏离阈值」/「配置正常」），**不改语义、不改成健康表四态**
  - 逐字一致**不**要求卡片偏离徽标与健康表偏离列字面相同
- **AC-04 零新增请求**：进入 `/portfolios` 时 portfolios 相关请求数不变
- **Out of Scope 红线**：不改 `shared/`、`server/`、`cron-worker/`、
  不改 Dashboard 健康表、不改 `drift.needsRebalance` 徽标语义

## 验证

  cd client && npm run build
  cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"

另需实测：
- 四格渲染 + 降级态（字段缺失时）
- AC-02 的「待办为 0 → —」「无值 → 从未」，并 grep 确认无「暂无」
- AC-03 文案与 066 逐字比对（可用常量表核对）
- AC-04 请求次数前后对比（证明零新增）
- **负向对照**：把 DriftBadge 改成四态 → 确认 AC-03 断言失败（证明你没改语义）

## 交付物

1. 改动文件清单 + SHA256
2. AC-01~AC-04 逐条结果
3. **driftLabels.js 的处理方式说明**（已消费 / 临时引用待切换）
4. **「待 065 合入后补验」的清单**
5. 负向对照记录
6. 请求次数对比
7. 已知妥协与未验证项
8. 在 TASK-067-plan.md §11 填实施记录
9. 提交到 feature/TASK-067（正文带 TASK-067）

**不要**改 Task 状态、不要 merge main、不要填 Merged。

## 停下上报

- 发现必须改 shared/ 或 server/ 才能满足 AC
- 发现 066 的四态文案与你要用的不一致（AC-03 会冲突）
- 需要新建 driftLabels.js（应先与 B / Orchestrator 协调）
- 需要新增依赖
```

### 备注

- **`DriftBadge` 维持两态是 AC-03 的红线**：D-01 解 B 只要求「待办 / 上次再平衡」逐字一致，**不要求**偏离徽标与健康表偏离列字面相同。把徽标改成四态即违反 AC-03。
- 若 B 的 `driftLabels.js` 尚未合入，C 的临时方案必须在交付说明里写明切换条件，避免长期双份文案。

---

## 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-11-05 | 新建 | 建立存档结构，收录 P-01「Planner 拆分 US-004」 |
| 2026-11-05 | 新增 | 收录 P-02「登记 US-004 为预研 Story」、P-03「实施 Task 并提交 git」 |
| 2026-11-06 | 新增 | 收录 P-04「派发 US-004 三卡并行开发」 |
| 2026-11-06 | 新增 | 收录 P-05「实施 TASK-065」、P-06「实施 TASK-066」、P-07「实施 TASK-067」；P-04 状态改为「已使用」（2026-11-06 实际完成派发） |
