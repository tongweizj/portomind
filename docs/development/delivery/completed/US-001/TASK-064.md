# TASK-064 — cron 状态读侧契约兼容与跳过观测

> Orchestrator 已于 2026-10-30 正式登记并接收规划。本卡处于 Planning，等待 Human 审阅相关决定和 Draft；登记不构成实施授权。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | Completed（2026-11-05，独立 Reviewer 判定 `Pass with issues`，无 BLOCKER；Human 确认「检验完成，没有问题」） |
| Priority / Owner / Type | High / — / Feature |
| Created / Updated | 2026-10-30 / 2026-11-05 |
| 所属 Story | [US-001](../../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md) |
| 覆盖的验收条件 | US-001/AC-02、05～08、11（读侧兼容） |
| Related Spec | [FS P0](../../../requirements/specs/FS-cron-worker-status-board.md) |
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

2026-10-30，Orchestrator 正式登记：依据 Human 本轮“接收 US-001 规划、条件满足后登记 TASK-063/064”的明确指令、当前 Story 的既有 High 优先级，以及 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态) 对已授权 Story 内常规拆分的权限。已核对所属 Story、AC 关联、范围、依赖及对应 Draft；本卡承接既有读侧兼容修正及获批方案的跳过观测读取，不重开 TASK-054。初始 Status 为 Planning，Owner 待指派；Planner 为既有规划产出角色，不代填实施者。D-01～D-03 的结果契约、真实环境核对及本计划批准尚未齐备，不可实施。接收与审阅清单见 [Orchestrator 接收记录](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。

规划已准备；实施、审查与关闭尚未发生。后续证据写对应计划；本卡仅引用。

2026-11-05，Planner：按已冻结契约（D-01～D-03 + [TASK-057 计划 §4 样例 S1～S10](./TASK-057-plan.md)）重写 [TASK-064 计划](./TASK-064-plan.md)：§3 精确缺陷地图 F1～F8（含实测行号）、§4 归一化修正与判级表、`lastSkip` 批量只读设计、查询预算 +1、验证映射 AC1～AC6。仍为 Draft 待 Human 批准；批准即覆盖卡片 §6 所述契约变化（可选 `lastSkip` 字段 + 查询预算）。

## Orchestrator 计划批准与启动核对（2026-11-05）

依据：Human 指示「批准 task064」；状态权限见 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)。

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

## W0 前置解除与实施交接（2026-11-05）

Human 指示「先完成 task064」。核对 W0 前置：**已满足**。

| 项 | 事实 |
|---|---|
| 057 合入 | ✅ `feature/TASK-057` 经 **`1e421db`** 合入 `main`；`git merge-base --is-ancestor 54136c2 main` = 是 |
| 前置物 1 | ✅ `shared/models/taskSkip.js` 存在（1400 B） |
| 前置物 2 | ✅ `shared/models/taskRun.js:30` 有 `result: { type: mongoose.Schema.Types.Mixed }` |
| `main` 基线 | `a8687a4`（含 US-002/003/005 登记与 TASK-065~069 卡片，与本卡无关） |
| 目标文件 | `shared/services/cronStatus.service.js` SHA256 `27a3cc56…`，与计划记录**一致**（057 未触碰） |

**F1～F7 行号复验（057 合入后无漂移）**

| # | 位置 | 复核结果 |
|---|---|---|
| F1 | `:475` `ok: value === true \|\| value === 'ok'` | ✅ 行号准确 |
| F2 | `:499` `contractReady = currencies !== null` | ✅ 行号准确 |
| F3 | `:503-505` `okCount === entries.length` | ✅ 行号准确 |
| F4 | `:578` `due: result ? result.due === true : null` | ✅ 行号准确 |
| F5 | `:619` `(row.suggestionsCount ?? 0) > 0` | ✅ 行号准确 |
| F6 | `:628` `due > 0 && generatedCount < due → 'bad'` | ✅ 行号准确 |
| F7 | `:560` `contractReady = Array.isArray(perPortfolio)` | ✅ 行号准确 |
| F8 | 全文件无 `lastSkip` | ✅ 确认 |

**⚠️ 本轮新发现**：`(row.suggestionsCount ?? 0) > 0` 在 **两处**出现——`:619`（主视图 `generatedCount`）与 **`:743`**（detail 视图的 `summary.generated`）。计划 §4-6 要求「detail 视图零回归」，故 `:743` **不在本卡修复范围**；实施时不要顺手改它，否则违反零回归红线。此条已写入交接。

**状态登记**：Task `Planning` → **`Implementing`**（依据 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)「Task → Implementing：当前设计的有效计划批准记录」——计划 2026-11-05 已 `Approved`，且 W0 前置满足）。Owner → `Implementer`。

**未做的事**：未建分支或 worktree；未改任何代码；未运行测试。

## Orchestrator 交付接收记录（2026-11-05）

依据 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)：「Task → Reviewing：Implementer 提供改动清单、自测证据、可审对象和已知妥协」。四项齐备，故登记 `Implementing` → **`Reviewing`**。

| 项 | 事实 |
|---|---|
| Worktree | `D:/projects/portomind-064`（主工作区未被本卡改动） |
| 分支 / 提交 | `feature/TASK-064` @ **`de045af`**（基点 `d124626`） |
| 改动规模 | **9 文件**，+899/−77：`cronStatus.service.js`、`server/test/` 2 文件、`scripts/verify-task-064.cjs`、docs 3 |
| 范围核对 | 无 `cron-worker/` `client/` 改动；未改 `taskSkip.js`、`fxRate.service.js`、server 路由 |
| 自测证据 | 计划 §11.4：AC1～AC6 逐条；新增 18 条用例 |

**Orchestrator 独立抽验（不采信自述）**

| 项 | 结果 |
|---|---|
| F1～F3（FX） | `NUMERIC_OBSERVATION_ONLY` note 已实现（`:595`）✓ |
| F4～F7（再平衡） | `PER_PORTFOLIO_INCOMPLETE` note 已实现（`:735`）✓ |
| F8（lastSkip） | 主视图与 detail 均有 `lastSkip` 构造（`:947` / `:990`）✓ |
| detail 零回归 | 计划 §11.3 声明 detail `summary.generated` 保留原 `?? 0`（行号 922）未改 ✓ |
| 越界 | `git diff main..HEAD -- cron-worker/ client/` **空** ✓ |

**⚠️ 必须由 Reviewer 核实的风险：分支基点落后，合入会回退一处无关修复**

`feature/TASK-064` 从 `d124626` 切出，**不包含** `c11bb64`（`fix(docs): allow two Story directories under delivery root`）。

该分支 diff 里因此出现：

```
-if (currentDeliveries.length > 2) ... '最多保留两个 Story 目录'
+if (currentDeliveries.length > 1) ... '只能保留一个当前 Story 目录'
```

**这是基点落后造成的"假改动"，不是 Implementer 改错**。但若直接合并，会把 `c11bb64` 的修复**回退掉**，`docs:check` 将重新报 `multiple-current-deliveries`。

**处置**：合入前必须 `rebase main` 或 `merge main`，并在 rebase 后确认 `scripts/check-docs.cjs:48` 仍为 `> 2`。此条已写入 Reviewer 提示词。

**未做的事**：未重跑验证（Reviewer 将独立复验）；未改 AC / Scope / 代码；未提交、未合入、未填 `Merged`、未关闭。

## 审查结论接收与完成记录（2026-11-05）

独立 Reviewer 已完成复核，结论写入 [计划 §12](./TASK-064-plan.md#12-review-record)（worktree 提交 `b23abb9`）。Human 确认「检验完成，没有问题」。

| 项 | 结果 |
|---|---|
| 判定 | **`Pass with issues`**（按 [REVIEWER.md](../../../../os/roles/REVIEWER.md) §5） |
| BLOCKER | **无** |
| AC1～AC6 | **全部满足**，经 Reviewer 自建探针 **36/36** + 真实 Mongo 重跑 + 全量回归（232/78）独立取证 |
| 负向对照 | **四处全部成立**（详见下） |
| 库未污染 | 前后 `276 / 0 / 0`；未新建集合/索引；detail 零回归 |

**Reviewer 的四处负向对照（判定可信的实质依据）**

| AC | 临时注入的缺陷 | 结果 |
|---|---|---|
| AC2 | `fxLevel` 改成「有 ok 就整体绿」 | 3 条断言 FAIL（单币种不绿 / 混合→warn / 无显式失败但有成功项→warn） |
| AC3 | `due` 改回 `result ? result.due === true : null`（F4 回归） | 「due=null 保持 null」FAIL |
| AC4 | `loadLatestSkips` 无条件 `return []` 吞错 | 「非命名空间 DB 错误必须抛出」FAIL |
| AC5 | 多加一次 `TaskSkip.aggregate` | 「恰好 1 次批量聚合」FAIL |

全部还原后重跑 36/36 PASS，`git status` 为空。

**F-01（MAJOR 级合入风险，非 Implementer 缺陷）**

Reviewer 核实 `git diff d124626..HEAD -- scripts/check-docs.cjs scripts/check-docs.test.cjs` **为空**——Implementer 从未改这两个文件。分支 diff 里的 `> 2 → > 1` 是**基点落后 `c11bb64` 产生的假改动**。

**合入前必须 rebase main，并复验 `scripts/check-docs.cjs:48` 仍为 `> 2`**，否则会回退 docs 检查修复。

**残余 MINOR（不阻塞）**

- **F-02**：S1～S10 真实结果以临时夹具/stub 验证，未跑满一个真实调度周期。
- **F-03**：既有 docs 问题（非本卡）。
- **F-04**：`unknownCount` 未输出（计划 §4-2 允许「在 note 体现」）。
- **F-05**：`taskskips` 容量/TTL 未评估（D-01 明确本次不加）。

**状态处置**

| 项 | 结果 |
|---|---|
| 结案日期 | 2026-11-05 |
| Status | `Reviewing` → **`Completed`** |
| Merged | **`Merged`** —— merge commit `cde811f`（`2026-11-05 22:44`），分支 tip `b23abb9` |
| DoD | T-1 实现 ✅ / T-2 验证 ✅ / T-3 AC 逐条 ✅ / T-4 审查收敛 ✅（F-01 为合入流程风险非代码缺陷）/ T-5 文档同步 ✅ / T-6 已知妥协 ✅ |

### 合入状态：`Merged`（2026-11-05 22:44）

2026-11-05 Human 提供合入依据并确认后登记。

```
cde811f  Merge branch 'feature/TASK-064' into main
parents = 0ae6442（结案记录）+ b23abb9（分支 tip / 审查记录）
```

`git reflog show --date=iso main`：

```
cde811f main@{2026-11-05 22:44:46 -0500}: merge chore/merge-TASK-064: Fast-forward
0ae6442 main@{2026-11-05 22:42:22 -0500}: commit: docs(us-001): close TASK-064 as Completed (Merged: Pending)
```

- `git merge-base --is-ancestor b23abb9 main` = **是**；`cde811f` 亦为 `main` / `origin/main` 祖先

**F-01（合入风险）已闭环**：合入采取合并流程（merge commit），`c11bb64` 的 docs 检查修复**未被回退**——复验 `scripts/check-docs.cjs:48` 仍为 `> 2`，「最多保留两个 Story 目录」，`docs:check` 0 ERROR。

**对下游的影响（已解除 063 阻塞）**：`TASK-063` 的串行前置是「057 与 064 均合入 `main`」。两者均已合入，**063 已可实施**（已完成至 `Completed`）。

**未做的事**：未改 AC / Scope / 代码；未推送、未关闭 Task 或 Story。
