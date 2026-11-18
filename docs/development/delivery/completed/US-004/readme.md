# US-004 · 交付详情（归档）

> 本文件保存 US-004 的**详情、下挂 Task 明细、开发进度说明**，2026-11-15 按看板新规则从 [BOARD.md](../../../../BOARD.md) 迁出。
> 规则：BOARD.md 只显示当前开发中 Story 的 n/m 进度与独立 Task；各 Story 详情归本目录 `readme.md`，见 [DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)。
> 状态权威仍是各卡片 `Status` 字段；本文件只作记录投影，不产生状态、不推进流程。
> 需求卡：[US-004](../../../../development/requirements/stories/active/US-004-dashboard-portfolio-health.md) · 进度 **5/5**（2026-11-08 Human 关闭 `Completed` 并归档）

## 交付概览

| 项目 | 当前情况 |
|---|---|
| Story / 用户价值 | [US-004](../../../../development/requirements/stories/active/US-004-dashboard-portfolio-health.md)：Dashboard 组合健康表 + 分币种小计 + 组合卡四格（Spec 交付单元 B） |
| Status | **`Completed`（2026-11-08，Human 关闭）**：五卡全部 `Completed` 且全部合入 `main`；整体验收通过（PM 汇总 2026-11-08，AC-01～AC-20 逐项满足）；过程目录已归档 |
| 交付目录 | [US-004 过程资料](../../../../development/delivery/completed/US-004)（TASK-065～069 卡与计划、并行方案、派发记录、提示词存档；2026-11-08 整体归档） |
| 并行实施 | 065 已合入 `main`（`6f556aa`）；066 已合入（`af1f4d2`，**PR #42**）；067 已合入（`d95be45`）；068 已合入（`6f0b4df`）；069 已合入（`d42a1bb`，**PR #43**）；五卡均结案 |
| 下一步 | **Story 已关闭**。仅剩可选收尾：069 MINOR F-02/F-03（AC 口径与 Spec 落地记录范围，PM/Planner 文档收窄）、066/068 记录层 MINOR；产品向待办（P1-1 徽标文案、`FAM-01` 家庭资产趋势、汇率面板归位）尚未建 Story |
| 阻塞 / 待决策 | **无阻塞、无待决。** |

## 下挂 Task（5 / 5 完成）

| Task | 工作 | 覆盖 Story AC | Status | Owner | 依赖 / 下一步 | ExecPlan |
|---|---|---|---|---|---|---|
| [TASK-065](TASK-065.md) | `summary` 四字段 | AC-01～04、AC-14 | **Completed** | — | **已结案（2026-11-06，Human 确认验收通过）**：分支 `feature/TASK-065` @ `5f807a3`（原 `8fde289` rebase）；Reviewer `Pass with issues`、无 BLOCKER，AC-01~04 与 AC-14 全满足。**`Merged` = `6f556aa`**（2026-11-06 `Merge branch 'feature/TASK-065' into main`；`merge-base --is-ancestor 5f807a3 main` = 是）。066/067 可解除降级态；068 前置已随本卡合入解除 | [Completed](TASK-065-plan.md) |
| [TASK-066](TASK-066.md) | Dashboard 健康表 + 分币种小计 | AC-05～13 | **Completed** | — | **已结案并合入（2026-11-06）**：独立 Reviewer **`Pass with issues`**，无 BLOCKER、无未决 MAJOR；F-01（MAJOR：本地时区格式化致 066/067 日期差一天 + 「N 天前」后缀）已由 **`353d583`** 整改（唯一 UTC `lastRebalanceDateStr`，两卡共用）并复审收敛；`verify066.cjs` **34/34**、build 0、eslint 0/0、5 条负向对照；剩 4 项 MINOR 记录在案。经 **PR #42** 合入 `main`（**`af1f4d2`**），合入前分支已 `f8903c3` 刷新 `main`；**`Merged` = `af1f4d2`** | [Completed](TASK-066-plan.md)（§11 实施、§12 审查、§13 结案） |
| [TASK-067](TASK-067.md) | `PortfolioCard` 四格 | AC-17、AC-18 | **Completed** | — | **已结案并合入（2026-11-06）**：Human 确认检验通过；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，AC-01～AC-04 全满足 + 3 条负向对照。分支 tip `6f5add2` 经 merge commit **`d95be45`** 合入 `main`；`git merge-base --is-ancestor 6f5add2 main` = 是，且合入未改动 `shared/`、`server/`、`cron-worker/`。**`Merged` = `d95be45`** | [Completed](TASK-067-plan.md)（§12 审查、§13 结案） |
| [TASK-068](TASK-068.md) | 删除组合后事件查询层过滤 | AC-19、AC-14 | **Completed** | — | **已结案并合入（2026-11-06）**：首轮独立复核 `Fail`（F-01 BLOCKER：`null.toString()` 致 summary 500；F-02 MAJOR：AC-03 断言无法证伪物理删除）→ `3226dd4` 返工（`_id!=null` 守卫、stub 补 null 样本、`deletePortfolioCascade` 契约测试，`test:server` **240/240**）→ 二审复检 **`Pass with issues`**（plan §12.11：F-01/F-02 已解决，AC-01～AC-07 全满足）。合入 **`6f0b4df`** `Merge branch 'feature/TASK-068' into main`（`merge-base --is-ancestor 84a50d4 main` = 是），合入仅 7 文件、未触 `client/`/`cron-worker/`；残余 MINOR F-03/F-05 记录在案 | [Completed](TASK-068-plan.md)（§11 实施、§12 审查、§13 结案） |
| [TASK-069](TASK-069.md) | 契约文档同步 | AC-16 | **Completed** | — | **已结案（2026-11-06，Human 确认检验通过）**：独立 Reviewer **`Pass with issues`**，无 BLOCKER/MAJOR，剩 MINOR F-01（交付证据不足：`docs:check` 无法发现字段缺失，Reviewer 已用 `fieldset.cjs` 独立补验）/ F-02（AC-16「响应示例」字面口径，归 PM）/ F-03（Spec 落地记录未列 066/B6~B14，归 PM/Planner）。交付 `ba5e5e1`：`API_CONTRACT.md:87` 补 `stats.unreadAlertCount`（B16 口径）+ 校正 4 处措辞；Spec 状态行 + `HD-15`。`docs:check` **0 ERROR / 0 WARN**、代码面 diff 为空。**`Merged` = `d42a1bb`**（**PR #43**，2026-11-06；`git merge-base --is-ancestor a93c90b main` = 是） | [Completed](TASK-069-plan.md)（§11 实施、§12 审查、§13 结案） |

> 派发依据：[US-004-04 派发记录](US-004-04-dispatch-record-2026-11-06.md)；并行编排见 [US-004-02](US-004-02-3card-parallel-plan.md)；三份 Implementer 提示词见 [US-004-prompts.md P-05/06/07](US-004-prompts.md)。068 不得与 065 同时派发。

## 开发进度记录

> 2026-11-06（Orchestrator 结案）：TASK-065 实现与独立审查均已完成，Reviewer 判定 **`Pass with issues`**、无 BLOCKER；Human 明确确认「065 已经验收通过」。按 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Reviewing → Completed`（Task → Completed 与关闭归 Human）。**`Merged` = `6f556aa`**：2026-11-06 经 `Merge branch 'feature/TASK-065' into main` 合入 `main`，`git merge-base --is-ancestor 5f807a3 main` = 是（此前登记的 `Pending` 已据实更正）。计划同步 `Approved → Completed`。US-004 仍 `Planning`（066 `Implementing`、067 `Reviewing`、068/069 待派），Story 不关闭；066 可解除降级态，068 硬串行前置已随 065 合入解除。AC-01~04 与 AC-14 已在 §8 标记已验证。

> 2026-11-06（Orchestrator 登记 TASK-067 → Reviewing）：Implementer C 交付提交 `8141275`。⚠️ **分支基线陈旧**：`feature/TASK-067` 基于旧 `main`（早于 `d345430`），不含 065 合入 `6f556aa`；故 `git diff main..feature/TASK-067` 会把 065 四字段+156 测试与 BOARD/US-004/prompt 文档**显示为删除**——属 fork 点陈旧的双向 diff 假象，**并非本卡删除它们**（两路合并会保留双方）。**评审与合入前必须先 `git merge main`（rebase 到当前 main）**，否则会回退 065 工作。封面四格源自 `stats`、零新增请求零服务端、降级态显示「—」/「从未」、临时内联文案待 066 的 `driftLabels.js` 合入后切换（D-02）、与 066 健康表逐字一致（D-01 解 B）。Orchestrator 不替代 Reviewer 结论 / Human 关闭。（后续：`434a323` 已 merge main 刷新基线、独立复核 `Pass with issues`、Human 确认结案，见 067 卡 §12/§13。）

> 2026-11-06（Human 合入 TASK-067）：分支在合入前以 `6f5add2` 刷新至 `main` @ `6f0b4df`，随后经 **`d95be45` `Merge branch 'feature/TASK-067' into main`** 合入。核对 `git merge-base --is-ancestor 6f5add2 main` = 是、`git merge-base --is-ancestor 8141275 main` = 是；合入相对原 `main` 未改动 `shared/`、`server/`、`cron-worker/`。`Merged` 由 `Pending` 据实更新为 `d95be45`。

> 2026-11-06（Orchestrator 如实登记 TASK-068 首轮 Fail → 返工 → 待复检）：分支 plan §12.10 记录首轮独立 Reviewer 判定 **`Fail`**——F-01（BLOCKER，资产级 `null` 组触发 `null.toString()` 致 `GET /api/portfolios/summary` 500）、F-02（MAJOR，AC-03 测试无法证伪物理删除）、F-03（MINOR）。Implementer 于 `3226dd4` 返工（plan §11.7）：`unreadByPortfolio` 加 `_id!=null` 守卫、stub 补 `{_id:null}` 样本、增 `deletePortfolioCascade` 契约测试，两条负向对照可 FAIL，`test:server` **240/240**。可审对象由 `9c8c808` 更新为 **`3226dd4`**；状态保持 `Reviewing`（第二轮）。**返工后复检结论尚未产生**，Orchestrator 不替 Reviewer 出具 verdict、不改 AC/Scope/代码、不填 `Merged`。此前 BOARD/卡「待首次复核、`9c8c808`、239/239」为历史首轮事实，已更正。

> 2026-11-06（Orchestrator 登记 TASK-068 二审复检 → Completed → 合入）：plan §12.11 记录独立 Reviewer 对返工提交 `3226dd4` 的二审判定 **`Pass with issues`**——F-01（BLOCKER）加守卫后 P1 探针 `NO_CRASH`、NC-F01 负向对照 FAIL 证断言有牙；F-02（MAJOR）契约测试在临时加 `AlertEvent.deleteMany` 时 FAIL、还原后 PASS；AC-01～AC-07 全满足，`test:server` 240/240 亲跑。残余 MINOR F-03（mock 求值器）/ F-05（哈希口径）记录在案；MAJOR F-04（返工提交改写 §12.2 哈希表）已由 Reviewer 恢复原值并留痕。按 Human 2026-11-06「067、068 已完成代码合并和提交」指令与 git 证据登记 `Reviewing → Completed`、**`Merged` = `6f0b4df`**（`Merge branch 'feature/TASK-068' into main`；`git merge-base --is-ancestor 84a50d4 main` = 是），计划同步 `Approved → Completed`、§13 结案记录已补。合入相对原 `main` 仅 7 文件，未触及 `client/`、`cron-worker/`、模型与迁移。

> 2026-11-06（Orchestrator 登记 TASK-066 复核 → Completed）：分支 plan §12 记录独立 Reviewer 判定 **`Pass with issues`**——Story AC-05～AC-13（含 G-2 的 AC-05 视口）逐条满足；首轮发现 **F-01（MAJOR）**：健康表用本地时区格式化 `lastExecutedAt` 且带「（N 天前）」后缀，与 067 组合卡 UTC 日期可能相差一天。按 Human 裁决（R2=Option A 去后缀、R1 抽唯一 UTC formatter 共用），Implementer 于 **`353d583`** 整改：`priceDisplay.js` 新增 `lastRebalanceDateStr`（唯一 UTC 实现），066/067 共用、`null → 从未`；复审 `verify066.cjs` **34/34**（含 5 条 F-01 断言）、双时区探针 4/4、NEG-A/NEG-B 均 FAIL 后还原，**F-01 收敛、无 BLOCKER/未决 MAJOR**，剩 MINOR F-02～F-05 记录在案。按 Human 2026-11-06「066 已检验通过」指令登记 `Reviewing → Completed`，计划同步 `Approved → Completed` 并补 §13。**合入登记（2026-11-06，Human）**：经 **PR #42** 合入 `main`，合并提交 **`af1f4d2`**（分支合入前以 `f8903c3` merge 最新 `main`）；`git merge-base --is-ancestor f8903c3 main` = 是。**`Merged` 由 `Pending` 据实更新为 `af1f4d2`**。

> 2026-11-06（Orchestrator 登记 TASK-069 → Planning）：按 Human 指令启动 US-004 收尾卡。硬前置「TASK-065 + TASK-068 已合入 `main`」**已满足**（`6f556aa` / `6f0b4df`）。任务内容已存在（`TASK-069.md` §3 三条 AC、Scope 仅 `API_CONTRACT.md` + Spec 状态行/§11、零代码改动），此前无 Status 字段、不属实施队列，现登记 `Planning`（[STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)）。**计划仍为 `Draft`**：`Draft → Approved` 仅 Human，批准后方可登记 `Implementing` 并派发 Implementer；Implementer 提示词已按「先核对批准记录」写入，未获批准前不得开工。

> 2026-11-06（Human 批准计划 → Orchestrator 登记 TASK-069 → Implementing）：Human 原话「批准 069 计划」，据 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态) 登记 ExecPlan **`Draft → Approved`**、Task **`Planning → Implementing`**，计划 `Branch / Base` 更新为 `feature/TASK-069`（基线 `main` @ `281b425`）。本卡为 US-004 收尾：仅改 `API_CONTRACT.md` 与 Spec 状态行/§11，零代码改动。**Orchestrator 开工前核对发现**：契约行已含 065 的四字段与 `drift` 子字段，但**缺 `stats.unreadAlertCount`**（代码 `summary.js:151` 已返回、066/067 前端在用），故提示词要求「逐字段比对 + 最小补齐」，不做整段重写。派发后剩：实现 → 独立复核（极小文档变更可按 REVIEWER §5.3 由未参与实现的 Human 直接复核）→ Human 合入并登记 `Merged`。

> 2026-11-06（Orchestrator 登记 TASK-069 复核 → Completed）：分支 plan §12 记录独立 Reviewer 判定 **`Pass with issues`**——US-004/AC-16 与卡内 AC-01～AC-03 逐条满足，`stats` 字段集与代码**逐字一致**（Reviewer 以 `fieldset.cjs` 从代码派生期望集机读比对），零代码改动、范围与单一归属守住、AC 未被改写；**BLOCKER 0 / MAJOR 0 / MINOR 3**：F-01（交付证据不足——`docs:check` 只校验链接与 Status 枚举，删字段或写错量纲仍 0 ERROR，Reviewer 已独立补验，建议后续补机读断言）、F-02（AC-16/AC35 字面「响应示例」与文档结构不符，归 PM 改口径）、F-03（Spec 落地记录未列 066/B6~B14、B5 是否含 `SERVER.md` 存疑，归 PM/Planner 收窄）。按 Human 2026-11-06「069 检验通过」指令登记 `Reviewing → Completed`，计划同步 `Approved → Completed` 并补 §13。核验：`docs:check` **134 文档 / 1364 链接 / ERROR 0 / WARN 0**（Implementer 与 Reviewer 各自亲跑一致）；`git diff --stat -- shared/ server/ client/ cron-worker/` 空。**合入登记（2026-11-06，Human）**：经 **PR #43** 合入 `main`，合并提交 **`d42a1bb`**（`Merge pull request #43 from tongweizj/feature/TASK-069`；分支 tip `a93c90b` 为 `main` 祖先）。**`Merged` 由 `Pending` 据实更新为 `d42a1bb`**，计划 §13 同步。

> 2026-11-06（US-004 交付完成登记）：五卡 **065/066/067/068/069 全部 `Completed` 且全部合入 `main`**（`6f556aa` / `af1f4d2` / `d95be45` / `6f0b4df` / `d42a1bb`），全部经独立 Reviewer 复核（065/067/068/069 `Pass with issues`，066 `Pass with issues` 且 F-01 MAJOR 已整改收敛；无未决 BLOCKER/MAJOR）。按 [STATES.md §2.2](../../../../os/process/STATES.md#22-story-状态)「全部 Task 完成只触发整体验收，不自动关闭 Story」：**Story 状态仍 `Planning`**，`Story → Reviewing`（整体验收）归 PM、`Story → Completed` 与归档只有 Human。遗留均为记录层 MINOR，不阻塞验收。

> 2026-11-08（PM 登记 US-004 → `Reviewing`）：五卡全部 `Completed` 且全部合入 `main`（065 `6f556aa`、066 `af1f4d2`、067 `d95be45`、068 `6f0b4df`、069 `d42a1bb`），**必要 Task 完成、AC 证据齐备**，按 [STATES.md §2.2/§4](../../../../os/process/STATES.md#22-story-状态) 由 PM 登记 `Story → Reviewing`（整体验收）。PM 在 Story §8 汇总：**AC-01～AC-20 逐项满足**（每项均有独立 Reviewer 复核；068 首轮 `Fail` 已返工二审复检收敛、066 F-01 MAJOR 已整改复审收敛），团队完成标准满足；残余 MINOR 记录在案、不阻塞。

> 2026-11-08（Human 关闭 US-004 → `Completed` + 归档）：依据 Human 指令「Story → Completed」，按 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Story → Completed`（只有 Human 可关闭）。交付摘要、验收结论、对应版本与证据已由 PM 在 Story §8/§9 补齐；Orchestrator 核对下挂五卡处置（全部 `Completed`、全部合入 `main`、无未决 BLOCKER/MAJOR）与引用后，将专属过程目录整体移动：`docs/development/delivery/US-004/` → `docs/development/delivery/completed/US-004/`，同步修复被移文件内部相对链接（+1 层）、Story、BOARD、Spec、TASK-070 等外部引用与索引；`docs:check` **0 ERROR / 0 WARN**。本次为**移动而非删除**，历史与验收证据完整保留。
