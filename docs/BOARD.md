# Story 交付与任务调度

> 更新日期：2026-11-05。默认只推进一个当前 Story（开发中），可另有一个预研 Story 做前期准备（拆 Task、写计划、提示词等）；不采用 Sprint。
> 状态与权限唯一依据：[STATES.md](./os/process/STATES.md) §2.2–§4；卡片字段是真相，本文件仅汇总。取消条目按 §2.3 排除，单独保留退出索引。历史任务不强制补建 Story。

## 当前 Story

> **当前格局（2026-11-05）**：US-001 = 当前 Story（`Implementing`，开发中）；[US-004](./development/requirements/stories/active/US-004-dashboard-portfolio-health.md) = 预研 Story（`Planning`，拆卡与计划已完成，**不进入实施**）。这是 [DOCS.md §1.1](./os/standards/DOCS.md#11-story-交付目录与文档生命周期) 允许的上限（一个开发中 + 一个预研），不新增第三个交付目录。US-002 / US-003 / US-005 仍为 `Backlog`，需求留在 `requirements/stories/`，不预建交付目录。

| 项目 | 当前情况 |
|---|---|
| Story / 用户价值 | [US-001](./development/requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)：首屏判断五类任务运行与数据完整性（FS P0） |
| Status | Implementing（053/054/055/056 结案；057 计划 Approved 并实施中；063/064 待批准） |
| 交付目录 | [US-001 过程资料](./development/delivery/US-001)（6张专属任务卡、6份计划（3 Completed、1 Approved、2 Draft）、2份交接记录；复用054保持唯一原位置） |
| PM / 验收负责人 | PM（需求整理与 Story 验收汇总）/ Human |
| 下一步 | **US-001 七张任务卡全部 Completed。** 053/055/056/057/064 已合入 `main`；**063 已结案但未合入**（`9b90fdc`）——063 是 11 项 AC 的最后一块前端接入，**合入后 Story 才具备整体验收条件**。 |
| 阻塞 / 待决策 | **任务层无阻塞，七卡全部 Completed。** 待 Human：① **合入 TASK-063 并登记 `Merged`**（`feature/TASK-063` @ `9b90fdc`）——这是 Story 进入整体验收的最后一个动作；② Story → `Reviewing` 由 **PM 登记**（STATES.md §2.2 / §4），Orchestrator 不代填；③ Story 级遗留（各卡 MINOR 多为「上线后跑满一个调度周期再验」）建议合并成一条 Story 级待办。 |

### 下挂 Task

| Task | 工作 | 覆盖 Story AC | Status | Owner | 依赖 / 下一步 | ExecPlan |
|---|---|---|---|---|---|---|
| [TASK-053](./development/delivery/US-001/TASK-053.md) | 看板入口及骨架 | AC-01、02、07、10、11 | Completed | — | **已结案（2026-11-04）**：实现 `c858521`，经 **PR #41** 合入 `main`（`ecd9314`）；33/33 + 7/7 PASS，提交后复验 build 0 / eslint 0-0 / check:ignored PASS；Reviewer `Pass with issues`，F-01/F-02 已修复，F-03 已关闭 | [Completed](./development/delivery/US-001/TASK-053-plan.md)，仅053设计 |
| [TASK-054](./development/tasks/completed/TASK-054-cron-status-aggregate-api.md) | 聚合快照读侧（既有产出） | AC-02～08、10、11 的读侧支撑 | Completed | 既有结案记录 | 复用证据前核对真实项目版本 | [已归档计划](./development/exec-plans/completed/TASK-054-cron-status-aggregate-api.md) |
| [TASK-055](./development/delivery/US-001/TASK-055.md) | 价格完成度 | AC-03、04、07、10 | Completed | — | **已结案并合入（2026-11-04）**：`Merged` = **Fast-forward `83e9971`**（无 merge commit）；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，11 条 AC 中 10 条满足 + AC4/6/7/9 负向对照成立；AC8① 归 063。⚠️ 文档曾引用 rebase 前旧 SHA `3991df8`/`0f697fd`（不在 main），已更正 | [Completed](./development/delivery/US-001/TASK-055-plan.md)（§12 审查、§13 结案） |
| [TASK-056](./development/delivery/US-001/TASK-056.md) | 系统状态色与图例 | AC-02、09 | Completed | — | **已结案并合入（2026-11-04）**：`feature/TASK-056` @ `31b516e` → `Merged` **`53edb8e`**；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，AC1～AC9 全满足 + AC2/AC3 负向对照成立，053 回归 PASS；余 3 项 MINOR。`status*` token 与 `statusTone.js` 已在 `main` | [Completed](./development/delivery/US-001/TASK-056-plan.md)（§12 审查、§13 结案） |
| [TASK-057](./development/delivery/US-001/TASK-057.md) | 结果写侧及再平衡父任务 | AC-05～08 的写侧支撑 | Completed | — | **已结案并合入（2026-11-05）**：`Merged` = **`1e421db`**（merge commit，分支 tip `54136c2`）；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，AC1～AC12 全满足 + AC2/AC5/AC7 负向对照成立；库前后 276/0/0 未污染 | [Completed](./development/delivery/US-001/TASK-057-plan.md)（§12 审查、§13 结案） |
| [TASK-063](./development/delivery/US-001/TASK-063.md) | 五卡接入、总览与刷新 | AC-02、05～08、10、11 | Completed | — | **已结案（2026-11-05）**：`feature/TASK-063` @ `9b90fdc`；Reviewer **`Pass with issues`**，无 BLOCKER/MAJOR，AC1～AC8 全满足 + 四处负向对照（含「unknown 不假绿」5 条）；053/056 组件改动判为**授权内必要扩展、缺省零回归**。⚠️ **`Merged` = `Pending`，尚未合入 `main`** | [Completed](./development/delivery/US-001/TASK-063-plan.md)（§12 审查、§13 结案） |
| [TASK-064](./development/delivery/US-001/TASK-064.md) | 读侧结果兼容与skip观测 | AC-02、05～08、11 | Completed | — | **已结案并合入（2026-11-05）**：`Merged` = **`cde811f`**（merge commit，分支 tip `b23abb9`）；Reviewer `Pass with issues`，无 BLOCKER，AC1～AC6 全满足 + 四处负向对照成立；库 276/0/0 未污染，detail 零回归。F-01（基点落后）已随 merge 闭环，`c11bb64` 未回退 | [Completed](./development/delivery/US-001/TASK-064-plan.md)（§12 审查、§13 结案） |

> 2026-10-30：Orchestrator 按本轮 Human 指令及 STATES.md §4 登记063/064，并接收053/055/056/057规划，将四卡原BACKLOG登记为Planning。各卡记录依据，Owner均待指派；没有卡进入Implementing。

> 随后Human仅批准053当前设计，Orchestrator代登记其计划Approved；真实源码只读核对已完成，但工作区未就绪，Task/Story仍Planning，未指派Implementer。其他计划、D-01～D-04、054完成及Merged记录未变。

> 2026-10-31：Orchestrator 按 STATES.md §4「Task → Reviewing：Implementer 提供改动清单、自测证据、可审对象和已知妥协」核对 TASK-053，三项齐备，登记 `Implementing` → **`Reviewing`**，Owner 改为「待 Human 结案」。核对事实：分支 `feature/TASK-053` @ `6e013d7` 存在；自测 33/33 + 7/7 PASS、build exit 0、eslint 0-0；Reviewer 首轮 `Fail`（F-01/F-02）→ 修复后复检 `Pass with issues`。**本轮未重跑验证**（同基线同一交付已有独立复验证据，按复用原则引用）；未改 AC/Scope/代码；**未提交、未合入、未填 `Merged`、未关闭**——交付仍是工作区未提交改动。Story 状态未动（Story → Implementing 属 PM 权限）。

> 2026-10-31（续）：Human 指示提交 TASK-053。已提交 `c858521`（17 文件，+2035/−129），工作区随之干净。**提交后复验**（此前交付仅为工作区改动，F-01 的实质风险是"提交后是否还能构建"）：`npm run build --workspace client` → exit 0 / 2429 modules；`eslint "src/**/*.{js,*.jsx}"` → 0 error 0 warning；`npm run check:ignored` → PASS。`RawLogView.jsx` 确认已入库（`git ls-tree` 命中 1），F-01 关闭。**未 push、未合入 `main`、未填 `Merged`、未关闭 Task**——`Merged` 与关闭仍归 Human。

> 2026-11-04：Human 确认「053 任务已经完成了」。核对 `git merge-base --is-ancestor c858521 main` = 是，合入来自 **PR #41**（`ecd9314`）。按 STATES.md §4 登记 TASK-053 **`Reviewing` → `Completed`**，`Merged` = `#41`，计划同步 `Implementing` → `Completed`；DoD §3 T-1～T-6 逐条满足（见计划 §13.2）。**本轮未重跑验证**（同基线同一交付已有提交后复验与独立审查证据，按复用原则引用）；未改 AC/Scope/代码。过程目录按 DOCS.md §1.1 **留在 `delivery/US-001/`**，待 Story 关闭后整体归档。同轮修正两处文档缺陷：计划 §12.9 误置于 §13 之后（已移回 §12 内）、卡片 3 处失效引用（`§10.4` 不存在、`../process/` `../roles/` 旧路径）——`npm run docs:check` 由 5 ERROR 降至 **0 ERROR**。

> 2026-11-04（续）：Human 指示「先完成 056」。Orchestrator 按 STATES.md §4 将 TASK-056 计划 `Draft` → **`Approved`**、Task `Planning` → **`Implementing`**，**token 命名冻结**为 `statusOk/statusWarn/statusBad/statusIdle`（055 AC2 依赖）。启动核对完成：053 骨架已在 `main`（AC3 基线 0 行、AC8 基线 7 文件 13 处已实测）。**发现一处缺口**：`BoardShell` 未预置图例插槽（053 计划称"056 插入图例"但未声明位置）→ 处置为在 `SummaryShell` 与五卡网格间新增一行 `StatusLegend`，只加不改，破坏 053 断言则停下上报。AC7 候选色静态计算均 ≥4.5:1，但须浏览器实测。**未建 worktree、未改代码、未跑验证、未指派实施者。**

> 2026-11-04（再续）：TASK-056 实施与审查均已完成。实现于独立 worktree `D:/projects/portomind-056`（`feature/TASK-056`，8 文件 +759/−1，`6f4b491`）；独立 Reviewer 自建探针复核，判定 **`Pass with issues`**——AC1～AC9 全满足、AC2/AC3 负向对照证明断言非恒真、**053 结构回归全部 PASS（未出现计划 §10.2 预警的图例插入回归）**，无 BLOCKER/MAJOR，余 3 项 MINOR（F-01 实现者脚本 AC2 期望值恒真风险、F-02 脚本依赖本机 Chrome、F-03 AC6 卡片文案待 063 接线）。审查记录提交 `31b516e`。

> 2026-11-04（结案）：Human 指示「056 请登记完成」。按 STATES.md §4 登记 **`Reviewing` → `Completed`**，计划同步 `Approved` → `Completed`，DoD §3 T-1～T-6 逐条满足（计划 §13.2）。

> 2026-11-04（合入）：Human 完成合并 —— `53edb8e` `Merge branch 'feature/TASK-056' into main`。核对 `git merge-base --is-ancestor 31b516e main` = **是**；`main` 上 `statusOk/statusWarn/statusBad/statusIdle` 四 token 与 `statusTone.js` / `StatusLegend.jsx` 均已在位。**`Merged` 由 `Pending` 更正为 `Merged` `53edb8e`**（原 `Pending` 登记基于当时未合入的事实，属如实记录，已在卡与计划 §13 更正）。055 的 B6 缺口随之解除。

> 2026-11-05（PM 同步）：按卡片事实同步 —— ① **TASK-057 计划 `Approved`**（2026-11-05，Human 批准当前设计），D-01～D-03 契约冻结，已登记 `Planning` → `Implementing`；② **TASK-063 改为串行**（Human 2026-11-05 裁决：057/064 合入后才实施，AC2/AC3 以真实记录验收），063/064 计划仍为 `Draft` 待批准。据此同步下挂 Task 行的 Status 与依赖、进度汇总。**同时按 [STATES.md §4](os/process/STATES.md#4-谁可以改变状态) 由 PM 登记 Story `Planning` → `Implementing`**（依据：053/054/055/056 结案、057 已实际启动；此前 Story 卡片与看板不同步，现以卡片为准更正）。**未修改任何 AC、Scope、Task 技术结论或代码**；6 份未提交的 Planner 文档改动保持原状未触碰。

> 2026-11-05（PM 核对）：`TASK-055` 已 `Completed` 但 `Merged` 仍为 `Pending`；`git merge-base --is-ancestor 0f697fd main` = **否**，即 `feature/TASK-055` 尚未合入 `main`，且需先 rebase。该合入与 `Merged` 登记归 Human（[STATES.md §4](os/process/STATES.md#4-谁可以改变状态)），PM 只登记事实、不改其状态。**影响：055 未合入前 AC-03/04 无主干证据，Story 不能进入 `Reviewing`。**

> 2026-11-05（TASK-057 结案）：057 实现与审查均已完成。实现于独立 worktree `D:/projects/portomind-057`（14 文件 +961/−84，`5bb47ea`）；独立 Reviewer 自建真实库探针复核，判定 **`Pass with issues`**——AC1～AC12 全满足、AC2/AC5/AC7 负向对照证明断言非恒真、**AC5 并发首跑未被改 SKIPPED**、AC4 父任务「未超阈 vs 生成建议」可区分、库前后 276/0/0 未污染；无 BLOCKER/MAJOR，余 F-01～F-04 共 4 项 MINOR。审查记录提交 `54136c2`。按 §4 登记 `Reviewing` → **`Completed`**，计划同步 `Approved` → `Completed`。**⚠️ `Merged` = `Pending`**：`git merge-base --is-ancestor 54136c2 main` = 否，分支领先 `main` 两个提交、**尚未合入**。**下游阻断**：064 计划已批准，但其 W0 前置为「057 合入 `main`」——未合入前 064 不可开工。

> 2026-11-04（续）：Human 指示「现在开始 055」。Orchestrator 按 §4 将 TASK-055 计划 `Draft` → **`Approved`**、Task `Planning` → **`Implementing`**，并完成启动核对：B1/B2 由本次批准解除；B4（054 接口）、B5（053 骨架）、B6（056 token）均已在 `main`。实测确认价格 `dataState` 无 `percentage` 字段、恒为对象不会 `null`、单端点返回五卡数据——与 D-04 裁决的三条口径一致。**未建 worktree、未改代码、未跑验证、未指派实施者。**

### 进度汇总

| 统计范围 | 总数 | Backlog | Planning | Implementing | Reviewing | Blocked | Completed |
|---|---:|---:|---:|---:|---:|---:|---:|
| 全部已登记 Story（排除取消） | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| 当前 Story 已关联 Task | 7 | 0 | 0 | 0 | 0 | 0 | 7 |
| 尚未关联 Story 的未完成 Task | 5 | 1 | 4 | 0 | 0 | 0 | 0 |

> 统计来自卡片；旧词按 STATES.md §7.1 映射，不证明当前实施授权。已关联任务不重复计入未关联任务。TASK-054 的既有 Completed 计为 1 个支撑任务完成，不表示当前 Story 已验收。TASK-055 的 `Completed` 计 1 个任务完成，但其 `Merged` 仍为 `Pending`（未合入 `main`），不构成 AC-03/04 的主干证据。共 11 条历史完成记录保留作证据索引，与本 Story 进度不可相加。

## Story Backlog

| Story | 用户价值 | Priority | 准备情况 | 依赖 / 待决策 |
|---|---|---|---|---|
| [US-002](./development/requirements/stories/active/US-002-board-drilldown-and-staleness.md) | 从看板追到原因：停滞提示 + 再平衡分发记录页 + 原始日志下钻（承接 US-001 未含的 P1 需求 R6/R7/R10） | High | 可启动；待 Planner 拆 Task | 依赖 TASK-057 合入（AC-05～09 三列）；OQ-01 缓冲值、OQ-02 单日 vs 多日矩阵、OQ-03 停滞提示形态未决 |
| [US-003](./development/requirements/stories/active/US-003-portfolio-detail-overview-ia.md) | 组合详情「总览」：目标 vs 实际 / 偏离原因 / 删除入口 / 配置分层（Spec 交付单元 A，纯客户端） | High | 可启动；Spec 已 `Approved` 但从未拆 Task | 顺序已裁（US-004 先行，US-003 侧 OQ-01 = US-004 侧 OQ-02）；AC-16 的 `lastExecutedAt` 依赖 US-004 的 B1，因 US-004 先行故无需临时隐藏；余 OQ-03（`?record=` 上限）待确认 |
| [US-004](./development/requirements/stories/active/US-004-dashboard-portfolio-health.md) | Dashboard 组合健康表 + 分币种小计 + 组合卡四格（Spec 交付单元 B，改 `shared`/`server`） | High | **预研中（已拆 5 卡，待登记实施）**——Status `Planning`，当前唯一的预研 Story | 交付目录 [delivery/US-004](./development/delivery/US-004)（TASK-065～069 + 5 份 Draft 计划 + 实施提示词）；**OQ-01 / OQ-02 均已裁决**（排序=有事的在上，原型 `unvaluable`/`missing` 两档不采用；顺序=本 Story 先行）；TASK-065 / TASK-068 需 `Approved` ExecPlan |
| [US-005](./development/requirements/stories/active/US-005-transaction-query-filters.md) | 交易流水按时间/类型/多组合筛选，条件写进 URL | Medium | 可启动；复用既有 TASK-045（Backlog） | OQ-01 多值参数形态、OQ-02 是否加索引未决；需 `Approved` ExecPlan |

> PM 按已确认的优先级维护队列，原有 Task 与 Spec 不自动变成 Story。Story 文档入口见 [STORIES.md](./development/requirements/stories/STORIES.md)；状态统一按 STATES.md §6 汇总。
>
> 2026-11-05（PM 登记预研）：按新规则把 **US-004 由 `Backlog` 登记为 `Planning`（预研 Story）**。依据：Planner 已拆出 TASK-065～TASK-069 并回写 Story §6，符合 [STATES.md §2.2](./os/process/STATES.md#22-story-状态)「Planning = 已定优先级、正在完善范围与任务拆分」与 §4「Story → Backlog / Planning 归 PM」。**预研不进入实施**——Task 状态登记仍归 Orchestrator，US-004 不会被写成 `Implementing`。同轮核对 AC 覆盖，发现两处缺口（AC-14 `cron-worker` 零改动无卡承接、AC-05 的 1440×900 不滚动断言未覆盖），已记入 Story §6 交回 Planner，**PM 未自行补卡、未改 AC**。US-001 仍是唯一「当前 Story」。

> 2026-11-05（PM 建卡）：按 Human 指示把 `docs/development/requirements/specs/` 的遗留需求整理为 Story，新建 **US-002～US-005** 四张卡。来源分工：US-002 ← `FS-cron-worker-status-board` 的 P1（C-06/C-07/C-08，US-001 明确排除在范围外）；US-003 / US-004 ← `FS-portfolio-ia-cleanup` 的交付单元 A / B（该 Spec 2026-10-26 已 `Approved`，但从未拆过 Task，代码零实现）；US-005 ← `FS-transaction-query-filters`（复用既有 TASK-045）。**未改动任何已有卡的状态、优先级或范围**；规格 P2 的 C-09 历史趋势、C-10 launchDate 引导不建 Story，留 Spec 作 Future 登记。

## 已完成 Story

| Story | 交付结果 | 完成日期 | 验收记录 |
|---|---|---|---|
| — | 暂无 | — | — |

## 已退出 Story

| Story | 退出日期 | 原因 / Human 决定 | 归档链接 |
|---|---|---|---|
| — | 暂无 | — | — |

## 未关联 Story 的任务

> 兼容既有任务与独立维护工作。US-001 已关联 TASK-053～057及063/064（其中054保持既有完成记录）；反向关联已核对，登记结果见上表。其余未确认关联的任务仍在下表；本轮未改变这些独立任务的状态、优先级或安排。

| Task | 工作 | Story | Status | Priority | 待处理 / 下一步 |
|---|---|---|---|---|---|
| [TASK-045](./development/tasks/active/TASK-045-transaction-query-filters.md) | 交易流水查询与筛选 | 未关联 | Backlog | Medium | 待排期 |
| [TASK-046](./development/tasks/active/TASK-046-csv-import-dedup.md) | CSV 二次导入未去重（幂等失效） | 未关联 | Planning | High | 待确认优先级与排期 |
| [TASK-047](./development/tasks/active/TASK-047-review-followups.md) | TASK-044 审查遗留整改（M-1/M-2/M-5/M-6） | 未关联 | Planning | High | 待 Planner 产出计划 |
| [TASK-051](./development/tasks/active/TASK-051-fx-rate-direction.md) | 家庭折算汇率方向反了（`rateToCny` 存成 `1 CNY = X 外币`） | 未关联 | Planning | High | 待 Human 裁决汇率方案及历史数据处置 |
| [TASK-062](./development/tasks/active/TASK-062-agent-role-boundary-and-overhead.md) | Agent 角色权限边界与执行开销整改 | 未关联 | Planning | High | 待审阅范围及裁决；提案未批准，不作为现行规则 |

## 历史完成 Task

> 本表汇总任务卡与 Human 的合入登记。权限与字段含义见 [STATES.md](./os/process/STATES.md) §1 / §4；仅 Human 可填写 Merged。

| Task | 工作 | 完成日期 | Merged | 记录 |
|---|---|---|---|---|
| TASK-064 | cron 状态读侧契约兼容与跳过观测（FS **C-05** 读侧） | 2026-11-05 | `Merged` `cde811f` | [任务卡](./development/delivery/US-001/TASK-064.md) · [计划](./development/delivery/US-001/TASK-064-plan.md)（仍在 US-001 过程目录；merge commit `cde811f`，分支 tip `b23abb9`） |
| TASK-063 | 五卡真实数据接入、总览与手动刷新（FS **C-06/C-07**） | 2026-11-05 | `Pending` | [任务卡](./development/delivery/US-001/TASK-063.md) · [计划](./development/delivery/US-001/TASK-063-plan.md)（仍在 US-001 过程目录；分支 `feature/TASK-063` @ `9b90fdc` **尚未合入 main**） |
| TASK-057 | `taskruns` 数据契约增强（`result` / `SKIPPED` / 再平衡父任务）（FS **C-05**） | 2026-11-05 | `Merged` `1e421db` | [任务卡](./development/delivery/US-001/TASK-057.md) · [计划](./development/delivery/US-001/TASK-057-plan.md)（仍在 US-001 过程目录；merge commit `1e421db`，分支 tip `54136c2`） |
| TASK-055 | 价格同步「数据态完成度」展示（FS **C-03**） | 2026-11-04 | `Merged` `83e9971` | [任务卡](./development/delivery/US-001/TASK-055.md) · [计划](./development/delivery/US-001/TASK-055-plan.md)（仍在 US-001 过程目录；**Fast-forward 合入，无 merge commit**；旧 SHA `3991df8`/`0f697fd` 为 rebase 前，不在 main） |
| TASK-056 | 看板系统状态色语义与图例（FS **C-04**） | 2026-11-04 | `Merged` `53edb8e` | [任务卡](./development/delivery/US-001/TASK-056.md) · [计划](./development/delivery/US-001/TASK-056-plan.md)（仍在 US-001 过程目录） |
| TASK-053 | 日志频道「任务运行看板」tab 骨架（FS **C-01**） | 2026-11-04 | `Merged` #41 | [任务卡](./development/delivery/US-001/TASK-053.md) · [计划](./development/delivery/US-001/TASK-053-plan.md)（仍在 US-001 过程目录，待 Story 关闭后整体归档） |
| TASK-052 | Agent 运行规则（docs 治理层）审计与整改 | 2026-10-29 | `Pending` | [任务卡](./development/tasks/completed/TASK-052-agent-rules-update.md)（含明确接受的未满足项，详见卡片） |
| TASK-058 | 账号与访问控制（用户模块；U1 后端内核 + U2 前端登录/账户 + U3 用户管理页） | 2026-10-28 | `Merged` #38 | [任务卡](./development/tasks/completed/TASK-058-authentication-and-accounts.md) |
| TASK-061 | 2.0 原型「日志」频道实现 cron 运行看板（FS-cron-worker-status-board） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-061-cron-board-prototype.md) |
| TASK-060 | 用户模块原型整改（auth 原型并入主原型 + 用户区） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-060-user-module-prototype-remediation.md) |
| TASK-059 | 组合线原型稿整改（对齐 `FS-portfolio-ia-cleanup`） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-059-prototype-alignment-portfolio-ia.md) |
| TASK-054 | 后端聚合接口 `GET /api/cron/status`（FS **C-02**） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-054-cron-status-aggregate-api.md) |
| TASK-050 | 组合列表页承接家庭五区块，`/family` 下线 | 2026-10-26 | `Merged` #35 | [任务卡](./development/tasks/completed/TASK-050-portfolio-list-household-blocks.md) |
| TASK-048 | Family 页分红类交易标签修正（M-3） | 2026-10-20 | `Merged` #34 | [任务卡](./development/tasks/completed/TASK-048-family-dividend-label.md) |
| TASK-049 | Dashboard 承接家庭总资产卡 | 2026-10-19 | `Merged` #33 | [任务卡](./development/tasks/completed/TASK-049-dashboard-household-total.md) |
| TASK-044 | 交易记录收拢进组合管理 | 2026-10-19 | `Merged` #32 | [任务卡](./development/tasks/completed/TASK-044-transaction-consolidation.md) |
| TASK-043 | 标的频道合并（资产管理 + 价格） | 2026-10-19 | `Merged` #32 | [任务卡](./development/tasks/completed/TASK-043-asset-price-consolidation.md) |


## Roadmap


1. 将资产管理和价格，合并。—— ✅ TASK-043
2. 将交易记录，收拢进组合管理 —— ✅ TASK-044
3. 家庭视图，融入进 dashboard —— ✅ **已完成（2026-10-26 收官）**：`TASK-049` 总资产卡 → `/`（2026-10-19 结案）；`TASK-050` 其余五块 → `/portfolios` 且 `/family` 下线（2026-10-21 实施 → R-1 返修 → 复验通过 → **2026-10-26 合入 `main` `cafcc5d`，PR #35**）。需求：[`specs/completed/FS-household-view-split.md`](./development/requirements/specs/completed/FS-household-view-split.md)
4. 交易线遗留修复（建议顺序）：`TASK-046`（CSV 幂等失效，P0 数据风险，修 1 行 + 修 mock）→ `TASK-047`（M-2 归属守卫等）→ ~~`TASK-048`（分红标签）~~ ✅ **已完成 2026-10-20**
5. 家庭线遗留（本 FS 明确不做，需独立立项）：家庭总资产趋势（`FAM-01` P1，无快照模型）· 家庭视图按账户类型/大类分组（PRD `CM-05`/`AS-09` 声称已就绪，实现中 `familySummary` 既无 `accountType` 也无大类聚合）
6. dashboard，增加组合健康表，内容是最新的3个提示。一个url ，跳转全部


## 看板维护与交接

- PM 维护当前 Story、Story 队列及验收摘要；Orchestrator 按权限登记 Task 状态。先改权威卡片，再同步看板，不单独在看板推进状态。
- Human 确认优先级 → PM 准备 Story → Orchestrator 分派 Planner → Implementer 实施 → Reviewer 提供结论 → PM 汇总 Story 验收 → Human 关闭。
- Task 明确所属 Story 和覆盖的 AC；状态按卡片投影。必要 Task 完成后进入整体验收，不能自动关闭 Story。
- 已完成 Story 移入完成索引，取消项移入退出索引；下一项按已确认优先级选择。卡片搬迁时修复链接，保留编号与历史证据。
- 汇总按稳定编号去重，未知写“待确认”；独立维护任务不计入当前 Story。更新看板复用已有证据，不触发额外技术复验。
