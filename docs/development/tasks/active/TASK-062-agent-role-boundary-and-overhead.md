# TASK-062 — Agent 角色权限边界与执行开销整改

| 项 | 内容 |
|---|---|
| **Status** | `Draft`（2026-10-29 重建落卡）—— **待 Human 审阅**。范围与验收标准均**未批准**，未进入实施；本卡不产生任何规则改动 |
| **Priority** | `High`（当前每次开工都要先读规则，而规则本身把"登记状态"与"技术验收"混在一起；`TASK-043` 的越权与 `TASK-058` 的重复复验各留下一次实证） |
| **Owner** | `—`（待指派；建议 Orchestrator 收口规则文本、独立 Reviewer 复核行为场景） |
| **Type** | `Process / Docs`（规则文档为主 + 工具权限**能力核查**；**不碰 `client/` `server/` `shared/` `cron-worker/`，不碰任何测试**） |
| **Created / Updated** | `2026-10-28`（首次立项，见 §12）/ `2026-10-29`（重建并落盘） |
| **Related Product Spec** | `None` |
| **Related ADR** | `None` |
| **Execution Plan** | `Not required`（本卡交付物是规则文本与场景记录，逐节可独立 review；若 Human 要求补，由 Planner 按 [EXECUTION_PLANS](../../../os/process/EXECUTION_PLANS.md) 产出） |
| **Related Task** | [TASK-052](../completed/TASK-052-agent-rules-update.md)（同批文件，边界见 [§3](#3-为什么本范围不并入-task-052)） |
| **来源** | Human 于 2026-10-29 提出整改目标：解决非编码角色越权、状态登记被扩大为技术验收、重复读取与验证、反复修改文档造成执行缓慢 |

> **本卡的性质**：这是一张**待审阅的整改任务卡**，不是规则本身。卡内所有"规则草案"（§6）均标注为**未生效**，不得被任何角色当作现行约束引用。

---

## 1. 问题

### 1.1 运行背景（现状事实，2026-10-29 核实）

| # | 背景 |
|---|---|
| **B1** | 产品经理、Orchestrator、Planner、Reviewer、Implementer 都是**独立会话**（不共享上下文，只共享目录） |
| **B2** | `Implementer` 负责代码实现；其余角色不写业务代码 |
| **B3** | 所有会话共享同一项目目录 `D:\projects\portomind`，**由 Human 手动转交任务** |
| **B4** | 当前每个角色都能编辑文件、运行终端，**没有目录写入限制**（见 [F16](#21-现状事实)） |
| **B5** | 现阶段**保留人工转交与逐步批准**，不引入跨会话自动化 |

### 1.2 四个病灶

| ID | 病灶 | 机制 |
|---|---|---|
| **P1** | **非编码角色越权** | 角色卡只写"允许/禁止"散文（[F4](#21-现状事实)），没有**路径级写入范围**。工具层也没有目录写入限制（B4），于是"禁止"只是自律，不是约束。已有一次实证：[TASK-043 plan §8](../../exec-plans/completed/TASK-043-asset-price-consolidation.md) 记录 Orchestrator 代行 Planner + Implementer + Reviewer 四个角色、四条禁令全部触发 |
| **P2** | **状态登记被扩大为技术验收** | 根 `AGENTS.md` 旧 §14 把"标记 DONE"写成 8 项完成条件的**证明**，其中第 3 条是 `Relevant verification has passed`，但**没写谁证明、证据从哪来、没有验证能力的登记者怎么办**（[F2](#21-现状事实)）。结果：登记状态的动作被读成"我担保测试已过"。**部分已缓解**：052 的 D1 重写已把旧 §14 压成新 §9 `Completion and evidence`，去掉"标记 DONE ⇒ 已验证通过"的证明责任转嫁，加入"证据必须来自实跑、引用而非复述、基线未变不重跑"。**但"谁有权登记、登记者无验证能力时怎么写"仍未定义**——这正是本卡 `D-4` 要补的部分 |
| **P3** | **重复读取与验证** | 规则要求"独立复跑、不采信自述"，但**没有证据复用规则**（[F15](#21-现状事实)）。同一代码基线被不同角色反复全量重跑；同一批文档被多轮审计重复通读 |
| **P4** | **反复修改文档造成执行缓慢** | 索引与看板被高频改写（`docs/readme.md` 15 次提交、`docs/BOARD.md` 13 次），且状态/owner 在索引、看板、卡片三处各存一份（[TASK-052 D8/D10](../completed/TASK-052-agent-rules-update.md)）。改一次状态要动三处，漏一处就是新的漂移 |

### 1.3 实证（各一条，均可在仓库内核对）

| 病灶 | 实证 |
|---|---|
| P1 | [TASK-043 plan §8](../../exec-plans/completed/TASK-043-asset-price-consolidation.md)：2026-10-18 由 Orchestrator 代行计划、实现、验证、自审、结案；根因之一明写"写代码的边际成本极低，角色边界最易在此刻被侵蚀" |
| P2 | 根 `AGENTS.md` §14（[F2](#21-现状事实)）；另见本卡自身的历史：上一会话在**卡文件不存在**的情况下已把"立项完成"写进索引（[§12](#12-本卡自身的登记)） |
| P3 | TASK-058 结案轮：Reviewer 已对**同一提交** `dd388ac` 跑过 28/28 + 2 条负向对照，结案轮仍完整复跑 `211-0` / `77-0` / build / eslint（`.workbuddy/memory/2026-10-28.md`）。"不采信自述/独立复跑"全仓命中 **68** 处 |
| P4 | 状态词三套并存（[F10](#21-现状事实)）；本次落卡即发现索引与看板对同一任务不一致（[§12](#12-本卡自身的登记)） |

---

## 2. 已核实的事实（2026-10-29 只读核查）

> 本节为**本轮亲读/亲跑**的结果，不引用 `TASK-052` 的旧行号。行号为 2026-10-29 读数，会漂移，引用时以章节标题为准。

### 2.1 现状事实

| ID | 事实 | 落点 |
|---|---|---|
| **F1** | 根 `AGENTS.md` 原 464 行，是未填充通用模板：**7 处占位符**、**2 处错误归档路径**；**无"会话"节、无"交接"节**。→ **已于 2026-10-29 由 `TASK-052` D1 重写为 v3（158 行，英文）**，占位符与错路径均已清零，并**预留 §7 空节**给本卡三项落点。本卡后续引用该文件时**以 v3 的章节号为准**（旧 §14 已并入新 §9，旧 §10/§11 已移入 §7 待填） | `AGENTS.md` v3 §1–§11；交付记录见 [TASK-052](../completed/TASK-052-agent-rules-update.md) §12.1 |
| **F2** | 旧 `AGENTS.md` §14 `Task Completion` 规定"marked DONE only when"8 条，含 `3. Relevant verification has passed.`、`8. Required Human acceptance is complete.`，收尾一句 `Completion must be supported by evidence.` —— **未规定证明责任主体、证据来源、无验证能力角色的登记写法**。→ **已由 052 的 D1 重写部分缓解**：新 §9 改为「AC 满足 + 验证实跑 + 审查结论收敛」并加入证据复用纪律，但**登记权限与责任主体仍缺**（本卡 `D-4` 补）。**本卡 AC3 的检验对象相应从「旧 §14 原文」改为「新 §9 + 本卡将填充的 §7」** | `AGENTS.md` v3 §9、§7 |
| **F3** | §10 `Multi-Agent Work` 要求每个 Agent 知道 `scope` 与 `prohibited changes`，但全仓**没有任何路径级写入范围定义**（`写入范围` / `write scope` 命中 0） | `AGENTS.md` §10 |
| **F4** | `docs/os/roles/` 只有 4 份：`IMPLEMENTER.md` 60 行 / `ORCHESTRATOR.md` 49 行 / `PLANNER.md` 64 行 / `REVIEWER.md` **0 字节**（→ **2026-10-29 更新：`TASK-052` D3 已交付 `REVIEWER.md` 189 行 `Approved v1` 并生效**，详见 [TASK-052](../completed/TASK-052-agent-rules-update.md) §12.2；其章节仍非本卡 `AC1` 要求的四段式，且 `OQ-4` 已裁定重写时**必须保留其条款**）。前三份结构一致（Role / Responsibilities / Permissions / Workflow / Deliverables / 反模式），但**"Permissions"只是散文式允许与禁止清单，无路径级写入范围、无停止条件、无交付物格式** | `docs/os/roles/` |
| **F5** | **没有产品经理角色文件**（`产品经理` / `Product Manager` / `PRODUCT_MANAGER` 在 `docs/` 命中 0） | — |
| **F6** | `PLANNER.md`、`IMPLEMENTER.md` 文首仍写"由 Orchestrator 于 2026-10-18 起草，**待 Human 审核**"，但两者已被当作硬约束引用（如"业务代码改动必须先有 Approved ExecPlan"） | `PLANNER.md:3`、`IMPLEMENTER.md:3` |
| **F7** | "交接说明"全仓 **6 处**提及（`ORCHESTRATOR.md` §5、`PLANNER.md` §2/§5、`IMPLEMENTER.md` §2/§5），**零格式定义、零模板、零字段** | `docs/os/roles/` |
| **F8** | `EXECUTION_PLANS.md` 372 行，§8 `Required ExecPlan Structure` 写到 `## 5. Work Breakdown` 的示例即**断尾**；Verification / Risks / Rollback / Completion 四节**从未被定义**，而 `PLANNER.md` §2 已要求写 "§7 Verification" | `docs/os/process/EXECUTION_PLANS.md` §8 |
| **F9** | `EXEC_PLAN_TEMPLATE.md` **0 字节** | `docs/os/templates/EXEC_PLAN_TEMPLATE.md` |
| **F10** | 状态词三套并存：模板 12 态 UPPER_SNAKE（`BACKLOG \| READY \| … \| DONE`）、流程 9 态 Title Case（`Draft → … → Completed`）、卡片实际混用（`BACKLOG` 16 / `Draft` 10 / `COMPLETED` 61 / `Done` 17 / `READY` 23 …） | `TASK_TEMPLATE.md` §Metadata、`EXECUTION_PLANS.md` §6、`docs/development/tasks/` |
| **F11** | `EXECUTION_PLANS.md` §7 列 Human / Planner / Implementer / Reviewer / **Integrator**，**Orchestrator 与产品经理缺席**；`docs/os/roles/INTEGRATOR.md` 不存在 | `EXECUTION_PLANS.md` §7 |
| **F12** | **没有轻量通道**：§2 有"usually not required"清单，但无配套的"谁审、审到哪一步、能否跳过 ExecPlan"；`轻量` 在 `docs/` 命中 2 处且均与流程无关 | `EXECUTION_PLANS.md` §2 |
| **F13** | **没有机械校验环**：`.github/` 不存在；`.git/hooks/` 只有 `*.sample`；根 `package.json` scripts 无 `docs:check` | 仓库根 |
| **F14** | `.workbuddy/` **未纳入版本库**（`git ls-files .workbuddy` = 0，`.gitignore` 含 `.workbuddy/*`），但跨会话事实（裁决、环境坑、教训）实际沉淀在这里 | `.workbuddy/memory/` |
| **F15** | 验证证据**没有复用规则**，只有"不采信自述"的文化：`不采信` / `独立复跑` / `复跑` 全仓命中 **68** 处；TASK-058 结案轮对同一提交二次全量复跑 | `docs/development/tasks/completed/`、`docs/development/exec-plans/completed/` |
| **F16** | 仓库内**无任何 agent 运行配置**：`.claude` / `.cursor` / `.github` / `.codex` / `.gemini` / `.aider` 均不存在；`docs/os/roles/` 无会话约定 | 仓库根 |
| **F17** | **看板当前陈述已过时**：`BOARD.md` 与 `docs/readme.md` 称 TASK-058 "未合入 `main`"，但实测 `git merge-base --is-ancestor dd388ac main` = **是**（PR #38），`main` = `2bde913`。**不在本卡修复范围**（见 §9 OQ-6） | `BOARD.md` §Active、`docs/readme.md` |

### 2.2 旧审计（TASK-052）结论的时效核对

> **规则**：`TASK-052` 的审计结论**不是当前事实**，须逐条复核后才可引用。下表为 2026-10-29 复核结果。

| 052 条目 | 2026-10-29 状态 | 依据 |
|---|---|---|
| D1 根 `AGENTS.md` 未填充 | ✅ **仍成立** | F1（7 占位 + 2 错路径） |
| D2 5 份未本地化模板 | 🟡 **部分过时**：`ARCHITECTURE.md` 已重写为 v2.0 本地化版（261 行、中文、含本项目技术栈与架构债）；`TESTING.md`（8 个 `<command>` 占位、零项目事实）、`GIT.md`（`<main\|master\|develop>`、`task/<id>`）、`SECURITY.md`（`Record project-specific…`）、`CODING.md`（零项目事实）**仍成立** | 亲读五份文件 |
| D3 `REVIEWER.md` / `EXEC_PLAN_TEMPLATE.md` 为 0 字节 | 🟡 **部分过时**：`REVIEWER.md` 已于 2026-10-29 由 `TASK-052` D3 交付为 **189 行 `Approved v1` 并生效**（判定词 / 严重度 / 禁写 / 停止条件 / 记录字段齐全，`OQ-1`~`OQ-4` 已裁决，见 [TASK-052](../completed/TASK-052-agent-rules-update.md) §12.2）；`EXEC_PLAN_TEMPLATE.md` **仍 0 字节** | 亲读 `docs/os/roles/REVIEWER.md` |
| D4 `EXECUTION_PLANS.md` 断尾 | ✅ **仍成立** | F8 |
| D5 状态词三套并存 | ✅ **仍成立** | F10 |
| D6 无 State→Owner→产物 映射、Orchestrator 缺席、无 `INTEGRATOR.md` | ✅ **仍成立** | F11 |
| D7 `Completed` 不保证已合入 | 🔴 **事实层已过时**：TASK-054（PR #36）与 TASK-058（PR #38）均已合入 `main`。但**规则层缺口仍在**（无 `Merged` 列、无"完成 ≡ 已合入"定义） | F17、`git merge-base` |
| D8 看板/索引 12 处失配 | ⚪ **本轮未复核，不得当当前事实**；且已知其中至少 1 处（058 合入状态）现已过时 | F17 |
| D9 任务卡模板合规率 52.7% | ⚪ **本轮未复核** | — |
| D10 单一归属被违反 | ⚪ **本轮未复核** | — |
| D11 验证成果不可复用 | ✅ **仍成立**（无复用规则；但 052 的落点是"测试脚本入库"，与本卡 AC6 的"证据引用"不同） | F15 |
| D12 无机械校验环 | ✅ **仍成立** | F13 |
| D13 记忆在治理外 | ✅ **仍成立**（`.workbuddy/` 未跟踪） | F14 |
| D14 workspace 入口漂移 | ✅ **仍成立**：`client/AGENTS.md` 仍指向 `../doc/API_CONTRACT.md`（实际在 `docs/handbook/technical/`）、仍写"交易方向仅 `buy \| sell`"（`enums.js` 实为 4 种：`buy`/`sell`/`div_cash`/`div_reinvest`） | 亲读 |
| D15 无轻量通道 | ✅ **仍成立** | F12 |
| D16 决策无队列 | ⚪ **本轮未复核** | — |
| D17 归档层路径矛盾 | ✅ **仍成立**：`EXECUTION_PLANS.md` §3 仍写 `exec-plans/completed/`，实际是 `complete/`；`docs/development/exec-plans/active/` **目录当前不存在** | 亲跑 `Test-Path` |
| D18 元数据口径不一致 | ⚪ **本轮未复核** | — |
| 052 §3「40 份 md / 链接 378 条」 | 🔴 **数字已过时**：实测 `docs/` **82** 份 md；含根 README 与各 workspace 共 **771** 条相对链接 | 亲跑校验脚本 |

**结论**：`TASK-052` 的**文档完整性**问题大部分仍成立（这正是它该管的事），但它的**审计数字**与**合入状态判断**已过时，引用时必须复核。

---

## 3. 为什么本范围不并入 TASK-052

逐条对照 7 条验收标准（AC1–AC7，见 §4）：

| AC | 能否由 `TASK-052` 承载 | 原因 |
|---|---|---|
| AC1 各角色有职责/写入范围/交付物/停止条件 | ✗ | 052 只管 `REVIEWER.md` 为空（D3）；**无写入范围矩阵、无停止条件、无产品经理角色** |
| AC2 轻量与标准两条流程且无冲突 | ✗ | 052 把轻量通道明确列为**不在范围**：§7.4「D11/D13/D15 需要 Human 决策或另立任务」，D15 即轻量通道，且 OQ-4 至今未决 |
| AC3 登记 DONE 不触发审查/测试/归档/暂存 | ✗ | 052 的 D7 是「`Completed` ≡ 已合入」（事实口径），**不涉及"登记动作的权限边界"**；052 全文无此议题 |
| AC4 Orchestrator 交接说明、不声称他人已开工 | ✗ | 052 的 D6 只把 Orchestrator 补进 §7 所有权表，**不涉及交接说明格式与措辞禁令** |
| AC5 Reviewer 交回 Implementer 不直接修 | △ | 052 的 D3 会产出一份非空 `REVIEWER.md`，但**未规定"发现即退回"**这一行为条款 |
| AC6 同基线证据可复用 | ✗ | 052 的 D11 是"把可自动化的 AC 做成入库脚本"，与"引用已有证据、避免重跑"是**两个方向** |
| AC7 行为场景验证并记耗时 | ✗ | 052 全文无行为场景验证，其 AC 全部是文档 grep/脚本退出码 |

**7 条中 6 条 ✗、1 条 △，且唯一重叠的 AC2 已被 052 自己排除在范围外。** 反向也不成立：052 的 D2/D8/D9/D10/D12/D17/D18 与 AC1/AC3/AC4/AC6/AC7/AC8/AC10（`docs:check`、空文件补全、状态枚举统一、看板零矛盾、索引零死链、规范可操作、零业务代码改动）**均不在本卡范围**。合并会作废 052 的 10 条 AC 与三批出口，也会让本卡的范围失去边界。

**因此：不更新原卡，按编号规则建立新卡 `TASK-062`。**

**编号依据**：`docs/development/tasks/` 现有最大编号为 `TASK-061`（`complete/`），`active/` 最大为 `TASK-057`；`062` 为下一个可用号，且 `docs/readme.md` 已预留该号指向本文件名（见 §12）。

**两卡的文件级分工**（避免同批改动互相覆盖）：

> **2026-10-29 分工变更（Human 裁决）**：`TASK-052` 的 D1 全量重写**已先行完成**，不再等本卡。根 `AGENTS.md` 现为 158 行 v3，本卡的三项落点以**空节形式预留**在该文件 **§7**（节内明确写「由 TASK-062 拥有、尚未批准、不得引用」）。因此本卡对根 `AGENTS.md` 的分工从「重写相应章节」收窄为「**填充 §7 的空位**」，**不得改动其余 10 节的结构**；若确需新增节，须先提请 Human 并同步更新 `TASK-052 §12.1` 的交付记录表。

| 文件 | 归 `TASK-052` | 归 `TASK-062` |
|---|---|---|
| 根 `AGENTS.md` | ✅ **已完成**：占位符填充、`completed/` 错路径、**全量重写为 v3**（158 行） | **只填 §7 空位**（会话模型与交接格式 / 写入范围矩阵引用 / 登记位语义）；**不改 §1–§6、§8–§11** |
| `docs/os/roles/*` | ✅ **已完成**：`REVIEWER.md` 判定词 / 严重度 / 禁令（`Approved v1`，2026-10-29） | **五角色四段式重写、新增 `PRODUCT_MANAGER.md`、写入范围与停止条件**；重写 `REVIEWER.md` 时**必须保留其现有条款**（`OQ-4` 裁决） |
| `docs/os/process/EXECUTION_PLANS.md` | ✅ **已完成（2026-10-29）**：§6–§10 断尾五节已补（Decisions/Verification/Risks/Rollback/Records），8 态 Lifecycle 已改 4 态 | **仍归 062**：两条通道（轻量/标准）、登记位流转 |
| `docs/os/templates/*` | ✅ **已完成 D3（2026-10-29）**：`EXEC_PLAN_TEMPLATE.md` 0 字节 → 254 行（按 9 份真实计划归纳） | **仍归 062**：交接说明格式、证据复用字段；`TASK_TEMPLATE.md` v2 归 052 D9 |
| 状态词枚举 | 产 `docs/os/process/STATES.md`（D5） | **不产枚举**，只定义"登记位允许的动作"（解耦，见 §6 D-4） |
| `docs/os/standards/*` | CODING/TESTING/GIT/SECURITY 本地化 | **不动** |
| `scripts/check-docs.mjs` | 新增（D12） | **不动** |

> 两卡的**唯一硬耦合**是状态词。本卡刻意改用**登记位语义**（完成态 / 进行中 / 待验证）表述，**不绑定具体字符串**，052 的 `STATES.md` 落地后本卡文本无需回改。

---

## 4. Acceptance Criteria

> 本卡成功 = 下列 7 条**可观察**成立。AC 本身未批准；批准后方可作为实施验收依据。

- [ ] **AC1 各角色都有明确职责、写入范围、交付物和停止条件。**
      5 份角色文件（`PRODUCT_MANAGER.md` + `ORCHESTRATOR.md` / `PLANNER.md` / `IMPLEMENTER.md` / `REVIEWER.md`）均含同名的四节：**职责** / **写入范围（路径级白名单 + 明确禁写）** / **交付物（格式或必填字段）** / **停止条件（何时必须停下并上交）**。
      检验：逐文件四节齐全；写入范围只出现一次（矩阵在根 `AGENTS.md`，角色卡引用不复制）；出现"允许修改文件"式散文而无路径即 FAIL。

- [ ] **AC2 轻量任务与标准任务都有完整流程，相关规则不存在冲突。**
      流程文档给出两条通道各自的：**适用判据 / 必产出物 / 谁审 / 审到哪一步 / 能否免 ExecPlan**；两条通道的状态流转互不矛盾；根 `AGENTS.md`、`EXECUTION_PLANS.md`、`TASK_TEMPLATE.md` 三处对同一门槛的表述一致（不存在 A 文档要求、B 文档禁止）。
      检验：三处交叉比对，冲突 0 处。

- [ ] **AC3 "登记 DONE 状态"不会自动触发源码审查、测试、归档或 Git 暂存。**
      完成登记条款明确三件事：① **动作边界**（登记只写状态字段 + 证据引用，不做别的）；② **证据来源**（引用他人已产出的证据，或显式声明"未验证"）；③ **无验证能力角色**（产品经理 / Orchestrator / Planner）的登记写法。
      检验：规则文本中不存在"标记 DONE ⇒ 必须已验证通过"这类把证明责任转嫁给登记者、且未说明证据来源的表述；**根 `AGENTS.md` §14 现文即为反例，必须被改写或加限定**。

- [ ] **AC4 Orchestrator 分派任务时生成可转交说明，不声称其他独立会话已开工。**
      交接说明有固定字段（任务号 / 目标 / 范围与禁改 / 前置条件 / 期望交付物 / 停止条件 / 证据要求）；措辞规范写明：只能写"已生成转交说明，等待 Human 转交"，**不得**写"已分派给 X、X 已开工/进行中"。
      检验：角色文件与交接格式均含该禁令；由场景 **S-3** 验证。

- [ ] **AC5 Reviewer 发现问题后交回 Implementer，不直接修复。**
      `REVIEWER.md` 含禁令"**不得修改实现代码与测试**"、finding 固定格式与判定词、修复路径写明"退回 Implementer（经 Human 转交）"。
      检验：`REVIEWER.md` 非空且含该禁令；由场景 **S-4** 验证。
      **当前状态**：禁令（§3 禁止写 `client/ servers/ ...` 含测试）、判定词（§5.1 `Pass`/`Pass with issues`/`Fail`）、finding 格式（§7）**均已就位**（`REVIEWER.md` `Approved v1`，2026-10-29）；仍缺**场景 S-4 的行为验证**。

- [ ] **AC6 同一代码基线下已有充分验证证据时，可以引用，避免机械重复。**
      证据复用规则写明：**可复用条件**（同一 commit / 同一基线、命令与参数一致、环境一致、中间无改动）、**引用写法**（出处 + 基线 SHA + 原执行者 + 时间）、**必须重新验证的例外**（基线变化、验证目标不同、证据不完整、缺负向对照）。
      检验：完成登记条款含该规则；由场景 **S-5** 验证（同一基线复验应引用而非重跑）。

- [ ] **AC7 用代表性行为场景验证规则，并记录结果和耗时；不预先承诺提速比例。**
      交付物含一份**场景验证记录**：≥ 6 个场景（至少覆盖 AC3 / AC4 / AC5 / AC6 各一），每场景写 **触发输入 / 期望行为 / 实际结果 / 耗时**；记录中**不得**出现"预计提速 X%"这类无实测依据的承诺。
      检验：记录文件存在、字段齐全、耗时列有实测值。

---

## 5. Scope / Out of Scope

### 5.1 In Scope

| # | 范围项 | 落点 |
|---|---|---|
| **S1** | 根 `AGENTS.md` | `AGENTS.md` |
| **S2** | 产品经理角色定义（当前不存在，需新建） | `docs/os/roles/PRODUCT_MANAGER.md` |
| **S3** | 四个工程角色定义 | `docs/os/roles/{ORCHESTRATOR,PLANNER,IMPLEMENTER,REVIEWER}.md` |
| **S4** | 执行流程 | `docs/os/process/EXECUTION_PLANS.md` |
| **S5** | 任务模板 | `docs/os/templates/TASK_TEMPLATE.md` |
| **S6** | 执行计划模板 | `docs/os/templates/EXEC_PLAN_TEMPLATE.md` |
| **S7** | 人工交接格式 | 根 `AGENTS.md` 新节（落点见 §9 OQ-3） |
| **S8** | 状态含义（登记位语义） | 同 S4 / S1 |
| **S9** | 验证证据复用规则 | 同 S1 / S4 |
| **S10** | 角色启动说明与会话管理约定 | 同 S1（落点见 OQ-3） |
| **S11** | 检查运行工具的权限限制能力 | **只做能力核查**；具体配置变更**另行列清单**后由 Human 决定是否实施 |

### 5.2 Out of Scope

- **业务代码、业务测试、数据库、产品功能与交互原型的任何修改**（`client/` `server/` `shared/` `cron-worker/` 零改动）。
- 更换模型，或搭建跨会话自动化系统（B5：保留人工转交与逐步批准）。
- 全量重写历史任务卡与历史 ExecPlan（历史事实保留，不追改）。
- 修复其他任务的问题（含 `TASK-052` 的 D2/D8/D9/D10/D12/D17/D18，以及 `TASK-047` / `TASK-051` / `TASK-057` 的待决项）。
- 重写 `docs/os/standards/` 四份规范与 `ARCHITECTURE.md`（属 `TASK-052`）。
- **实施** S11 的工具权限配置（本轮只核查能力 + 列清单）。

---

## 6. 整改要点草案（**未生效，仅供 Human 审阅**）

> 下列条目是**草案**，不构成现行规则；批准前任何角色不得引用。编号供 Human 逐条裁决与删改。

| # | 草案要点 | 针对 |
|---|---|---|
| **D-1** | 五份角色卡统一四段式：职责 / 写入范围（路径级）/ 交付物（含格式）/ 停止条件 | P1、AC1 |
| **D-2** | 写入范围以**一张矩阵**为准（在根 `AGENTS.md`），角色卡只引用不复制；越界即"停止并上交"，不是"尽力避免" | P1、AC1 |
| **D-3** | 流程分**轻量 / 标准**两条通道，判据写死（文件数、workspace 数、是否涉 schema/安全面/原型/新依赖），各自写明谁审、审到哪 | P4、AC2 |
| **D-4** | **登记位语义**：登记状态只表示"当前处在哪一步"，**不表示已验证**；验证结论只能由产出证据的角色给出。登记动作允许写状态字段与证据引用，不得因此触发审查、测试、归档或 `git add` | P2、AC3 |
| **D-5** | **证据复用规则**：同一基线 + 同一命令 + 同一环境 + 中间无改动 ⇒ 可引用，写明出处/SHA/执行者/时间；基线或目标变化必须重验 | P3、AC6 |
| **D-6** | **交接说明格式**：固定 7 字段；措辞禁令——不得声称其他独立会话已开工 | P1、AC4 |
| **D-7** | Reviewer 只审不改：finding 有固定格式与判定词，修复一律退回 Implementer | P1、AC5 |
| **D-8** | 会话与启动约定：独立会话、共享目录、人工转交；**开工前必读清单**（只读必要文件，禁止全量通读） | P3、P4、AC2 |
| **D-9** | 工具权限能力核查结论 + 配置变更清单（单列，不实施）；明示"规则层只能约束自律，硬约束需工具层" | P1、S11 |

---

## 7. Risks

| # | 风险 | 应对 |
|---|---|---|
| **RK1** | 与 `TASK-052` 在同一批文件上冲突（根 `AGENTS.md`、`REVIEWER.md`、状态语义、轻量通道） | 采用 [§3](#3-为什么本范围不并入-task-052) 的文件级分工；两卡不得同时处于实施态（见 OQ-2）。**已发生一次**：052 的 D1 于 2026-10-29 先行重写了根 `AGENTS.md`。应对已落实——重写方为 062 预留了 §7 空节，062 的分工表已同步收窄为「只填空位」，**结构冲突已消除**（内容冲突仍需 062 开工前确认 §7 的三项落点无变化） |
| **RK2** | 规则越加越多，反而加重开销，与本卡目标相反 | 每条新规则必须能回答"它减少哪一次重复动作"；答不出就不加。本卡 AC 以"可观察"为准，不追求条文完备 |
| **RK3** | 行为场景验证退化成"再把文档读一遍" | 场景必须是**可执行动作序列**（输入 → 期望 → 实际），且必须记耗时（AC7） |
| **RK4** | 角色卡与根 `AGENTS.md` 重复书写同一规则 → 新的漂移源 | 单一归属：矩阵与禁令只在根 `AGENTS.md`，角色卡引用（D-2） |
| **RK5** | 只改规则不改工具权限，越权仍可能发生 | S11 单列配置清单，并在规则中明示"自律约束"与"工具硬约束"的区别，不谎称已阻止 |
| **RK6** | 状态词改动与历史卡片不一致，诱发大批回改 | 用登记位语义表述、不绑具体字符串；历史卡不回改 |
| **RK7** | 规则文本本身变成新的"反复修改文档" | 交付物按节拆分、逐节 review；不追求一次成稿 |

---

## 8. Blocking Dependencies

| 依赖 | 状态 |
|---|---|
| Human 批准本卡范围与 AC（§4 / §5） | **阻塞中** —— 本卡 `Draft`，未批准 |
| OQ-1 产品经理是否为独立新角色 | **待裁**（影响 S2 是否需要新建文件） |
| OQ-2 本卡与 `TASK-052` 的实施先后 | **待裁**（影响 RK1） |
| OQ-3 交接格式与会话约定的落点 | **待裁**（影响 S7 / S10 是否新建文件） |
| OQ-4 / OQ-4b 业务测试执行权限与轻量通道阈值 | **待裁**（影响 D-3 / D-4） |
| OQ-5 工具权限限制是否启用 | **待裁**（影响 S11 的产出形态） |
| 非阻塞：`REVIEWER.md` 已由 `TASK-052` D3 交付为 `Approved v1`（189 行，2026-10-29 生效）；`EXEC_PLAN_TEMPLATE.md` 当前仍为 0 字节 | 由 `TASK-052` 或本卡按分工处理，见 §3 |

---

## 9. 待 Human 裁决 / 待核查

### 9.1 待裁决

> **来源说明**：`OQ-1` ~ `OQ-4` 在 `.workbuddy/memory/2026-10-29.md` 中记录为已由 Human 裁决，但**原卡文件不存在于磁盘与 git 历史**（见 §12），该记录属**会话记忆，未经本轮复核**。下表保留记录内容，标为"待复核确认"，请 Human 逐条确认或改判。

| # | 决策 | 记录中的裁决（待复核） | 状态 |
|---|---|---|---|
| **OQ-1** | 产品经理是独立新角色，还是由 Orchestrator 兼任？ | 记录为「是一个新角色」⇒ 需新建 `docs/os/roles/PRODUCT_MANAGER.md` | ⚠️ **待复核** |
| **OQ-2** | 本卡与 `TASK-052` 谁先行？ | 记录为「062 是独立任务卡，先完成它」⇒ 062 先行、`TASK-052` 冻结（保持 `Draft`、不改正文） | ⚠️ **待复核** |
| **OQ-3** | 交接格式与会话约定的落点 | 记录为「先并入 agents」⇒ 合并为根 `AGENTS.md` 新增一节，**不建** `HANDOFF.md` / `SESSIONS.md` | ⚠️ **待复核** |
| **OQ-4** | 谁能执行业务测试？ | 记录为「只有 Reviewer，Implementer 可以跑」⇒ 白名单 = Implementer + Reviewer；产品经理 / Orchestrator / Planner 一律禁跑 | ⚠️ **待复核** |
| **OQ-4b** | 轻量通道的判据阈值 | **未裁**（拟值：≤3 文件 / 单 workspace / 无 schema 变更 / 无安全面 / 无原型 / 无新依赖） | 🔴 **待裁** |
| **OQ-5** | 工具权限限制是否启用、落在哪一层 | **未裁**（选项：① 仅核查能力、不配置；② 在角色卡写禁写路径由 Human 抽检；③ 启用工具层目录限制） | 🔴 **待裁** |
| **OQ-6** | 看板过时陈述（[F17](#21-现状事实)：TASK-058 已合入 `main`，看板仍写未合入）由谁修？ | **未裁**。本卡不修（超出本轮"只改本卡与对应看板条目"的边界） | 🔴 **待裁** |

### 9.2 待核查（实施阶段前置，本轮未做）

| # | 待核查项 |
|---|---|
| **C1** | 各角色会话当前的**实际**工具权限（文件写入范围 / 终端执行 / 网络）由什么控制 |
| **C2** | 是否存在可用的 **per-agent 目录写入限制**能力（只确认能力，不做配置变更） |
| **C3** | 状态词唯一枚举是否等 `TASK-052` 的 `STATES.md`，还是本卡先定登记位语义（解耦方案已定，见 §3） |
| **C4** | 历史卡片是否需要回填（预期：**不回填**，需 Human 确认） |

---

## 10. Coordination Notes

- 本卡为 `Draft`，**待 Human 审阅**。审阅通过前不得开工，也不得把 §6 草案当作现行规则。
- 与 `TASK-052` 的关系：**同批文件、不同议题**，分工见 [§3](#3-为什么本范围不并入-task-052)。两卡不应同时处于实施态。
- 本卡**不代做** `TASK-052` 的活：不填根 `AGENTS.md` 的 7 处占位符、不修 2 处 `completed/` 错路径、不补 `EXECUTION_PLANS.md` 断尾五节、不产 `STATES.md`、不修 `EXECUTION_PLANS.md` §3 的归档路径。这些在本卡完成后**仍然存在**，属"已知未清"。
- 本卡不修 `BOARD.md` / `docs/readme.md` 里其他任务的过时陈述（含 F17），只登记本卡自身条目。

---

## 11. 本轮边界自检（2026-10-29）

| # | 边界 | 结果 |
|---|---|---|
| 1 | 只改本卡 + `BOARD.md` 的对应条目 + 必要索引链接 | ✅ 新建本卡；`BOARD.md` 加 062 行；`docs/readme.md` **未改**（其 062 链接已存在，本卡落盘即修复该失效链接） |
| 2 | 不改角色规则 / 模板 / 运行配置 | ✅ `docs/os/roles/`、`docs/os/process/`、`docs/os/templates/`、根 `AGENTS.md`、`package.json` **零改动** |
| 3 | 不运行业务测试 | ✅ 未跑 `npm test` / build / lint / E2E |
| 4 | 不暂存、不提交 | ✅ 未执行 `git add` / `git commit`（暂存区为空） |
| 5 | 不标记已批准或实施中 | ✅ Status = `Draft`（待 Human 审阅）；§6 草案标注"未生效" |
| 6 | 保留历史事实，标明过时结论 | ✅ 见 [§2.2](#22-旧审计task-052结论的时效核对) 与 [§12](#12-本卡自身的登记) |
| 7 | 不修复其他任务的问题 | ✅ 仅记录 F17，未改动相关条目 |
| 8 | 链接校验 | ✅ 771 条相对链接，**失效 0 条**（落卡前为 1 条：本卡文件缺失） |

### 11.1 后续变更（2026-10-29 晚，非本卡实施）

> 以下由 `TASK-052` 的 D1 重写与分工同步引起，**本卡 Status 仍为 `Draft`，未开工**。

- 根 `AGENTS.md` 由 052 重写为 v3（464 → 158 行），本卡三项落点改为预留空节 `AGENTS.md §7`；[§3](#3-为什么本范围不并入-task-052) 分工表、F1、F2、P2、RK1 已同步改写。
- 未改 `REVIEWER.md` / `EXEC_PLAN_TEMPLATE.md` / `EXECUTION_PLANS.md` / `TASK_TEMPLATE.md` / `docs/os/roles/`——本卡 §5.1 的 In Scope 项**全部仍未做**。
- 未 `git add` / `commit`；未跑业务测试。

---

## 12. 本卡自身的登记

### 12.1 历史（保留，不追改）

- **2026-10-28 13:00**：上一会话按 Human 要求核实"`TASK-052` 能否承载新范围"，结论为**不适合**、应建新卡；据 `.workbuddy/memory/2026-10-28.md` 记录，该轮已把 062 链接写入 `docs/readme.md`。
- **2026-10-29 20:30**：据 `.workbuddy/memory/2026-10-29.md` 记录，Human 就 `OQ-1`~`OQ-4` 作出裁决并"折入卡内"。
- ⚠️ **但卡文件从未落盘**：`docs/development/tasks/active/TASK-062-agent-role-boundary-and-overhead.md` 在磁盘上不存在，`git log --all -- "*TASK-062*"` 为空；`BOARD.md` 的 Backlog 表也没有 062 行（只留下一个空表格行）。**后果**：`docs/readme.md` 的 062 链接为失效链接，且上述两次记录中的"已完成"陈述与仓库事实不符 —— 这正是本卡 P2/P4 的自我实证。

### 12.2 本轮（2026-10-29 重建落卡）

- [x] 重建本卡并落盘 `docs/development/tasks/active/TASK-062-agent-role-boundary-and-overhead.md`（同时修复 `docs/readme.md` 的失效链接，**未改 readme 文本**）。
- [x] 在 [`BOARD.md`](../../../BOARD.md) Backlog 表补 062 行（替换上一会话遗留的空表格行）。
- [x] 逐条复核 `TASK-052` 审计结论的时效（[§2.2](#22-旧审计task-052结论的时效核对)），过时项已标红。
- [x] 记录四项"已裁决"事项的来源与待复核状态（[§9.1](#91-待裁决)）。
- [ ] **待 Human 审阅**：范围（§5）、AC（§4）、草案（§6）、OQ（§9.1）。
- [ ] 批准后由 Planner 判断是否补 ExecPlan（当前判 `Not required`）。
- [ ] 实施完成后，按 [DOCS.md](../../../os/standards/DOCS.md) 的 `active/` → `completed/` 规则移动并同步全部链接。
