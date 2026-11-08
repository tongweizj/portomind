# TASK-070 — 基于 DSH Agent Teams 插件的工作流适配（提案）

> **性质**：本卡是**待 Human 审阅的提案**，不是规则、不是设计定稿、不是启用授权。Status 采用现行枚举 `Planning`（[STATES.md §2](../../../os/process/STATES.md)），含义为「优先级已确认、正在准备方案与依据」；范围与 AC **均未批准**，未进入实施。
> **边界**：按 Human 2026-11-06 裁决——① 只出提案文档，不改规则、不改状态、不启用插件；② 与 [TASK-062](./TASK-062-agent-role-boundary-and-overhead.md) **另起新卡**，不并入、不修改其正文；③ 目标特性为 **DSH 自带的 Agent Teams 实验插件**，非 Claude Code 的同名特性。
> **引用禁令**：下文 §4 全部映射与流程均为**草案**，批准前任何角色不得当作现行约束引用。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | `Planning`（2026-11-06 新建）—— **待 Human 审阅**；范围与 AC 未批准、未进入实施。按 [STATES.md §2](../../../os/process/STATES.md) 使用现行枚举，不自造 `Draft` 之类的 Task 状态词（§7.2 已列为非法状态） |
| Priority / Owner / Type | High（建议，待 Human 定） / `—`（待指派） / `Process / Docs`（调研与工作流设计；**零业务代码改动**） |
| Created / Updated | 2026-11-06 / 2026-11-06 |
| 所属 Story | None（独立维护 / 预研任务，未关联 Story；按 [DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 独立任务沿用 `development/tasks/`） |
| 覆盖的验收条件 | N/A（独立任务，无 Story AC） |
| Related Product Spec / ADR | None |
| Execution Plan | `Not required`（本卡交付物为提案文本，逐节可独立 review；若 Human 要求补，由 Planner 按 [EXECUTION_PLANS.md](../../../os/process/EXECUTION_PLANS.md) §2 判断） |
| 编号依据 | `docs/development/tasks/` 现有最大活动编号 `TASK-062`，US-004 已占用 `065～069`；全仓 `TASK-070` 零命中，取下一个可用号 |
| 来源 | Human 2026-11-06 指示：「复制 agent teams 功能应用」「基于项目 agent os 设计自己的工作流」 |

---

## 1. 问题

项目已有一套成熟但**手工**的 Agent OS：五个角色（Human / PM / Orchestrator / Planner / Implementer / Reviewer）、[WORKFLOW.md](../../../os/process/WORKFLOW.md) 的交接顺序、[STATES.md](../../../os/process/STATES.md) 的六态状态机与权限表、以及 [US-004 三卡并行实录](../../delivery/completed/US-004/US-004-02-3card-parallel-plan.md)（3 个独立 worktree + 文件零重叠 + 硬串行门）。

DSH 自带 `dsh-experimental-agent-team` 实验插件族提供了**运行时并行编排**（具名 teammate、直接消息、持久共享任务板）。但二者机制并不一致，直接套用会破坏现有治理：

1. 插件是**共享 checkout、无 worktree 隔离、无 merge、无文件锁**；而 US-004 的并行正确性恰恰建立在独立 worktree 上。
2. 插件任务板只有 `pending / in_progress / completed / deleted` 四态，无 `Reviewing` / `Blocked` / `Merged`、无 Human 批准门、无证据与 AC 概念。
3. 启用组合包会**禁用**普通 `subagent` / `subagent_fork` 等工具，改变本会话既有的委派方式。
4. 插件的 `writeScopes` 只是**提示性重叠警告**，官方明示不阻止 Bash / formatter / 外部写入，不能当权限边界用。

若不先产出一份经 Human 批准的适配提案就启用插件，等于让运行时机制反过来定义项目的状态与权限，违反 [AGENTS.md](../../../../AGENTS.md) §8「新架构决策要停手上报」与 §10「共享项目记忆不依赖私有聊天」。

## 2. 已核实的事实（2026-11-06，只读核查）

> 核实方式：读取 DSH 安装目录 `resources/app.asar` 内四个包的中文 README、`cordis.patch.yml`、`lib/types/task-board.js`、`lib/types/roster.js`；读取本机 `C:/Users/maxto/.dsh/profiles/{desktop,web}/package.json`；读取仓库治理文档与 US-004 过程资料。**未运行插件、未启用 profile、未改任何配置。**

### 2.1 插件形态（源码事实）

| ID | 事实 | 出处 |
|---|---|---|
| F-1 | DSH 安装包内含四个实验包：`dsh-experimental-agent-team`（领域服务）、`-profile`（组合包）、`-tool-agent-team`（模型工具）、`-client-ui-agent-team`（Web roster / 任务板）；**默认关闭，需显式 opt-in** | `app.asar` 内 `dsh/node_modules/@deepseek-ai/` |
| F-2 | 启用方式：Web/Desktop 插件页开启「智能体团队」，或 `dsh plugin --profile <name> add @deepseek-ai/dsh-experimental-agent-team-profile`；该组合包依赖 `dsh-base`，并同时挂载工具与 Web UI | `agent-team-profile/README.zh.md` |
| F-3 | 组合包 patch **禁用** `tool-subagent-control` / `tool-subagent-list-agents` / `tool-subagent` / `tool-subagent-fork` 四行，插入 `agent-team` + `tool-agent-team` + `ui-agent-team`；配置 `maxMembers: 8`、`maxTasks: 256`、`maxMessageBytes: 65536` | `agent-team-profile/cordis.patch.yml` |
| F-4 | 每个成员（Lead 与 teammate）获得**相同九个工具**：`spawn_teammate`（仅 Lead）、`send_message`、`list_agents`、`wait_agent`、`interrupt_agent`（仅 Lead）、`team_task_create/list/get/update`；Workflow 的 `agent()` 仍可用 | `tool-agent-team/README.zh.md` |
| F-5 | 身份：每个普通 runtime root 是隐式 Lead，`TeamId = SessionId`；teammate 用永久小写名字（含失败的也不复用），可 `fresh`（无 Lead 历史）或 `fork`（继承 Lead 已完成轮次）；**只有 Lead 能创建 / 中断 / reassign** | `agent-team/README.zh.md`、`lib/types/roster.js` |
| F-6 | 消息：任何成员可发给任何成员或 Lead；投递即写入目标 inbox，`steer` running target、冷恢复 inactive target；**成功只表示 inbox 接收，不表示已处理**；无发送重试、无去重、不保证顺序 | `agent-team/README.zh.md` |
| F-7 | 任务板：任务含 `subject / description / blockedBy / writeScopes`，状态 `pending / in_progress / completed / deleted`，**依赖全部完成才可 claim**；owner 通过 `claim` 取得；每次更新是 **CAS（expectedRevision）**，过期编辑报 `TEAM_TASK_STALE_REVISION`；`reassign` 仅 Lead | `lib/types/task-board.js` |
| F-8 | `writeScopes` 是规范化 workspace 相对前缀，重叠时**仅警告、绝不阻止** claim 或授予写权限；官方明示 Bash / formatter / 代码生成器 / 外部写入可绕过 | `agent-team/README.zh.md`「已知限制」、`task-board.js` |
| F-9 | **单进程、共享 checkout**：所有 teammate 观察同一 cwd，修改立即可见；**不提供 worktree、远端成员、merge 或文件锁** | `agent-team/README.zh.md`「已知限制」 |
| F-10 | 其他限制：无嵌套 Team、无重命名/删除/名字复用；**不会自动释放 owner**（inactive / interrupt / 退出 / 失败都不释放）；完整视图广播、实验原型无稳定性承诺；Web UI 任务板**只读**，由模型工具改 | `agent-team/README.zh.md`、`client-ui-agent-team/README.zh.md` |
| F-11 | 持久性：roster 与任务写 Lead 日志（`team/member`、`team/task`），消息走目标 Agent 的常规 inbox 持久化；`agentTeam` 投影供 Web 面板读取 | `agent-team/README.zh.md` |
| F-12 | 本机 `desktop` 与 `web` 两个 profile 的 `dsh.profile.bundles` 均**未包含** agent-team 组合包 ⇒ 插件当前未启用 | `C:/Users/maxto/.dsh/profiles/*/package.json`（2026-11-06 读） |

### 2.2 项目现状事实

| ID | 事实 | 出处 |
|---|---|---|
| G-1 | 角色为独立会话、共享目录、**人工转交**；不引入跨会话自动化是既定边界 | [TASK-062 §1.1 B1/B3/B5](./TASK-062-agent-role-boundary-and-overhead.md)（该卡 `Draft` 未批准，此处仅作背景事实，不作规则引用） |
| G-2 | Task 六态、Story 六态、ExecPlan 四态；**只有 Human** 能关 Task / Story、批准 ExecPlan、合 main、填 `Merged` | [STATES.md §2 / §4](../../../os/process/STATES.md) |
| G-3 | 卡片 Status 是状态唯一来源，看板只作投影；目录不表示状态 | [STATES.md §6](../../../os/process/STATES.md#6-看板与归档)、[DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) |
| G-4 | 交接顺序：Human → PM → Orchestrator → Planner → Implementer → Reviewer → Human；Orchestrator 不改业务代码、不替 Reviewer 审查 | [WORKFLOW.md §1](../../../os/process/WORKFLOW.md)、[ORCHESTRATOR.md §3](../../../os/roles/ORCHESTRATOR.md) |
| G-5 | 并行任务「按依赖及文件写入冲突协调」；跨模块/复杂依赖需 ExecPlan | [WORKFLOW.md §1](../../../os/process/WORKFLOW.md)、[EXECUTION_PLANS.md §2](../../../os/process/EXECUTION_PLANS.md) |
| G-6 | US-004 已实测并行：3 个独立 worktree（`portomind-065/066/067`）、`driftLabels.js` 单点归属、065 作验收前置门、068 硬串行 | [US-004-02](../../delivery/completed/US-004/US-004-02-3card-parallel-plan.md)、[派发记录](../../delivery/completed/US-004/US-004-04-dispatch-record-2026-11-06.md) |
| G-7 | [US-004-prompts.md](../../delivery/completed/US-004/US-004-prompts.md) 的 P-01～P-07 已是各角色的「启动必读 + 禁止事项」提示词存档 | 同上 |
| G-8 | [TASK-062](./TASK-062-agent-role-boundary-and-overhead.md) 仍为 `Planning`（BOARD 投影），其 §6 草案明确「未生效、不得引用」；OQ-5「工具权限限制是否启用」与本议题相关但本卡不代裁 | [BOARD.md](../../../BOARD.md) 未关联任务表 |
| G-9 | 根 [AGENTS.md](../../../../AGENTS.md) §10 要求共享项目记忆可脱离私有聊天恢复；§8 要求新架构决策停手上报 | 根 AGENTS.md |

### 2.3 未验证范围（如实声明）

- **未实跑**插件：未在两个 profile 启用组合包，未实际 spawn teammate、发消息、建任务板，所有行为结论来自安装目录内 README 与 lib 源码，**非运行证据**。
- **未验证** Web GUI `agentTeam` 面板在本会话 URL 的实际渲染（插件未启用，面板不可用）。
- **未验证** 启用组合包后本会话 `subagent` / `workflow` 工具的具体可用性变化（F-3/F-4 只说明 patch 与 Workflow 保留）。
- DSH 版本：`app.asar` 2026-10-29 构建；README 内引用 2026-08-05 / 2026-10-13 的设计笔记，未逐篇读取。

---

## 3. Acceptance Criteria（**未批准，供 Human 逐条裁决**）

- [ ] **AC-1 机制说明准确**：提案写明 DSH Agent Teams 的 Lead/teammate/消息/任务板/限制，且与安装目录内 README 与源码一致；明确区分「源码事实」与「未实跑」。
- [ ] **AC-2 映射不越权**：逐项给出插件能力 ↔ 项目 Agent OS 的对应物，并标明三处硬冲突（共享 checkout vs worktree、四态任务板 vs 六态状态机、工具替换 vs 现有委派）；结论不得把插件状态写成项目状态。
- [ ] **AC-3 工作流可执行**：给出端到端工作流草案，含角色映射、并行/串行判据、状态与证据的落盘位置、以及「哪些动作保留人工」。
- [ ] **AC-4 边界与启用条件**：列出启用前置门（Human 批准、试点选择、回退方式）、明确本提案**不修改**任何 `docs/os/` 规则文件、不改 BOARD 状态投影、不启用插件。
- [ ] **AC-5 与 TASK-062 分工清晰**：写明两卡不合并的理由与文件级边界；本卡不改 TASK-062 正文、不代裁其 OQ。
- [ ] **AC-6 待决项成列**：把需 Human 决定的事项整理为带选项与影响的 OQ，不预先拍板。
- [ ] **AC-7 零副作用**：本卡交付动作仅新增本文件 + 在 [BOARD.md](../../../BOARD.md) 未关联任务表登记本卡一行 + 在 [docs/readme.md](../../../readme.md) 登记索引；不改业务代码、不改规则、不改既有卡状态、不 `git add/commit`。

## 4. 工作流设计草案（**未生效，仅供审阅**）

> 核心判断：**不要把插件当新流程引进来，而把它当现有 Agent OS 的可选「运行时编排层」**。文档层（状态、权限、AC、证据）是真相；插件只承担「多会话同时干活 + 通信 + 认领」的加速，且必须在现有约束下裁剪。

### 4.1 能力映射（草案）

| DSH Agent Teams | 项目 Agent OS 对应物 | 冲突与处置（草案） |
|---|---|---|
| Team Lead（隐式 root） | **Orchestrator**：检查启动条件、登记状态、派发、协调；不改业务代码 | ⚠️ 插件不限制 Lead 下场实现。须在 Lead 的启动提示词中明令「只登记与派发」，并在最终 diff 由 Human/Reviewer 核对 |
| teammate（fresh / fork） | Planner / Implementer A·B·C / Reviewer 的独立会话 | 用 `fresh` 保证角色上下文干净；`fork` 仅用于需要继承 Lead 已完成轮次的场景 |
| 九个工具 | 现有人工转交 + 过程文档 | ⚠️ 启用组合包会禁用 `subagent` / `subagent_fork`，改变本会话委派方式 ⇒ 列为启用前置决策（OQ-1） |
| 共享任务板（4 态 + CAS + DAG） | **不是**项目状态机；仅作「本次并行窗口的运行时工作清单」 | ❌ 禁止把 `team_task_update(complete)` 当作 Task `Completed`。`Reviewing` / `Blocked` / `Merged` / AC 证据 / Human 批准一律回写 [BOARD.md](../../../BOARD.md) 与任务卡/计划记录节，按 [STATES.md §6](../../../os/process/STATES.md#6-看板与归档) |
| `blockedBy` 依赖 | [US-004-02](../../delivery/completed/US-004/US-004-02-3card-parallel-plan.md) 的验收前置门 / 硬串行 | 可用：065 合入前 066/067 不得 claim「完整验收」类任务；068 硬串行等 065 合入 |
| `writeScopes` 重叠警告 | 「文件零重叠」判据 | ⚠️ 仅提示，**不能当权限**（F-8）。必须继续靠 Human 批准的 ExecPlan 中的改动边界 + 人工核对最终 diff |
| 共享 checkout（F-9） | US-004 的独立 worktree（G-6） | ❌ **最大冲突**。草案：并行**写**业务代码时仍用独立 worktree，插件只用于协调与通信；或把插件限定在**只读**任务（并行 review / 调研），不用于并行写 |
| `send_message` inbox | 人工转交 + 落盘交接记录 | ⚠️ 可用于「共享常量已合入 main」这类**事实通知**；**决策 / 批准 / 裁决 / 证据必须落盘**，否则违反 G-9 |
| `wait_agent` / `interrupt_agent` | Orchestrator 的进度跟踪 | 可用，但「等待」不等于验证；验证仍按 [DoD §3](../../../os/process/DEFINITION_OF_DONE.md) |
| Web roster / 只读任务板 | [BOARD.md](../../../BOARD.md) 看板 | 两者并存时须明确 BOARD 是权威投影，Web 面板只是运行时视图（G-3） |

### 4.2 端到端工作流（草案）

```
① Human 定优先级 / 裁 OQ
② PM：Story（范围 + AC）→ Orchestrator → Planner 拆 Task + ExecPlan
③ Human 批准 ExecPlan（唯一硬门，STATES.md §4）
④ Orchestrator 登记 Task → Implementing，按「文件零重叠 + 依赖门」划并行窗口
       └─ 【可选】启用 DSH Agent Teams 作为本窗口的运行时编排层
            Lead(=Orchestrator 会话) 用 team_task_create 建运行时清单
            teammate 用 fresh spawn，各读自己角色卡 + Task + Plan + 必读清单
            并行写业务代码时仍在各自 worktree；插件只传事实消息、不承载批准
            blockedBy 表达验收前置门；writeScopes 只作重叠提醒
⑤ Implementer：实现 + 验证，交付改动清单 / AC 证据 / 已知妥协
       └─ 任务板 complete 仅表示「本窗口这件事做完」，不是 Task Completed
⑥ Orchestrator 登记 Reviewing → 独立 Reviewer 审查（不实现、不修复）
⑦ 所有状态 / 证据 / 裁决回写 BOARD + 任务卡 + ExecPlan 记录节
⑧ Human：关 Task、合 main、填 Merged、关 Story
⑨ Orchestrator 按 DOCS.md §1.1 整体归档过程目录
```

### 4.3 必须保留人工的三件事（草案）

1. **状态登记与关闭**：Task / Story / ExecPlan 状态、Merged 只由 Human 或 STATES.md §4 授权角色在**文档层**推进，插件任务板不参与。
2. **Human 批准门**：ExecPlan `Draft → Approved`、OQ 裁决、风险接受、合入 main。
3. **证据与结论落盘**：AC 对照、Reviewer findings、验证实跑结果写计划 §11–§13 / 任务卡记录节；inbox 消息不作为验收证据。

### 4.4 并行判据（沿用已验证的 US-004 实践，草案）

- **可并行**：改动文件零重叠；共享常量单点归属（参考 `driftLabels.js` 归 066）；未就绪字段用「缺失降级」开发。
- **硬串行**：同改一个文件（参考 068 等 065 合入）；或某卡是其他卡完整验收的前置门。
- **先裁后做**：OQ / D-xx 未裁决不派发（参考 [US-004-03 一页清单](../../delivery/completed/US-004/US-004-03-dispatch-checklist.md)）。
- **规模**：`maxMembers: 8` 是插件上限，不是建议值；草案建议一次并行 ≤ 3 个写任务，且优先用**只读并行**（多 lens review / 调研）试水。
- **不用于**：顺序任务、同文件编辑、依赖密集的卡——退回单会话。

### 4.5 启用前置门与回退（草案）

| # | 前置门 | 说明 |
|---|---|---|
| P-1 | Human 批准本提案的范围与方向 | 本卡 `Planning` → 由 Human 决定下一步，不自动进入实施 |
| P-2 | Human 决定是否启用组合包、在哪个 profile 启用 | 会禁用普通 subagent 工具（F-3），属工具链决策 |
| P-3 | 选首个试点 | 建议**只读并行**（3 个 Reviewer 按不同 lens 审同一改动），不写业务代码；验证通信与汇总后再评估并行写 |
| P-4 | 明确回退 | 关闭插件 / `dsh plugin --profile <name> remove ...`；因插件状态在 Lead 会话日志，停用前把需长期保留的结论回写文档 |
| P-5 | 明确「未实跑」 | 本机插件当前未启用（F-12），本提案的行为结论均为源码阅读，启用后须补一次真实运行证据 |

### 4.6 与 TASK-062 的分工（按 Human 裁决：另起新卡）

| 维度 | 本卡 TASK-070 | [TASK-062](./TASK-062-agent-role-boundary-and-overhead.md) |
|---|---|---|
| 议题 | DSH Agent Teams 插件的机制核对 + 运行时工作流适配提案 | Agent 角色权限边界、写入范围矩阵、登记位语义、证据复用、执行开销 |
| 状态 | `Planning`（本卡，待审阅） | `Planning`（BOARD 投影；其卡内 `Draft` 为 2026-10-29 的历史自述，按 STATES.md §7.1 读取为 `Planning`，未批准） |
| 文件边界 | 只新增本卡 + BOARD 一行 + readme 索引；**不碰** `docs/os/` | 其 §5 归 `AGENTS.md §7`、`docs/os/roles/*`、`EXECUTION_PLANS.md`、模板 |
| 交互 | 本卡 §4 的「写入范围/权限」结论**不写入**角色卡，只提出「需与 062 结论对齐」 | 062 的 OQ-5（工具权限限制是否启用）与本卡 P-2 相关，但**本卡不代裁、不改其正文** |
| 合并禁止 | 不并入 062 | 不吸收 070 |

> 重叠点诚实记录：两卡都涉及「工具层权限 / 会话约定」。Human 后续若同时批准两卡，需由 Orchestrator 按 [DOCS.md §2](../../../os/standards/DOCS.md#2-单一归属规则核心) 指定唯一归属，避免规则正文双份。本卡不预先定义该归属。

## 5. Scope

### 5.1 In Scope

| # | 范围项 | 落点 |
|---|---|---|
| S-1 | DSH Agent Teams 插件机制核对（只读） | 本卡 §2 |
| S-2 | 插件 ↔ Agent OS 映射与冲突清单（草案） | 本卡 §4.1 |
| S-3 | 端到端工作流草案、人工保留项、并行判据、启用门 | 本卡 §4.2–§4.5 |
| S-4 | 与 TASK-062 分工边界 | 本卡 §4.6 |
| S-5 | 待 Human 裁决事项 | 本卡 §8 |
| S-6 | 看板与索引登记（仅新增本卡一行 / 一条链接） | [BOARD.md](../../../BOARD.md)、[docs/readme.md](../../../readme.md) |

### 5.2 Out of Scope（明确不做）

- **修改任何 `docs/os/` 规则文件**（角色卡、STATES、WORKFLOW、EXECUTION_PLANS、DOCS、模板）。
- **修改 [AGENTS.md](../../../../AGENTS.md)**（含 §7 空节——该节归 TASK-062）。
- **修改 [TASK-062](./TASK-062-agent-role-boundary-and-overhead.md) 正文**、代裁其 OQ、或把它并进本卡。
- **修改业务代码 / 测试 / 数据库 / 产品功能**（`client/` `server/` `shared/` `cron-worker/` 零改动）。
- **启用插件或修改 DSH profile 配置**（`~/.dsh/profiles/*` 零改动；不执行 `dsh plugin add`）。
- **新增 subagent definition / 提示词模板文件**（Human 选择「只出提案文档」）。
- **修改 US-004 任何过程资料、状态或 BOARD 的 Story / Task 状态投影**。
- `git add` / `commit` / `push`；不运行业务测试。

## 6. Risks

| # | 风险 | 触发条件 | 应对 |
|---|---|---|---|
| R-1 | 把插件四态任务板误当项目六态状态机 | 启用后 Lead 用 `team_task_update(complete)` 代替关 Task | §4.1 / §4.3 明确「任务板只是运行时清单」，状态权威只在文档层 |
| R-2 | 共享 checkout 造成并行写互相覆盖（F-9） | 多个 teammate 同时改同一文件 | §4.4 保留独立 worktree；插件优先用于只读并行；`writeScopes` 只提醒不兜底 |
| R-3 | 启用组合包禁用 `subagent` / `subagent_fork` 影响既有委派（F-3） | 在正在使用这些工具的会话/profile 启用 | 列为 P-2 启用前置决策；先确认影响范围再决定 profile |
| R-4 | 决策/批准只走 inbox，丢失可恢复的共享记忆（G-9） | teammate 之间口头裁决 OQ | §4.3 要求裁决与证据落盘；inbox 只传事实 |
| R-5 | owner 不自动释放导致任务卡死（F-10） | teammate inactive / interrupt / 失败 | 试点阶段记录该现象；由 Lead 人工 `release` / `reassign`，并回写文档说明 |
| R-6 | 源码阅读被当成运行证据 | 本卡 §2 结论被直接引用为「已验证」 | §2.3 显式声明未实跑；P-5 要求启用后补真实运行证据 |
| R-7 | 与 TASK-062 产生规则正文双份（DOCS.md §2） | 两卡都写「写入范围/会话约定」 | §4.6 声明本卡不写角色卡；归属留待 Human 后续指定 |
| R-8 | 实验插件无稳定性承诺、schema 可变（F-10） | DSH 升级 | 提案不绑定具体工具 schema 细节；引用安装目录内版本与日期 |

## 7. Blocking Dependencies

| 依赖 | 状态 |
|---|---|
| Human 批准本卡范围与 AC（§3 / §5） | **阻塞中** —— 本卡 `Planning`，范围与 AC 未批准 |
| Human 决定是否启用插件（§8 OQ-1） | **待裁** |
| 首个试点场景选择（§8 OQ-2） | **待裁** |
| 与 TASK-062 的最终归属裁定（§8 OQ-4） | **待裁**（仅在两卡都推进时才需要） |
| 插件实跑证据（§4.5 P-5） | **未做**；不阻塞提案审阅，阻塞「宣布工作流已可用」 |

## 8. Open Questions（**不预先拍板**）

| # | 问题 | 选项 | 影响 |
|---|---|---|---|
| **OQ-1** | 是否启用 DSH Agent Teams 组合包？在哪个 profile（desktop / web / 仅一次性会话）？ | ① 暂不启用，本卡仅作机制备案；② 在专用 profile 启用做试点；③ 在当前 web profile 启用 | ③ 会禁用普通 `subagent` / `subagent_fork` 工具（F-3），影响本会话委派方式；①② 不影响现有工作流 |
| **OQ-2** | 首个试点用什么场景？ | ① 只读并行：3 个 teammate 按不同 lens 审同一改动（建议）；② 并行写：复刻 US-004 三卡；③ 不试点 | ① 无文件冲突风险、可验证通信/汇总；② 撞上共享 checkout（F-9），需先解决 worktree 协调；③ 提案停留在纸面 |
| **OQ-3** | 并行写业务代码时，插件与独立 worktree 如何共存？ | ① 插件只协调、写仍在各自 worktree（本卡 §4.2 草案）；② 放弃插件，继续纯手工 worktree 并行；③ 等待插件未来提供 worktree 隔离（README 列为未承诺方向） | ① 需约定「teammate 不直接写共享 cwd」；② 回到现状；③ 无时间表 |
| **OQ-4** | 若 TASK-062 与本案同时推进，「工具权限 / 会话约定」正文归哪一份文档？ | ① 归 062 的 `AGENTS.md §7`，本卡只链接；② 另立 `docs/os/process/AGENT_TEAMS.md` 作唯一 owner；③ 暂不写规则正文 | 按 [DOCS.md §2](../../../os/standards/DOCS.md#2-单一归属规则核心)，须指定唯一归属避免双份；本卡不代选 |
| **OQ-5** | 任务板状态与项目状态是否需要机械映射/校验？ | ① 不映射，明确「任务板 = 运行时清单」；② 写脚本校验两者不冲突；③ 由 Human 逐次核对 | ① 最轻；②③ 增加维护成本，且插件 schema 可变（F-10） |
| **OQ-6** | 本卡批准后的下一步形态？ | ① 只备案、不实施；② 转 Planner 出 ExecPlan 后做只读试点；③ 并入某个 Story | ① 符合「只出提案」；②③ 需 Human 另行授权，且不自动改本卡 Status |

## 9. Coordination Notes

- 本卡为 `Planning`（待 Human 审阅），**范围与 AC 未批准**。审阅通过前不得开工，也不得把 §4 草案当作现行规则。
- 与 [TASK-062](./TASK-062-agent-role-boundary-and-overhead.md)：按 Human 裁决另起新卡；两卡不合并、不互相修改正文、不代裁对方 OQ。
- 与 [AGENTS.md §8](../../../../AGENTS.md)：引入运行时工具链属需上报的决策，本卡只出提案、不启用、不改规则，符合「停手上报」。
- 与 [DOCS.md §2](../../../os/standards/DOCS.md#2-单一归属规则核心)：本卡不新增 `docs/os/` 规则正文；若后续要写，须由 Human 指定唯一 owner（OQ-4）。
- 本卡不运行业务测试、不 `git add/commit`；交付仅为文档新增与索引登记。

## 10. 本轮边界自检（2026-11-06）

| # | 边界 | 结果 |
|---|---|---|
| 1 | 只新增本卡 + [BOARD.md](../../../BOARD.md) 未关联任务表一行 + [docs/readme.md](../../../readme.md) 索引一条 | 待本轮落盘后核对 |
| 2 | 不改 `docs/os/`、根 `AGENTS.md`、`TASK-062` 正文、US-004 过程资料 | ✅ 本轮只读 |
| 3 | 不改 BOARD 的 Story / Task 状态投影与进度汇总数字 | ✅ 仅新增独立任务行 |
| 4 | 不改 DSH profile / 不启用插件 / 不改 `~/.dsh/` | ✅ 只读核查 |
| 5 | 零业务代码、零测试、零 `git add/commit` | ✅ |
| 6 | 源码事实与未实跑范围分开记录 | ✅ §2.1 / §2.3 |
| 7 | 草案标注「未生效、不得引用」 | ✅ 文首与 §4 |

## 11. 记录（按需）

本卡完成后按 [DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 留在 `development/tasks/active/`；独立任务结案后由 Human 决定移至 `completed/`。当前 `Planning`、范围未批准，无实施 / 审查 / 结案记录。

## 自检

- [x] Scope 与任务 AC 明确；独立任务无 Story AC 关联，已标 N/A。
- [x] 批准或免计划依据有效：本卡 `Not required`，待 Human 批准范围与 AC 后才可能进入实施。
- [x] 状态、证据、权限和链接一致；记录未重复存放；草案未冒充现行规则。
