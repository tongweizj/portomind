# Story 交付与任务调度

> 更新日期：2026-11-08。默认只推进一个当前 Story（开发中），可另有一个预研 Story 做前期准备（拆 Task、写计划、提示词等）；不采用 Sprint。
> 状态与权限唯一依据：[STATES.md](./os/process/STATES.md) §2.2–§4；卡片字段是真相，本文件仅汇总。取消条目按 §2.3 排除，单独保留退出索引。历史任务不强制补建 Story。
> **版本基线**：`v1.0.0`（2026-11-08，`release/v1.0` @ `d87f81d`）；US-004 交付单元 B 已随该版本封板，开发分支已清理（保留 `main`、`release/v1.0`、未合并的 `chore/merge-TASK-067` 与 `origin/f_23`）。

## 当前 Story

> **当前格局（2026-11-08）**：**当前无开发中的 Story**。[US-004](./development/requirements/stories/active/US-004-dashboard-portfolio-health.md) 已于 2026-11-08 由 Human 关闭（`Completed`），过程目录归档在 `delivery/completed/US-004/`；US-001 亦已 `Completed` 并归档（`delivery/completed/US-001/`）。US-002 / US-003 / US-005 仍为 `Backlog`，需求留在 `requirements/stories/`，不预建交付目录。

> 默认只推进一个当前 Story（开发中），可另有一个预研 Story 做前期准备；不采用 Sprint。

### US-004（已归档，2026-11-08）

| 项目 | 当前情况 |
|---|---|
| Story / 用户价值 | [US-004](./development/requirements/stories/active/US-004-dashboard-portfolio-health.md)：Dashboard 组合健康表 + 分币种小计 + 组合卡四格（Spec 交付单元 B） |
| Status | **`Completed`（2026-11-08，Human 关闭）**：五卡全部 `Completed` 且全部合入 `main`；整体验收通过（PM 汇总 2026-11-08，AC-01～AC-20 逐项满足）；过程目录已归档 |
| 交付目录 | [US-004 过程资料](./development/delivery/completed/US-004)（TASK-065～069 卡与计划、并行方案、派发记录、提示词存档；2026-11-08 整体归档） |
| 并行实施 | 065 已合入 `main`（`6f556aa`）；066 已合入（`af1f4d2`，**PR #42**）；067 已合入（`d95be45`）；068 已合入（`6f0b4df`）；069 已合入（`d42a1bb`，**PR #43**）；五卡均结案 |
| 下一步 | **Story 已关闭**。仅剩可选收尾：069 MINOR F-02/F-03（AC 口径与 Spec 落地记录范围，PM/Planner 文档收窄）、066/068 记录层 MINOR；产品向待办（P1-1 徽标文案、`FAM-01` 家庭资产趋势、汇率面板归位）尚未建 Story |
| 阻塞 / 待决策 | **无阻塞、无待决。** |

### US-004 下挂 Task

| Task | 工作 | 覆盖 Story AC | Status | Owner | 依赖 / 下一步 | ExecPlan |
|---|---|---|---|---|---|---|
| [TASK-065](./development/delivery/completed/US-004/TASK-065.md) | `summary` 四字段 | AC-01～04、AC-14 | **Completed** | — | **已结案（2026-11-06，Human 确认验收通过）**：分支 `feature/TASK-065` @ `5f807a3`（原 `8fde289` rebase）；Reviewer `Pass with issues`、无 BLOCKER，AC-01~04 与 AC-14 全满足。**`Merged` = `6f556aa`**（2026-11-06 `Merge branch 'feature/TASK-065' into main`；`merge-base --is-ancestor 5f807a3 main` = 是）。066/067 可解除降级态；068 前置已随本卡合入解除 | [Completed](./development/delivery/completed/US-004/TASK-065-plan.md) |
| [TASK-066](./development/delivery/completed/US-004/TASK-066.md) | Dashboard 健康表 + 分币种小计 | AC-05～13 | **Completed** | — | **已结案并合入（2026-11-06）**：独立 Reviewer **`Pass with issues`**，无 BLOCKER、无未决 MAJOR；F-01（MAJOR：本地时区格式化致 066/067 日期差一天 + 「N 天前」后缀）已由 **`353d583`** 整改（唯一 UTC `lastRebalanceDateStr`，两卡共用）并复审收敛；`verify066.cjs` **34/34**、build 0、eslint 0/0、5 条负向对照；剩 4 项 MINOR 记录在案。经 **PR #42** 合入 `main`（**`af1f4d2`**），合入前分支已 `f8903c3` 刷新 `main`；**`Merged` = `af1f4d2`** | [Completed](./development/delivery/completed/US-004/TASK-066-plan.md)（§11 实施、§12 审查、§13 结案） |
| [TASK-067](./development/delivery/completed/US-004/TASK-067.md) | `PortfolioCard` 四格 | AC-17、AC-18 | **Completed** | — | **已结案并合入（2026-11-06）**：Human 确认检验通过；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，AC-01～AC-04 全满足 + 3 条负向对照。分支 tip `6f5add2` 经 merge commit **`d95be45`** 合入 `main`；`git merge-base --is-ancestor 6f5add2 main` = 是，且合入未改动 `shared/`、`server/`、`cron-worker/`。**`Merged` = `d95be45`** | [Completed](./development/delivery/completed/US-004/TASK-067-plan.md)（§12 审查、§13 结案） |
| [TASK-068](./development/delivery/completed/US-004/TASK-068.md) | 删除组合后事件查询层过滤 | AC-19、AC-14 | **Completed** | — | **已结案并合入（2026-11-06）**：首轮独立复核 `Fail`（F-01 BLOCKER：`null.toString()` 致 summary 500；F-02 MAJOR：AC-03 断言无法证伪物理删除）→ `3226dd4` 返工（`_id!=null` 守卫、stub 补 null 样本、`deletePortfolioCascade` 契约测试，`test:server` **240/240**）→ 二审复检 **`Pass with issues`**（plan §12.11：F-01/F-02 已解决，AC-01～AC-07 全满足）。合入 **`6f0b4df`** `Merge branch 'feature/TASK-068' into main`（`merge-base --is-ancestor 84a50d4 main` = 是），合入仅 7 文件、未触 `client/`/`cron-worker/`；残余 MINOR F-03/F-05 记录在案 | [Completed](./development/delivery/completed/US-004/TASK-068-plan.md)（§11 实施、§12 审查、§13 结案） |
| [TASK-069](./development/delivery/completed/US-004/TASK-069.md) | 契约文档同步 | AC-16 | **Completed** | — | **已结案（2026-11-06，Human 确认检验通过）**：独立 Reviewer **`Pass with issues`**，无 BLOCKER/MAJOR，剩 MINOR F-01（交付证据不足：`docs:check` 无法发现字段缺失，Reviewer 已用 `fieldset.cjs` 独立补验）/ F-02（AC-16「响应示例」字面口径，归 PM）/ F-03（Spec 落地记录未列 066/B6~B14，归 PM/Planner）。交付 `ba5e5e1`：`API_CONTRACT.md:87` 补 `stats.unreadAlertCount`（B16 口径）+ 校正 4 处措辞；Spec 状态行 + `HD-15`。`docs:check` **0 ERROR / 0 WARN**、代码面 diff 为空。**`Merged` = `d42a1bb`**（**PR #43**，2026-11-06；`git merge-base --is-ancestor a93c90b main` = 是） | [Completed](./development/delivery/completed/US-004/TASK-069-plan.md)（§11 实施、§12 审查、§13 结案） |

> 派发依据：[US-004-04 派发记录](./development/delivery/completed/US-004/US-004-04-dispatch-record-2026-11-06.md)；并行编排见 [US-004-02](./development/delivery/completed/US-004/US-004-02-3card-parallel-plan.md)；三份 Implementer 提示词见 [US-004-prompts.md P-05/06/07](./development/delivery/completed/US-004/US-004-prompts.md)。068 不得与 065 同时派发。

> 2026-11-06（Orchestrator 结案）：TASK-065 实现与独立审查均已完成，Reviewer 判定 **`Pass with issues`**、无 BLOCKER；Human 明确确认「065 已经验收通过」。按 [STATES.md §4](./os/process/STATES.md#4-谁可以改变状态) 登记 `Reviewing → Completed`（Task → Completed 与关闭归 Human）。**`Merged` = `6f556aa`**：2026-11-06 经 `Merge branch 'feature/TASK-065' into main` 合入 `main`，`git merge-base --is-ancestor 5f807a3 main` = 是（此前登记的 `Pending` 已据实更正）。计划同步 `Approved → Completed`。US-004 仍 `Planning`（066 `Implementing`、067 `Reviewing`、068/069 待派），Story 不关闭；066 可解除降级态，068 硬串行前置已随 065 合入解除。AC-01~04 与 AC-14 已在 §8 标记已验证。

> 2026-11-06（Orchestrator 登记 TASK-067 → Reviewing）：Implementer C 交付提交 `8141275`。⚠️ **分支基线陈旧**：`feature/TASK-067` 基于旧 `main`（早于 `d345430`），不含 065 合入 `6f556aa`；故 `git diff main..feature/TASK-067` 会把 065 四字段+156 测试与 BOARD/US-004/prompt 文档**显示为删除**——属 fork 点陈旧的双向 diff 假象，**并非本卡删除它们**（两路合并会保留双方）。**评审与合入前必须先 `git merge main`（rebase 到当前 main）**，否则会回退 065 工作。封面四格源自 `stats`、零新增请求零服务端、降级态显示「—」/「从未」、临时内联文案待 066 的 `driftLabels.js` 合入后切换（D-02）、与 066 健康表逐字一致（D-01 解 B）。Orchestrator 不替代 Reviewer 结论 / Human 关闭。（后续：`434a323` 已 merge main 刷新基线、独立复核 `Pass with issues`、Human 确认结案，见 067 卡 §12/§13。）

> 2026-11-06（Human 合入 TASK-067）：分支在合入前以 `6f5add2` 刷新至 `main` @ `6f0b4df`，随后经 **`d95be45` `Merge branch 'feature/TASK-067' into main`** 合入。核对 `git merge-base --is-ancestor 6f5add2 main` = 是、`git merge-base --is-ancestor 8141275 main` = 是；合入相对原 `main` 未改动 `shared/`、`server/`、`cron-worker/`。`Merged` 由 `Pending` 据实更新为 `d95be45`。

> 2026-11-06（Orchestrator 如实登记 TASK-068 首轮 Fail → 返工 → 待复检）：分支 plan §12.10 记录首轮独立 Reviewer 判定 **`Fail`**——F-01（BLOCKER，资产级 `null` 组触发 `null.toString()` 致 `GET /api/portfolios/summary` 500）、F-02（MAJOR，AC-03 测试无法证伪物理删除）、F-03（MINOR）。Implementer 于 `3226dd4` 返工（plan §11.7）：`unreadByPortfolio` 加 `_id!=null` 守卫、stub 补 `{_id:null}` 样本、增 `deletePortfolioCascade` 契约测试，两条负向对照可 FAIL，`test:server` **240/240**。可审对象由 `9c8c808` 更新为 **`3226dd4`**；状态保持 `Reviewing`（第二轮）。**返工后复检结论尚未产生**，Orchestrator 不替 Reviewer 出具 verdict、不改 AC/Scope/代码、不填 `Merged`。此前 BOARD/卡「待首次复核、`9c8c808`、239/239」为历史首轮事实，已更正。

> 2026-11-06（Orchestrator 登记 TASK-068 二审复检 → Completed → 合入）：plan §12.11 记录独立 Reviewer 对返工提交 `3226dd4` 的二审判定 **`Pass with issues`**——F-01（BLOCKER）加守卫后 P1 探针 `NO_CRASH`、NC-F01 负向对照 FAIL 证断言有牙；F-02（MAJOR）契约测试在临时加 `AlertEvent.deleteMany` 时 FAIL、还原后 PASS；AC-01～AC-07 全满足，`test:server` 240/240 亲跑。残余 MINOR F-03（mock 求值器）/ F-05（哈希口径）记录在案；MAJOR F-04（返工提交改写 §12.2 哈希表）已由 Reviewer 恢复原值并留痕。按 Human 2026-11-06「067、068 已完成代码合并和提交」指令与 git 证据登记 `Reviewing → Completed`、**`Merged` = `6f0b4df`**（`Merge branch 'feature/TASK-068' into main`；`git merge-base --is-ancestor 84a50d4 main` = 是），计划同步 `Approved → Completed`、§13 结案记录已补。合入相对原 `main` 仅 7 文件，未触及 `client/`、`cron-worker/`、模型与迁移。

> 2026-11-06（Orchestrator 登记 TASK-066 复核 → Completed）：分支 plan §12 记录独立 Reviewer 判定 **`Pass with issues`**——Story AC-05～AC-13（含 G-2 的 AC-05 视口）逐条满足；首轮发现 **F-01（MAJOR）**：健康表用本地时区格式化 `lastExecutedAt` 且带「（N 天前）」后缀，与 067 组合卡 UTC 日期可能相差一天。按 Human 裁决（R2=Option A 去后缀、R1 抽唯一 UTC formatter 共用），Implementer 于 **`353d583`** 整改：`priceDisplay.js` 新增 `lastRebalanceDateStr`（唯一 UTC 实现），066/067 共用、`null → 从未`；复审 `verify066.cjs` **34/34**（含 5 条 F-01 断言）、双时区探针 4/4、NEG-A/NEG-B 均 FAIL 后还原，**F-01 收敛、无 BLOCKER/未决 MAJOR**，剩 MINOR F-02～F-05 记录在案。按 Human 2026-11-06「066 已检验通过」指令登记 `Reviewing → Completed`，计划同步 `Approved → Completed` 并补 §13。**合入登记（2026-11-06，Human）**：经 **PR #42** 合入 `main`，合并提交 **`af1f4d2`**（分支合入前以 `f8903c3` merge 最新 `main`）；`git merge-base --is-ancestor f8903c3 main` = 是。**`Merged` 由 `Pending` 据实更新为 `af1f4d2`**。

> 2026-11-06（Orchestrator 登记 TASK-069 → Planning）：按 Human 指令启动 US-004 收尾卡。硬前置「TASK-065 + TASK-068 已合入 `main`」**已满足**（`6f556aa` / `6f0b4df`）。任务内容已存在（`TASK-069.md` §3 三条 AC、Scope 仅 `API_CONTRACT.md` + Spec 状态行/§11、零代码改动），此前无 Status 字段、不属实施队列，现登记 `Planning`（[STATES.md §4](./os/process/STATES.md#4-谁可以改变状态)）。**计划仍为 `Draft`**：`Draft → Approved` 仅 Human，批准后方可登记 `Implementing` 并派发 Implementer；Implementer 提示词已按「先核对批准记录」写入，未获批准前不得开工。

> 2026-11-06（Human 批准计划 → Orchestrator 登记 TASK-069 → Implementing）：Human 原话「批准 069 计划」，据 [STATES.md §4](./os/process/STATES.md#4-谁可以改变状态) 登记 ExecPlan **`Draft → Approved`**、Task **`Planning → Implementing`**，计划 `Branch / Base` 更新为 `feature/TASK-069`（基线 `main` @ `281b425`）。本卡为 US-004 收尾：仅改 `API_CONTRACT.md` 与 Spec 状态行/§11，零代码改动。**Orchestrator 开工前核对发现**：契约行已含 065 的四字段与 `drift` 子字段，但**缺 `stats.unreadAlertCount`**（代码 `summary.js:151` 已返回、066/067 前端在用），故提示词要求「逐字段比对 + 最小补齐」，不做整段重写。派发后剩：实现 → 独立复核（极小文档变更可按 REVIEWER §5.3 由未参与实现的 Human 直接复核）→ Human 合入并登记 `Merged`。

> 2026-11-06（Orchestrator 登记 TASK-069 复核 → Completed）：分支 plan §12 记录独立 Reviewer 判定 **`Pass with issues`**——US-004/AC-16 与卡内 AC-01～AC-03 逐条满足，`stats` 字段集与代码**逐字一致**（Reviewer 以 `fieldset.cjs` 从代码派生期望集机读比对），零代码改动、范围与单一归属守住、AC 未被改写；**BLOCKER 0 / MAJOR 0 / MINOR 3**：F-01（交付证据不足——`docs:check` 只校验链接与 Status 枚举，删字段或写错量纲仍 0 ERROR，Reviewer 已独立补验，建议后续补机读断言）、F-02（AC-16/AC35 字面「响应示例」与文档结构不符，归 PM 改口径）、F-03（Spec 落地记录未列 066/B6~B14、B5 是否含 `SERVER.md` 存疑，归 PM/Planner 收窄）。按 Human 2026-11-06「069 检验通过」指令登记 `Reviewing → Completed`，计划同步 `Approved → Completed` 并补 §13。核验：`docs:check` **134 文档 / 1364 链接 / ERROR 0 / WARN 0**（Implementer 与 Reviewer 各自亲跑一致）；`git diff --stat -- shared/ server/ client/ cron-worker/` 空。**合入登记（2026-11-06，Human）**：经 **PR #43** 合入 `main`，合并提交 **`d42a1bb`**（`Merge pull request #43 from tongweizj/feature/TASK-069`；分支 tip `a93c90b` 为 `main` 祖先）。**`Merged` 由 `Pending` 据实更新为 `d42a1bb`**，计划 §13 同步。

> 2026-11-06（US-004 交付完成登记）：五卡 **065/066/067/068/069 全部 `Completed` 且全部合入 `main`**（`6f556aa` / `af1f4d2` / `d95be45` / `6f0b4df` / `d42a1bb`），全部经独立 Reviewer 复核（065/067/068/069 `Pass with issues`，066 `Pass with issues` 且 F-01 MAJOR 已整改收敛；无未决 BLOCKER/MAJOR）。按 [STATES.md §2.2](./os/process/STATES.md#22-story-状态)「全部 Task 完成只触发整体验收，不自动关闭 Story」：**Story 状态仍 `Planning`**，`Story → Reviewing`（整体验收）归 PM、`Story → Completed` 与归档只有 Human。遗留均为记录层 MINOR，不阻塞验收。

> 2026-11-08（PM 登记 US-004 → `Reviewing`）：五卡全部 `Completed` 且全部合入 `main`（065 `6f556aa`、066 `af1f4d2`、067 `d95be45`、068 `6f0b4df`、069 `d42a1bb`），**必要 Task 完成、AC 证据齐备**，按 [STATES.md §2.2/§4](./os/process/STATES.md#22-story-状态) 由 PM 登记 `Story → Reviewing`（整体验收）。PM 在 Story §8 汇总：**AC-01～AC-20 逐项满足**（每项均有独立 Reviewer 复核；068 首轮 `Fail` 已返工二审复检收敛、066 F-01 MAJOR 已整改复审收敛），团队完成标准满足；残余 MINOR 记录在案、不阻塞。

> 2026-11-08（Human 关闭 US-004 → `Completed` + 归档）：依据 Human 指令「Story → Completed」，按 [STATES.md §4](./os/process/STATES.md#4-谁可以改变状态) 登记 `Story → Completed`（只有 Human 可关闭）。交付摘要、验收结论、对应版本与证据已由 PM 在 Story §8/§9 补齐；Orchestrator 核对下挂五卡处置（全部 `Completed`、全部合入 `main`、无未决 BLOCKER/MAJOR）与引用后，将专属过程目录整体移动：`docs/development/delivery/US-004/` → `docs/development/delivery/completed/US-004/`，同步修复被移文件内部相对链接（+1 层）、Story、BOARD、Spec、TASK-070 等外部引用与索引；`docs:check` **0 ERROR / 0 WARN**。本次为**移动而非删除**，历史与验收证据完整保留。

### US-001（已归档）

| 项目 | 当前情况 |
|---|---|
| Story / 用户价值 | [US-001](./development/requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)：首屏判断五类任务运行与数据完整性（FS P0） |
| Status | **Completed**（2026-11-05，Human 确认「us 完成了」；七张任务卡全部 `Completed` 并合入 `main` @ `d1b1e4a`） |
| 交付目录 | [US-001 过程资料](./development/delivery/completed/US-001)（**已归档**，14 个文件：6 张任务卡 + 6 份计划全部 `Completed`、1 份 Planner 交接、1 份回交记录；复用 054 保持唯一原位置） |
| PM / 验收负责人 | PM（需求整理与 Story 验收汇总）/ Human（已关闭） |
| 下一步 | 剩余一项独立动作：[Story §8.1 六项上线后验证待办](./development/requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md#81-上线后验证待办承接自各任务卡的残余-minor)（V-01～V-06），需真实调度周期，完成时在 Story §8 补记录，不重开各 Task |
| 阻塞 / 待决策 | **无阻塞。** 说明：Story 级 11 项 AC 的**端到端串联验收未单独执行**——本轮结论依据 Human 明示关闭（属 Human 授权），逐条 AC 的部分由各任务卡的独立审查覆盖。验收性质已在 Story §8 顶部声明。若要补做端到端验收，属可选加强项，非阻塞 |

> **归档说明（2026-11-05）**：US-001 过程目录已用 `git mv` 移到 `development/delivery/completed/US-001/`（14 文件，移动非删除）。目录内相对路径与 11 个外部引用方均已同步，`docs:check` 0 ERROR。

### US-001 下挂 Task（已归档）

| Task | 工作 | 覆盖 Story AC | Status | Owner | 依赖 / 下一步 | ExecPlan |
|---|---|---|---|---|---|---|
| [TASK-053](./development/delivery/completed/US-001/TASK-053.md) | 看板入口及骨架 | AC-01、02、07、10、11 | Completed | — | **已结案（2026-11-04）**：实现 `c858521`，经 **PR #41** 合入 `main`（`ecd9314`）；33/33 + 7/7 PASS，提交后复验 build 0 / eslint 0-0 / check:ignored PASS；Reviewer `Pass with issues`，F-01/F-02 已修复，F-03 已关闭 | [Completed](./development/delivery/completed/US-001/TASK-053-plan.md)，仅053设计 |
| [TASK-054](./development/tasks/completed/TASK-054-cron-status-aggregate-api.md) | 聚合快照读侧（既有产出） | AC-02～08、10、11 的读侧支撑 | Completed | 既有结案记录 | 复用证据前核对真实项目版本 | [已归档计划](./development/exec-plans/completed/TASK-054-cron-status-aggregate-api.md) |
| [TASK-055](./development/delivery/completed/US-001/TASK-055.md) | 价格完成度 | AC-03、04、07、10 | Completed | — | **已结案并合入（2026-11-04）**：`Merged` = **Fast-forward `83e9971`**（无 merge commit）；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，11 条 AC 中 10 条满足 + AC4/6/7/9 负向对照成立；AC8① 归 063。⚠️ 文档曾引用 rebase 前旧 SHA `3991df8`/`0f697fd`（不在 main），已更正 | [Completed](./development/delivery/completed/US-001/TASK-055-plan.md)（§12 审查、§13 结案） |
| [TASK-056](./development/delivery/completed/US-001/TASK-056.md) | 系统状态色与图例 | AC-02、09 | Completed | — | **已结案并合入（2026-11-04）**：`feature/TASK-056` @ `31b516e` → `Merged` **`53edb8e`**；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，AC1～AC9 全满足 + AC2/AC3 负向对照成立，053 回归 PASS；余 3 项 MINOR。`status*` token 与 `statusTone.js` 已在 `main` | [Completed](./development/delivery/completed/US-001/TASK-056-plan.md)（§12 审查、§13 结案） |
| [TASK-057](./development/delivery/completed/US-001/TASK-057.md) | 结果写侧及再平衡父任务 | AC-05～08 的写侧支撑 | Completed | — | **已结案并合入（2026-11-05）**：`Merged` = **`1e421db`**（merge commit，分支 tip `54136c2`）；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，AC1～AC12 全满足 + AC2/AC5/AC7 负向对照成立；库前后 276/0/0 未污染 | [Completed](./development/delivery/completed/US-001/TASK-057-plan.md)（§12 审查、§13 结案） |
| [TASK-063](./development/delivery/completed/US-001/TASK-063.md) | 五卡接入、总览与刷新 | AC-02、05～08、10、11 | Completed | — | **已结案并合入（2026-11-05）**：`Merged` = **`d1b1e4a`**（merge commit，分支 tip `1a5a666`）；Reviewer **`Pass with issues`**，无 BLOCKER/MAJOR，AC1～AC8 全满足 + 四处负向对照（含「unknown 不假绿」5 条）；053/056 组件改动判为授权内必要扩展、缺省零回归 | [Completed](./development/delivery/completed/US-001/TASK-063-plan.md)（§12 审查、§13 结案） |
| [TASK-064](./development/delivery/completed/US-001/TASK-064.md) | 读侧结果兼容与skip观测 | AC-02、05～08、11 | Completed | — | **已结案并合入（2026-11-05）**：`Merged` = **`cde811f`**（merge commit，分支 tip `b23abb9`）；Reviewer `Pass with issues`，无 BLOCKER，AC1～AC6 全满足 + 四处负向对照成立；库 276/0/0 未污染，detail 零回归。F-01（基点落后）已随 merge 闭环，`c11bb64` 未回退 | [Completed](./development/delivery/completed/US-001/TASK-064-plan.md)（§12 审查、§13 结案） |

> 2026-10-30：Orchestrator 按本轮 Human 指令及 STATES.md §4 登记063/064，并接收053/055/056/057规划，将四卡原BACKLOG登记为Planning。各卡记录依据，Owner均待指派；没有卡进入Implementing。

> 随后Human仅批准053当前设计，Orchestrator代登记其计划Approved；真实源码只读核对已完成，但工作区未就绪，Task/Story仍Planning，未指派Implementer。其他计划、D-01～D-04、054完成及Merged记录未变。

> 2026-10-31：Orchestrator 按 STATES.md §4「Task → Reviewing：Implementer 提供改动清单、自测证据、可审对象和已知妥协」核对 TASK-053，三项齐备，登记 `Implementing` → **`Reviewing`**，Owner 改为「待 Human 结案」。核对事实：分支 `feature/TASK-053` @ `6e013d7` 存在；自测 33/33 + 7/7 PASS、build exit 0、eslint 0-0；Reviewer 首轮 `Fail`（F-01/F-02）→ 修复后复检 `Pass with issues`。**本轮未重跑验证**（同基线同一交付已有独立复验证据，按复用原则引用）；未改 AC/Scope/代码；**未提交、未合入、未填 `Merged`、未关闭**——交付仍是工作区未提交改动。Story 状态未动（Story → Implementing 属 PM 权限）。

> 2026-10-31（续）：Human 指示提交 TASK-053。已提交 `c858521`（17 文件，+2035/−129），工作区随之干净。**提交后复验**（此前交付仅为工作区改动，F-01 的实质风险是"提交后是否还能构建"）：`npm run build --workspace client` → exit 0 / 2429 modules；`eslint "src/**/*.{js,*.jsx}"` → 0 error 0 warning；`npm run check:ignored` → PASS。`RawLogView.jsx` 确认已入库（`git ls-tree` 命中 1），F-01 关闭。**未 push、未合入 `main`、未填 `Merged`、未关闭 Task**——`Merged` 与关闭仍归 Human。

> 2026-11-06（Orchestrator 登记）：TASK-065 实现交付，`Implementing` → **`Reviewing`**，交 Reviewer 独立审查；`Merged` 仍为 `Pending`（合入与 `Completed` 关闭归 Human）。066/067 仍 `Implementing`、068/069 待登记（068 硬串行等 065 合入）。**本注记属过程记录，下挂 Task 的完整状态以 [US-004 下挂 Task](#us-004-下挂-task) 表为准。**

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
| 全部已登记 Story（排除取消） | 2 | 0 | 0 | 0 | 0 | 0 | 2 |
| US-001 已关联 Task（已归档，全 Completed） | 7 | 0 | 0 | 0 | 0 | 0 | 7 |
| US-004 已关联 Task | 5 | 0 | 0 | 0 | 0 | 0 | 5 |
| 尚未关联 Story 的未完成 Task | 5 | 1 | 4 | 0 | 0 | 0 | 0 |

> 统计来自卡片；旧词按 STATES.md §7.1 映射，不证明当前实施授权。已关联任务不重复计入未关联任务。US-001 七张卡全部 `Completed` 并已合入 `main`、过程目录已归档；TASK-054 的既有 Completed 计为 1 个支撑任务完成，不表示 US-001 已验收（Story 另由 Human 关闭）。US-004 的 5 张卡全部 `Completed` 且全部合入 `main`：065（`6f556aa`）、066（`af1f4d2`，PR #42）、067（`d95be45`）、068（`6f0b4df`）、069（`d42a1bb`，PR #43）；**US-004 已于 2026-11-08 由 Human 关闭（`Completed`）并归档至 `delivery/completed/US-004/`**。共 13 条历史完成记录保留作证据索引，与本 Story 进度不可相加。

## Story Backlog

| Story | 用户价值 | Priority | 准备情况 | 依赖 / 待决策 |
|---|---|---|---|---|
| [US-002](./development/requirements/stories/active/US-002-board-drilldown-and-staleness.md) | 从看板追到原因：停滞提示 + 再平衡分发记录页 + 原始日志下钻（承接 US-001 未含的 P1 需求 R6/R7/R10） | High | 可启动；待 Planner 拆 Task | 依赖 TASK-057 合入（AC-05～09 三列）；OQ-01 缓冲值、OQ-02 单日 vs 多日矩阵、OQ-03 停滞提示形态未决 |
| [US-003](./development/requirements/stories/active/US-003-portfolio-detail-overview-ia.md) | 组合详情「总览」：目标 vs 实际 / 偏离原因 / 删除入口 / 配置分层（Spec 交付单元 A，纯客户端） | High | 可启动；Spec 已 `Approved` 但从未拆 Task | 顺序已裁（US-004 先行，US-003 侧 OQ-01 = US-004 侧 OQ-02）；AC-16 的 `lastExecutedAt` 依赖 US-004 的 B1，因 US-004 先行故无需临时隐藏；余 OQ-03（`?record=` 上限）待确认 |
| [US-004](./development/requirements/stories/active/US-004-dashboard-portfolio-health.md) | Dashboard 组合健康表 + 分币种小计 + 组合卡四格（Spec 交付单元 B，改 `shared`/`server`） | High | **实施中（Story 仍 `Planning`；065/067 `Completed`、066/068 `Reviewing`、069 待登记）** | 交付目录 [delivery/completed/US-004](./development/delivery/completed/US-004)（TASK-065～069）。**2026-11-06**：065 已合入 `main`（`6f556aa`）；067 已合入 `main`（`d95be45`）并结案；**066 已交付转 `Reviewing`**（29/29 PASS、D-02 落实）；068 已交付转 `Reviewing`。OQ-01/02/04/05 全部已裁决，G-1/G-2 覆盖缺口已闭合。069 收尾（等 065+068 合入） |
| [US-005](./development/requirements/stories/active/US-005-transaction-query-filters.md) | 交易流水按时间/类型/多组合筛选，条件写进 URL | Medium | 可启动；复用既有 TASK-045（Backlog） | OQ-01 多值参数形态、OQ-02 是否加索引未决；需 `Approved` ExecPlan |

> PM 按已确认的优先级维护队列，原有 Task 与 Spec 不自动变成 Story。Story 文档入口见 [STORIES.md](./development/requirements/stories/STORIES.md)；状态统一按 STATES.md §6 汇总。
>
> 2026-11-05（PM 登记预研）：按新规则把 **US-004 由 `Backlog` 登记为 `Planning`（预研 Story）**。依据：Planner 已拆出 TASK-065～TASK-069 并回写 Story §6，符合 [STATES.md §2.2](./os/process/STATES.md#22-story-状态)「Planning = 已定优先级、正在完善范围与任务拆分」与 §4「Story → Backlog / Planning 归 PM」。**预研不进入实施**——Task 状态登记仍归 Orchestrator，US-004 不会被写成 `Implementing`。同轮核对 AC 覆盖，发现两处缺口（AC-14 `cron-worker` 零改动无卡承接、AC-05 的 1440×900 不滚动断言未覆盖），已记入 Story §6 交回 Planner，**PM 未自行补卡、未改 AC**。US-001 仍是唯一「当前 Story」。

> 2026-11-05（PM 建卡）：按 Human 指示把 `docs/development/requirements/specs/` 的遗留需求整理为 Story，新建 **US-002～US-005** 四张卡。来源分工：US-002 ← `FS-cron-worker-status-board` 的 P1（C-06/C-07/C-08，US-001 明确排除在范围外）；US-003 / US-004 ← `FS-portfolio-ia-cleanup` 的交付单元 A / B（该 Spec 2026-10-26 已 `Approved`，但从未拆过 Task，代码零实现）；US-005 ← `FS-transaction-query-filters`（复用既有 TASK-045）。**未改动任何已有卡的状态、优先级或范围**；规格 P2 的 C-09 历史趋势、C-10 launchDate 引导不建 Story，留 Spec 作 Future 登记。

## 已完成 Story

| Story | 交付结果 | 完成日期 | 验收记录 |
|---|---|---|---|
| [US-001](./development/requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md) | 日志频道 `/logs` 任务运行看板：三 tab + 五卡真实数据 + 总览 + 状态色图例 + 手动刷新 + 四型空态 + 错误分层；后端补 `taskruns.result` / `taskskips` / 再平衡父任务 / 读侧归一化。七张任务卡全部 `Completed` 并合入 `main` @ `d1b1e4a` | 2026-11-05 | [Story §8](./development/requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md#8-整体验收记录)（Human 授权通过，含验收性质声明）· 遗留 [§8.1 V-01～V-06](./development/requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md#81-上线后验证待办承接自各任务卡的残余-minor) |

## 已退出 Story

| Story | 退出日期 | 原因 / Human 决定 | 归档链接 |
|---|---|---|---|
| — | 暂无 | — | — |

## 未关联 Story 的任务

> 兼容既有任务与独立维护工作。US-001 已关联 TASK-053～057及063/064（其中054保持既有完成记录）；反向关联已核对，登记结果见上表。其余未确认关联的任务仍在下表。
>
> **2026-11-09 增补跟踪**（**2026-11-11 更新**）：TASK-071、TASK-072 已完成并合入 `main`（PR #53 / #52），卡片与计划已归档，见「历史完成 Task」表。下表只保留未完成项。**更正**：046 此前被判断为「已实现、仅需收口」，经端到端复核证伪——投影缺 `portfolioId` 导致去重失效、测试为假阳性，缺陷仍在。
>
> **议定推进顺序（2026-11-11 更新）**：`TASK-051` → `TASK-047` → `TASK-046`（修复投影）；已完成的 `TASK-072`、`TASK-071` 见「历史完成 Task」；`TASK-062` / `TASK-070` 等 Human 审阅；`TASK-045` 保持 Backlog。**完成一张即归档一张**（`tasks/active` → `tasks/completed`，计划 `exec-plans/active` → `exec-plans/completed`），**不迁入 `delivery/`**（该目录只属于 Story 过程资料）。

| Task | 工作 | Story | Status | Priority | 待处理 / 下一步 |
|---|---|---|---|---|---|
| [TASK-045](./development/tasks/active/TASK-045-transaction-query-filters.md) | 交易流水查询与筛选 | 未关联 | Backlog | Medium | 待排期。前置未决：跨组合+时间范围查询无索引前缀（`transaction.js` 复合索引均以 `portfolioId` 开头），需先定索引方案 |
| [TASK-046](./development/tasks/active/TASK-046-csv-import-dedup.md) | CSV 二次导入未去重（幂等失效） | 未关联 | Planning | High | **小计划已起草待批准**（`TASK-046-csv-import-dedup-plan.md`，Draft）。**缺陷仍在（2026-11-11 端到端复核更正）**：`transaction.service.js:233-235` 的 `select()` 投影不含 `portfolioId`，`:237-240` 拼键得到 `undefined`，与库比对永不命中；`transaction.enhanced.test.js` 的 mock 返回了投影外字段 → **假阳性**。实测连续导入两次仍 `imported=1`。需先修投影 + 按 AC5 先验红重写用例（详见卡 §11） |
| [TASK-047](./development/tasks/active/TASK-047-review-followups.md) | TASK-044 审查遗留整改（M-1/M-2/M-5/M-6） | 未关联 | Planning | High | **计划已起草待批准**（`TASK-047-review-followups-plan.md`，Draft）； **仍未修**：M-2 `WRITABLE_FIELDS` 仍含 `portfolioId`（可静默把交易迁到别的组合）；M-1 `Sidebar.isPortfolioListPath` 未覆盖 `/portfolios/:id/transactions`。Human 已裁定 M-2 = 后端拒绝改写 |
| [TASK-051](./development/tasks/active/TASK-051-fx-rate-direction.md) | 家庭折算汇率方向反了（`rateToCny` 存成 `1 CNY = X 外币`） | 未关联 | Planning | High | **计划已起草待批准**（`TASK-051-fx-rate-direction-plan.md`，Draft）；历史数据按 Human 决定 **不迁移**（只修采集）。 **仍未修**：`fxRate.service.js:78-96` 采集结果未取倒数直接入库，`familySummary` 按乘法折算 → 家庭总资产被算成约 1/24；真实库已有反向数据；当前无该模块测试。**最高优先** |
| [TASK-062](./development/tasks/active/TASK-062-agent-role-boundary-and-overhead.md) | Agent 角色权限边界与执行开销整改 | 未关联 | Planning | High | 待审阅范围及裁决；提案未批准，不作为现行规则 |
| [TASK-070](./development/tasks/active/TASK-070-dsh-agent-teams-workflow-proposal.md) | 基于 DSH Agent Teams 插件的工作流适配（提案） | 未关联 | Planning | High（建议，待 Human 定） | 待 Human 审阅范围与 AC；仅机制核对 + 工作流草案，未启用插件、未改规则，不作为现行规则；与 TASK-062 另起新卡不合并 |

## 历史完成 Task

> 本表汇总任务卡与 Human 的合入登记。权限与字段含义见 [STATES.md](./os/process/STATES.md) §1 / §4；仅 Human 可填写 Merged。

| Task | 工作 | 完成日期 | Merged | 记录 |
|---|---|---|---|---|
| TASK-071 | 代码结构清理（死代码 / 命名 / 路由 / 目录，零行为变更） | 2026-11-11 | `Merged` #53 `ff118f4` | [任务卡](./development/tasks/completed/TASK-071-codebase-structure-cleanup.md) · [计划](./development/exec-plans/completed/TASK-071-codebase-structure-cleanup-plan.md)（M1～M10 分批；16 个零引用文件 + IFetcher 删除；`api.js→api.client.js` 等 rename；lint 0 error / `test:server` 248 pass / `docs:check` 0 ERROR；残余 D-3 未执行） |
| TASK-072 | API 契约残差（lint 归零 / 8 条契约测试 / 形状例外文档） | 2026-11-11 | `Merged` #52 `6421d4f` | [任务卡](./development/tasks/completed/TASK-072-api-contract-residuals.md) · [计划](./development/exec-plans/completed/TASK-072-api-contract-residuals-plan.md)（`test:server` 240→248；新增 `api-contract.crud.test.js`；`/api/users` 保持 `{items}` 并写入契约） |
| TASK-065 | `summary` 四字段（US-004 B1~B4：lastExecutedAt / pendingRebalanceCount / drift.dueByTime / drift.overThresholdCount） | 2026-11-06 | `Merged` `6f556aa` | [任务卡](./development/delivery/completed/US-004/TASK-065.md) · [计划](./development/delivery/completed/US-004/TASK-065-plan.md)（US-004 过程目录；分支 `feature/TASK-065` @ `5f807a3`，原 `8fde289` rebase；Reviewer `Pass with issues`，Human 确认验收通过。`2026-11-06` 经 `Merge branch 'feature/TASK-065' into main` 合入，`merge-base --is-ancestor 5f807a3 main` = 是） |
| TASK-067 | `PortfolioCard` 四格（US-004 B15：总市值/持仓资产/待办/上次再平衡） | 2026-11-06 | `Merged` `d95be45` | [任务卡](./development/delivery/completed/US-004/TASK-067.md) · [计划](./development/delivery/completed/US-004/TASK-067-plan.md)（US-004 过程目录；Reviewer `Pass with issues`，无 BLOCKER/MAJOR；分支 tip `6f5add2` 经 `d95be45` 合入 `main`，`merge-base --is-ancestor 6f5add2 main` = 是） |
| TASK-064 | cron 状态读侧契约兼容与跳过观测（FS **C-05** 读侧） | 2026-11-05 | `Merged` `cde811f` | [任务卡](./development/delivery/completed/US-001/TASK-064.md) · [计划](./development/delivery/completed/US-001/TASK-064-plan.md)（仍在 US-001 过程目录；merge commit `cde811f`，分支 tip `b23abb9`） |
| TASK-063 | 五卡真实数据接入、总览与手动刷新（FS **C-06/C-07**） | 2026-11-05 | `Merged` `d1b1e4a` | [任务卡](./development/delivery/completed/US-001/TASK-063.md) · [计划](./development/delivery/completed/US-001/TASK-063-plan.md)（仍在 US-001 过程目录；merge commit `d1b1e4a`，分支 tip `1a5a666`） |
| TASK-057 | `taskruns` 数据契约增强（`result` / `SKIPPED` / 再平衡父任务）（FS **C-05**） | 2026-11-05 | `Merged` `1e421db` | [任务卡](./development/delivery/completed/US-001/TASK-057.md) · [计划](./development/delivery/completed/US-001/TASK-057-plan.md)（仍在 US-001 过程目录；merge commit `1e421db`，分支 tip `54136c2`） |
| TASK-055 | 价格同步「数据态完成度」展示（FS **C-03**） | 2026-11-04 | `Merged` `83e9971` | [任务卡](./development/delivery/completed/US-001/TASK-055.md) · [计划](./development/delivery/completed/US-001/TASK-055-plan.md)（仍在 US-001 过程目录；**Fast-forward 合入，无 merge commit**；旧 SHA `3991df8`/`0f697fd` 为 rebase 前，不在 main） |
| TASK-056 | 看板系统状态色语义与图例（FS **C-04**） | 2026-11-04 | `Merged` `53edb8e` | [任务卡](./development/delivery/completed/US-001/TASK-056.md) · [计划](./development/delivery/completed/US-001/TASK-056-plan.md)（仍在 US-001 过程目录） |
| TASK-053 | 日志频道「任务运行看板」tab 骨架（FS **C-01**） | 2026-11-04 | `Merged` #41 | [任务卡](./development/delivery/completed/US-001/TASK-053.md) · [计划](./development/delivery/completed/US-001/TASK-053-plan.md)（仍在 US-001 过程目录，待 Story 关闭后整体归档） |
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
4. 交易线遗留修复（**2026-11-11 更新**）：`TASK-051`（汇率方向，P0 数据错误）→ `TASK-047`（M-2 归属守卫 + M-1 侧栏高亮）→ `TASK-046`（CSV 幂等**仍失效**，需修投影 + 重写假阳性用例）；~~`TASK-072`（API 契约残差）~~ ✅ **2026-11-11 合入 #52**；~~`TASK-071`（结构清理）~~ ✅ **2026-11-11 合入 #53**；~~`TASK-048`（分红标签）~~ ✅ **已完成 2026-10-20**
5. 家庭线遗留（本 FS 明确不做，需独立立项）：家庭总资产趋势（`FAM-01` P1，无快照模型）· 家庭视图按账户类型/大类分组（PRD `CM-05`/`AS-09` 声称已就绪，实现中 `familySummary` 既无 `accountType` 也无大类聚合）
6. dashboard，增加组合健康表，内容是最新的3个提示。一个url ，跳转全部


## 看板维护与交接

- PM 维护当前 Story、Story 队列及验收摘要；Orchestrator 按权限登记 Task 状态。先改权威卡片，再同步看板，不单独在看板推进状态。
- Human 确认优先级 → PM 准备 Story → Orchestrator 分派 Planner → Implementer 实施 → Reviewer 提供结论 → PM 汇总 Story 验收 → Human 关闭。
- Task 明确所属 Story 和覆盖的 AC；状态按卡片投影。必要 Task 完成后进入整体验收，不能自动关闭 Story。
- 已完成 Story 移入完成索引，取消项移入退出索引；下一项按已确认优先级选择。卡片搬迁时修复链接，保留编号与历史证据。
- 汇总按稳定编号去重，未知写“待确认”；独立维护任务不计入当前 Story。更新看板复用已有证据，不触发额外技术复验。

---

> **2026-11-06 看板整理（Orchestrator）**：修复此前多次编辑造成的表格结构错位——「归档说明」曾被插进 US-001 表格中间，把「阻塞 / 待决策」挤到表外；标题「US-004 下挂 Task」下却挂 US-001 的 053～064 表。本次拆成三个独立小节：US-004（当前推进）、US-004 下挂 Task（新增 065～069 表）、US-001（已归档）及其下挂 Task。同步更正过时事实：TASK-063 `Merged` 由 `Pending` → `d1b1e4a`；进度汇总按真实状态重算（065 `Reviewing`、066/067 `Implementing`、068/069 待登记）。`docs:check` 0 ERROR。
