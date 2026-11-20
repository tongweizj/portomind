# TASK-074 — 价格链路观测与健壮性（SUCCEEDED 语义 / result 部署核对 / 新鲜度 / 熔断 / NOT_FOUND 提示）

> **Status：Completed**（2026-11-20，Human 确认结案）。见[结案记录](./TASK-074-price-pipeline-observability-and-robustness-plan.md#13-completion-record)。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Completed** |
| 所属 Story | 无（独立维护任务） |
| 覆盖的验收条件 | 本卡 §3 AC（来源：[PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P1-3 / P1-4 / P1-5 / P2-6 / P2-7） |
| Priority | Medium（建议；观测与健壮性，排在 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) P0 之后，待 Human 确认） |
| Owner | 待指派 |
| Created | 2026-11-17 |
| Type | Feature / Bugfix（shared / cron-worker，少量 client 提示） |
| 来源 | [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)（2026-11-15 独立审阅，基线 `main@d6e1413`；发现的唯一事实来源） |
| Execution Plan | 已创建（2026-11-17，Planner 起草，Status `Approved` **已批准**）：[TASK-074 执行计划](./TASK-074-price-pipeline-observability-and-robustness-plan.md)。跨模块/契约变化/复杂依赖按 [EXECUTION_PLANS §2](../../../os/process/EXECUTION_PLANS.md) 必写；计划 §6 列 D-f/D-g（D-e 已收敛，D-g 超出本卡），批准前不得实施 |

## 1. 问题

审阅（同步后真实库实测）发现价格链路的观测与健壮性缺陷：数据坏了没人知道、上游挂了放大故障。与 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md)（数据正确性）不同，本卡解决**"看得见 + 抗打击"**：

1. **P1-3 `SUCCEEDED` 语义透支**：周末零采集（`ok=0`，20ms）也记 `SUCCEEDED`——连着两天 `SUCCEEDED` 而价格实际停在 3 天前，只看 status 完全看不出数据停止更新。
2. **P1-4 `result` 契约缺失（实测）**：2026-11-13/14 的 `taskruns.result=undefined`，事后无法区分"休市跳过"与"真没数据"。⚠️ 但 Planner 核对发现 **TASK-057 的 result 透传已在 `main`**——此项**先核对部署现状**（生产 cron-worker 是否已部署 057 代码），可能只是部署滞后而非实现缺陷。
3. **P1-5 旧价无告警**：`getLatestPrices` 取最新一条不校验新鲜度，页面若无其事地展示 3 天前价格——"旧价也是一种猜"，与不变量 2 的精神相悖。
4. **P2-6 无熔断 + 错误压平**：上游整体故障时 44 资产逐个重试到底（68～82 秒、44×4 次请求），且失败原因被压平成 `UPSTREAM/request failed`。
5. **P2-7 `NOT_FOUND` 长期静默**：`VBG.TO`/`VBU.TO` 连续 3 周每天失败无人处理，其 CAD 桶因此恒 `null`。

## 2. 已核实的事实

审阅结论引用 [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)。Planner 2026-11-17 只读补充核对：

| 事实 | 落点 |
|---|---|
| `taskRunner.normalizeCounts` 已显式透传 `result` 键（TASK-057 交付在 `main`）→ P1-4 的"代码缺失"判断**已过时**，真实原因待核（部署滞后 / 生产数据早于部署） | `shared/services/taskRunner.js:21-24` |
| `getLatestPrices` 逐 symbol `findOne().sort({timestamp:-1})`，无新鲜度字段返回 | `shared/services/marketData.service.js:12` |
| 审阅实测数字（耗时 68～82s 全失败日、连续 NOT_FOUND、周末 SUCCEEDED 表）可按其附录 A 复现 | 审阅 §P1-3/P2-6/P2-7 |

证据边界：本轮未连库、未跑测试；P1-4 根因是**待核事实**，本卡 AC1 先核对再定改法。

## 3. Acceptance Criteria

| # | 验收标准 | 来源 |
|---|---|---|
| AC1 | **先核对后动手**：查明 2026-11-13/14 `taskruns.result=undefined` 的真实原因（部署滞后 vs 残余缺陷）。若部署滞后 → 部署 057 代码并以**真实库** `taskruns.result` 非空实证闭环；若为残余缺陷 → 修复并实证。交付含根因判定记录，不接受"重新实现一遍 result 透传" | P1-4 |
| AC2 | 零采集运行（`ok=0` 且全部休市跳过）不再提供虚假安全感：**与 [TASK-073 AC6 / D-d](./TASK-073-price-pipeline-p0-data-correctness.md) 统一同一口径与单点实现**——「无新数据/全部跳过」作为**中间态**在 `result` 数据态中如实反映（沿用 US-001 数据态契约的灰/未知表达），**不加入状态机、不新增状态值**，沿用 TASK-057 锁定的 `RUNNING/SUCCEEDED/PARTIAL/FAILED` 四态；**074 不在 `shared/` 或看板另建第二套「无数据」表达或状态值**（硬规则 #1 单一实现）。本卡在此之上只保留 074 特有的观测增量：**连续 N 天无新数据可见**（N 见 D-f），使「连续 `SUCCEEDED` 而价格停更」可被发现；负向对照：不得新增 `SKIPPED` 等状态、不得改唯一索引、不得把 `status` 判成「数据完好」来掩盖未检查 | P1-3 / 073 D-d |
| AC3 | `getLatestPrices`（或等价入口）返回**新鲜度信号**（如 `{price, timestamp, stale}`），至少一处消费端（估值页或提醒）对"价格距今 > N 个交易日"给出可见提示；stale 是**标注**不是猜测，缺价仍 `null`（不变量 2 不破） | P1-5 |
| AC4 | 单 provider 连续失败达阈值即**熔断**本轮该 provider 剩余资产；全失败日请求数与耗时显著下降（实测对比审阅的 44×4 次 / 68～82s 基线）；`classifyMarketDataError` 保留 HTTP 状态与原始报文进 `failures[]`，不再只剩 `request failed` | P2-6 |
| AC5 | 连续 N 天 `NOT_FOUND` 的资产产生**用户可见提示**（提醒或看板异常入口），不再无限静默；阈值见 D-f | P2-7 |
| AC6 | 回归：`test:server` 与 `test:worker` 全量全绿（数量以实际为准，入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）；独立 Reviewer 通过 | — |

## 4. Scope

**In Scope**

- AC1 的部署核对与（如需）残余修复；AC2 的语义处置（按裁决）；`getLatestPrices` 新鲜度信号与一处消费端提示；fetch 熔断 + 错误分类增强；`NOT_FOUND` 连续失败提示（复用提醒/看板既有通道，不新建子系统）

**Out of Scope**

- P0 数据正确性（symbol 双轨 / launchDate / 采集日期错位）→ [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md)
- 币种桶「任一缺价整桶 `null`」策略变更（产品语义，见 D-g）；P3-9 逐条评估项；不改估值/再平衡规则；不重开已结案任务

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 误把"部署滞后"当缺陷重做 057 已交付的功能（重复实现 = 硬规则 #1 违规） | AC1 强制先核对；与 [US-001 已交付](../../delivery/completed/US-001/readme.md) 契约对照 |
| R-2 | 另起一套「无数据」表达与 073/057 冲突 | AC2 + D-e 已收敛到 073 D-d 单一实现：只复用其 `result` 数据态，不改状态机/唯一索引/不新增状态值；本卡只做「连续 N 天可见」增量 |
| R-3 | stale 提示被当成"估值打折/修正"的依据 | AC3 明示 stale 只是标注；缺价仍 null |
| R-4 | 熔断把单资产瞬时故障放大成"整轮不采" | 阈值按 provider 连续失败计（非单资产），D-f 定阈值 |
| R-5 | 审阅部分结论过时（P1-4 已被 Planner 证伪一半） | 以 §2 补充核对为准；其余复用审阅可复现实测 |

## 6. 待 Human 裁决

> D-e 已收敛（与 073 D-d 统一，见下表）；D-f / D-g 仍待裁决。

| # | 决定 | 选项 |
|---|---|---|
| **D-e** | 零采集 `SUCCEEDED` 语义 | ✅ **已收敛 = 与 [TASK-073 D-d](./TASK-073-price-pipeline-p0-data-correctness.md) 统一**：「无新数据/全部跳过」仅作 `result` 数据态表达（灰/未知），沿用 TASK-057 四态，**不加入/不新增状态机**；本卡不另建第二套表达。仅在 073/057 提供的单一数据态之上增加「连续 N 天无新数据可见」的观测增量。若 Human 要新增状态值，须显式推翻 TASK-057 锁定并同步改 073/074 两卡，非本卡单独裁决 |
| **D-f** | 阈值取值 | stale：N 个交易日（建议 2）；NOT_FOUND 连续天数（建议 3）；provider 熔断连续失败次数（建议 3～5） |
| **D-g** | 币种桶「整桶 null」策略（产品不变量 2 的解释） | 维持现状 vs 允许部分估值+显式缺口标注——属产品语义，超出本卡，如需变更另行立项 |

## 7. Coordination Notes

- 与 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) 边界：数据正确性 vs 观测健壮性；AC3 的新鲜度提示在 073 修复后价值才完整（否则"最旧价"也查不到）。
- **「无数据/全部跳过」表达归属 073（本卡复用，不另建）**：073 AC6 / D-d 已把「`skippedCount === totalCount` / `checkedCount=0`」定为 `result` 数据态中间态（沿用 TASK-057 四态、US-001 数据态契约）。本卡 AC2 的零采集 `SUCCEEDED` 是同一问题的另一实例，**统一消费该单点数据态实现**（`shared/` 与看板各一份，硬规则 #1）；074 **只**新增「连续 N 天无新数据可见」的观测能力，不改 `shared/` 的状态/数据态表达、不新增状态值、不改唯一索引。两卡不得各自造一套「无数据」表达或看板渲染；实现时若发现需在该单点加字段，回报后由 073 侧统一改，本卡不私自分叉。
- AC1 的核对结论若证明 result 契约已有缺陷，**先回报**再决定是否改 `normalizeCounts`（057/064 已交付契约的实质变更须走 Human 权限）。
- `ASSET_*` 枚举等既有同步约定照旧（硬规则 #8）；外部调用保持超时+重试包装（硬规则 #7），熔断是其上层短路，不替代之。

## 8. 本卡未做的事

未实施、**ExecPlan 已创建但为 `Draft`（未批准，见计划 §6：D-e 已收敛；D-f 待裁决；D-g 超出本卡）**、**D-e 已收敛（统一到 073 D-d，见 §6 / AC2 / §7）**，D-f/D-g 仍待裁决；未改任何 AC 实质意图/Status（Planner 仅建卡内容与边界协调）。

## 9. 记录

2026-11-19，Reviewer 复审结论为 **Pass**。AC1 按 Human 裁决依据现有证据验收，原异常未复现，根因未确认。裁决和完整结论见[实施计划 §12](./TASK-074-price-pipeline-observability-and-robustness-plan.md#12-review-record)。

2026-11-17，Planner：依据 Human 指令「根据 PRICE-PIPELINE-REVIEW 创建独立 task」建卡，与 TASK-073 按审阅优先级分层拆分（P0 数据正确性 / P1-P2 观测健壮性）。P1-4 已按 Planner 核对修正定位（先核对部署，不重做 057）。初始 Status 待 Orchestrator 登记；优先级建议 Medium，最终以 Human 为准。D-f/D-g 裁决前 AC3/AC5 的口径未冻结，不得按推荐值擅自实现。

2026-11-17（Planner 协调修订，仅重叠 A）：按 Human 指令，将本卡 AC2「零采集/全部跳过 = SUCCEEDED」统一到 [TASK-073 AC6 / D-d](./TASK-073-price-pipeline-p0-data-correctness.md)——「无新数据/全部跳过」仅作 `result` 数据态表达（复用 073/057 单点实现，沿用四态、不新增状态值、不改唯一索引），本卡只保留「连续 N 天无新数据可见」的观测增量。同步更新 AC2 / D-e / R-2 / §7 Coordination Notes / §8；未改任何 AC 实质意图、其它重叠项（B–F）或 Status。

2026-11-17（Planner 起草执行计划）：任务卡移入 active/ 后，按 Human 指令新建 [TASK-074 执行计划](./TASK-074-price-pipeline-observability-and-robustness-plan.md)（Status `Draft` 未批准）；计划逐条映射 AC1–AC6，落实 D-e 复用 073 D-d 单点，§6 保留 D-f/D-g 待裁决，§10 交接 Implementer。同步更新本卡 Metadata Execution Plan 行与 §8；未改任何 AC/Status。
