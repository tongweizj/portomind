# TASK-052 — Agent 运行规则（docs 治理层）审计与整改

> 历史审计记录：文内“原 L…”是当时版本的行号，链接仅定位当前文档；不能据此认定现行规则仍有该问题。未绑定固定版本的历史引用不作为当前实施或验收依据。

| 项 | 内容 |
|---|---|
| **Status** | **`Completed`（2026-10-29，Human 裁定结案）** —— 由 `Approved` 直接结案。**结案时仍有 4 条 AC 未满足，见 §13「结案豁免」**：AC1（`docs:check` 未建）、AC6（看板"阻塞中：无"与 3 张卡自述不一致）、AC7（`docs/issues.md` / `handbook/manual/Concept.md` 未登记索引）、AC9（无独立 Reviewer 复核记录）。**这 4 条属 Human 明示接受的残余项**，不是"已验证通过"。<br>本轮已闭环：**D1** 全量重写（根 `AGENTS.md` 464 → 158 行 v3）、**D2** 四份规范本地化、**D3** 两份空文件补齐（`REVIEWER.md` 189 行 `Approved v1` + `EXEC_PLAN_TEMPLATE.md` 254 行）、**D4** 断尾五节、**D5** `STATES.md`、**D6** State→Owner→证据映射、**D7** `Merged` 列、**D9** 模板 v2。**未做**：D12 `docs:check`（→ AC1）、D14 workspace 入口漂移、D17 归档路径、D18 元数据口径。<br>**`Merged` 状态：未合入**——本卡改动仍在工作区（分支 `chore/agent-rules-refactor`，未 commit），合入属 Human 动作，Done 表填 `Pending` |
| **Priority** | `High`（规则是每个 agent 会话的准入依赖；当前有 2 份 0 字节、1 份断尾、5 份未本地化模板被引为权威） |
| **Owner** | `Orchestrator`（分派与状态）/ `Implementer`（正文撰写）/ 独立 `Reviewer`（复核）/ `Human`（内容批准与合入） |
| **Type** | `Process / Docs`（纯文档 + 一个校验脚本，**不碰 `client/` `server/` `shared/` `cron-worker/`**） |
| **Created / Updated** | `2026-10-26` |
| **Related Product Spec** | `None` |
| **Related ADR** | `None` |
| **Execution Plan** | `Not required`（三批均为文档类改动，逐批提交 diff；如 Human 要求补，则由 Planner 按 [EXECUTION_PLANS](../../../os/process/EXECUTION_PLANS.md) 产出） |
| **Blocking Dependencies** | 本次切片**无前置**（`ARCHITECTURE.md` v2.0 已于 2026-10-26 重写，模块边界权威已就位）。**D1 全量重写已于 2026-10-29 解除对 TASK-062 的阻塞并完成**：Human 裁决改为「先重写、给 062 预留挂载点」，不再等 062 落地后在新增内容之上做减法。重写后 062 的文件分工相应收窄为「只填空位」，见 [TASK-062 §3](../active/TASK-062-agent-role-boundary-and-overhead.md) |
| **来源** | Human 于 2026-10-26 要求「阅读 `docs/` 下的文档，了解本项目的 agent 运行规则，指出好的地方与需要优化的地方」。本卡合并两轮审计：第一轮为全量通读 + `.git`/记忆交叉核对；第二轮为治理层逐文件核对与合规率统计 |

---

## 1. 问题

> **时效说明（2026-10-26 18:00 补注）**：本卡 §5 的审计条目（尤其 **D6 / D7 / D8 / D10**）中凡涉及 `TASK-050` 与「`main` 停在 `891d0f7`」的事实，**已随 `TASK-050` 结案（合入 `main` `cafcc5d`，PR #35）而失效** —— 现 `TASK-050` = `COMPLETED`、任务卡与 ExecPlan 已归档 `complete/`、`BOARD.md` 的 Active 已清空、Done 表补 `Merged` 落点、`readme.md` 活跃行已改「无」。**但这些失效恰好印证 D6/D7 本身的结论**（缺少 State→Owner→产物映射、`Completed` 不保证已合入、看板与事实会漂移），故整改条目**保留不动**，仅在此提示：实施整改时请以当前 `BOARD.md` / `main` 为基线核对，不要照抄本节引用的行号与状态。

本项目的 agent 运行规则实际由**三层**构成，而书面那层有明显空洞：

1. **书面层**（`docs/`）：[AGENTS.md](../../../../AGENTS.md)、[docs/readme.md](../../../readme.md)、[DOCS.md](../../../os/standards/DOCS.md)、[EXECUTION_PLANS.md](../../../os/process/EXECUTION_PLANS.md)、`docs/os/roles/*`、`docs/os/templates/*`、`docs/os/standards/*`；
2. **隐性层**：`.workbuddy/memory/MEMORY.md` 里沉淀的分支模型、审查方法、环境坑——**不受 docs 治理、不在索引内**；
3. **模仿层**：agent 实际按"上一份同类产物"的格式写作——模板为空时这是必然结果，也是 [§5.2](#52-任务卡模板合规率实测) 那些分叉的直接成因。

三层交集才是事实规则。书面层的缺陷不是"写错了"，而是**没写完、没本地化、没有机械校验**，于是流程设计（这部分相当成熟，见 [§6](#6-值得保留的优点)）与文档实现不在同一水平，且已知问题会长期悬置（如 [ARCHITECTURE.md](../../../os/architecture/ARCHITECTURE.md) 未填充一项自 2026-10-15 已记录，至今未动）。

**本卡的判断**：只读 `docs/` 的 agent 无法回答四个关键问题——(a) 哪个状态字符串是合法的；(b) Reviewer 能做什么、不能做什么；(c) 已完成的计划放在哪个目录；(d) `Completed` 是否意味着代码已合入主线。

---

## 2. 审计范围与方法

**范围**：`docs/` 全部 40 份 md（索引、流程、模板、角色、规范、手册、架构、ADR、产品线、任务卡、执行计划）+ 仓库根 [README.md](../../../../README.md)、[AGENTS.md](../../../../AGENTS.md) + `client/AGENTS.md`、`cron-worker/AGENTS.md` + `.workbuddy/memory/` 8 份记忆 + `.git/HEAD`、`.git/packed-refs`、`package.json`。

**方法**：全文通读（逐条留 file:line 证据）；对任务卡按 [TASK_TEMPLATE.md](../../../os/templates/TASK_TEMPLATE.md) 的 11 个顶层章节做逐卡计数；对看板/索引与卡片元数据做三方核对；对文档声称的代码事实（交易方向、目录名、脚本路径、环境变量）与源码/实际目录对账。

**限制**：本会话 `pwsh` 报 `SetNamedSecurityInfoW failed (Win32 5): grantWrite(D:\projects\portomind)`，无法执行 `git`/`npm`。故分支与提交状态取自 `.git/HEAD`（当前 `refs/heads/main`）、`.git/packed-refs` 与记忆记录交叉核对；未运行 build/test（本轮未改任何业务代码，也不需要）。

---

## 3. 关键结论：规则的"三层结构"

| 层 | 内容 | 状态 |
|---|---|---|
| **真实层（在用、项目特有）** | [docs/readme.md](../../../readme.md) 索引、[DOCS.md](../../../os/standards/DOCS.md) 单一归属、[BOARD.md](../../../BOARD.md) 看板、任务卡、ExecPlan、[ADR-002](../../../os/architecture/adr/ADR-002-single-scheduler.md)、四份 `manual/`、`handbook/product/lines/` | 质量高，且在持续维护（链接校验从 154 条做到 378 条、失效 0） |
| **空壳层（复制来、未本地化，却被引为权威）** | [AGENTS.md](../../../../AGENTS.md)（464 行，仍在用 `<PROJECT_NAME>` 占位）、[ARCHITECTURE.md](../../../os/architecture/ARCHITECTURE.md)（627 行示例）、[CODING.md](../../../os/standards/CODING.md)、[GIT.md](../../../os/standards/GIT.md)、[SECURITY.md](../../../os/standards/SECURITY.md)、[TESTING.md](../../../os/standards/TESTING.md)、[ADR-001](../../../os/architecture/adr/ADR-001-authentication.md)（363 行空模板）、[REVIEWER.md](../../../os/roles/REVIEWER.md)（0 字节）、[EXEC_PLAN_TEMPLATE.md](../../../os/templates/EXEC_PLAN_TEMPLATE.md)（0 字节） | 约 2 700 行不含本项目事实；其中 3 份是"被引用但内容为空/断尾" |
| **隐性层（事实规则，但不受治理）** | `.workbuddy/memory/MEMORY.md`（分支堆叠模型、审查方法、环境坑、已裁决"不改"清单） | 不在索引、不在 DOCS.md 适用范围、与书面规范冲突（如分支命名） |

---

## 4. 缺陷清单

> 每条只出现一次；后续章节按 ID 引用。行号以 2026-10-26 读取为准。

### P0 — 阻塞 agent 正确执行

| ID | 缺陷 | 证据 | 最短修法 |
|---|---|---|---|
| **D1** | 仓库根 `AGENTS.md` 是未填充通用模板：8 处占位符（`<PROJECT_NAME>`、`<technology>`×5 等），2 条错路径 `docs/development/tasks/completed/`、`docs/development/exec-plans/completed/`；且它**不在** DOCS.md §1 的适用范围内（该节只列根 README 与各 workspace 文档） | [AGENTS.md:39-51（原 L39-L51）](../../../../AGENTS.md)、[:127（原 L127）](../../../../AGENTS.md)、[:162（原 L162）](../../../../AGENTS.md)；[DOCS.md:3（原 L3）](../../../os/standards/DOCS.md) | 重写为"本项目入口 40 行"（读什么、开工前查什么、四模块边界、禁令、入口命令），通用方法论下沉到 `docs/os/standards/`，并把根 AGENTS.md 纳入 DOCS.md 适用范围 |
| **D2** | 5 份规范/架构文件是未本地化英文模板，却承担权威引用：[ARCHITECTURE.md](../../../os/architecture/ARCHITECTURE.md) 含 PostgreSQL/Prisma/OAuth/Teams 示例；[TESTING.md](../../../os/standards/TESTING.md) §5 九个 `<command>` 占位，却写"agents should use these commands instead of guessing"；[GIT.md](../../../os/standards/GIT.md) 留 `<main\|master\|develop>` 与 `task/<id>`（实际全用 `feature/TASK-xxx`）；[SECURITY.md](../../../os/standards/SECURITY.md) 留 "Record project-specific security reporting procedure here"，且**未写本项目最重要的安全事实**（无认证、CORS `origin:true`、仅可信网络）；[CODING.md](../../../os/standards/CODING.md) 要求"遵守 ARCHITECTURE.md 的模块边界"而该文件无本项目边界。**✅ 2026-10-29 已全部处置**（四份规范本地化；`ARCHITECTURE.md` 已于 2026-10-26 由 v2.0 重写，不在本轮）。**D2 的两条前提已过时**，见 §12.4 | 详见 §12.4 | ~~见 §7.2~~ 已执行，见 §12.4 |
| **D3** | 两份决定流程质量的文件为空：[REVIEWER.md](../../../os/roles/REVIEWER.md) 原 0 字节（**✅ 2026-10-29 已批准为 `Approved v1`，见 §7.2**）；[EXEC_PLAN_TEMPLATE.md](../../../os/templates/EXEC_PLAN_TEMPLATE.md) 原 0 字节（**✅ 2026-10-29 已从 9 份真实计划归纳出模板，254 行，见 §12.5**）。**D3 已闭环** | 见 §12.5 | ~~用已验证的实践反推写模板~~ 已执行：取 9 份真实计划的章节序列 + 实测出现率 |
| **D4** | 流程文档断尾：[EXECUTION_PLANS.md](../../../os/process/EXECUTION_PLANS.md) 原 372 行，§8 "Required ExecPlan Structure" 只写到 §5 Work Breakdown 的示例就结束，Verification / Risks / Rollback / Completion 四节**从未被规定**；而 [PLANNER.md:16（原 L16）](../../../os/roles/PLANNER.md) 已要求写 "§7 Verification"——引用了不存在的定义。**✅ 2026-10-29 已补全**（§5 收尾 + 新增 §6–§11，见 §12.5） | [EXECUTION_PLANS.md](../../../os/process/EXECUTION_PLANS.md)；[PLANNER.md:16（原 L16）](../../../os/roles/PLANNER.md) | ~~补完 §6-§10~~ 已执行：Decisions / Verification / Risks / Rollback / Records / Template，章节号与模板一致 |
| **D5** | 状态词无唯一枚举：模板 12 态 UPPER_SNAKE / 流程 9 态 Title Case / 卡片实际用 `COMPLETED`、`Done`、`REVIEWING`、`PLANNING`、`Draft` / 计划出现 `Implemented`；`COMPLETED` 不在任何枚举中；`READY`、`EXPLORING`、`HUMAN_ACCEPTANCE` 从未使用；`blocked` 语义分裂（依赖未满足 ≠ 状态 `BLOCKED`）。**✅ 2026-10-29 已落地 `docs/os/process/STATES.md`**（Human 三项裁决：全 Title Case / 任务与计划分两套 / `Completed` 定义不改）；模板与流程文档的同步仍待做，见本卡 §7.2 与 `STATES.md` §8 | 详见 [§5.1](#51-状态词汇三套并存) | ~~建立 `docs/os/process/STATES.md`~~ **已建立**；剩余：按 `STATES.md` §8 同步 `TASK_TEMPLATE.md`（12→6 态）、`EXECUTION_PLANS.md` §6（8→4 态）、`REVIEWER.md` §3、`BOARD.md` Done 表加 `Merged` 列 |
| **D6** | 没有 State → Owner → 产物 映射：`EXECUTION_PLANS §7` 定义了 Human/Planner/Implementer/Reviewer/Integrator，但 **Orchestrator 缺席**；`docs/os/roles/` 也没有 `INTEGRATOR.md`；`Integrating` 有三个主人（Integrator / Orchestrator / Human 合并），实际进入率不一致。**✅ 2026-10-29 已完成**（Human 裁决方案 A）：① `STATES.md` §4 升级为 **State → Owner → 必须产出的证据 → 记录位置** 唯一映射表（任务 6 态 + 计划 4 态 + 合入）；② `EXECUTION_PLANS §7` 补入 **Orchestrator** 角色，并把状态流转改为指向 `STATES.md` §4（不再复述，避免双份）；③ **删除 Integrator 角色**，新增 `### No Integrator role` 一节说明理由；**不新建 `docs/os/roles/INTEGRATOR.md`**（合入归 Human，`Integrating` 已废弃）；④ 连带修掉 `GIT.md` §13/§16 与 `TESTING.md` 中残留的 Integrator 职责（D2 本地化时的遗漏）。见 §12.9 |
| **D7** | `Completed` 不保证已提交/已合入：TASK-044/048/049/050 标 `COMPLETED`，但 [BOARD.md:9（原 L9）](../../../BOARD.md) 写 `main` 停在 `891d0f7` 不含这四个任务；TASK-048 记录"改动仍在工作区，未提交"，TASK-049 记录"尚未合入 main"。**部分已处置（2026-10-29）**：`STATES.md` §1 已把「流程状态」与「合入状态」拆成 `Status` + `Merged` 两个字段，并按 Human 裁决 **保留 `Completed` 不兼表已合入** | [TASK-048:8（原 L8）](./TASK-048-family-dividend-label.md)、[TASK-049:8（原 L8）](./TASK-049-dashboard-household-total.md)、[BOARD.md:9（原 L9）](../../../BOARD.md) | ~~定义 `Completed ≡ 已合入主线`~~ **已否决（Human 2026-10-29）**：改为 `BOARD.md` Done 表加 `Merged (— / Pending / Merged + SHA)` 列，由 Human 维护；`STATES.md` §1 已定字段语义 |

### P1 — 造成事实漂移与重复劳动

| ID | 缺陷 | 证据 | 最短修法 |
|---|---|---|---|
| **D8** | 看板/索引与卡片、与事实三方失配（12 处）：TASK-050 owner 三个版本（readme 写"独立 Reviewer"、TASKS 写"Orchestrator → Human"、卡片写四段链）；"阻塞中：无"而 TASK-051/046/047 卡片标有 `⏳ 阻塞`；TASK-051 索引写"待立项"而卡片已是 `Draft`；TASK-043 完成日期 10-18 vs 10-19；TASK-005 不在 Done 表；TASK-050 的 B5 仍写"⏳ 交付时"；readme 两条死链（`development/requirements/ROADMAP.md`、`development/requirements/specs/authentication.md`）；`docs/issues.md` 未登记索引且被四处误称"0 字节"（实际 8 行）；`TASK_TEMPLATE.md:121` 笔误 `docs/producr/` | [readme.md:59-62（原 L59-L62）](../../../readme.md)；[BOARD.md:13（原 L13）](../../../BOARD.md)、[:30（原 L30）](../../../BOARD.md)、[:32-39（原 L32-L39）](../../../BOARD.md)；[TASK-051:6（原 L6）](../active/TASK-051-fx-rate-direction.md)、[:176（原 L176）](../active/TASK-051-fx-rate-direction.md)；[TASK-050:127（原 L127）](./TASK-050-portfolio-list-household-blocks.md)；[issues.md](../../issues.md) | 见 §7.1；根治靠 §7.3 的一致性检查 |
| **D9** | 官方任务卡模板与真实写法分叉：按 11 个顶层章节统计，**10 张卡合规 58/110 = 52.7%**；只有 TASK-043 是 1:1 实现；元数据字段精确合规仅 2/10。事实模板（046/047/048/049/050/051 一致）是"问题优先"结构；官方 `Goal`/`Why`/`Out of Scope`/`Constraints`/`Related Documentation`/`ExecPlan Decision` 基本无人使用。原模板禁止在 Coordination Notes 写实现历史，而官方模板又没有放历史的位置，导致 [TASK-047:159-167（原 L159-L167）](../active/TASK-047-review-followups.md) 只能违纪。**✅ 2026-10-29 已落地 v2**（9 节结构 + 6 态状态词 + 记录节明确归 ExecPlan），见 §12.6 | 详见 [§5.2](#52-任务卡模板合规率实测) | ~~把事实 7 节模板批准为 v2~~ 已执行；实测为 **9 节**（含按需的 Open Questions 与记录节），且与 D4 的 ExecPlan 结构在"记录归计划"这一点上一致 |
| **D10** | 单一归属被违反：4/5 已完成任务卡与 ExecPlan 各存一份 Review/Completion Record（TASK-043/044/048/049），进行中的 TASK-050 同样重复；同一份证据出现三处（2408 modules / 25 断言 25 PASS / 9 FAIL / 5 FAIL 同时写在卡片、ExecPlan、[BOARD.md:13（原 L13）](../../../BOARD.md)） | [TASK-048:180（原 L180）](./TASK-048-family-dividend-label.md) vs [plan:722（原 L722）](../../exec-plans/completed/TASK-048-family-dividend-label.md)；[TASK-050:333-340（原 L333-L340）](./TASK-050-portfolio-list-household-blocks.md) vs [plan:917-940（原 L917-L940）](../../exec-plans/completed/TASK-050-portfolio-list-household-blocks.md) | 卡片只留一行结论 + 链接；详细 Review/Completion 唯一归属 ExecPlan（[EXECUTION_PLANS §4（原 L78-L90）](../../../os/process/EXECUTION_PLANS.md) 已有此规定，无需新规则，只需执行） |
| **D11** | 验证成果不可复用：约束明文"不得为任务新建测试文件"，Reviewer 自写 25 断言后"跑完即删"，实现者脚本未跟踪未登记。后果实证：`fxRate.service` 零单测、既有测试手填 `7.2` 绕过采集端，TASK-051 的方向错误存在一年未被任何测试拦住 | [TASK-050 plan:74（原 L74）](../../exec-plans/completed/TASK-050-portfolio-list-household-blocks.md)；[TASK-050:353（原 L353）](./TASK-050-portfolio-list-household-blocks.md)、[:385（原 L385）](./TASK-050-portfolio-list-household-blocks.md)；[TASK-051:49-60（原 L49-L60）](../active/TASK-051-fx-rate-direction.md) | 可自动化的 AC → 脚本入库（已有 `client/scripts/e2e-task-049.mjs` 先例）+ `npm run e2e:*`；修 bug 的任务若无回归测试须显式申报（把 [TESTING.md:50（原 L50）](../../../os/standards/TESTING.md) 从愿望落到执行层） |
| **D12** | 没有机械校验环：全套规则靠自觉执行——无 `.github/`、无 CI、无 git hook；[DOCS.md §5（原 L83-L113）](../../../os/standards/DOCS.md) 的链接校验脚本只能手工跑；引用用行号（`BOARD.md:13`、`readme.md:59`）随文件变动必然失效，已实际失效两处 | [TASK-048:185（原 L185）](./TASK-048-family-dividend-label.md)、[TASK-049:194（原 L194）](./TASK-049-dashboard-household-total.md) | `scripts/check-docs.mjs` + `npm run docs:check` + pre-commit/CI；引用改用标题或表格行 ID，禁止行号 |
| **D13** | 事实规则书在治理外：`.workbuddy/memory/MEMORY.md` 承载分支堆叠模型、审查方法、环境坑、已裁决"不改"清单，但不在索引、不在 DOCS.md 适用范围、与 [GIT.md](../../../os/standards/GIT.md) 冲突；新 agent 若只读 `docs/` 会不知道"开工前先 `git branch --show-current`" | `.workbuddy/memory/MEMORY.md`；[GIT.md:34（原 L34）](../../../os/standards/GIT.md) vs [TASK-050 plan:27（原 L27）](../../exec-plans/completed/TASK-050-portfolio-list-household-blocks.md) | 提升为 `docs/os/roles/PLAYBOOK.md` 并登记索引（记忆只留指针）；已裁决事项转入对应任务卡/规范 |

### P2 — 结构性/体验问题

| ID | 缺陷 | 证据 | 最短修法 |
|---|---|---|---|
| **D14** | workspace 级入口不全且漂移：`client/AGENTS.md` 指向 `../doc/API_CONTRACT.md`（实际 `docs/handbook/technical/`）、写"交易方向仅 `buy \| sell`"（实际 4 种，与 [enums.js:14-18（原 L14-L18）](../../../../client/src/constants/enums.js) 不符）；`server/` 只有 README 无 AGENTS；`shared/`（业务内核）**没有任何 md** | [client/AGENTS.md:3（原 L3）](../../../../client/AGENTS.md)、[:35（原 L35）](../../../../client/AGENTS.md) | 各 workspace 只写本目录特有事实 + 引用唯一归属；`shared/AGENTS.md` 至少写"禁止复制实现、跨包必须 `@portomind/shared`" |
| **D15** | 流程开销与任务规模不匹配、反向激励跳步：纯前端 12 文件任务产出 387 行卡 + 960 行计划 + 两轮评审 + 两轮负向对照；而 [EXECUTION_PLANS §2（原 L32-L40）](../../../os/process/EXECUTION_PLANS.md) 的"通常不需要 ExecPlan"清单没有配套轻量通道（谁审、审到什么程度、是否走 Integrating）。历史上 [TASK-043 plan §8（原 L156-L204）](../../exec-plans/completed/TASK-043-asset-price-consolidation.md) 的违规根因之一就是"写代码边际成本极低" | [TASK-043 plan:181-186（原 L181-L186）](../../exec-plans/completed/TASK-043-asset-price-consolidation.md) | 按风险分 light / normal / full 三档，light = 卡片 + 一页变更说明 + 单轮 spot check；需 Human 裁决（[OQ-4](#11-待-human-裁决)） |
| **D16** | 决策无队列：全 docs "待 Human 裁决/待补"55 处命中，散落在卡片与计划；[PLANNER.md:3（原 L3）](../../../os/roles/PLANNER.md)、[IMPLEMENTER.md:3（原 L3）](../../../os/roles/IMPLEMENTER.md) 自 2026-10-18 挂着"待 Human 审核"，却已被当作硬约束引用；TODO 型欠账（如 ARCHITECTURE 未填充）无责任人无期限 | [TASK-043:110（原 L110）](./TASK-043-asset-price-consolidation.md) | 建唯一待决队列（可复用并规范化 [issues.md](../../issues.md)）；规则：未登记视为未阻塞；批准两份角色文档为 v1 |
| **D17** | 归档层不纯 + 路径矛盾：§3 规定 `docs/development/exec-plans/completed/` 实际是 `complete/`；`development/exec-plans/completed/` 混入两份非计划文件（`DOCS-DEDUP-2026-10-15.md`、`DEPENDENCY_UPGRADES.md`，均无 TASK 编号与 Status/Owner 头）；`TASK_TEMPLATE.md:27` 把 ExecPlan 指针硬编码为 `active/`，归档后必然写错 | [EXECUTION_PLANS.md:50-52（原 L50-L52）](../../../os/process/EXECUTION_PLANS.md)、[:54-56（原 L54-L56）](../../../os/process/EXECUTION_PLANS.md)；[TASK_TEMPLATE.md:27（原 L27）](../../../os/templates/TASK_TEMPLATE.md) | 改路径为 `complete/`；非计划文件移入 `docs/archive/`；模板改 `<active\|complete>` |
| **D18** | 元数据小口径不一致：TASK-045 缺 `Updated` 与 `Related ADR`；046-051 多加模板未定义的 `Type`/`来源`；`docs/issues.md`（8 行笔记）被视为未申报文件 | [TASK-045:3-22（原 L3-L22）](../active/TASK-045-transaction-query-filters.md)；[TASK-050:20-33（原 L20-L33）](./TASK-050-portfolio-list-household-blocks.md) | 随 D9 的模板 v2 一并定义字段表（含 `Updated` 必填） |

---

## 5. 状态词汇与模板合规（实测数据）

### 5.1 状态词汇三套并存

| 来源 | 词表 | 形式 |
|---|---|---|
| [TASK_TEMPLATE.md:6（原 L6）](../../../os/templates/TASK_TEMPLATE.md) | `BACKLOG \| READY \| EXPLORING \| PLANNING \| PLAN_REVIEW \| IMPLEMENTING \| VERIFYING \| REVIEWING \| INTEGRATING \| HUMAN_ACCEPTANCE \| BLOCKED \| DONE` | 12 态 UPPER_SNAKE |
| [EXECUTION_PLANS.md:126（原 L126）](../../../os/process/EXECUTION_PLANS.md)、[:245（原 L245）](../../../os/process/EXECUTION_PLANS.md) | `Draft → Plan Review → Approved → Implementing → Verifying → Reviewing → Integrating → Completed`（+`Blocked`） | 9 态 Title Case |
| 角色文档 | PLANNER：`Draft`/`Plan Review`/`Approved`；IMPLEMENTER：`Approved`/`Implementing`/`Verifying`/`Reviewing`；ORCHESTRATOR 与 REVIEWER：无枚举 | Title Case |
| 实际卡片 | `BACKLOG`(045)、`PLANNING`(046/047)、`Draft`(051)、`REVIEWING`(050)、`COMPLETED`(043/044/048/049)、`Done`(005)；验收结果写 `Passed`，模板规定 `Accepted` | 混用 |
| 实际计划 | `Approved → Implemented`（`Implemented` 不在任何枚举） | 越界状态 |
| [BOARD.md](../../../BOARD.md) | 只有分节 `Active`/`Backlog`/`Blocked`/`Done`，无枚举表；Done 表头叫 `Completed` | — |

**分歧点**：同一含义三种拼写（`COMPLETED`/`Done`/`Completed`、`REVIEWING`/`Reviewing`、`PLAN_REVIEW`/`Plan Review`）；`Draft` 是计划状态却用在卡片；`Implemented` 无处定义；`READY`/`EXPLORING`/`HUMAN_ACCEPTANCE` 从未出现（人工验收实际以散文"Human 最终验收"发生在 `REVIEWING → Completed` 之间）；`BLOCKED` 从未作为状态使用，但三张卡自述"阻塞"。

### 5.2 任务卡模板合规率实测

| 卡片 | 元数据 | 命中章节 | 缺失章节 |
|---|---|---|---|
| TASK-005 | 8/8（无 Metadata 块） | **11/11** | — |
| TASK-043 | 8/8 | **11/11** | —（唯一 1:1 实现） |
| TASK-044 | 8/8 | 7/11 | Out of Scope、Constraints、Related Documentation、ExecPlan Decision |
| TASK-048 / 049 | 8/8 +Type/来源 | 5/11 | Goal、Why、Out of Scope、Constraints、Related Documentation、ExecPlan Decision |
| TASK-050 / 046 / 047 / 051 | 8/8 +Type/来源 | 4/11 | 上述 6 节 + Completion |
| TASK-045 | 6/8（缺 Updated、Related ADR） | 3/11 | 8 节 |

**合计 58/110 = 52.7%**；元数据精确合规 2/10。事实模板（046-051 一致）：

```
Metadata → 1. 问题 → 2. 已核实的代码事实 → 3. Acceptance Criteria
→ 4. Scope → 5. Risks → 6. Blocking Dependencies → 7. Coordination Notes
→ Implementation / Review / Completion 记录
```

**执行计划侧同样分叉**：5 份计划 5 种章节顺序（TASK-048 为 Decisions→Verification→Risks，TASK-049 为 Open Decisions→Verification→Risks，TASK-005 为 Risks→Verification→Open Decisions，TASK-043 出现两个 `## 10.`），根因见 D3/D4。

---

## 6. 值得保留的优点

> 这部分是"不要在下一次整改中改掉"的清单。每条的判断依据是**已有执行数据**，不是设计意图。

1. **单一索引 + 单一归属 + 可跑校验**（[DOCS.md](../../../os/standards/DOCS.md)）：规则解释了"为什么"（主题级重复 → 事实漂移），有边界表、有提交前 checklist、有真正的链接校验脚本；实测链接数 154 → 163 → 188 → 378，失效始终 0。
2. **审批分层写进了硬约束**：需求批准 ≠ 方案批准；业务代码改动必须先有 `Approved` ExecPlan（[IMPLEMENTER.md:10（原 L10）](../../../os/roles/IMPLEMENTER.md)）；实现与审查不同角色不同轮；`build/lint 通过 ≠ 验收通过`（[IMPLEMENTER.md:35（原 L35）](../../../os/roles/IMPLEMENTER.md)）。正对 agent 最常见的跳步。
3. **ExecPlan 的设计初衷准确**："使另一个 agent 不依赖私有聊天记录与未记录假设即可接手"（[EXECUTION_PLANS.md:7（原 L7）](../../../os/process/EXECUTION_PLANS.md)），且明确是 living document——针对上下文丢失这一 agent 特有问题。
4. **角色用"禁止清单 + 反模式清单"表达**（[ORCHESTRATOR §3（原 L25-L31）](../../../os/roles/ORCHESTRATOR.md)、[PLANNER §6（原 L58-L63）](../../../os/roles/PLANNER.md)、[IMPLEMENTER §6（原 L54-L60）](../../../os/roles/IMPLEMENTER.md)），可执行性远高于"应当尽职"。
5. **验收标准可机器验证**：AC 直接写成 `grep -rn` 结果与 `git status ... 空输出`（[TASK-050:75-79（原 L75-L79）](./TASK-050-portfolio-list-household-blocks.md)），ExecPlan 逐字引用 FS 的 AC 并声明"未增删改"（[plan:77（原 L77）](../../exec-plans/completed/TASK-050-portfolio-list-household-blocks.md)）——需求→AC→验证血缘完整。
6. **审查方法论是真正的资产**：负向对照证明断言"能失败"（注入缺陷后 16/25、20/25 PASS，[TASK-050 §13.2（原 L368-L375）](./TASK-050-portfolio-list-household-blocks.md)）；"恒显示类要求必须构造空态"、"别 mock 掉你怀疑的那一段"、"断言失败先怀疑选择器"；`page.route` 喂数据零写库。这套东西比一般测试规范更硬，**应原样保留下沉到规范里**（D3 修法的一部分）。
7. **偏差可审计**：[TASK-043 plan §8（原 L156-L204）](../../exec-plans/completed/TASK-043-asset-price-consolidation.md) 完整记录 7 步偏离、触犯的 4 条禁令、4 条根因、Human 追认边界（"仅限本次，不构成先例"），并写"例外必须可审计，不能静默"；[TASK-050 的 D-7（原 L322-L327）](./TASK-050-portfolio-list-household-blocks.md) 同一纪律。
8. **归档纪律有实操细节**：完成即移动 active → complete 并同步所有链接（[DOCS.md:25（原 L25）](../../../os/standards/DOCS.md)）；记忆里还补了"新 ExecPlan 默认 untracked，`git mv` 失败、`git commit -am` 会静默丢掉"的坑。
9. **不写会漂移的数字**（[DOCS.md:67（原 L67）](../../../os/standards/DOCS.md)）：明确以 `npm test` 实际输出为准——这条规则正是被"文档写 157/157、实际 154"撞出来的。
10. **通用模板里的内核是好东西**：根 `AGENTS.md` 的审批门（§6）、审查严重度 `BLOCKER/MAJOR/MINOR/PASS`（§9）、完成条件（§14）、"仓库是共享记忆"（§15）都值得保留——问题只在没本地化（D1）。
11. **workspace 级 AGENTS.md 形态正确**：就近可读、给命令给约定给目录索引——内容需修（D14），形态值得推广到 `server/` 与 `shared/`。

---

## 7. 整改方案（三批，逐批可独立 review）

### 7.1 第一批：零风险文档修复（约 0.5 天，纯 docs）

覆盖 D8、D17、D18 中的确定性错误。改动集中在 5 个文件——`docs/readme.md`、`docs/BOARD.md`、`docs/os/process/EXECUTION_PLANS.md`、`docs/os/templates/TASK_TEMPLATE.md`、`docs/issues.md`——外加两张历史卡的失效行号引用（TASK-048:185、TASK-049:194）。逐项修法见 §4 对应行的"最短修法"列；本批不新增规则，只做搬移、更正与登记。

**出口**：AC1、AC6、AC7 通过。

### 7.2 第二批：规则补全（约 1.5–2 天，纯 docs）

新增 1 份（`docs/os/process/STATES.md`，覆盖 D5/D6）+ 重写或补齐 9 份：根 `AGENTS.md`、`REVIEWER.md`、`EXEC_PLAN_TEMPLATE.md`、`TASK_TEMPLATE.md`（v2）、`ARCHITECTURE.md`、`TESTING.md`、`GIT.md`、`SECURITY.md`，并把 `PLANNER.md` / `IMPLEMENTER.md` 从"待审核"批准为 v1（覆盖 D1/D2/D3/D4/D9/D14/D16）。逐项修法见 §4；顺序建议：先 `STATES.md`（它决定其余文档里所有状态引用怎么写）→ 模板 → 规范 → 根入口。

**已定范围（2026-10-29 Human 裁决，两次）**：

1. 第一轮：本次只做 **052 自己的 D1 切片**——根 `AGENTS.md` 的 7 处占位符与 2 处 `completed/` 错路径。✅ 已完成。
2. **第二轮（同日改判，覆盖前一轮的"推迟"结论）**：Human 裁决 **D1 全量重写现在就做，不等 `TASK-062`**，做法是「先重写、给 062 预留挂载点」，并**同步改写 062 的文件分工表**。✅ 已完成，产出见 §12。

**为什么改为先行**：原计划「等 062 落地后再做减法」有一个隐含前提——062 的规则内容会先到位。但 062 至今为 `Draft`（`§8` 标注「阻塞中 —— 待 Human 批准」），而根 `AGENTS.md` 的失效是**当前每次会话都在生效**的：464 行里约 440 行是通用方法论、唯一项目专属块（技术栈）与 `ARCHITECTURE.md §2` 重复、真正该有的「主题→去哪找」完全没有。等待期间每个 agent 都要为此付出通读成本（`TASK-062` P3 的实证）。故改为先把入口重写成路由形态，062 的三项落点以**空节 + 状态说明**形式预留（`AGENTS.md` §7），062 批准后只需填空，不必再动整体结构。

**仍未做（本轮明确不做）**：`EXECUTION_PLANS.md` 断尾五节（D4）、模板 v2（D9）、四份规范本地化（D2 剩余部分）。~~`STATES.md`（D5）~~ —— **已落地，见下条与 §12.3**。

**已落地的第三轮（2026-10-29 晚）**：`docs/os/process/STATES.md`（D5）依 Human 三项裁决建立 —— ① 全 **Title Case**；② 任务（6 态）与 ExecPlan（4 态）**分两套**；③ `Completed` 定义**不改**，合入状态拆为独立的 `Merged` 字段（`—` / `Pending` / `Merged`）。**这把 D5 与 D7 作为同一个病的两面一并处置了**：一个 `Status` 字段原先被要求同时回答"流程走到哪"和"是否已进 `main`"，拆字段后两者各归其位。交付记录见 §12.3。

**下一步（STATES.md 的直接后续）**：按 `STATES.md` §8 的清单同步四个文件 —— `TASK_TEMPLATE.md`（12→6 态）、`EXECUTION_PLANS.md` §6（8→4 态）、`REVIEWER.md` §3（改为"登记判定词，不改 `Status`"）、`BOARD.md`（Done 表加 `Merged` 列）。这四项完成前，**模板与流程文档仍与 `STATES.md` 分叉**，属已知未清。

**D3 的 `REVIEWER.md` 半边已批准 v1（2026-10-29）**：`docs/os/roles/REVIEWER.md` 0 字节 → 189 行，Human 批准，**即日起为生效规则**。内容：判定词（`Pass` / `Pass with issues` / `Fail`，含别名表）、严重度（`BLOCKER` / `MAJOR` / `MINOR`，**正式承接本文 `R-4` 指向的归属**，`OQ-3`）、路径级写入范围与禁写（含 `OQ-2` 裁决：可写审查状态与一行结论、不可写 `Completed`）、6 条停止条件、审查记录 9 个必填字段。审查类型在原始五类（Requirement / Code / Architecture / Test / Regression）之外补了三类：**Security Review**（依据 `EXECUTION_PLANS.md` §7 本就划给 Reviewer、但五类里缺失）、**Evidence & Docs Review**、**Scope & Deviation Review**。四项待决点已全部裁决（`OQ-1`~`OQ-4`，见该文件 §9.1）；`OQ-4` 同时确认 062 重写 `docs/os/roles/*` 时必须保留本文条款。原 §14「完成条件」的价值条款已按 R-4 迁入根 `AGENTS.md` §9，并在该节加了一行指向 `REVIEWER.md` §5 的归属声明。**本卡 AC2 中属于 `REVIEWER.md` 的那一半已满足**；AC2 的另一半（`EXEC_PLAN_TEMPLATE.md`）仍未做。

**出口**：AC2、AC3、AC5、AC8 通过。

### 7.3 第三批：机械校验环（约 1 天，纯 docs + 1 个脚本）

**D12**：新增 `scripts/check-docs.cjs` + 根 `package.json` 的 `docs:check` / `docs:check:links`，规则集：

1. 相对链接全部可解析（复用 [DOCS.md §5（原 L83-L113）](../../../os/standards/DOCS.md) 脚本）；
2. `docs/` 内不出现 `exec-plans/completed/`、`docs/producr/`、`docs/development/tasks/completed/`；
3. 每张任务卡 `Status` ∈ `STATES.md` 枚举；`Updated` 字段存在；
4. 模板类文档（ARCHITECTURE/TESTING/GIT/SECURITY/CODING）不得含 `<command>`、`<PROJECT_NAME>` 之类占位；
5. `readme.md` 的活跃任务行与 `BOARD.md` 的 owner/状态一致；
6. `docs/` 下每个 md 都出现在 `readme.md` 索引（对应 DOCS.md §4 第 1 条）。

挂 pre-commit 或 GitHub Actions（仓库当前无 CI，二选一由 [OQ-5](#11-待-human-裁决) 定）。规则 2–6 全部通过后，第一批的那些错误不可能再回归。

> **2026-10-30 已落地（D12 首个可运行版本）**：`scripts/check-docs.cjs` + `npm run docs:check`（全量）/ `npm run docs:check:links`（只查链接）+ `--json`（CI 用）。
> **已实现规则**：① 相对链接可解析；② 根 `AGENTS.md` §3 路由表逐行可解析（D1 专属，独立一条）；③ 任务卡 `Status` 枚举校验（兼容 3 种卡片格式：v2 表格行 / `**Status:**` 段落 / `## Status` 独立节；按 `STATES.md §7.0` 豁免 2026-10-30 前的历史卡）；④ 权威文档残留模板占位符。
> **退出码语义**：`0` 全通过 / `1` 有 ERROR（必修）/ `2` 仅 WARN（可合并但须说明）。
> **尚未实现**：上述第 2、5、6 条（坏路径黑名单、看板一致性、全量索引覆盖）——这三条依赖对 `BOARD.md` / `readme.md` 结构的稳定约定，随本卡剩余整改推进再做。
> **当前实测**：`865` 条相对链接 / **`99` 条失效**（全部由 `docs/development/requirements/` + `docs/handbook/manual/` 目录重构引起，见 §12.1 复核结论），故 **AC1 尚未满足，退出码为 1**——脚本此时的价值正是把「静默漂移」变成「一条命令可复现的红灯」。

### 7.4 明确不在本卡范围

D11（验证资产化）、D13（记忆提升为 PLAYBOOK）、D15（轻量通道）需要 Human 决策或另立任务，见 §11。

---

## 8. Acceptance Criteria

- [ ] **AC1** `npm run docs:check` 存在且退出码 0；输出"相对链接 N 条，失效 0 条"。**（脚本已建：2026-10-30 交付 `scripts/check-docs.cjs` + `npm run docs:check`，但当前实测 `865` 条链接 / **`99` 条失效** → 退出码 **1**，本 AC **未满足**。失效全部源于 `docs/development/requirements/` + `docs/handbook/manual/` 目录重构，见 §12.1 复核结论与 §13「结案豁免」）**
- [x] **AC2** 4 份"空/断尾"文件不再是缺陷：`REVIEWER.md` 非空且含判定词与禁令（**✅ 2026-10-29，`Approved v1`**，见 §12.2）；`EXEC_PLAN_TEMPLATE.md` 非空且章节与真实计划一致（**✅ 254 行，13 节，按 9 份计划归纳**，见 §12.5）；`EXECUTION_PLANS.md` 含 Decisions / Verification / Risks / Rollback / Records 各节且断尾已补（**✅ 见 §12.5**）；根 `AGENTS.md` 无占位符且无 `completed/` 路径（`grep -c` 为 0）（**✅ 已满足**）。**AC2 通过。**
- [x] **AC3** 全仓只有一份状态枚举：`docs/os/process/STATES.md` 是唯一归属，且**历史卡豁免**（2026-10-29 Human 裁决：「当前已经存在的 task 任务卡，就不改了」）。**判定方式（按裁决 ① 全 Title Case 调整，已可机械校验）**：① **定义处唯一**：`grep -rnE "(BACKLOG|PLANNING|PLAN_REVIEW|IMPLEMENTING|VERIFYING|REVIEWING|INTEGRATING|HUMAN_ACCEPTANCE|COMPLETED)" docs/templates docs/process` **只允许命中 `STATES.md` 的别名/废弃表**（实测仅命中 `STATES.md:120-122,147,149`）；② **历史卡豁免**：2026-10-30 前已存在的 21 张卡保留原写法，**不回改、不计失败**（`STATES.md` §7.0）；③ **新卡强制**：2026-10-30 起新建或变更 `Status` 的卡 ∈ {`Backlog`,`Planning`,`Implementing`,`Reviewing`,`Blocked`,`Completed`}，ExecPlan ∈ {`Draft`,`Approved`,`Implementing`,`Completed`}；判定"新卡"依据 `Created`/`Updated` ≥ 2026-10-30 或此后发生过 `Status` 变更；④ 因改用 Title Case，**校验不能只靠 UPPER_SNAKE 字面量 grep**，须同时比对卡片取值。见 §12.7。
- [x] **AC4** 合入状态可验证。**已完成（2026-10-29）**：
  - ✅ **列已存在**：`BOARD.md` Done 表含 `Merged` 列（2026-10-29 新增，10 行全部填入 `—`），并附填写规则（取值 `—`/`Pending`/`Merged`+SHA、判定命令 `git merge-base --is-ancestor <sha> main`、**只有 Human 能填**）。
  - ✅ **值已填（2026-10-29，Human 授权实测）**：10 个已结案任务全部填 `` `Merged` `` + PR 号，依据 `git merge-base --is-ancestor <sha> main` 逐个实测，**10/10 全部已合入**（详见 §12.8）。
  - **注**：不再要求"未合入的不处于 `Completed`" —— 该要求已被 Human 于 2026-10-29 否决（裁决 ③：`Completed` 不含合入语义），改由 `Merged` 字段独立表达，见 [STATES.md](../../../os/process/STATES.md) §1。
- [x] **AC5** 任务卡模板 v2 落地：`TASK_TEMPLATE.md` 已换为**问题优先**结构（**9 节**：问题 / 已核实的事实 / AC / Scope / Risks / Blocking Dependencies / Coordination Notes / Open Questions / 记录节），与 049/050/051 三张卡的实测同构结构一致；无未定义占位（16 处 `<…>` 全部为填写位，已逐个核对）。**注：本条原写"7 节"，实测事实结构为 9 节**（含按需的 Open Questions 与记录节），已按实际修正。见 §12.6。
- [ ] **AC6** 看板零矛盾：`readme.md` 活跃任务行不含状态词；`BOARD.md` 与卡片 owner/status 一致；"阻塞"表述与卡片一致。
- [ ] **AC7** 索引零死链、零未登记文件：`docs/` 下每个 md 都在 [readme.md](../../../readme.md) 中；`ROADMAP.md`/`authentication.md` 二选一（存在或从索引删除）。
- [x] **AC8** 规范可操作：TESTING §5 不再留 `<command>` 占位（已改为指向 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)，并新增 §5A 本项目测试地形）；GIT 分支规则与实际分支命名一致（已改为 `feature/TASK-xxx`，示例 `feature/TASK-058-auth-kernel`，合并策略实测为 Merge commit）。**✅ 2026-10-29 满足**，见 §12.4。**注：本条原写"SECURITY 含『无认证 / CORS 全开』现状"已失效** —— TASK-058 已落地认证与 CORS 白名单（2026-10-27），SECURITY 现写的是「安全状态归 DEPLOYMENT §9，本文件只定规则」+ 10 条红线。
- [ ] **AC9** 独立 Reviewer 复核通过（按新 REVIEWER.md 判定词），Implementer 不得自判。
- [x] **AC10** 零业务代码改动：`git status client server shared cron-worker` 空输出。

---

## 9. Scope / Out of Scope

**In Scope**：`docs/**`、根 `AGENTS.md`、根 `README.md` 的文档段、`client/AGENTS.md`、新增 `shared/AGENTS.md`、根 `package.json` 的 `docs:check` 脚本与 `scripts/check-docs.mjs`。

**Out of Scope**：任何 `client/` `server/` `shared/` `cron-worker/` 业务代码；`.workbuddy/memory/` 内容迁移（仅 OQ-1 讨论）；TASK-051 的汇率缺陷本身（已单独立项）；历史任务卡的既有 Review 记录（只做"卡片瘦身"增量，不改写历史事实）。

---

## 10. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 一次改 5 份规范容易引入新的漂移 | 三批分次提交，每批只改一类问题；`docs:check` 必须在第二批结束前可用 |
| R-2 | 把"事实模板"批准为 v2 会被读成"降低标准" | AC 明确 v2 只重组章节、不降低 AC/验证要求；旧卡不重写 |
| R-3 | 状态重构会让历史卡片"看起来不合规" | `STATES.md` 附别名表（`COMPLETED`→`Completed`、`Done`→`Completed`）；历史卡不动，新卡起用 |
| R-4 | 根 AGENTS.md 重写后丢失通用方法论 | 已按此执行：审批门 / 完成与证据 / 共享记忆三条价值条款**保留在根 `AGENTS.md`**（§8 / §9 / §10），其余方法论改为指向 `docs/os/standards/`、`docs/os/roles/`、`EXECUTION_PLANS.md`。**审查严重度已于 2026-10-29 归位到 [REVIEWER.md](../../../os/roles/REVIEWER.md) §5.2**（`Approved v1`，`OQ-3` 裁决），根 `AGENTS.md` §6 / §9 已加指向；**本项 R-4 已关闭** |
| R-5 | D1 先行会让 062 的落点无处安放 | 用**空节 + 状态说明**预留：`AGENTS.md` §7 明确写「本节由 TASK-062 拥有、尚未批准、不得引用」，并列出将要落地的三个子主题。062 批准后只需填空，不动整体结构 |

---

## 11. 待 Human 裁决

| # | 决策 | 选项 | 推荐 |
|---|---|---|---|
| **OQ-1** | 隐性规则（`.workbuddy/memory/`）是否提升为受治理文档 | ① 提升为 `docs/os/roles/PLAYBOOK.md` 并登记索引；② 维持现状、只在根 AGENTS.md 加一句指引 | ①（当前它是唯一记载分支堆叠模型与审查方法的地方） |
| **OQ-2** | `readme.md` 活跃任务行是否只保留链接、不写状态/owner | ① 去状态词，状态唯一来源 `BOARD.md`；② 保留但由脚本生成 | ①（该行已连续失真三次，机制修法在记忆中提过两次未采纳） |
| **OQ-3** | `docs/issues.md`（8 行零散笔记）去留 | ① 规范化为待决队列并登记索引；② 删除，内容迁入本卡/新卡 | ①（D16 需要一个队列的落点） |
| **OQ-4** | 是否引入 light / normal / full 三档流程（D15） | ① 引入；② 维持单一流程 | ①（否则小改动要么被重流程拖慢、要么被跳过——TASK-043 已有一次实证） |
| **OQ-5** | 校验脚本的触发方式 | ① pre-commit；② GitHub Actions；③ 仅 `npm run docs:check` 手动 | ②（不依赖个人环境，且当前仓库无 CI） |
| **OQ-6** | `Integrating` 状态去留（D6） | ① 定义为"待 Human 合入队列"并唯一归属 Human；② 删除 | ①（TASK-044 实际用过它，说明有需求） |
| **OQ-7** | D1 的重写幅度与边界权威来源（**已由 Human 于 2026-10-29 裁决，同日二次改判**） | 已定：① D1 取**全量重写**（不做最小可逆版）；② 四模块边界以 **D2 重写后的 `ARCHITECTURE.md`** 为权威 —— 该文件已于 2026-10-26 重写为 v2.0，权威已就位，**阻塞已解除**；③ 【二次改判】原「D1 全量重写 ← TASK-062」**作废**，改为**现在就重写、给 062 预留空位**，062 的文件分工同步收窄。执行结果见 §7.2 与 §12 | — |

---

## 12. 本卡自身的登记（已完成的治理动作）

- [x] 建立任务卡：本文件（2026-10-26）。
- [x] 登记 [BOARD.md](../../../BOARD.md) Backlog 表。
- [x] 登记 [docs/readme.md](../../../readme.md) 索引"流程与协作"段。
- [x] **D1 切片 1（052 自己的活）**：根 `AGENTS.md` 的 7 处占位符 + 2 处 `completed/` 错路径已改（2026-10-29）。
- [x] **D1 切片 2（全量重写，Human 二次改判）**：根 `AGENTS.md` 464 → 158 行 v3，见 §12.1。
- [x] 把根 `AGENTS.md` 纳入 [DOCS.md](../../../os/standards/DOCS.md) 的适用范围（§1 目录职责 + §2.2 主题归属速查 + §3 搬迁规则 + §4 清单 + §5 校验脚本均补入根 `AGENTS.md`）——这是 D1 的**下半句**，原 052 已识别但未做。
- [x] `docs/readme.md`「项目根」段登记根 `AGENTS.md`（措辞明确：**它只做路由，索引仍是文档唯一入口**，避免出现两个"唯一入口"）。
- [x] **D3 半边（`REVIEWER.md`）**：0 字节 → 189 行，Human 批准为 **`Approved v1`**（2026-10-29，含 `OQ-1`~`OQ-4` 四项裁决），见 §7.2 与 §12.2；`EXEC_PLAN_TEMPLATE.md` 仍空，**D3 未闭环**。
- [ ] 批准后由 Planner 判断是否补 ExecPlan（当前判 `Not required`）。
- [ ] 三批整改完成后，按 [DOCS.md](../../../os/standards/DOCS.md) §1 移动至 `docs/development/tasks/completed/` 并同步全部链接。

### 12.1 D1 全量重写交付记录（2026-10-29；2026-10-30 复核并修补 2 条死链）

**产出**：根 `AGENTS.md` = 英文 v3，**实测 163 行 / 11 节 / 路由表 26 行**（原记录写「158 行 / 20 行路由」，属改写过程中的中间值，此处按当前实测更新）。

> **2026-10-30 复核结论**：D1 主体成立（占位符 0、`completed/` 错路径 0、11 节齐备）。**复核发现并修复 2 条真实死链**——成因不是 D1 当初写错，而是同期 `docs/development/requirements/` 目录重构后入口未跟上：
>
> | 行 | 原指向（404） | 实际位置 | 处置 |
> |---|---|---|---|
> | PRD | `docs/development/requirements/specs/PRD.md` | `docs/development/requirements/PRD.md`（`git show HEAD:` 逐字节比对确认同一文件） | 已改指新路径 |
> | 功能全景 | `docs/handbook/product/PRODUCT_LINES.md` + `handbook/product/lines/` | `docs/handbook/product/PRODUCT_LINES.md` + `handbook/product/lines/`（PL-0 ~ PL-6 全部随迁） | 已改指新路径 |
>
> 同时补一句 `FS-*.md` 归档约定（交付后移入 `specs/completed/`），避免后人按旧路径找已交付规格。
>
> **这两条死链正好演示 D1 的核心风险**：路由表是入口文件里唯一「必须永远正确」的部分，目录一搬而入口未同步，agent 就会照着失效路径撞 404 或被误导。D12（`docs:check` 机械校验）未建，所以这类漂移目前只能靠人工复核发现——**这是 D1 剩余的结构性缺口，不是文本缺口**。

| 节 | 内容 | 相对旧版 |
|---|---|---|
| 头部 | 「这是入口不是手册」+ 读法 + 维护规则指针 | 新 |
| §1 | 项目定位 + 四包职责/禁止表 + **三条产品不变量** | 收编旧 §2；**删除技术栈明细**（改指 `ARCHITECTURE.md §2`，消除与 D2 的唯一归属冲突） |
| §2 | 首次进入读哪 3 份（带时间盒） | 替代旧 §4 的 8 步清单 |
| §3 | **主题 → 唯一权威路由表（实测 26 行）** | 新增，替代旧 §3「Sources of Truth」的 8 个平级小节；这是本次最核心的新增 |
| §4 | 改代码前最小顺序（5 步）+ 验证命令唯一归属 | 压缩旧 §4/§5/§8 |
| §5 | 硬规则 8 条 | 收编旧 §7 + `ARCHITECTURE.md §7` 摘要 |
| §6 | 本仓库特有的坑：架构债 + **哪些规范目前不可信** + `.workbuddy` 未跟踪 | 新增；「哪些规范不可信」是旧文件完全缺失、而 agent 最需要知道的一节 |
| §7 | **TASK-062 挂载点（空节 + 明确"未生效、不得引用"）** | 新增 |
| §8 | 停手上报条件 | 保留旧 §6（052 §6.10 认定这是好东西） |
| §9 | 完成与证据 | 收编旧 §14 的价值部分，按 062 P2 去掉「标记 DONE ⇒ 已通过验证」的证明责任转嫁 |
| §10 | 仓库是共享记忆 | 保留旧 §15，压成 2 行 |
| §11 | **本文件自身的维护规则**（约 150 行上限 + 禁写清单 + 删行测试） | 新增；防止再次膨胀成手册 |

**删除项的去向**（不是降低标准，是各自归位）：

| 旧节 | 去向 |
|---|---|
| §1 Purpose 分层、§3 各节展开 | 压成 §1 首段 + §3 路由表 |
| §5 Task Complexity 19 行清单 | §4 第 3 步 + `EXECUTION_PLANS.md §2` |
| §8 Verification 9 项清单 | §4 末句 + `DEPLOYMENT.md §7`（命令唯一归属） |
| §9 Review 严重度 | **已归位** —— `REVIEWER.md` §5.2（`Approved v1`，2026-10-29）承接 `BLOCKER` / `MAJOR` / `MINOR`；根 `AGENTS.md` §9 已加指针。此项 R-4 关闭 |
| §10 Multi-Agent、§11 Ownership | **暂缺** —— 归 062，见 `AGENTS.md §7` |
| §12 Git、§13 Documentation | §3 路由表 + `GIT.md`（待本地化）/ `DOCS.md` |

**校验证据**：
- 占位符：`grep -c "<PROJECT_NAME>\|<technology>\|<Brief description"` = **0**。
- 错归档路径：`grep -c "tasks/completed\|exec-plans/completed"` = **0**。
- ~~相对链接全量校验（脚本含根 `AGENTS.md`）：**93 份文件 / 821 条相对链接 / 失效 0 条**。~~ **该结论已被 2026-10-30 的目录重构打破，见下条。**
- **2026-10-30 复测（根 `AGENTS.md`）**：链接 **50 条 / 失效 0 条**（本轮修补 2 条死链后）；路由表 **26 行 / 26 行可解析**；四份规范（CODING / GIT / SECURITY / TESTING）残留占位符 **0 / 0 / 0 / 0**。
- ⚠️ **全仓文档链接现状（2026-10-30 实测）：21 份文件 / 101 条失效**，集中在 `docs/handbook/technical/DATA_MODEL.md`（19）、`docs/readme.md`（12）、`docs/development/requirements/specs/completed/FS-authentication.md`（9）等。成因是 `docs/development/requirements/` 与 `docs/handbook/manual/` 目录重构后大量引用未同步，**与 D1 无直接关系**，但同属「搬迁未同步引用方」这一类缺陷（`DOCS.md` §4 已有规则）。
- 零业务代码改动：本次只动 `AGENTS.md`、`docs/os/standards/DOCS.md`、`docs/readme.md`、本卡、`TASK-062` 卡、`BOARD.md`。

**未做（属本人的边界）**：未改 `client/` `server/` `shared/` `cron-worker/`；未补 `EXEC_PLAN_TEMPLATE.md`（D3 另一半）；未产 `STATES.md`（D5）；未加 `docs:check`（D12）；未 `git add` / `commit`。

### 12.2 D3 半边交付记录 — `REVIEWER.md` v1（2026-10-29，Human 已批准）

**产出**：`docs/os/roles/REVIEWER.md`，0 字节 → **189 行**，状态 **`Approved v1`**（即日起生效，修订须 Human 复审并升版本号）。

| 节 | 内容 | 卡住的旧缺口 |
|---|---|---|
| §1 Role | 三条立场：Reviewer ≠ Implementer / 独立 / 只判断不裁决 | F4 只有散文式允许禁止 |
| §2 Responsibilities | **R1–R5 五类必做**（Requirement / Code / Architecture / Test / Regression）+ **R6–R8 触发式**（Security / Evidence & Docs / Scope & Deviation）+ §2.3 负向对照硬性要求 | 原无任何审查类型清单 |
| §3 Permissions | **路径级**写入范围：4 项允许写、5 项禁止写；`OQ-2` 定权 | F3「无路径级写入范围」 |
| §4 Workflow | 9 步，含钉基线（分支 + SHA + 工作区状态）与证据复用判断 | 无执行顺序 |
| §5 Verdicts | `Pass` / `Pass with issues` / `Fail` + 别名表；`BLOCKER` / `MAJOR` / `MINOR` 归属；独立性声明 | **D3 原文要求的判定词**；`R-4` 的严重度归属 |
| §6 停止条件 | 6 条何时必须停下上交 | F4「无停止条件」 |
| §7 Deliverables | 审查记录 9 个必填字段 + 单一归属位置 | 无交付物格式 |
| §8 反模式 | 10 条 | — |
| §9 边界 + §9.1 | 与四角色边界；`OQ-1`~`OQ-4` 四项裁决结果逐条落地 | 原四项悬置 |

**四项裁决（2026-10-29 Human）**：

| # | 裁决 |
|---|---|
| `OQ-1` | 判定词 **`Pass` / `Pass with issues` / `Fail`**（非 `PASS` / `PASS WITH FINDINGS` / `FAIL`）；历史别名不回改 |
| `OQ-2` | Reviewer **可**写审查状态与一行结论，**不可**写 `Completed` / `Done` / 合入状态，不可改 Owner / Priority / 依赖 |
| `OQ-3` | 严重度枚举**正式归 `REVIEWER.md` §5.2**；其他文档只引用 |
| `OQ-4` | 本文**先批 v1 并生效**；`TASK-062` 重写 `docs/os/roles/*` 时**必须保留本文全部条款**（062 的 `AC5` 直接引用本文） |

**为什么补了 R6–R8（相对「五类」的增补）**：`EXECUTION_PLANS.md` §7 早已把 **security review** 划给 Reviewer，但五类清单里没有它；R7 / R8 分别对应本仓库复发最多的两个问题——同一结论在卡片 / 计划 / 看板各存一份（D10），以及越界改动的静默化（TASK-043 plan §8）。

**同步改动**（避免新的漂移，均为「陈述与事实对齐」而非新规则）：
- 根 `AGENTS.md` §6「规范不可信」条：`REVIEWER.md` 由「空 / Draft」改为「`Approved v1` 且生效」；§9 末句加指向 `REVIEWER.md` §5 的归属声明。
- [BOARD.md](../../../BOARD.md) 的 052 / 062 两行；`TASK-062` 的 F4 / §2.2 D3 行 / §8 依赖行。

**校验证据**：
- 文件非空且含判定词与禁令（AC2 的 `REVIEWER.md` 半边）：`wc -l` = **189**；判定词 `Pass with issues` 见 §5.1；禁写「`client/` `server/` `shared/` `cron-worker/` 下任何文件（含测试）」见 §3。
- 相对链接全量校验：**93 份文件 / 845 条相对链接 / 失效 0 条**（含本轮新增的 `REVIEWER.md` 链接）。
- 零业务代码改动：本次只动 `docs/os/roles/REVIEWER.md`、`AGENTS.md`、`BOARD.md`、本卡、`TASK-062` 卡。

### 12.3 D5 交付记录 — `docs/os/process/STATES.md`（2026-10-29，Human 三项裁决）

**产出**：`docs/os/process/STATES.md`（新建，约 150 行）。这是状态词的**唯一归属**。

**三项裁决（2026-10-29 Human）**：

| # | 裁决 | 本方案的原始建议 | 差异说明 |
|---|---|---|---|
| ① | 状态词**全部用 Title Case** | 建议 UPPER_SNAKE（便于 grep） | **按 Human 裁决执行**。副作用已记入 `AC3`：`docs:check` 不能只靠 UPPER_SNAKE 字面量校验，须比对卡片实际取值 |
| ② | 任务与 ExecPlan **分两套**状态 | 一致 | — |
| ③ | `Completed` 定义**不改**（不含"已合入"） | 一致 | 合入状态拆为独立 `Merged` 字段；本卡 `D7` 的"`Completed ≡ 已合入`"提案**随之否决** |

**文档结构**：

| 节 | 内容 | 解决的旧缺口 |
|---|---|---|
| §1 | 两个正交问题 → 两个字段（`Status` / `Merged`），附实测证据 | **D5 + D7 的共同根因** |
| §2 | 任务 6 态：`Backlog` `Planning` `Implementing` `Reviewing` `Blocked` `Completed`，各含进入条件与退出物证 | 模板原 12 态 |
| §2.1 | 审查判定词**不是**状态：Reviewer 登记判定词，`Status` 的推进只有 Human | 消除 `REVIEWED` 这个不存在的状态 |
| §3 | ExecPlan 4 态：`Draft` `Approved` `Implementing` `Completed` + 与任务的差异表 | 流程原 8 态；`Plan Review` / `Verifying` / `Reviewing` / `Integrating` 归一 |
| §4 | 谁能推进哪个状态（含"→ `Completed` 只有 Human"）；登记动作的边界 | D6 的 State→Owner 映射（状态部分） |
| §5 | 免 ExecPlan 的判定只引用 `EXECUTION_PLANS §2`，不复述 | 避免第三份清单 |
| §6 | 看板分节 = `Status` 的投影，唯一来源是卡片 | D8 的看板漂移 |
| §7 | 别名表（不回改历史卡）+ 废弃表（6 个零使用词 + 原因） | D5 的历史兼容 |
| §8 | 同批需同步的 4 个文件 | 明确"已知未清" |

**筛选依据（实测，非臆断）**：逐卡提取 21 张任务卡 + 11 份计划的 `Status` 实际取值。结果：模板定义 12 态、实际只用 2 态（`BACKLOG` / `PLANNING`）+ 事实主导词 `COMPLETED`(9)；流程定义 8 态、实际用 3 态（`Approved` / `Completed` / 越界的 `Implemented`）。`Ready` / `Exploring` / `Plan Review` / `Implementing` / `Verifying` / `Integrating` / `Human Acceptance` **从未作为取值出现** —— 故废弃并发文防"恢复"。

**D5/D7 合并处置的实证**（2026-10-29 实测）：
- `TASK-058`：`Status = Completed`，`git merge-base --is-ancestor dd388ac main` = **是**（PR #38），但 `BOARD.md` 有 **4 处**仍写"未合入 `main`"。
- `TASK-054`：`Status = Completed`，代码**未合入**（`c7389d1`）。
- 两者同为 `Completed`、合入状态相反 → 证明"一个字段两个语义"必然出错，拆 `Merged` 后消解。

**同步改动**：根 `AGENTS.md` §3 路由表加 2 行（状态词 / 判定词，并明写"verdicts are **not** statuses"）；`docs/readme.md`「流程与协作」段登记 `STATES.md`；`DOCS.md` §1 目录职责 + §2.2 主题归属速查各加相关行；本卡 `D5` / `D7` / `AC3` / `AC4` / `AC8` / §7.2。

**未做（明确边界）**：未改 `TASK_TEMPLATE.md`、`EXECUTION_PLANS.md`、`REVIEWER.md`、`BOARD.md` 的 Done 表 —— 这四项是 `STATES.md` §8 列出的后续动作，**当前仍与 `STATES.md` 分叉**；未 `git add` / `commit`。

### 12.4 D2 交付记录 — 四份规范本地化（2026-10-29）

**范围**：`CODING.md` / `GIT.md` / `SECURITY.md` / `TESTING.md`。**不含 `ARCHITECTURE.md`** —— 它已于 2026-10-26 由 v2.0 重写（D2 对该文件的断言早已过时）。

**先修正 D2 的两条过时前提**：

| D2 原文 | 2026-10-29 实测 | 处置 |
|---|---|---|
| `ARCHITECTURE.md` 含 PostgreSQL/Prisma/OAuth/Teams | 已是 v2.0（261 行、中文、真实技术栈） | D2 的这一条**删除** |
| SECURITY「未写无认证、CORS `origin:true`」 | **前提已消失**：TASK-058 已落地认证；`server/app.js:85-95` 是白名单 + `credentials:true`，生产缺 `CORS_ORIGINS` fail-fast | 结论反了，**按新事实重写** |
| TESTING §5「九个 `<command>`」 | 实测 **8 个** | 数字更正 |
| GIT「`task/<id>`，实际全用 `feature/TASK-xxx`」 | ✅ 成立（8 个分支实测） | 采用 |
| CODING「引用无本项目边界的 ARCHITECTURE」 | 边界现已存在，问题变成**指向顺序** | 改为纯引用 |

**核心判断**：这四份文件**没有写错，而是任何项目都能原样使用**——机械统计本地化前本项目名词提及 **0 处**（合计 1 206 行）。正确的废话比写错更危险：读者会以为已被覆盖，于是没人去补真正的约定。

| 序 | 文件 | 改动 | 依据 |
|---|---|---|---|
| 1 | `SECURITY.md` §16 | 填掉唯一真占位 → 无公开披露渠道；记任务卡 + 当面告知 Human；先轮换后排查 | 自托管单家庭项目，答案无歧义 |
| 2 | `GIT.md` §2 / §3 / §4 / §5 / §12 | `main` 唯一主分支（并点名历史残留分支勿用）；`feature/TASK-<id>`（附 5 个真实分支）；`task/` 明确「从未使用」；合并策略 = **Merge commit**（PR #32–#39） | 事实被仓库写死，改错代价最高（会建错分支名）。§4/§5 的 `task/042` 示例一并改掉，避免刚改完又分叉 |
| 3 | `CODING.md` §5 | 模块边界改为**指向** `ARCHITECTURE §4/§7`，声明本文件不复述；补四包职责表 + `@portomind/shared/*` 引用规则 | 修的是**指向顺序**，不是内容缺失 |
| 4 | `TESTING.md` §5 + 新增 §5A | §5 的 8 个 `<command>` 全删 → 命令唯一归属 `DEPLOYMENT §7`；§5A 写本项目测试地形 | 原修法（填 6 条命令）**会破坏单一归属**，故改为引用 |
| 5 | `SECURITY.md` 整份 | 250 → 112 行，5 节：现状摘要（指向 DEPLOYMENT §9）/ 10 条红线 / 敏感变更须 ExecPlan / 审查须验拒绝路径 / 上报 | 原 16 节通用内容无法判定；改为**可读 diff 就能查**的红线 |

**TESTING §5A 的实质内容（这是本次信息密度最高的新增）**：

- 测试真实分布：`server/` 21 个集成、`cron-worker/` 11 个、**`shared/` 与 `client/` 均为 0**。
- 明确写出后果：业务规则只许住在 `shared/`，而它**零直接单测** → 解释了 TASK-051 的汇率反向缺陷为何在一年里全绿通过（既有测试手填 `7.2` 绕过了采集端）。
- **一次性脚本的处置：明确决定「留在仓库」**，推翻「跑完即删」的旧惯例。实测 `client/scripts/` 的 6 个脚本**全部已被 Git 跟踪**（修正 D11「未跟踪未登记」的说法），且只有 `server` 的 `e2e:auth` 有 npm 入口。附命名、可运行性、失效删除的规则。
- 方法论沉入：负向对照、恒显示类须构造空态、别 mock 你怀疑的那层、断言失败先怀疑实现、`SUCCEEDED` ≠ 有新数据。

**校验证据**：
- 四份文件占位符（`<command>` / `<main\|master\|develop>` / `<security contact / process>` / `<merge commit |` / `<task-id>` / `Record project-specific`）合计 **0**。
- 本项目名词提及：**0 → 39 处**（CODING 5 / GIT 10 / SECURITY 9 / TESTING 15）。
- 相对链接全量校验：**89 份文件 / 875 条 / 失效 0 条**。
- 业务代码改动 **0 行**（`git status -- client server shared cron-worker` 空）。

**同步改动**：根 `AGENTS.md` §6「规范不可信」条整条改写（原称四份为"不可信模板"已不成立），改为「哪些可用 / 哪些仍过期」，并保留唯一仍真实的两项：`EXEC_PLAN_TEMPLATE.md` 为空、`TASK_TEMPLATE.md` 的 12 态未与 `STATES.md` 对齐。

**仍未做（§12.4 结束时点）**：~~`EXEC_PLAN_TEMPLATE.md`（D3）~~、~~`EXECUTION_PLANS.md` 断尾五节（D4）~~ —— **两项已于同日随后完成，见 §12.5**。剩余：`TASK_TEMPLATE.md` v2 + 6 态（D9/D5 后续）、`docs:check`（D12）。

### 12.5 D3 + D4 交付记录 — ExecPlan 模板与流程文档补全（2026-10-29）

**方法**：D3 的要求是"用已验证的实践反推写模板"。故先对 `docs/development/exec-plans/completed/TASK-*.md` **9 份真实计划**做结构提取与出现率统计，再据实测结果写模板——而不是先想一个"理想模板"再去找依据。

**实测规律（这是模板的依据）**：

| 章节 | 出现率 | 结论 |
|---|---|---|
| §1 Intent | **9/9** | 必填；且其 6 个子节（Goal / Why / Scope / Out of Scope / Constraints / Acceptance Criteria）**9/9 顺序完全一致** —— 全篇最强规律 |
| §2 Context · §3 Repository Findings · §4 Proposed Design · §5 Work Breakdown · §6 Decisions · §7 Verification | **9/9** | 必填 |
| §8 Risks | 8/9 | 建议必填（缺的那份实施中确实遇到未预见冲突） |
| §11 Implementation Record · §12 Review Record | 7/9 | 实施/复核后必填（未写的两份是提前归档） |
| §10 Handoff · §13 Completion Record | 5/9 · 4/9 | 条件必填（跨会话协作 / 结案时） |
| §9 Rollback | 4/9 | 按需（仅依赖/schema/认证等不可逆变更） |
| Out of Scope 边界核对清单 | 2/9 | 偶发做法，**未**写成强制 |

**另外一个实测事实**：9 份计划的章节顺序**一致到 §7**，从 §8 起分叉（TASK-048 是 Risks→Rollback→OutOfScope→Handoff→Impl→Review→Completion，TASK-054 是 Risks→OpenDecisions→Handoff→Impl→Review→Completion）。**分叉点正是"记录类章节"**——这说明 §1–§7 是稳定的核心，§8 之后按任务性质增删是正常的，不必强行统一。

**产出 1：`docs/os/templates/EXEC_PLAN_TEMPLATE.md`（0 字节 → 254 行）**

结构 13 节，与 `EXECUTION_PLANS.md` §8 的章节号一一对应。每节附**实测出现率 + 填写要点**，让使用者知道哪些是硬要求、哪些可省。关键设计：

- **文档头明说"来自 9 份真实计划的归纳，不是通用范本"**，并声明章节号是契约（其他文档按编号引用，如 `PLANNER.md` 要求写 "§7 Verification"）
- `Status` 只允许 [STATES.md](../../../os/process/STATES.md) 的 4 态，并明写 `Plan Review`/`Verifying`/`Reviewing`/`Integrating` **是阶段活动不是状态**
- §7 Verification 要求"命令唯一归属 `DEPLOYMENT §7`"、每条对应 AC 编号、**已知覆盖缺口必须显式写出**
- §11 强调"偏差必须可审计，不能静默"—— 不允许偷偷改 §4 让它看起来符合计划
- 末尾附 7 条填写自检

**产出 2：`docs/os/process/EXECUTION_PLANS.md`（D4 断尾修复）**

| 改动 | 说明 |
|---|---|
| §6 Lifecycle 8 态 → **4 态** | 原文 `Draft → Plan Review → Approved → Implementing → Verifying → Reviewing → Integrating → Completed` + `Blocked`。改为 `Draft → Approved → Implementing → Completed`，并明写"计划没有 `Blocked` 态——被卡的是任务，此处再记一份必然漂移"（符合裁决 ② 与 ③） |
| §8 Required Structure 补全 | 原断尾于 §5 示例。现补 §5 收尾 + **新增 §6 Decisions / §7 Verification / §8 Risks / §9 Rollback / §10 Records / §11 Template**，并加一行指向模板（避免模板与流程文档各存一份骨架） |
| `Status` 枚举修正 | `Draft \| Plan Review \| ... \| Blocked \| Completed` → `Draft \| Approved \| Implementing \| Completed` |

**产出 3：`docs/os/roles/REVIEWER.md` §3 同步** —— 原写"当前实践为 `REVIEWING` → `REVIEWED`；`STATES.md` 落地后以其枚举为准"，现改为"审查结论用判定词表达，`Status` 的 6 态归 `STATES.md`，→ `Completed` 只有 Human"。这样 `STATES.md` §2.1 的决定（审查结论不是状态）落到角色卡上。

**校验证据**：
- 相对链接：**89 份文件 / 883 条 / 失效 0 条**。（过程中出现过 1 条坏链：模板里 `Related task` 的占位路径 `TASK-XXX-<slug>.md`。已改为纯文本 + 提示"填写后改成相对链接"，避免模板本身携带死链。）
- 旧的 8 态 Lifecycle 字符串：`grep` 命中 **0**。
- 业务代码改动 **0 行**。

**顺带记下一处 D4 未提但同样致命的缺陷**：该文件 §6 与 §8-`Status` 的枚举**本身就不一致**（§6 是 8 态 Title Case，§8 是 9 态含 `Blocked`）。现已统一为 4 态。

#### 12.5.1 第一版实现的返工（2026-10-29 同日晚，Human 要求复查）

> **本节的教训比改动本身重要**：第一版交付时我自评"D3 + D4 完成"，Human 要求复查后实测发现**两个真实缺陷**。记录在此，因为它们是本卡要消灭的那类问题的复现。

**缺陷 1（实质）：流程文档骨架 ⊋ 模板，我亲手造了第二份真相**

| 来源 | 节数 | §10 起 |
|---|---|---|
| `EXECUTION_PLANS.md` §8 骨架（第一版） | 12 | §10 把 Handoff/Impl/Review/Completion **合并成一节** |
| `EXEC_PLAN_TEMPLATE.md` | 15 | 拆成 §10 §11 §12 §13 四节 |
| 真实计划（TASK-054） | 14 | 与**模板**一致 |

即：流程文档说的和模板说的不一样，而真实计划跟模板一致 → 流程文档那一份是错的。更糟的是它的 `## 11. Template` 因合并而**错位**（按模板同一位置是 Implementation Record）。

**缺陷 2（形式）：骨架被写成真实 Markdown 标题**

`## 8. Required ExecPlan Structure` 下直接跟 `# TASK-XXX — Task Name` 与 `## Status`、`## 1. Intent`…**无代码围栏**。后果：文档内出现两套 `## 1.`–`## 8.`（`## 8.` 实际出现两次），锚点互相冲突。

**修法（一次改动解决两个问题）**：§8 改为「围栏内 13 节骨架 + 每节用途说明 + 指向模板」三块。流程文档不再维护第二份完整骨架，其职责收窄为**解释每节为什么存在**，符合 `DOCS.md` 单一归属。

**修复后校验**：
- 真实二级标题（排除围栏内）：`1`–`9`，**无重复**（原 `8` 出现两次 → 现 1 次）。
- 骨架 13 节 ↔ 模板 13 节（+Status/自检）↔ 真实计划 13 节，**三者节号一致**。
- 代码围栏配对：`^``` ` 计数 = 2（一开一合）。
- 相对链接：**879 条 / 失效 0 条**。
- 行数 445 → 305（去重后更短，但信息无损：删的是重复骨架，留的是每节用途）。

**为什么第一版没发现**：我在自检时用 `grep '^## 6. Verification'` 去找 D4 要求的节，误报"命中 0"，随后又用宽松匹配说服自己"已补"。**真正的问题是没做交叉比对**——只验证了"节存在"，没验证"流程文档、模板、真实计划三者一致"。这条已作为教训写入本节。

**同步**：`TASK-062 §3` 分工表中「补 §6–§10 断尾五节」与「补空模板」两格已标为 052 已完成，避免 062 开工时以为还有活。

### 12.6 D9 交付记录 — `TASK_TEMPLATE.md` v2（2026-10-29）

**方法**：同 D3 —— 先测真实写法，再定模板。对 **21 张任务卡**提取章节结构与字段，再据出现率决定必填/按需。

**实测规律**：

| 节 | 出现率 | v1 对应节 | 判定 |
|---|---|---|---|
| 问题 / 缺陷描述 / 背景 | 17/21 | `Goal` + `Why` | v1 两节合并为 v2 一节（**问题优先**） |
| 已核实的事实 / 复现步骤 / 根因 | 16/21 | **无** | v1 缺这一节，而它是本仓库卡片最有价值的部分 |
| Acceptance Criteria | 17/21 | AC | 保留 |
| Scope | 17/21 | Scope + Out of Scope | 合并为一节，Out of Scope 写一行 |
| Risks | 15/21 | **无** | v1 缺 |
| Blocking Dependencies | 13/21 | Dependencies | 保留（只保留阻塞项） |
| Coordination Notes | 14/21 | Coordination Notes | 保留，并明确禁写实现历史 |
| 记录节（Impl/Review/Completion） | 3–6/21 | Completion | 改为**按需 + 明确归 ExecPlan** |

**关键发现：D9 原文说"事实模板是 7 节"，实测为 9 节**——049/050/051 三张同构卡实际是「问题 / 已核实的事实 / AC / Scope / Risks / Blocking Dependencies / Coordination Notes」7 节 + 按需的 `Open Questions` 与记录节。已据实修正，并在 AC5 与 D9 条目里标注了这个偏差（不隐藏）。

**v1 的六节为何被删**：`Goal`/`Why`/`Out of Scope`/`Constraints`/`Related Documentation`/`ExecPlan Decision` 合计使用率极低（合规率 58/110 = 52.7%）。其中：
- `Goal`+`Why` → 并入 §1 问题
- `Out of Scope` → 并入 §4 Scope 的一行
- `Constraints` → 并入 §2 已核实的事实 / §4 Scope（真实卡片把约束写成事实，更可检验）
- `Related Documentation` → 由根 `AGENTS.md` §3 路由表承担，卡片不再维护第二份
- `ExecPlan Decision` → 并入 Metadata 的 `Execution Plan` 字段

**产出**：`docs/os/templates/TASK_TEMPLATE.md` 191 → **152 行**，9 节 + 自检。改动要点：

- **Status 改 6 态 Title Case**，并强制"必须取 `STATES.md` §2 之一"
- **Metadata 改表格形式**，补 v1 遗漏的 `Type`（8/10 张卡自发使用）与必填的 `Updated`
- **§2「已核实的事实」升为正式节**，写明"每条指到 `文件:行`、区分已核实与推测"
- **§9 记录节明确「唯一归属是 ExecPlan」**，只在无计划的轻量任务里写（对应 D10）
- 顺带修掉 v1 的 `docs/producr/` 笔误（D8 曾记录）
- 附 9 条填写自检

**校验证据**：
- 旧 12 态残留：`grep -c` = **0**。
- 未定义占位：16 处 `<…>` 逐个核对，**全部为填写位**（无 `<command>` / `<PROJECT_NAME>` 类）。
- AC3 机器校验：`grep -rnE '\b(BACKLOG|PLAN_REVIEW|HUMAN_ACCEPTANCE|INTEGRATING|VERIFYING|EXPLORING|READY)\b' docs/templates docs/process` → **仅命中 `STATES.md:121` 的别名表**。
- 相对链接：**879 条 / 失效 0 条**。
- 业务代码改动 **0 行**。

**同步**：`STATES.md §8` 的 4 项同步清单已标 3 项完成，`BOARD.md` 的 `Merged` 列标为唯一未清项并说明**必须由 Human 维护**（§4 规定 `Merged` 只有 Human 能改）。

### 12.7 D5 收尾 — 历史卡豁免与 `Merged` 列（2026-10-29，Human 裁决后）

**Human 裁决**：「当前已经存在的 task 任务卡，就不改了！」

#### 这个裁决修掉了一条自相矛盾的规则

`STATES.md §7` 原写"不回改历史卡"，而 `AC3` 原写"所有卡片的 `Status` 值 ∈ 枚举"。两条同时成立不可能——21 张历史卡用的全是旧词（`BACKLOG` 5 张、`PLANNING` 2 张、`Draft` 2 张、`COMPLETED` 9 张、`Approved` 1 张），**AC3 永远无法通过**。

**修法**：`STATES.md` 新增 **§7.0 适用范围与生效基准**：

| 对象 | 规则 |
|---|---|
| 2026-10-30 前已存在的卡（当前 21 张） | **豁免**：保留原写法、不回改、按别名映射理解、**不计校验失败** |
| 2026-10-30 起新建或变更 `Status` 的卡 | **必须**用 6 态 Title Case |
| ExecPlan | 同上，基准一致 |

判定"新卡"的依据也写死了：`Created`/`Updated` ≥ 2026-10-30，或此后发生过 `Status` 变更。这样规则**既尊重历史事实、又可机械校验**。

#### `Merged` 列：我之前的判断错了一半

上一轮我说"这项不该由我做"，理由是 §4 规定 `Merged` 只能 Human 维护。**这个理由对，但结论错**——我把两件事混成一件：

| 动作 | 谁能做 | 我上一轮的判断 |
|---|---|---|
| **加列**（改表头结构） | agent 可做 | ❌ 误判为不可做 |
| **填值**（判定每个任务是否已合入） | **只有 Human** | ✅ 正确 |

**已修正**：`BOARD.md` Done 表已加 `Merged` 列，10 行全部填 `—`（未判定），表下附三条规则：取值含义 · 判定命令 `git merge-base --is-ancestor <sha> main` · **只有 Human 能填**。并注明「`—` 表示未判定，不等于未合入；不要用 `Completed` 推断合入状态」。

#### 顺带修掉一处我自己写错的事实陈述

`STATES.md §6` 原写「`BOARD.md` 的**四个**分节由 `Status` 派生」。实测看板有**五个**分节：`Active` / `Backlog` / `Blocked` / `Done` / **`Roadmap`**。

已改为五个，并把 `Roadmap` 明确标为 **❌ 非状态视图**（它是路线图叙述"下一步做什么"，与 `Status` 无关，不应被映射）。这正是本卡一直要消灭的"文档说 A、实际是 B"。

#### 校验证据

- **AC3 校验 1（定义处唯一）**：`grep -rnE "\b(BACKLOG|PLANNING|PLAN_REVIEW|IMPLEMENTING|VERIFYING|REVIEWING|INTEGRATING|HUMAN_ACCEPTANCE|COMPLETED)\b" docs/templates docs/process` → **仅 5 处、全部在 `STATES.md`**（别名表 3 处 + §8 说明 2 处），`docs/os/templates/` **0 处**。
- **`Merged` 列**：表头存在（1 处），10 个数据行列数一致（每个 5 列）。
- 相对链接：**884 条 / 失效 0 条**。
- 业务代码改动 **0 行**。

#### D5 状态：规则侧已闭环，事实侧待 Human

| 项 | 状态 |
|---|---|
| 唯一枚举落地 | ✅ `STATES.md` |
| 模板 / 流程 / 角色卡同步 | ✅ 4 项中 3 项（`TASK_TEMPLATE` / `EXECUTION_PLANS` / `REVIEWER`） |
| 历史卡豁免规则 | ✅ `STATES.md §7.0` |
| `Merged` 列结构 | ✅ 已建 |
| **`Merged` 值** | 🔴 **待 Human 逐个判定** |

**结论**：`AC3` 已通过（历史卡豁免后规则自洽且可校验）；`AC4` 前半通过、**后半待 Human 填值**，故 AC4 整体仍为未通过。这是**设计使然**，不是缺陷——`Merged` 的判定需要权威依据，agent 代填就等于制造第五条假事实。

### 12.8 D7 收尾 — `Merged` 填值 + 看板错述更正（2026-10-29，Human 授权实测）

**Human 授权**：跑 `git merge-base --is-ancestor` 把实测结果列出，确认后填值；并同意与错述更正**一起做**。

#### 实测方法

对每个已结案任务取其卡片/看板记录的实现提交，逐个执行 `git merge-base --is-ancestor <sha> main`；对未记 SHA 的原型三卡，查其产物是否在 `main` 中并用 `git log --ancestry-path` 回溯首次进入 `main` 的 PR。

#### 实测结果：**10/10 全部已合入**

| 任务 | 提交 | 结果 | 首次进入 `main` 的 PR |
|---|---|---|---|
| TASK-043 | `891d0f7` | MERGED | #32（与 044 同批） |
| TASK-044 | `30dc525` | MERGED | #32 |
| TASK-048 | `fb5fdaf` | MERGED | #34 |
| TASK-049 | `69576ad` | MERGED | #33 |
| TASK-050 | `cafcc5d` | MERGED | #35 |
| TASK-054 | `c7389d1` | MERGED | #36 |
| TASK-058 | `dd388ac` | MERGED | #38 |
| TASK-059 | `1895530` | MERGED | #36 |
| TASK-060 | `3ba27e4` | MERGED | #36 |
| TASK-061 | `3ba27e4` | MERGED | #36 |

`main` = `2bde913`。

#### 这推翻了看板里两处明确陈述——而这正是 D5/D7 的活证据

| 位置 | 原陈述 | 实测 |
|---|---|---|
| `BOARD.md` 在途段 / Done 表 058 行 | 「代码仍在分支，**未合入** `main`」 | `dd388ac` 在 `main` 内（PR #38） |
| `BOARD.md` 在途段 / Done 表 054 行 | 「代码在分支 `c7389d1`，**尚未合入**」 | `c7389d1` 在 `main` 内（PR #36） |
| `docs/readme.md` | 「已结案待合入」单列 TASK-058 | 无待合入项 |
| `STATES.md §1` | 「`TASK-054` 代码**未合入**」 | 已合入；该处**是我自己写错的**，见下 |

**根本原因一致**：都是采信了旧记忆/旧陈述，没有跑命令。`STATES.md §1` 那处尤其值得记——我为了论证"`Completed` 不该兼表合入"而举 `TASK-054` 为例，却没有实测，于是自己也制造了一条假事实。已在 §1 加「更正记录」并保留原错误可追溯。

#### 已完成的修改

**① `Merged` 列（10 行填值）**：全部填 `` `Merged` `` + PR 号。SHA 不重复写入该列（「产出」列已有）。

**② 看板错述更正（现行层，历史卡按裁决不动）**：

| 文件 | 改动 |
|---|---|
| `BOARD.md` 在途段 | 删去两处「未合入」断言，改为实测结论 + 「合入状态统一由 `Merged` 列表达，本段不再重复陈述」；`main` 由 `0d95319` 更新为 `2bde913` |
| `BOARD.md` Done 表 058 / 054 行产出列 | 「未合入」改为「合入状态见 `Merged` 列（实测已随 PR #38 / #36 进入 `main`），此前陈述已作废」 |
| `BOARD.md` Blocked 表 | 「其接口未合入 `main` 前，下游只能按接口 404 空态开发」→ 已合入，下游可直接依赖 |
| `docs/readme.md` | 「已结案待合入」→ **无**，并说明合入状态以 `Merged` 列为准 |
| `STATES.md §1` | `TASK-054` 实证结论更正 + 加「更正记录」段，保留原错误 |

**不做（按 Human 裁决 2026-10-29「当前已存在的任务卡就不改了」）**：`docs/development/tasks/completed/TASK-054`、`TASK-058` 卡片内 §11.3「尚未合入 `main`」等历史记录、以及 `development/exec-plans/completed/` 下的同类陈述。它们是**当时时点的真实记录**，改写会破坏审计链。当前生效的 `Merged` 列已覆盖其结论。

#### 校验证据

- `Merged` 列：Done 表 **12 行全部 5 列**，10 个任务值为 `` `Merged` #<PR> ``。
- 剩余「未合入」字样 3 处：均为**更正说明 / 作废标记 / 规则定义**，非断言。
- 相对链接：**886 条 / 失效 0 条**。
- 业务代码改动 **0 行**。

#### AC4 状态

**AC4 现已通过**：`Merged` 列存在且 10 个值全部与 `git merge-base` 实测一致。

### 12.9 D6 交付记录 — State→Owner→证据 映射与 Integrator 退场（2026-10-29，Human 裁决方案 A）

**Human 裁决**：采用方案 A（映射唯一归属 `STATES.md`）；**不新建 `INTEGRATOR.md`**，合入由 Human 完成。

#### 开工前的实测：三项要求一项都没做

| D6 要求 | 实测（开工前） |
|---|---|
| ① §7 增三列表 | `§7` 仍是散文「Owns: …」列表，**无 State 列、无证据列** |
| ② Orchestrator 补入 | `grep -c -i orchestrator docs/os/process/EXECUTION_PLANS.md` = **0** |
| ③ `Integrating` 定义或删除 | `§7` 仍有 `### Integrator` 节；状态词虽已废弃，**角色描述还在** |

#### 一个必须先说明的矛盾

`STATES.md §4` 开工前**已经**在做 State→Owner→记录位置 的映射（含 Orchestrator、含 `Merged`），而 `EXECUTION_PLANS §7` 也在描述角色归属、但**没有 Orchestrator、却有 Integrator**。

**同一主题两处描述、结论相反** —— 这是 D10 类问题。所以方案 A 不是"再写一份映射"，而是**把两处收敛成一处**。

#### 改动 1：`STATES.md §4` 升级为唯一映射表

标题由「谁能推进哪个状态」改为「**谁能推进哪个状态 → 必须产出的证据**」，拆成三张表：

| 表 | 列 |
|---|---|
| 任务卡状态 | 状态变更 / Owner / **必须产出的证据** / 记录位置 |
| ExecPlan 状态 | 同上 |
| **合入（不属于任何状态）** | 动作 / Owner（只有 Human）/ 证据 / 记录位置 |

关键补强：`→ Implementing` 要求"`Approved` ExecPlan 或卡内免计划依据"；`→ Completed` 要求"AC 逐条 + 验证实跑 + 审查收敛（BLOCKER 清零；MAJOR 已整改或 Human 明示接受）"——**每条都写明必须拿到什么证据才能推进**，而不只是"谁能点这个按钮"。

#### 改动 2：`EXECUTION_PLANS §7` 补 Orchestrator、删 Integrator

- 开头加一句：本节只描述**角色负责什么**，**不复述"谁能推进哪个状态"**（那归 `STATES.md` §4）
- **新增 `### Orchestrator`**：检查启动条件与依赖 / 决定下一阶段负责人并产出交接 / 维护 `Status` 准确性 / 上报阻塞。并明写它是**协调角色，不写代码、不做技术方案、不出审查判定**
- Human 节补一条：**`merging into main`（只有 Human 合入）**
- **删除 `### Integrator`**，新增 `### No Integrator role` 说明四条理由：合入是 Human 动作从未下放 · `Integrating` 状态已废弃、合入改由 `Merged` 字段表达 · 历史上它有三个竞争主人（044 用过、048 明确跳过、050 停在 `Reviewing` 等一个始终未发生的转换）· 为已废弃状态建角色文件等于给它续命

#### 改动 3：连带修掉 D2 的遗漏

grep 全仓发现 Integrator 还残留在两份规范里（属 D2 本地化时的漏网）：

| 文件 | 原状 | 现状 |
|---|---|---|
| `GIT.md §13` | "Complex conflicts may require the Integrator or human owner." | → 只 Human，附链接 |
| `GIT.md §16` | "For multi-agent tasks, the Integrator is responsible for: …"（5 条职责） | → 改为三步分工表（分支合并=Implementer 在 Human 指示下 / 验证=Implementer 跑、Reviewer 独立确认 / **合入后确认=Human**），并写明合并后须填 `Merged` 列 |
| `TESTING.md` | "Integrator runs combined verification after merge" | → "the **Human** runs or confirms combined verification after merge" |

#### 校验证据

- `grep -c '^### Orchestrator' docs/os/process/EXECUTION_PLANS.md` = **1**
- `grep -c '^### Integrator' docs/os/process/EXECUTION_PLANS.md` = **0**
- `grep -c '必须产出的证据' docs/os/process/STATES.md` = **3**（三张表）
- `docs/os/roles/INTEGRATOR.md` **不存在**（按裁决不建）
- 全仓 `Integrator` 剩余命中仅为**说明"没有这个角色"**的句子，无一处仍在派活
- 相对链接：**895 条 / 失效 0 条**
- 业务代码改动 **0 行**

#### 同步

`STATES.md §8` 清单新增 §7 / GIT.md / TESTING.md 三行，并把 `Merged` 行由"值待 Human"更新为已完成；该清单现已**全部清空**。

---

## 13. 结案记录与豁免（2026-10-29，Human 裁定）

**结案依据**：Human 于 2026-10-29 直接指示「把 052 标记为 `Completed`」。
按 [STATES.md](../../../os/process/STATES.md) §4，`→ Completed` 的 Owner **只有 Human**，且允许「MAJOR 已整改**或 Human 明示接受**」——本节即该明示接受的登记处。

### 13.1 结案时的 AC 实测（未全通过，如实记录）

| AC | 结果 | 实测证据（2026-10-29 亲跑） |
|---|---|---|
| AC1 | ❌ **未满足** | `grep -c "docs:check" package.json` = **0**；`scripts/check-docs.mjs` **不存在**；`npm run docs:check` → `missing script`。**2026-10-30 更新：脚本已建（`scripts/check-docs.cjs` + `npm run docs:check`，规则见 §7.3），但全仓仍有 `99` 条失效链接 → 退出码 `1`，AC 仍未满足。** |
| AC2 | ✅ 满足 | `REVIEWER.md` 189 行；`EXEC_PLAN_TEMPLATE.md` 254 行 / 13 节；`EXECUTION_PLANS.md` 324 行，§6–§13 齐；根 `AGENTS.md` 占位符 0 |
| AC3 | ✅ 满足 | 9 个 UPPER_SNAKE 词在 `docs/templates` + `docs/process` **仅命中 `STATES.md`**（5 处，全在别名/废弃表） |
| AC4 | ✅ 满足 | `BOARD.md` Done 表含 `Merged` 列，10/10 已填 |
| AC5 | ✅ 满足 | `TASK_TEMPLATE.md` 152 行，问题优先 9 节 + Metadata + 自检附录 |
| AC6 | ❌ **未满足** | `docs/readme.md:72` 已无状态词 ✅，但同段「阻塞中：无」与 `TASK-051:176-177`、`TASK-053:123`、`TASK-057:163` 的自述「⏳ 阻塞」矛盾 |
| AC7 | ❌ **未满足** | 死链 **0**（898 条链接全可解析）✅；但 `docs/issues.md`（8 行）与 `docs/handbook/manual/Concept.md`（6 行）**未登记 `docs/readme.md`** |
| AC8 | ✅ 满足 | 四份规范 `<command>` / `<PROJECT_NAME>` 等占位符全为 **0**；GIT 用 `feature/TASK-xxx`；TESTING 命令指向 DEPLOYMENT §7 |
| AC9 | ❌ **未满足** | 无任何按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §5 判定词出具的独立审查记录 |
| AC10 | ✅ 满足 | `git status client server shared cron-worker` 空输出 |

**合计：6 通过 / 4 未通过。**

### 13.2 Human 明示接受的残余项（**不是"已通过"，是"被接受的风险"**）

| # | 残余项 | 接受理由（Human 裁定） | 后续归属 |
|---|---|---|---|
| 1 | **AC1 / D12** `docs:check` 校验环未建 | 第三批工作量独立（脚本 + 规则集 + 触发方式 OQ-5 未裁），不阻塞本卡已交付的规则文本 | 建议另立新卡，`§7.3` 已写好 6 条规则集可直接实施。**2026-10-30 进展：脚本已建成并接入 `npm run docs:check`（4 条规则 + 三种卡片格式兼容），但 99 条既有死链未清 → AC1 仍红。清链上属独立工作量（`docs/development/requirements/` + `docs/handbook/manual/` 重构的收尾），见 §12.1。** |
| 2 | **AC6** 看板「阻塞中：无」与 3 张卡不一致 | 涉及 3 张他人任务卡的措辞，改卡片超出本卡边界；改看板又需逐卡核对 | 随各卡推进时自然消解，或另立看板一致性小卡 |
| 3 | **AC7** `issues.md` / `Concept.md` 未登记 | 两份为无主笔记（8 行 / 6 行），去留本身是 Human 决策（见 §11 `OQ-3`，至今未裁） | 待 `OQ-3` 裁决后一并处理 |
| 4 | **AC9** 无独立 Reviewer 复核 | 本卡为纯文档卡，Human 已逐条过目并亲自裁定结案；再找独立 Reviewer 的成本高于收益 | 豁免；若后续对某条整改有异议，按 `REVIEWER.md` 单独发起 |

> **纪律声明**：以上 4 项在 `BOARD.md` Done 表与 `docs/readme.md` 中**不得**被表述为"全部通过"。任何人都可以在一年后据此复现"为什么它带着 4 条未满足结案"。

### 13.3 未做但**不属于**本卡残余项的（原就不在范围）

`§7.4` 已明确排除：**D11**（验证资产化）、**D13**（记忆提升为 PLAYBOOK）、**D15**（轻量通道）——需 Human 决策或另立任务，见 §11 的 `OQ-1` / `OQ-4`。

### 13.4 归档动作

| 动作 | 结果 |
|---|---|
| 卡片移动 | `docs/development/tasks/active/` → `docs/development/tasks/completed/`（[DOCS.md](../../../os/standards/DOCS.md) §1） |
| 卡内同级链接 | `../BOARD.md` / `../complete/*` 保持不变；`TASK-0xx-*.md` 等同级引用改为 `../active/*` |
| `BOARD.md` | Backlog 表移除本行；Done 表新增一行（`Completed` = 2026-10-29，`Merged` = `Pending`） |
| `docs/readme.md` | 「待立项/待排期」列表移除本行；「已完成任务」列表新增条目 |
| 入链修正 | `AGENTS.md` §6、`STATES.md` §1、`TASK-062` §Metadata（5 处）路径改为 `complete/` |
| 相对链接校验 | 见 §13.5 |

### 13.5 结案校验

**归档后复跑（2026-10-29 22:5x，实跑）**：

- 相对链接全量校验：**89 份文件 / 899 条相对链接 / 失效 0 条**（复跑命中的文件含根 `README.md`、`AGENTS.md`、`docs/**`、`client/AGENTS.md`、`server/README.md`、`cron-worker/AGENTS.md`）。
- 残留旧路径引用：`grep -rn "development/tasks/active/TASK-052" docs/ AGENTS.md README.md` = **0**。
- 卡片位置：`docs/development/tasks/completed/TASK-052-agent-rules-update.md` 存在；`docs/development/tasks/active/` 中**已无**本卡。
- 看板：`BOARD.md` Backlog 表**已无本行**；Done 表首行为本卡，`Completed` = 2026-10-29、`Merged` = `Pending`。
- 业务代码改动：**0 行**（`git status client server shared cron-worker` 空输出）。
- `git add` / `commit`：**未执行**（合入属 Human）。
