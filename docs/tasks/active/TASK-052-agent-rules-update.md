# TASK-052 — Agent 运行规则（docs 治理层）审计与整改

| 项 | 内容 |
|---|---|
| **Status** | `Draft`（2026-10-26 立项）—— 审计结论已落盘，**整改尚未开始**；整改范围与顺序待 Human 批准 |
| **Priority** | `High`（规则是每个 agent 会话的准入依赖；当前有 2 份 0 字节、1 份断尾、5 份未本地化模板被引为权威） |
| **Owner** | `—`（待指派；建议 Orchestrator 收口、文档改动由 Implementer 执行、独立 Reviewer 复核） |
| **Type** | `Process / Docs`（纯文档 + 一个校验脚本，**不碰 `client/` `server/` `shared/` `cron-worker/`**） |
| **Created / Updated** | `2026-10-26` |
| **Related Product Spec** | `None` |
| **Related ADR** | `None` |
| **Execution Plan** | `Not required`（三批均为文档类改动，逐批提交 diff；如 Human 要求补，则由 Planner 按 [EXECUTION_PLANS](../../process/EXECUTION_PLANS.md) 产出） |
| **来源** | Human 于 2026-10-26 要求「阅读 `docs/` 下的文档，了解本项目的 agent 运行规则，指出好的地方与需要优化的地方」。本卡合并两轮审计：第一轮为全量通读 + `.git`/记忆交叉核对；第二轮为治理层逐文件核对与合规率统计 |

---

## 1. 问题

本项目的 agent 运行规则实际由**三层**构成，而书面那层有明显空洞：

1. **书面层**（`docs/`）：[AGENTS.md](../../../AGENTS.md)、[docs/readme.md](../../readme.md)、[DOCS.md](../../standards/DOCS.md)、[EXECUTION_PLANS.md](../../process/EXECUTION_PLANS.md)、`docs/agents/*`、`docs/templates/*`、`docs/standards/*`；
2. **隐性层**：`.workbuddy/memory/MEMORY.md` 里沉淀的分支模型、审查方法、环境坑——**不受 docs 治理、不在索引内**；
3. **模仿层**：agent 实际按"上一份同类产物"的格式写作——模板为空时这是必然结果，也是 [§5.2](#52-任务卡模板合规率实测) 那些分叉的直接成因。

三层交集才是事实规则。书面层的缺陷不是"写错了"，而是**没写完、没本地化、没有机械校验**，于是流程设计（这部分相当成熟，见 [§6](#6-值得保留的优点)）与文档实现不在同一水平，且已知问题会长期悬置（如 [ARCHITECTURE.md](../../architecture/ARCHITECTURE.md) 未填充一项自 2026-10-15 已记录，至今未动）。

**本卡的判断**：只读 `docs/` 的 agent 无法回答四个关键问题——(a) 哪个状态字符串是合法的；(b) Reviewer 能做什么、不能做什么；(c) 已完成的计划放在哪个目录；(d) `Completed` 是否意味着代码已合入主线。

---

## 2. 审计范围与方法

**范围**：`docs/` 全部 40 份 md（索引、流程、模板、角色、规范、手册、架构、ADR、产品线、任务卡、执行计划）+ 仓库根 [README.md](../../../README.md)、[AGENTS.md](../../../AGENTS.md) + `client/AGENTS.md`、`cron-worker/AGENTS.md` + `.workbuddy/memory/` 8 份记忆 + `.git/HEAD`、`.git/packed-refs`、`package.json`。

**方法**：全文通读（逐条留 file:line 证据）；对任务卡按 [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md) 的 11 个顶层章节做逐卡计数；对看板/索引与卡片元数据做三方核对；对文档声称的代码事实（交易方向、目录名、脚本路径、环境变量）与源码/实际目录对账。

**限制**：本会话 `pwsh` 报 `SetNamedSecurityInfoW failed (Win32 5): grantWrite(D:\projects\portomind)`，无法执行 `git`/`npm`。故分支与提交状态取自 `.git/HEAD`（当前 `refs/heads/main`）、`.git/packed-refs` 与记忆记录交叉核对；未运行 build/test（本轮未改任何业务代码，也不需要）。

---

## 3. 关键结论：规则的"三层结构"

| 层 | 内容 | 状态 |
|---|---|---|
| **真实层（在用、项目特有）** | [docs/readme.md](../../readme.md) 索引、[DOCS.md](../../standards/DOCS.md) 单一归属、[TASKS.md](../TASKS.md) 看板、任务卡、ExecPlan、[ADR-002](../../architecture/adr/ADR-002-single-scheduler.md)、四份 `manual/`、`product/lines/` | 质量高，且在持续维护（链接校验从 154 条做到 378 条、失效 0） |
| **空壳层（复制来、未本地化，却被引为权威）** | [AGENTS.md](../../../AGENTS.md)（464 行，仍在用 `<PROJECT_NAME>` 占位）、[ARCHITECTURE.md](../../architecture/ARCHITECTURE.md)（627 行示例）、[CODING.md](../../standards/CODING.md)、[GIT.md](../../standards/GIT.md)、[SECURITY.md](../../standards/SECURITY.md)、[TESTING.md](../../standards/TESTING.md)、[ADR-001](../../architecture/adr/ADR-001-authentication.md)（363 行空模板）、[REVIEWER.md](../../agents/REVIEWER.md)（0 字节）、[EXEC_PLAN_TEMPLATE.md](../../templates/EXEC_PLAN_TEMPLATE.md)（0 字节） | 约 2 700 行不含本项目事实；其中 3 份是"被引用但内容为空/断尾" |
| **隐性层（事实规则，但不受治理）** | `.workbuddy/memory/MEMORY.md`（分支堆叠模型、审查方法、环境坑、已裁决"不改"清单） | 不在索引、不在 DOCS.md 适用范围、与书面规范冲突（如分支命名） |

---

## 4. 缺陷清单

> 每条只出现一次；后续章节按 ID 引用。行号以 2026-10-26 读取为准。

### P0 — 阻塞 agent 正确执行

| ID | 缺陷 | 证据 | 最短修法 |
|---|---|---|---|
| **D1** | 仓库根 `AGENTS.md` 是未填充通用模板：8 处占位符（`<PROJECT_NAME>`、`<technology>`×5 等），2 条错路径 `docs/tasks/completed/`、`docs/exec-plans/completed/`；且它**不在** DOCS.md §1 的适用范围内（该节只列根 README 与各 workspace 文档） | [AGENTS.md:39-51](../../../AGENTS.md#L39-L51)、[:127](../../../AGENTS.md#L127)、[:162](../../../AGENTS.md#L162)；[DOCS.md:3](../../standards/DOCS.md#L3) | 重写为"本项目入口 40 行"（读什么、开工前查什么、四模块边界、禁令、入口命令），通用方法论下沉到 `docs/standards/`，并把根 AGENTS.md 纳入 DOCS.md 适用范围 |
| **D2** | 5 份规范/架构文件是未本地化英文模板，却承担权威引用：[ARCHITECTURE.md](../../architecture/ARCHITECTURE.md) 含 PostgreSQL/Prisma/OAuth/Teams 示例；[TESTING.md](../../standards/TESTING.md) §5 九个 `<command>` 占位，却写"agents should use these commands instead of guessing"；[GIT.md](../../standards/GIT.md) 留 `<main\|master\|develop>` 与 `task/<id>`（实际全用 `feature/TASK-xxx`）；[SECURITY.md](../../standards/SECURITY.md) 留 "Record project-specific security reporting procedure here"，且**未写本项目最重要的安全事实**（无认证、CORS `origin:true`、仅可信网络）；[CODING.md](../../standards/CODING.md) 要求"遵守 ARCHITECTURE.md 的模块边界"而该文件无本项目边界 | [ARCHITECTURE.md:97](../../architecture/ARCHITECTURE.md#L97)；[TESTING.md:114-150](../../standards/TESTING.md#L114-L150)；[GIT.md:22](../../standards/GIT.md#L22)、[:34](../../standards/GIT.md#L34)；[SECURITY.md:246-248](../../standards/SECURITY.md#L246-L248)；[CODING.md:105-107](../../standards/CODING.md#L105-L107) | 见 §7.2：ARCHITECTURE 重写 20-30 行真实架构；TESTING §5 填 6 条真命令（可直接取 [DEPLOYMENT.md:283-288](../../manual/DEPLOYMENT.md#L283-L288)）并改为"命令唯一归属 DEPLOYMENT §7"；GIT 重写为本项目 3 节；SECURITY 顶部加"当前安全现实"节；其余通用内容移入 `docs/templates/` 或删除 |
| **D3** | 两份决定流程质量的文件为空：[REVIEWER.md](../../agents/REVIEWER.md) 0 字节（但它是所有 "AC: 独立 Reviewer 复核" 的依据）；[EXEC_PLAN_TEMPLATE.md](../../templates/EXEC_PLAN_TEMPLATE.md) 0 字节 | [readme.md:63-64](../../readme.md#L63-L64)、[DOCS.md:19](../../standards/DOCS.md#L19)、[TASK_TEMPLATE.md:154-160](../../templates/TASK_TEMPLATE.md#L154-L160)；作者自述：[TASK-050 plan:29-30](../../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md#L29-L30)、[TASK-048 plan:25-26](../../exec-plans/complete/TASK-048-family-dividend-label.md#L25-L26) | 用已验证的实践反推写模板（取 [TASK-050 plan](../../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md) 的章节序列）；REVIEWER.md 写判定词（`Pass` / `Pass with issues` / `Fail`）、禁止项（**不得改业务代码**）、记录位置、以及"能否改看板状态"——实践中 Reviewer 改过 `TASKS.md`（[TASK-050 plan:954](../../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md#L954)），必须显式定权 |
| **D4** | 流程文档断尾：[EXECUTION_PLANS.md](../../process/EXECUTION_PLANS.md) 共 372 行，§8 "Required ExecPlan Structure" 只写到 §5 Work Breakdown 的示例就结束，Verification / Risks / Rollback / Completion 四节**从未被规定**；而 [PLANNER.md:16](../../agents/PLANNER.md#L16) 已要求写 "§7 Verification"——引用了不存在的定义 | [EXECUTION_PLANS.md:233](../../process/EXECUTION_PLANS.md#L233)、[:360-372](../../process/EXECUTION_PLANS.md#L360-L372)；[PLANNER.md:16](../../agents/PLANNER.md#L16) | 补完 §6-§10（Verification / Risks / Rollback / Decision / Completion Record），与 D3 的模板保持同一章节号 |
| **D5** | 状态词无唯一枚举：模板 12 态 UPPER_SNAKE / 流程 9 态 Title Case / 卡片实际用 `COMPLETED`、`Done`、`REVIEWING`、`PLANNING`、`Draft` / 计划出现 `Implemented`；`COMPLETED` 不在任何枚举中；`READY`、`EXPLORING`、`HUMAN_ACCEPTANCE` 从未使用；`blocked` 语义分裂（依赖未满足 ≠ 状态 `BLOCKED`） | 详见 [§5.1](#51-状态词汇三套并存) | 建立 `docs/process/STATES.md`：唯一枚举 + 迁移表（谁能推进 / 进入条件 / 退出物证 / 记录位置），模板与卡片只引用；删掉未使用状态 |
| **D6** | 没有 State → Owner → 产物 映射：[EXECUTION_PLANS §7](../../process/EXECUTION_PLANS.md#L175-L229) 定义了 Human/Planner/Implementer/Reviewer/Integrator，但 **Orchestrator 缺席**（而 [ORCHESTRATOR.md:13](../../agents/ORCHESTRATOR.md#L13) 明确负责状态管理），`docs/agents/` 也**没有 INTEGRATOR.md**；`Integrating` 有三个主人（Integrator / Orchestrator / Human 合并），实际进入率也不一致：TASK-044 进过（[card:149](../complete/TASK-044-transaction-consolidation.md#L149)）、TASK-048 明确跳过（[plan:790](../../exec-plans/complete/TASK-048-family-dividend-label.md#L790)）、TASK-050 仍停在 `REVIEWING` 等"置 Integrating" | [EXECUTION_PLANS.md:221-227](../../process/EXECUTION_PLANS.md#L221-L227)；[TASKS.md:13](../TASKS.md#L13) | §7 增三列表（State → Owner → 必须产出的证据）；Orchestrator 补入；`Integrating` 要么定义为"Human 合入 main 前的待合并队列"并明确唯一主人，要么删除，只保留 `Reviewing → Completed(已合入)` |
| **D7** | `Completed` 不保证已提交/已合入：TASK-044/048/049/050 标 `COMPLETED`，但 [TASKS.md:9](../TASKS.md#L9) 写 `main` 停在 `891d0f7` 不含这四个任务；TASK-048 记录"改动仍在工作区，未提交"，TASK-049 记录"尚未合入 main" | [TASK-048:8](../complete/TASK-048-family-dividend-label.md#L8)、[TASK-049:8](../complete/TASK-049-dashboard-household-total.md#L8)、[TASKS.md:9](../TASKS.md#L9) | 定义 `Completed ≡ 已合入主线`；Done 表加 `Merged (Y/N + SHA)` 列；未合入的改标 `Integrating`/`Integrated-Not-Merged` |

### P1 — 造成事实漂移与重复劳动

| ID | 缺陷 | 证据 | 最短修法 |
|---|---|---|---|
| **D8** | 看板/索引与卡片、与事实三方失配（12 处）：TASK-050 owner 三个版本（readme 写"独立 Reviewer"、TASKS 写"Orchestrator → Human"、卡片写四段链）；"阻塞中：无"而 TASK-051/046/047 卡片标有 `⏳ 阻塞`；TASK-051 索引写"待立项"而卡片已是 `Draft`；TASK-043 完成日期 10-18 vs 10-19；TASK-005 不在 Done 表；TASK-050 的 B5 仍写"⏳ 交付时"；readme 两条死链（`product/ROADMAP.md`、`product/specs/authentication.md`）；`docs/issues.md` 未登记索引且被四处误称"0 字节"（实际 8 行）；`TASK_TEMPLATE.md:121` 笔误 `docs/producr/` | [readme.md:59-62](../../readme.md#L59-L62)；[TASKS.md:13](../TASKS.md#L13)、[:30](../TASKS.md#L30)、[:32-39](../TASKS.md#L32-L39)；[TASK-051:6](TASK-051-fx-rate-direction.md#L6)、[:176](TASK-051-fx-rate-direction.md#L176)；[TASK-050:127](../complete/TASK-050-portfolio-list-household-blocks.md#L127)；[issues.md](../../issues.md) | 见 §7.1；根治靠 §7.3 的一致性检查 |
| **D9** | 官方任务卡模板与真实写法分叉：按 11 个顶层章节统计，**10 张卡合规 58/110 = 52.7%**；只有 TASK-043 是 1:1 实现；元数据字段精确合规仅 2/10。事实模板（046/047/048/049/050/051 一致）是 7 节"问题优先"结构；官方 `Goal`/`Why`/`Out of Scope`/`Constraints`/`Related Documentation`/`ExecPlan Decision` 基本无人使用。[TASK_TEMPLATE.md:175](../../templates/TASK_TEMPLATE.md#L175) 禁止在 Coordination Notes 写实现历史，而官方模板又没有放历史的位置，导致 [TASK-047:159-167](TASK-047-review-followups.md#L159-L167) 只能违纪 | 详见 [§5.2](#52-任务卡模板合规率实测) | 把事实 7 节模板**批准为 v2**（而不是继续要求 11 节），并与 D4 的 ExecPlan 结构对齐；删除未采用状态 |
| **D10** | 单一归属被违反：4/5 已完成任务卡与 ExecPlan 各存一份 Review/Completion Record（TASK-043/044/048/049），进行中的 TASK-050 同样重复；同一份证据出现三处（2408 modules / 25 断言 25 PASS / 9 FAIL / 5 FAIL 同时写在卡片、ExecPlan、[TASKS.md:13](../TASKS.md#L13)） | [TASK-048:180](../complete/TASK-048-family-dividend-label.md#L180) vs [plan:722](../../exec-plans/complete/TASK-048-family-dividend-label.md#L722)；[TASK-050:333-340](../complete/TASK-050-portfolio-list-household-blocks.md#L333-L340) vs [plan:917-940](../../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md#L917-L940) | 卡片只留一行结论 + 链接；详细 Review/Completion 唯一归属 ExecPlan（[EXECUTION_PLANS §4](../../process/EXECUTION_PLANS.md#L78-L90) 已有此规定，无需新规则，只需执行） |
| **D11** | 验证成果不可复用：约束明文"不得为任务新建测试文件"，Reviewer 自写 25 断言后"跑完即删"，实现者脚本未跟踪未登记。后果实证：`fxRate.service` 零单测、既有测试手填 `7.2` 绕过采集端，TASK-051 的方向错误存在一年未被任何测试拦住 | [TASK-050 plan:74](../../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md#L74)；[TASK-050:353](../complete/TASK-050-portfolio-list-household-blocks.md#L353)、[:385](../complete/TASK-050-portfolio-list-household-blocks.md#L385)；[TASK-051:49-60](TASK-051-fx-rate-direction.md#L49-L60) | 可自动化的 AC → 脚本入库（已有 `client/scripts/e2e-task-049.mjs` 先例）+ `npm run e2e:*`；修 bug 的任务若无回归测试须显式申报（把 [TESTING.md:50](../../standards/TESTING.md#L50) 从愿望落到执行层） |
| **D12** | 没有机械校验环：全套规则靠自觉执行——无 `.github/`、无 CI、无 git hook；[DOCS.md §5](../../standards/DOCS.md#L83-L113) 的链接校验脚本只能手工跑；引用用行号（`TASKS.md:13`、`readme.md:59`）随文件变动必然失效，已实际失效两处 | [TASK-048:185](../complete/TASK-048-family-dividend-label.md#L185)、[TASK-049:194](../complete/TASK-049-dashboard-household-total.md#L194) | `scripts/check-docs.mjs` + `npm run docs:check` + pre-commit/CI；引用改用标题或表格行 ID，禁止行号 |
| **D13** | 事实规则书在治理外：`.workbuddy/memory/MEMORY.md` 承载分支堆叠模型、审查方法、环境坑、已裁决"不改"清单，但不在索引、不在 DOCS.md 适用范围、与 [GIT.md](../../standards/GIT.md) 冲突；新 agent 若只读 `docs/` 会不知道"开工前先 `git branch --show-current`" | `.workbuddy/memory/MEMORY.md`；[GIT.md:34](../../standards/GIT.md#L34) vs [TASK-050 plan:27](../../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md#L27) | 提升为 `docs/agents/PLAYBOOK.md` 并登记索引（记忆只留指针）；已裁决事项转入对应任务卡/规范 |

### P2 — 结构性/体验问题

| ID | 缺陷 | 证据 | 最短修法 |
|---|---|---|---|
| **D14** | workspace 级入口不全且漂移：`client/AGENTS.md` 指向 `../doc/API_CONTRACT.md`（实际 `docs/dev/`）、写"交易方向仅 `buy \| sell`"（实际 4 种，与 [enums.js:14-18](../../../client/src/constants/enums.js#L14-L18) 不符）；`server/` 只有 README 无 AGENTS；`shared/`（业务内核）**没有任何 md** | [client/AGENTS.md:3](../../../client/AGENTS.md#L3)、[:35](../../../client/AGENTS.md#L35) | 各 workspace 只写本目录特有事实 + 引用唯一归属；`shared/AGENTS.md` 至少写"禁止复制实现、跨包必须 `@portomind/shared`" |
| **D15** | 流程开销与任务规模不匹配、反向激励跳步：纯前端 12 文件任务产出 387 行卡 + 960 行计划 + 两轮评审 + 两轮负向对照；而 [EXECUTION_PLANS §2](../../process/EXECUTION_PLANS.md#L32-L40) 的"通常不需要 ExecPlan"清单没有配套轻量通道（谁审、审到什么程度、是否走 Integrating）。历史上 [TASK-043 plan §8](../../exec-plans/complete/TASK-043-asset-price-consolidation.md#L156-L204) 的违规根因之一就是"写代码边际成本极低" | [TASK-043 plan:181-186](../../exec-plans/complete/TASK-043-asset-price-consolidation.md#L181-L186) | 按风险分 light / normal / full 三档，light = 卡片 + 一页变更说明 + 单轮 spot check；需 Human 裁决（[OQ-4](#11-待-human-裁决)） |
| **D16** | 决策无队列：全 docs "待 Human 裁决/待补"55 处命中，散落在卡片与计划；[PLANNER.md:3](../../agents/PLANNER.md#L3)、[IMPLEMENTER.md:3](../../agents/IMPLEMENTER.md#L3) 自 2026-10-18 挂着"待 Human 审核"，却已被当作硬约束引用；TODO 型欠账（如 ARCHITECTURE 未填充）无责任人无期限 | [TASK-043:110](../complete/TASK-043-asset-price-consolidation.md#L110) | 建唯一待决队列（可复用并规范化 [issues.md](../../issues.md)）；规则：未登记视为未阻塞；批准两份角色文档为 v1 |
| **D17** | 归档层不纯 + 路径矛盾：§3 规定 `docs/exec-plans/completed/` 实际是 `complete/`；`exec-plans/complete/` 混入两份非计划文件（`DOCS-DEDUP-2026-10-15.md`、`DEPENDENCY_UPGRADES.md`，均无 TASK 编号与 Status/Owner 头）；`TASK_TEMPLATE.md:27` 把 ExecPlan 指针硬编码为 `active/`，归档后必然写错 | [EXECUTION_PLANS.md:50-52](../../process/EXECUTION_PLANS.md#L50-L52)、[:54-56](../../process/EXECUTION_PLANS.md#L54-L56)；[TASK_TEMPLATE.md:27](../../templates/TASK_TEMPLATE.md#L27) | 改路径为 `complete/`；非计划文件移入 `docs/archive/`；模板改 `<active\|complete>` |
| **D18** | 元数据小口径不一致：TASK-045 缺 `Updated` 与 `Related ADR`；046-051 多加模板未定义的 `Type`/`来源`；`docs/issues.md`（8 行笔记）被视为未申报文件 | [TASK-045:3-22](TASK-045-transaction-query-filters.md#L3-L22)；[TASK-050:20-33](../complete/TASK-050-portfolio-list-household-blocks.md#L20-L33) | 随 D9 的模板 v2 一并定义字段表（含 `Updated` 必填） |

---

## 5. 状态词汇与模板合规（实测数据）

### 5.1 状态词汇三套并存

| 来源 | 词表 | 形式 |
|---|---|---|
| [TASK_TEMPLATE.md:6](../../templates/TASK_TEMPLATE.md#L6) | `BACKLOG \| READY \| EXPLORING \| PLANNING \| PLAN_REVIEW \| IMPLEMENTING \| VERIFYING \| REVIEWING \| INTEGRATING \| HUMAN_ACCEPTANCE \| BLOCKED \| DONE` | 12 态 UPPER_SNAKE |
| [EXECUTION_PLANS.md:126](../../process/EXECUTION_PLANS.md#L126)、[:245](../../process/EXECUTION_PLANS.md#L245) | `Draft → Plan Review → Approved → Implementing → Verifying → Reviewing → Integrating → Completed`（+`Blocked`） | 9 态 Title Case |
| 角色文档 | PLANNER：`Draft`/`Plan Review`/`Approved`；IMPLEMENTER：`Approved`/`Implementing`/`Verifying`/`Reviewing`；ORCHESTRATOR 与 REVIEWER：无枚举 | Title Case |
| 实际卡片 | `BACKLOG`(045)、`PLANNING`(046/047)、`Draft`(051)、`REVIEWING`(050)、`COMPLETED`(043/044/048/049)、`Done`(005)；验收结果写 `Passed`，模板规定 `Accepted` | 混用 |
| 实际计划 | `Approved → Implemented`（`Implemented` 不在任何枚举） | 越界状态 |
| [TASKS.md](../TASKS.md) | 只有分节 `Active`/`Backlog`/`Blocked`/`Done`，无枚举表；Done 表头叫 `Completed` | — |

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

1. **单一索引 + 单一归属 + 可跑校验**（[DOCS.md](../../standards/DOCS.md)）：规则解释了"为什么"（主题级重复 → 事实漂移），有边界表、有提交前 checklist、有真正的链接校验脚本；实测链接数 154 → 163 → 188 → 378，失效始终 0。
2. **审批分层写进了硬约束**：需求批准 ≠ 方案批准；业务代码改动必须先有 `Approved` ExecPlan（[IMPLEMENTER.md:10](../../agents/IMPLEMENTER.md#L10)）；实现与审查不同角色不同轮；`build/lint 通过 ≠ 验收通过`（[IMPLEMENTER.md:35](../../agents/IMPLEMENTER.md#L35)）。正对 agent 最常见的跳步。
3. **ExecPlan 的设计初衷准确**："使另一个 agent 不依赖私有聊天记录与未记录假设即可接手"（[EXECUTION_PLANS.md:7](../../process/EXECUTION_PLANS.md#L7)），且明确是 living document——针对上下文丢失这一 agent 特有问题。
4. **角色用"禁止清单 + 反模式清单"表达**（[ORCHESTRATOR §3](../../agents/ORCHESTRATOR.md#L25-L31)、[PLANNER §6](../../agents/PLANNER.md#L58-L63)、[IMPLEMENTER §6](../../agents/IMPLEMENTER.md#L54-L60)），可执行性远高于"应当尽职"。
5. **验收标准可机器验证**：AC 直接写成 `grep -rn` 结果与 `git status ... 空输出`（[TASK-050:75-79](../complete/TASK-050-portfolio-list-household-blocks.md#L75-L79)），ExecPlan 逐字引用 FS 的 AC 并声明"未增删改"（[plan:77](../../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md#L77)）——需求→AC→验证血缘完整。
6. **审查方法论是真正的资产**：负向对照证明断言"能失败"（注入缺陷后 16/25、20/25 PASS，[TASK-050 §13.2](../complete/TASK-050-portfolio-list-household-blocks.md#L368-L375)）；"恒显示类要求必须构造空态"、"别 mock 掉你怀疑的那一段"、"断言失败先怀疑选择器"；`page.route` 喂数据零写库。这套东西比一般测试规范更硬，**应原样保留下沉到规范里**（D3 修法的一部分）。
7. **偏差可审计**：[TASK-043 plan §8](../../exec-plans/complete/TASK-043-asset-price-consolidation.md#L156-L204) 完整记录 7 步偏离、触犯的 4 条禁令、4 条根因、Human 追认边界（"仅限本次，不构成先例"），并写"例外必须可审计，不能静默"；[TASK-050 的 D-7](../complete/TASK-050-portfolio-list-household-blocks.md#L322-L327) 同一纪律。
8. **归档纪律有实操细节**：完成即移动 active → complete 并同步所有链接（[DOCS.md:25](../../standards/DOCS.md#L25)）；记忆里还补了"新 ExecPlan 默认 untracked，`git mv` 失败、`git commit -am` 会静默丢掉"的坑。
9. **不写会漂移的数字**（[DOCS.md:67](../../standards/DOCS.md#L67)）：明确以 `npm test` 实际输出为准——这条规则正是被"文档写 157/157、实际 154"撞出来的。
10. **通用模板里的内核是好东西**：根 `AGENTS.md` 的审批门（§6）、审查严重度 `BLOCKER/MAJOR/MINOR/PASS`（§9）、完成条件（§14）、"仓库是共享记忆"（§15）都值得保留——问题只在没本地化（D1）。
11. **workspace 级 AGENTS.md 形态正确**：就近可读、给命令给约定给目录索引——内容需修（D14），形态值得推广到 `server/` 与 `shared/`。

---

## 7. 整改方案（三批，逐批可独立 review）

### 7.1 第一批：零风险文档修复（约 0.5 天，纯 docs）

覆盖 D8、D17、D18 中的确定性错误。改动集中在 5 个文件——`docs/readme.md`、`docs/tasks/TASKS.md`、`docs/process/EXECUTION_PLANS.md`、`docs/templates/TASK_TEMPLATE.md`、`docs/issues.md`——外加两张历史卡的失效行号引用（TASK-048:185、TASK-049:194）。逐项修法见 §4 对应行的"最短修法"列；本批不新增规则，只做搬移、更正与登记。

**出口**：AC1、AC6、AC7 通过。

### 7.2 第二批：规则补全（约 1.5–2 天，纯 docs）

新增 1 份（`docs/process/STATES.md`，覆盖 D5/D6）+ 重写或补齐 9 份：根 `AGENTS.md`、`REVIEWER.md`、`EXEC_PLAN_TEMPLATE.md`、`TASK_TEMPLATE.md`（v2）、`ARCHITECTURE.md`、`TESTING.md`、`GIT.md`、`SECURITY.md`，并把 `PLANNER.md` / `IMPLEMENTER.md` 从"待审核"批准为 v1（覆盖 D1/D2/D3/D4/D9/D14/D16）。逐项修法见 §4；顺序建议：先 `STATES.md`（它决定其余文档里所有状态引用怎么写）→ 模板 → 规范 → 根入口。

**出口**：AC2、AC3、AC5、AC8 通过。

### 7.3 第三批：机械校验环（约 1 天，纯 docs + 1 个脚本）

**D12**：新增 `scripts/check-docs.mjs` + 根 `package.json` 的 `docs:check`，规则集：

1. 相对链接全部可解析（复用 [DOCS.md §5](../../standards/DOCS.md#L83-L113) 脚本）；
2. `docs/` 内不出现 `exec-plans/completed/`、`docs/producr/`、`docs/tasks/completed/`；
3. 每张任务卡 `Status` ∈ `STATES.md` 枚举；`Updated` 字段存在；
4. 模板类文档（ARCHITECTURE/TESTING/GIT/SECURITY/CODING）不得含 `<command>`、`<PROJECT_NAME>` 之类占位；
5. `readme.md` 的活跃任务行与 `TASKS.md` 的 owner/状态一致；
6. `docs/` 下每个 md 都出现在 `readme.md` 索引（对应 DOCS.md §4 第 1 条）。

挂 pre-commit 或 GitHub Actions（仓库当前无 CI，二选一由 [OQ-5](#11-待-human-裁决) 定）。规则 2–6 全部通过后，第一批的那些错误不可能再回归。

### 7.4 明确不在本卡范围

D11（验证资产化）、D13（记忆提升为 PLAYBOOK）、D15（轻量通道）需要 Human 决策或另立任务，见 §11。

---

## 8. Acceptance Criteria

- [ ] **AC1** `npm run docs:check` 存在且退出码 0；输出"相对链接 N 条，失效 0 条"。
- [ ] **AC2** 4 份"空/断尾"文件不再是缺陷：`REVIEWER.md` 非空且含判定词与禁令；`EXEC_PLAN_TEMPLATE.md` 非空且章节与一份真实计划一致；`EXECUTION_PLANS.md` 含 Verification / Risks / Rollback / Completion 四节；根 `AGENTS.md` 无占位符且无 `completed/` 路径（`grep -c` 为 0）。
- [ ] **AC3** 全仓只有一份状态枚举：`grep -rn "COMPLETED\|HUMAN_ACCEPTANCE\|PLAN_REVIEW" docs/` 仅命中 `STATES.md` 的别名/弃用表；所有卡片的 `Status` 值 ∈ 枚举。
- [ ] **AC4** `Completed` 的语义可验证：`TASKS.md` Done 表含 `Merged` 列；未合入的任务不处于 `Completed`。
- [ ] **AC5** 任务卡模板 v2 落地：新卡按 7 节结构，`TASK_TEMPLATE.md` 与之一致；`grep -c "<" TASK_TEMPLATE.md` 中不存在未定义占位（`<Task Title>` 这类填写位除外）。
- [ ] **AC6** 看板零矛盾：`readme.md` 活跃任务行不含状态词；`TASKS.md` 与卡片 owner/status 一致；"阻塞"表述与卡片一致。
- [ ] **AC7** 索引零死链、零未登记文件：`docs/` 下每个 md 都在 [readme.md](../../readme.md) 中；`ROADMAP.md`/`authentication.md` 二选一（存在或从索引删除）。
- [ ] **AC8** 规范可操作：TESTING §5 每条命令可直接复制执行；GIT 分支规则与实际分支命名一致（`feature/TASK-049` 为例）；SECURITY 含"无认证 / CORS 全开"现状。
- [ ] **AC9** 独立 Reviewer 复核通过（按新 REVIEWER.md 判定词），Implementer 不得自判。
- [ ] **AC10** 零业务代码改动：`git status client server shared cron-worker` 空输出。

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
| R-4 | 根 AGENTS.md 重写后丢失通用方法论 | 先把有价值条款（审批门、严重度、完成条件）迁入 `docs/standards/`，再改根文件 |

---

## 11. 待 Human 裁决

| # | 决策 | 选项 | 推荐 |
|---|---|---|---|
| **OQ-1** | 隐性规则（`.workbuddy/memory/`）是否提升为受治理文档 | ① 提升为 `docs/agents/PLAYBOOK.md` 并登记索引；② 维持现状、只在根 AGENTS.md 加一句指引 | ①（当前它是唯一记载分支堆叠模型与审查方法的地方） |
| **OQ-2** | `readme.md` 活跃任务行是否只保留链接、不写状态/owner | ① 去状态词，状态唯一来源 `TASKS.md`；② 保留但由脚本生成 | ①（该行已连续失真三次，机制修法在记忆中提过两次未采纳） |
| **OQ-3** | `docs/issues.md`（8 行零散笔记）去留 | ① 规范化为待决队列并登记索引；② 删除，内容迁入本卡/新卡 | ①（D16 需要一个队列的落点） |
| **OQ-4** | 是否引入 light / normal / full 三档流程（D15） | ① 引入；② 维持单一流程 | ①（否则小改动要么被重流程拖慢、要么被跳过——TASK-043 已有一次实证） |
| **OQ-5** | 校验脚本的触发方式 | ① pre-commit；② GitHub Actions；③ 仅 `npm run docs:check` 手动 | ②（不依赖个人环境，且当前仓库无 CI） |
| **OQ-6** | `Integrating` 状态去留（D6） | ① 定义为"待 Human 合入队列"并唯一归属 Human；② 删除 | ①（TASK-044 实际用过它，说明有需求） |

---

## 12. 本卡自身的登记（已完成的治理动作）

- [x] 建立任务卡：本文件（2026-10-26）。
- [x] 登记 [TASKS.md](../TASKS.md) Backlog 表。
- [x] 登记 [docs/readme.md](../../readme.md) 索引"流程与协作"段。
- [ ] 批准后由 Planner 判断是否补 ExecPlan（当前判 `Not required`）。
- [ ] 三批整改完成后，按 [DOCS.md:25](../../standards/DOCS.md#L25) 移动至 `docs/tasks/complete/` 并同步全部链接。
