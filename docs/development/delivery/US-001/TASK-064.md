# TASK-064 — cron 状态读侧契约兼容与跳过观测

> Orchestrator 已于 2026-10-30 正式登记并接收规划。本卡处于 Planning，等待 Human 审阅相关决定和 Draft；登记不构成实施授权。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | Planning（计划已 `Approved`；**W0 前置未满足**——057 未合入 `main`，暂不登记 `Implementing`） |
| Priority / Owner / Type | High / 待指派 / Feature |
| Created / Updated | 2026-10-30 / 2026-11-05 |
| 所属 Story | [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md) |
| 覆盖的验收条件 | US-001/AC-02、05～08、11（读侧兼容） |
| Related Spec | [FS P0](../../requirements/specs/FS-cron-worker-status-board.md) |
| Execution Plan | [Approved：TASK-064](./TASK-064-plan.md)（2026-11-05 批准；含可选 `lastSkip` + 查询预算 +1 契约变化；启动核对见计划 §10.1） |

## 1. 问题

已完成054保留了数字汇率形态及空对象误判问题；057补充结果后会激活。推荐独立跳过载体还需要读侧汇总，不能在写侧卡或已完成054中静默夹带。

## 2. 已核实的事实

只读源码事实、基线、文件位置与证据限制见 [Planner 回交说明](./US-001-02-planner-return.md) §2。该文件为事实唯一记录，不把设计写成已实现。

## 3. Acceptance Criteria

- [ ] AC1：数字币种值不能被默认为失败：正有限数值只证明该数值观测可读，是否标记同步成功以获批结果契约为准；支持057批准的 currencies 对象形态，不以正数证明业务汇率方向正确。
- [ ] AC2：空对象、数组、缺失/非法预期币种及不完整结果显示 unknown 或明确缺契约说明，不产生空集合即成功、空对象即全部失败且无解释的情况；失败标志与缺记录可区分。
- [ ] AC3：以057最终结果字段为输入，核对完整性、提醒、汇率、父任务及逐组合字段归一化；旧无result记录保持降级；due=null必须仍为未知，未超阈但正常检查不能因suggestionsCount=0被判失败；perPortfolio缺项不能凭数组存在就标契约齐备。仅修正共享归一化错误并回归已有detail，不新增详情功能或改变业务目标日。
- [ ] AC4：若D-01采用TaskSkip集合，增加可选 lastSkip（taskName/runKey/reason/skippedAt/trigger），只读查询最近跳过，不替换 lastRun，不把正在运行的首条记录改成SKIPPED，不用跳过事件冒充成功结果；无新集合或无记录时为null并兼容。若选择替代方案则先更新Draft，不能自行实现新载体。
- [ ] AC5：仅GET读聚合、不触发任务或写库；新查询有索引与批量策略，记录查询预算变化；五任务顺序、现有字段与错误参数处理不回归。
- [ ] AC6：添加针对数字汇率、空对象、非法/缺币种、完整与缺result、skip覆盖及RUNNING/STALE保留的验证；真正Mongo持久化由057证明，读侧stub不能代替写侧证据。

## 4. Scope

shared/services/cronStatus.service.js 及关联 server 测试、API_CONTRACT 文档；如D-01批准，读取新TaskSkip模型。禁止改cron、任务执行、汇率采集业务规则、已完成054的历史结论；新工作在本Task交付。

## 5. Risks

补充字段引入读侧成本或状态掩盖；误把数值合法解释为业务正确；适配器接受无效结果导致假绿。用缺失/失败/混合结果与查询次数验证。

## 6. Blocking Dependencies

D-01/D-02/D-03 已于 2026-11-04 全部裁决（独立 TaskSkip 集合 / currencies{ok,rateToCny} / 函数内部包裹），契约样例 S1～S10 已冻结于 [TASK-057 计划 §4](./TASK-057-plan.md)。**实施前置（串行，Human 2026-11-05 裁决）**：057 合入 `main` 后启动本卡。接口新增可选 `lastSkip` + 查询预算 +1 随本计划批准覆盖（卡片 AC4 已预授权「若 D-01 采用 TaskSkip 集合」）。保留 054 Completed，不重开。计划批准仍待 Human。

## 7. Coordination Notes

新增本任务填补 Story 既有 AC 的实现缺口，不扩展 Story 范围。需 ExecPlan：涉及跨组件接口、状态处理或共享读侧兼容，当前 Draft 未获批准。当前不实施。

## 8. Open Questions

D-01 已裁决（独立 TaskSkip 集合），lastSkip 来源冻结为 `taskskips` 最近事件；D-02 已裁决（currencies 记数值+完成标志），数字形态语义 = 仅数值观测（不判成败）。旧 `result` 数字形态的修正随本计划（计划 §4-1）送 Human 批准，不绕过。无其他待决项。

## 9. 记录

2026-10-30，Orchestrator 正式登记：依据 Human 本轮“接收 US-001 规划、条件满足后登记 TASK-063/064”的明确指令、当前 Story 的既有 High 优先级，以及 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 对已授权 Story 内常规拆分的权限。已核对所属 Story、AC 关联、范围、依赖及对应 Draft；本卡承接既有读侧兼容修正及获批方案的跳过观测读取，不重开 TASK-054。初始 Status 为 Planning，Owner 待指派；Planner 为既有规划产出角色，不代填实施者。D-01～D-03 的结果契约、真实环境核对及本计划批准尚未齐备，不可实施。接收与审阅清单见 [Orchestrator 接收记录](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。

规划已准备；实施、审查与关闭尚未发生。后续证据写对应计划；本卡仅引用。

2026-11-05，Planner：按已冻结契约（D-01～D-03 + [TASK-057 计划 §4 样例 S1～S10](./TASK-057-plan.md)）重写 [TASK-064 计划](./TASK-064-plan.md)：§3 精确缺陷地图 F1～F8（含实测行号）、§4 归一化修正与判级表、`lastSkip` 批量只读设计、查询预算 +1、验证映射 AC1～AC6。仍为 Draft 待 Human 批准；批准即覆盖卡片 §6 所述契约变化（可选 `lastSkip` 字段 + 查询预算）。

## Orchestrator 计划批准与启动核对（2026-11-05）

依据：Human 指示「批准 task064」；状态权限见 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)。

| 动作 | 结果 |
|---|---|
| 计划状态 | [TASK-064-plan.md](./TASK-064-plan.md) `Draft` → **`Approved`**（依据 §4「ExecPlan Draft → Approved：只有 Human」） |
| 批准范围 | §1～§9 当前设计，**含 §6 契约变化**：可选 `lastSkip` API 字段、主视图查询预算 +1、FX 与再平衡判级语义修正。不含其他任务。 |
| Task 状态 | **保持 `Planning`** —— W0 前置未满足，不登记 `Implementing` |
| Owner | 仍 `待指派` |

**核对结论：设计有效。** 计划 §3 的 F1～F8 八条缺陷经 Orchestrator 亲读逐一核实**属实，行号准确**（`normalizeCurrencies:475` 数值判 `ok:false`；`contractReady = currencies !== null` 空对象判就绪；`okCount === entries.length` 单币种也绿；`due: result ? result.due === true : null` 把 null 读成 false；`(row.suggestionsCount ?? 0) > 0` 未知折算 0；`due > 0 && generatedCount < due → bad` 未超阈误判；`Array.isArray(perPortfolio)` 缺项也标齐备；无 `lastSkip`）。

**⚠️ W0 前置未满足（阻断派发）**

核对 `git merge-base --is-ancestor 5bb47ea main` = **否**。`feature/TASK-057` @ `5bb47ea` 仍在 `Reviewing`（worktree `D:/projects/portomind-057`），**未合入 `main`**。

后果：`shared/models/taskSkip.js` 与真实 `result` 写入在 `main` 上**都不存在**。本卡是 adapter 环，读取对象正是这两者——现在开工等于对着不存在的契约写适配层。

**处置**：057 审查通过并合入 `main` 后，按计划 §10 派发。**不提前登记 `Implementing`**。

**未做的事**：未建分支或 worktree；未改任何代码；未运行测试。
