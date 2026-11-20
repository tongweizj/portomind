# TASK-074 — 价格链路观测与健壮性 实施计划

## Status

Status：Completed（2026-11-20，参见 §13）

Owner：Planner（起草）；Implementer（待指派）

Related Task：[TASK-074-price-pipeline-observability-and-robustness](./TASK-074-price-pipeline-observability-and-robustness.md)（独立维护任务，无 Story）

Related Spec / ADR：无 Spec；依据为 [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P1-3 / P1-4 / P1-5 / P2-6 / P2-7、任务卡 §6 裁决（D-e 已收敛）、[TASK-073 AC6 / D-d](./TASK-073-price-pipeline-p0-data-correctness.md)（「无数据」单点语义）、[TASK-057](../../delivery/completed/US-001/TASK-057.md) 四态、[US-001 数据态契约](../../delivery/completed/US-001/readme.md)、[ADR-002 单一调度](../../../os/architecture/adr/ADR-002-single-scheduler.md)、[AGENTS.md §5](../../../../AGENTS.md) 硬规则

Branch / Base：当前 `main` @ `d6e1413`（起草时）；实施从最新 `main` 开 `feature/TASK-074-price-pipeline-observability-and-robustness`

Approval：Human 于 2026-11-17 批准计划，D-e 复用 TASK-073 D-d。2026-11-19 Human 冻结 D-f 阈值，见 §6。D-g 不在本卡范围。

## 1. Intent

修复价格链路「数据坏了没人知道、上游挂了放大故障」的观测与健壮性缺陷（[审阅](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P1-3 / P1-4 / P1-5 / P2-6 / P2-7），与 [TASK-073](./TASK-073-price-pipeline-p0-data-correctness.md) 的数据正确性互补，不改变产品需求与业务规则。

目标（逐条对应任务卡 AC）：

- **AC1**：先核对 2026-11-13/14 `taskruns.result=undefined` 的真实原因（部署滞后 vs 残余缺陷），按核对结果处置并实证；**不重新实现一遍 result 透传**。
- **AC2**：零采集/全部跳过不再提供虚假安全感——「无数据/全部跳过」**统一复用 TASK-073 AC6 / D-d 的 `result` 数据态单点实现**（沿用 TASK-057 四态与 US-001 灰/未知表达，不加入状态机、不新增状态值、不改唯一索引，074 不另建第二套表达或看板渲染）；074 只新增「连续 N 天无新数据可见」的观测增量。
- **AC3**：`getLatestPrices` 返回新鲜度信号（如 `{price, timestamp, stale}`），至少一处消费端对「价格距今 > N 个交易日」给出可见提示；stale 只是标注，缺价仍 `null`（不变量 2）。
- **AC4**：单 provider 连续失败达阈值即熔断本轮该 provider 剩余资产（全失败日请求数/耗时对比 44×4 次 / 68～82s 基线显著下降）；`classifyMarketDataError` 保留 HTTP 状态与原始报文进 `failures[]`。
- **AC5**：连续 N 天 `NOT_FOUND` 的资产产生用户可见提示（复用既有提醒/看板异常通道，不新建子系统）。
- **AC6**：`test:server` / `test:worker` 全量全绿，独立 Reviewer 通过。

范围外（卡 §4）：P0 数据正确性（TASK-073）、币种桶「任一缺价整桶 `null`」策略（D-g）、估值/再平衡规则、P3-9 逐条评估、重开已结案任务与 US-001。

## 2. Context

- **AC1 已知代码事实（亲读）**：`shared/services/taskRunner.js:14-27` 的 `normalizeCounts` 在 `result` 键存在时显式透传（`TASK-057` 交付在 `main`），现有实现已能把 `result` 写进 `TaskRun`（`taskRunner.js:86-96`）；`shared/tasks/dailySync.js:82` 已把 `{ result: { skippedCount } }` 包进 execute 返回值。故审阅所见 `result=undefined` 更可能是**部署滞后或生产数据早于部署**，而非代码缺失——AC1 必须先核对部署版本与库中数据时间，再决定是否动代码。
- **AC2 单点语义来源**：TASK-073 AC6 / D-d 定义「`skippedCount === totalCount` / `checkedCount=0`」为 `result` 数据态中间态，沿用 TASK-057 `RUNNING/SUCCEEDED/PARTIAL/FAILED` 四态；US-001 看板按数据态给出灰/未知表达。074 零采集 `SUCCEEDED`（P1-3）是同一问题的另一实例，按卡 §6 D-e 收敛结论必须复用该单点，不得分叉（硬规则 #1 单一实现）。
- **状态推导（亲读）**：`taskRunner.js:89` 仅按 `failureCount > 0` 判 `PARTIAL` 否则 `SUCCEEDED`，不看 `successCount`——周末 `ok=0`、无失败 → `SUCCEEDED`（P1-3 根因）。本计划**不改**该状态机（D-e/D-d 锁定），只在数据态与看板表达层解决。
- **新鲜度数据面（亲读）**：`shared/services/marketData.service.js:12-39` 逐 symbol `findOne({symbol}).sort({timestamp:-1})`，返回 `{ [symbol]: price|null }`，不含时间戳，故消费端无法判断价格新旧。调用方有 `alertEngine.service.js:245`、`portfolio/positionTracker.js:15`、`rebalance/suggestionGenerator.js:190`；「距今天数」的市场日口径应复用既有市场日历能力（`shared/services/calendar.service.js`、`shared/utils/marketTime.js`），不自行发明交易日算法。
- **熔断插入点（亲读）**：`shared/tasks/dailySync.js:19-68` 的 `syncActiveAssetPrices` 逐资产串行 try/catch；fetch 经 `shared/services/priceFetch.service.js:92-95` 的 `fetchWithRetry`（`shared/utils/retry.js:20-45`，`maxRetries=3` 指数退避，只重试 `error.retryable===true`）。熔断应作为**遍历层短路**，位于 `fetchWithRetry` 之上，不替代硬规则 #7 的超时+重试包装。
- **错误分类（亲读）**：`shared/fetchers/errors.js:28-49` 的 `classifyMarketDataError` 已区分 `TIMEOUT/RATE_LIMIT/NOT_FOUND/INVALID_RESPONSE/UPSTREAM`；但落库 `failures[]` 时 `dailySync.js:56-63` 只取 `category/provider/retryable/message`，丢失 `error.status` 与原始报文（P2-6 错误压平）。`NOT_FOUND` 当前 `retryable:false`（`errors.js:38-43`）。
- **看板数据（亲读）**：`shared/services/cronStatus.service.js` 是 `GET /api/cron/status` 的**唯一派生实现**（TASK-054/064），常量在 `shared/constants/cronStatus.constants.js`（5 个 `CRON_TASK_NAMES`、数据态优先级 `NOTE_PRIORITY` 在 `cronStatus.service.js:45-66`）。新增「连续无数据/旧价/NOT_FOUND」提示须在此单点派生，不改前端业务阈值（硬规则 #3）。

## 3. Repository Findings（2026-11-17 亲读，标注行号）

| # | 事实 | 落点 |
|---|---|---|
| F-01 | `normalizeCounts` 显式透传 `result` 键（有则用 `hasOwnProperty` 保留），`TASK-057` 已在 `main` | `shared/services/taskRunner.js:14-27` |
| F-02 | `runTrackedTask` 状态推导只看 `failureCount`，不看 `successCount`/`skippedCount` → 零采集记 `SUCCEEDED` | `shared/services/taskRunner.js:85-98` |
| F-03 | `dailySync` 把 `{ result: { skippedCount } }` 包进 execute 返回值；`syncActiveAssetPrices` 汇总含 `skippedCount` | `shared/tasks/dailySync.js:26-32,70-85` |
| F-04 | `getLatestPrices` 返回 `{symbol: price|null}`，无 timestamp/stale；缺价记 `PRICE_DB_MISSING` 日志 | `shared/services/marketData.service.js:12-39` |
| F-05 | `getLatestPrices` 三处调用方：alertEngine / positionTracker / suggestionGenerator（均为 shared 内部） | `shared/services/alertEngine.service.js:245`、`shared/services/portfolio/positionTracker.js:15`、`shared/services/rebalance/suggestionGenerator.js:190` |
| F-06 | `classifyMarketDataError` 有 `status`/`cause` 字段但 `failures[]` 未落；`NOT_FOUND` 判 404 或 `not found|no data`，`retryable:false` | `shared/fetchers/errors.js:12-49`、`shared/tasks/dailySync.js:56-63` |
| F-07 | `fetchWithRetry` 默认 `maxRetries=3`，仅重试 `error.retryable===true`，指数退避 + full jitter | `shared/utils/retry.js:20-45` |
| F-08 | `syncActiveAssetPrices` 逐资产串行 try/catch，无 provider 连续失败计数/熔断 | `shared/tasks/dailySync.js:35-66` |
| F-09 | cronStatus 唯一派生实现，5 个任务名常量 + `NOTE_PRIORITY` 数据态排序；`result` 缺失时数值为 null（null≠0） | `shared/services/cronStatus.service.js:3-12,45-66`、`shared/constants/cronStatus.constants.js:7-14` |
| F-10 | 测试框架为 Node 内建 `node:test` + `node:assert`，无 jest/vitest；`test:server` / `test:worker` 见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md) | 各 package `package.json`、`DEPLOYMENT.md §7` |

未核实项（诚实标注）：本轮**未连库、未跑测试、未确认生产 cron-worker 部署版本**。AC1 的部署版本与库中 `taskruns.result` 时间分布待实施阶段实测；审阅的 68～82s / 44×4 次 / 连续 NOT_FOUND 数字按 [审阅附录 A](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) 复现方式验证，不在此处重复断言。D-f 的具体阈值（stale N 交易日 / NOT_FOUND 连续天数 / 熔断连续失败次数）尚未裁决，实施前须冻结。

## 4. Proposed Design

> 所有方案均落在既有单点实现上，不新增子系统、不在 `server/` 注册调度、不改估值/再平衡规则；业务规则只在 `shared/`（硬规则 #1/#2/#3）。

### 4.1 AC1 — result 部署核对（先核对后动手）

1. 核对生产 `cron-worker` 实际部署版本/commit 是否含 TASK-057（`normalizeCounts` 透传 `result`）；核对 2026-11-13/14 `taskruns` 的 `result` 字段与 `startedAt`/`endedAt`，判断是否部署滞后或数据早于部署。
2. 若为部署滞后 → 部署 057 代码，以真实库 `taskruns.result` 非空实证闭环；若为残余缺陷 → 定位并修复（须回报，涉及 057/064 已交付契约的实质变更走 Human 权限，卡 §7）。
3. 交付**根因判定记录**（部署版本、数据时间、实证结果）；禁止「重新实现一遍 result 透传」（R-1）。

### 4.2 AC2 — 「无数据/全部跳过」复用 073 D-d 单点

1. `shared/` 与看板层**不新增**「无数据」表达、状态值或 `result` 契约；直接消费 TASK-073 AC6 / D-d 已定义的 `result` 数据态中间态（`skippedCount===totalCount` / `checkedCount=0` → 灰/未知，status 仍按 TASK-057 四态）。
2. 本卡**仅**新增「连续 N 天无新数据可见」的观测增量：按 `CRON_TASK_NAMES` 中价格同步任务，从 `TaskRun.result` 数据态读取「全部跳过/无新数据」信号，统计连续天数（N 见 D-f，建议 2），在看板数据态中给出可见提示（复用 `cronStatus.service.js` 的 `NOTE_PRIORITY` 与前端既有灰/未知渲染，不新增卡片/子系统）。
3. 负向对照：不新增 `SKIPPED` 状态、不改唯一索引、不把 `status` 判成「数据完好」掩盖未检查。若实施中发现单点需加字段，**回报后由 073 侧统一改**，本卡不私自分叉（卡 §7）。

### 4.3 AC3 — `getLatestPrices` 新鲜度信号

1. `shared/services/marketData.service.js` 的 `getLatestPrices` 在返回价格时附带 `timestamp` 与 `stale` 标志；**保持缺价 `null` 与不变量 2**（stale 是标注，不是把旧价当新价或把缺价补 0）。设计上保持向后兼容：默认返回形状可与调用方协商（如新增 `getLatestPriceDetails` 或在原映射值上扩展对象），以不破坏三处 `shared/` 调用方为前提，具体形状在 §6 记录后冻结。
2. 「距今 > N 个交易日」的判定复用既有市场日历能力（`shared/services/calendar.service.js` 与 `shared/utils/marketTime.js`），**不自行发明交易日算法**，且与 076「最近 3 个市场日全空」口径区分（旧价 vs 无价，互不重复提示；卡 §7 仅 A 收敛，D 项未处理，实施时仅做到"不复用同一阈值语义"即可）。
3. 至少一处消费端（建议 alertEngine 提醒或看板数据态）对 stale 给可见提示；恒 `null` 的缺价语义不变。

### 4.4 AC4 — 熔断 + 错误分类增强

1. 在 `shared/tasks/dailySync.js` 的 `syncActiveAssetPrices` 遍历层按 `provider` 维护**连续失败计数**；达阈值（D-f，建议 3～5）即短路本轮该 provider 剩余资产，记入 `result`（如 `circuitOpened`）供可观测，不改变已成功资产结果。熔断是 `fetchWithRetry`（硬规则 #7）之上的短路，不替代超时+重试。
2. `failures[]` 保留 `classifyMarketDataError` 的 `status` 与原始报文（在 `dailySync.js:56-63` 扩展落库字段），使 `UPSTREAM/request failed` 不再丢失 HTTP 状态与响应体。
3. 全失败日对比审阅基线（44×4 次 / 68～82s），用时序单测断言请求数与耗时显著下降。

### 4.5 AC5 — NOT_FOUND 连续失败用户可见提示

1. 复用 `classifyMarketDataError` 的 `NOT_FOUND` 分类（已有，`errors.js:7,38-43`），按资产统计连续 `NOT_FOUND` 天数；达阈值（D-f，建议 3）产生用户可见提示，**复用既有提醒/看板异常通道**（`alertEngine` / `cronStatus` 数据态），不新建子系统。
2. 与 [TASK-077 AC7](./TASK-077-symbol-historical-data-migration.md) 的一次性只读探测、[TASK-076](./TASK-076-asset-information-completeness-check.md) 的升级入口保持边界：074 负责**持续告警**，077 负责**一次性报告**（卡 §7 其它重叠项未处理，实施时以"不重复造检测逻辑"为最低要求，复用同一分类实现）。

### 4.6 兼容性 / 关键取舍

- 不改 `TaskRun` 状态机与唯一索引（D-e/D-d 锁定）；不改 `fetchWithRetry` 通用重试语义；不改 chart 以外的产品行为。
- `getLatestPrices` 返回形状变更须评估三处调用方兼容性（F-05），优先选用可向后兼容的扩展方式。
- 熔断按 provider 连续失败计（非单资产），防止单资产瞬时故障放大成整轮不采（R-4）。

## 5. Work Breakdown

- [ ] W1：**AC1 部署核对**——查生产 cron-worker 部署 commit 含 057、查 11-13/14 `taskruns.result` 与时间；产出根因判定记录；按结论部署或修复并实证（前置：无）
- [x] W2：**D-f 阈值冻结**，见 §6 Human 裁决。
- [x] W3：看板显示连续应采交易日无新数据，基于已完成批次 `result` 和市场日历。
- [x] W4：旧价详情和价格卡提示，验算数值读价入口的兼容性。
- [x] W5：行情源熔断和失败诊断字段，含全失败请求数对照。
- [x] W6：按标的和应采交易日统计连续 `NOT_FOUND`，复用价格卡提示。
- [ ] W7：**回归与审查**——`test:server` / `test:worker` 全量全绿；AC1 实证记录复核；独立 Reviewer 通过（前置：W1、W3–W6 完成）

## 6. Decisions

| # | 决定 | 状态 / 内容 |
|---|---|---|
| **D-e** | 零采集 `SUCCEEDED` 语义 | ✅ 已收敛（卡 §6 与 073 D-d）：「无数据/全部跳过」仅作 `result` 数据态表达，沿用四态，不新增状态值；074 只加「连续 N 天无新数据可见」，不另建第二套。要新增状态值须 Human 显式推翻 TASK-057 锁定并同步改 073/074 两卡 |
| **D-f** | 阈值取值 | Human 于 2026-11-19 批准默认值：连续 2 个应采交易日无新数据时提示，最近价超过 2 个交易日标为旧价，连续 3 个应采交易日 `NOT_FOUND` 时提示，同一行情源本轮连续失败 3 次后熔断。 |
| **D-g** | 币种桶「整桶 null」策略 | ⏳ 产品语义，超出本卡范围，本计划不涵盖；如需变更另行立项 |

## 7. Verification

| AC | 验证方法 | 预期结果 |
|---|---|---|
| AC1 | 核对生产部署 commit/版本与 `taskruns.result` 时间分布；部署/修复后以真实库查询实证 | 根因判定记录齐备；`taskruns.result` 非空且可复现；无重复实现 result 透传 |
| AC2 | 单测/集成：构造全部跳过（零采集）TaskRun，检查 `result` 数据态灰/未知表达、连续 N 天提示；负向断言 | `status` 仍四态之一、无 `SKIPPED`、唯一索引不变；连续 N 天提示可见；不另建第二套表达（grep 检查） |
| AC3 | 单测：构造价格时间早于 N 交易日 / 缺价 / 新价三例，检查返回形状与消费端提示；三处调用方回归 | stale 标注正确、缺价仍 `null`、消费端有可见提示、三处调用方无回归 |
| AC4 | 时序单测：模拟单 provider 连续失败达阈值，计数请求次数与耗时；检查 `failures[]` 字段 | 熔断后该 provider 剩余资产被短路，请求数/耗时显著低于 44×4 / 68～82s 基线；`failures[]` 含 status/原始报文 |
| AC5 | 单测：构造资产连续 N 天 `NOT_FOUND` 与未达阈值两例，检查用户可见提示 | 达阈值产生提示、未达不误报；复用既有通道、无新子系统 |
| AC6 | `test:server`、`test:worker` 全量执行（入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）；独立 Reviewer 审查 | 全绿；Reviewer 通过（Implementer 不自判） |

命令入口唯一来源为 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，本计划不复制命令。覆盖缺口：真实库实测与生产部署核对需在实施环境完成，本轮仅静态核对源码。

## 8. Risks

| # | 触发条件 | 影响 | 应对 |
|---|---|---|---|
| R-1 | 误把部署滞后当缺陷重做 057 已交付的 result 透传 | 重复实现 = 硬规则 #1 违规，破坏已交付契约 | AC1 强制先核对；与 US-001 契约对照；改契约走 Human 权限 |
| R-2 | 074 另起一套「无数据」表达 | 与 073/057 数据态分叉、看板双重渲染 | D-e/AC2 锁定复用 073 D-d 单点；加字段须回报由 073 侧统一改 |
| R-3 | stale 提示被当成估值打折/修正依据 | 破坏不变量 2（旧价当新价） | AC3 明示 stale 只标注、缺价仍 `null` |
| R-4 | 熔断阈值按单资产计 | 单资产瞬时故障放大为整轮不采 | 按 provider 连续失败计；D-f 冻结阈值 |
| R-5 | 审阅结论过时（P1-4 已被 Planner 证伪一半） | 按过时结论改动引入缺陷 | 以卡 §2 补充核对与 F-01/F-03 为准；其余复用审阅可复现实测 |
| R-6 | `getLatestPrices` 返回形状变更破坏三处调用方 | 提醒/估值/再平衡回归 | 优先向后兼容扩展；AC3 验证三处调用方回归 |

## 9. Rollback

- AC1 若部署后出现回归，回滚到部署前 commit；若为代码修复，以 git revert 回退，并保留根因判定记录。
- AC2/AC3/AC5 为数据态/标注/提示增强，回滚仅涉及 `shared/` 与看板派生代码，不残留数据库 schema 变更（不改状态机/唯一索引/schema）。
- AC4 熔断为遍历层短路，回滚即移除短路逻辑；不改 `fetchWithRetry` 与 `Price` 唯一索引，无不可逆数据影响。
- 本计划不含数据迁移与不可逆操作；无残留数据需清理。若 D-g 另行立项涉及产品语义，与本计划回滚无关。

## 10. Implementer Handoff

下一角色：Implementer（待指派）。输入：本计划 + 任务卡 §3 AC / §4 Scope / §6 裁决。

范围与禁改：

- 只在 §4 列出的单点（`shared/services/taskRunner.js`、`shared/tasks/dailySync.js`、`shared/services/marketData.service.js`、`shared/fetchers/errors.js`、`shared/services/cronStatus.service.js`、相关测试与必要文档）内改动。
- **禁改**：`TaskRun` 状态机与唯一索引；`fetchWithRetry` 通用重试语义；估值/再平衡规则；`server/` 调度（ADR-002）；第二套「无数据」表达或新子系统；TASK-073/076/077/078 范围；D-g 产品语义。
- **前置**：D-f 阈值经 Human 冻结后方可实现 W4/W5/W6；AC2 依赖 073 D-d 单点可用。

授权：常规实施细节在范围内自主决定；任何触及状态机、result 契约、产品语义或跨卡边界的变更须回报 Human（卡 §7 / AGENTS §8）。

依赖：W1 部署核对（含生产访问/数据查询权限）；D-f 裁决；073 D-d 落地。

预期产出：AC1 根因判定记录 + 实证；AC2–AC5 代码与测试；全量测试绿灯；独立 Reviewer 通过。

停止条件：部署核对受阻于权限、D-f 未冻结、发现需改状态机/唯一索引/result 契约、或触及跨卡边界时停机回报。

验证入口：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)。

## 11. Implementation Record

### 2026-11-19 · 开工、W1 取证及 W4 价格详情

- 从最新 `origin/main` @ `f7ef68a` 创建 `feature/TASK-074-price-pipeline-observability-and-robustness`，使用独立工作树 `D:/projects/portomind-task-074`。原工作树保留 TASK-078 审查返工及未提交改动。基线含 TASK-057 合入 `1e421db` 与 TASK-073 合入 `fc1c728`。
- **W1 / AC1。** 2026-11-19 只读直查生产库 `portomind`，按 ET 11-13、11-14 的时间窗口定位 `daily-price-sync`。11-13 03:00 批次为 `PARTIAL`，成功 42、失败 2。11-14 03:00 批次为 `SUCCEEDED`，成功 0、失败 0。两条原始文档均有 `result.skippedCount`，同日完整性检查亦都有 `result`。11-19 03:00 生产定时批次仍有 `result.skippedCount`。隔离库镜像中的两条对应记录同样存在该字段。当前读回与 P1-4 的 `undefined` 描述不一致，不能据此判定此前部署滞后或残余缺陷。实际生产 Worker 的部署 SHA 与原报告的取证来源尚待确认。保留 TASK-057 的现有透传，本轮未改生产库或部署。
- **W4 / AC3 进展。** `marketData.service.js` 复用同一读取链路新增 `getLatestPriceDetails`，返回按原始输入键映射的 `{ price, timestamp, stale }` 或 `null`。以价格桶日期之后至当前市场日期内的开市日计龄，超过 2 个交易日标记旧价，时间戳或市场无法确认时 `stale=null`。现有 `getLatestPrices` 的数值 / `null` 契约保留。实测覆盖超过阈值、恰到阈值、跨周末、无时间戳和缺价。可见提示、连续应采日统计、熔断与 `NOT_FOUND` 提示尚未接到看板及采集。TASK-078 尚未进入本分支基线，合入时需对分组运行和看板派生做同基线回归。
- 本阶段全 workspace 回归实跑通过，服务端 280/280，Worker 81/81，原始输出 `%TEMP%/portomind-TASK-074-start-20261119-093142.log`。W1 差异交 Orchestrator 协调原证据与部署版本，保留 AC1 待核状态。

### 2026-11-19 · 更新主干基线及完成 W3–W6 本地实现

- TASK-074 工作树无冲突更新至最新 `origin/main` @ `a8d8837`（PR #60），包括 TASK-078 `40ce7c3`。保留先前价格详情改动。生产 `result` 取证沿用上文，原始报告出处和实际部署 SHA 仍待核对。
- **AC2 / AC5。** 看板使用实际开市日和分组批次键，兼容旧全量批次。没有已完成记录时中断连续统计，缺 `result` 时不推断零采集，休市日不计。保留 TaskRun 状态与唯一索引。既有价格卡渲染服务端提示。验收库以 11-18 15:00 ET 只读查询实际看板，覆盖 42/44，`VBG.TO`、`VBU.TO` 同时出现旧价和连续 `NOT_FOUND` 提示。连续零采集、休市及证据缺失的反例使用测试夹具。
- **AC3。** 看板用一次按资产键聚合取最近价格，复用行情服务的旧价判断，仍带明确的按时点范围。原估值、提醒及再平衡调用保留数值或 `null`。浏览器夹具验证所有新增提示可见。
- **AC4。** 同源可重试的请求连续失败 3 次后，仅熔断本批该源。资产级 `NOT_FOUND` 或成功响应会重置计数，落库失败及 TASK-078 的净值日期拒绝不计入。44 个同源标的的模拟请求从 176 次降为 12 次，其它行情源继续。`failures[]` 可选保存 HTTP 状态和最长 4096 字符的脱敏响应摘要。未实跑生产上游全失败的耗时对照。
- **AC6 本地回归。** 服务端 284/284，Worker 88/88。浏览器价格卡 49/49，Client build 成功（既有分块告警），lint 0 错误、5 条既有警告。原始输出 `%TEMP%/portomind-TASK-074-workspaces-20261119-094250.log` 与 `%TEMP%/portomind-TASK-074-browser-20261119-094250.log`。文档检查和差异空白检查通过。待独立复审，未部署或写入验收库。

### 2026-11-19 · W1 原始记录与部署时段复核

- **原报告出处。** [价格链路审阅 P1-4](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) 于 11 月 15 日基于 `d6e1413` 审阅，称同步后的 `portomind_dev` 有下面两条 `result=undefined` 的记录。仓库中的审阅记录只保留格式化文本，未附查询、投影或原始 BSON。其同步校验比对了条数和 `_id`，并未校验字段内容。本轮未重跑镜像。
- **数据库直查。** 使用 MongoDB 原生驱动读取 `taskruns`，按 `taskName='daily-price-sync'` 和 `runKey` 查定时批次，投影显式包含 `result`。生产库 `portomind`、报告使用的 `portomind_dev` 和 `portomind_task077_restore_test` 返回相同的 `_id`、时间及计数。

| 日期和时间（ET） | `_id` | 状态 | 总数 / 成功 / 失败 | `result.skippedCount` |
|---|---|---|---|---:|
| 2026-11-13 03:00:00.002 | `6af6c38031e5e7ea8b01fa54` | `PARTIAL` | 44 / 42 / 2 | 0 |
| 2026-11-14 03:00:00.001 | `6af8150031e5e7ea8b01fb82` | `SUCCEEDED` | 44 / 0 / 0 | 44 |

- **复现原报告文本。** 对 `portomind_dev` 的同一对 `_id` 做包含式投影，只取 `runKey/status/totalCount/successCount/failureCount`，再输出 `row.result`，两行与原报告逐字一致。加入 `result: 1` 即读到 `0`、`44`。投影遗漏可以解释两行输出，原查询未找到，实际取证方式待确认。仅凭 `0` 的真假值无法解释另一行的 `44`。
- **部署时间线。** `5bb47ea` 同时加入 `dailySync` 的嵌套字段、`normalizeCounts` 的显式透传和 `TaskRun` 持久化，11 月 5 日 ET 合入 `main`（`1e421db`），`v1.0.0` 和审阅基线 `d6e1413` 均包含该提交。生产 11 月 8 日 09:30 ET 的汇率记录尚无 `result`。11 月 9 日 00:00 ET 已出现 TASK-057 新增的 `rebalance-check` 父记录及 `result.perPortfolio`，03:00 ET 的价格批次首次有 `result.skippedCount`。两天的定时记录也显示不同的 ObjectId 进程段，支持 Worker 在上述窗口切换的推断。11 月 9–19 日生产同类 `SUCCEEDED` / `PARTIAL` 定时批次 11/11 有 `result.skippedCount`。
- **AC1 判定边界。** 生产行为证据支持 TASK-057 的契约最迟于 11 月 9 日已生效。11 月 13/14 的字段缺失未复现，现有证据没有指向需要修复或重部署的缺陷。仓库没有当日部署记录；从当前工作站对生产数据库所在主机的已知 SSH 入口做只读取证时，非交互认证被拒，未能核实历史 PM2 日志、部署产物或精确 SHA。不能把 Git 标签作为部署证据。保留 W1 待复核，待原查询或部署日志补证后由独立 Reviewer 确认。全程只读，无业务代码变更。

### 2026-11-19 · 第一轮审查返工

- **R1 / AC2。** 价格看板复用 TASK-073 的 `allItemsSkipped` 和 `ALL_SKIPPED` 提示。最近批次 `SUCCEEDED`、成功数为零且全部休市跳过时，价格数据态为灰色 `unknown`，卡片显示「本次未采集价格」。保留目标日、覆盖计数及原运行状态。相同周五报价下，正常批次为 `ok`，周六全跳过为 `unknown`，覆盖均为 1/1。单次休市不进入连续应采日统计。另只读核对 `portomind_dev` 最新实际批次 `2026-11-18`，仍为 `warn`，41/44，无全跳过提示。
- **R3 / AC4。** 在序列化及截断之前，对上游原始文本和嵌套字符串统一清除 URL 查询串，并处理 URL 用户信息与常见凭据文本。合成夹具覆盖嵌套描述、相对 URL、编码参数名和未知签名参数。实测 TaskRun 更新、单标的失败日志和 `TASK_END` 日志均无夹具敏感值，保留 HTTP 503 及诊断文字。熔断回归仍为 12 次请求，其它源正常采集。
- 两项新增回归在修复前均失败，修复后通过。全量服务端 285/285，Worker 89/89，浏览器夹具 50/50。Client build 成功（既有分块警告），lint 0 错误、5 条既有警告。输出保留在 `%TEMP%/portomind-TASK-074-r1-workspaces.log`、`%TEMP%/portomind-TASK-074-r1-browser.log`。原始查询与历史部署 SHA 仍待补证，R2 / AC1 保持待复核。返工待独立 Reviewer 复审。

### 2026-11-19 · 复审后的文本脱敏返工

- **R3 / AC4。** 上游响应文本与结构化响应共用敏感字段判定。在序列化及截断前识别 `access_token`、`refresh_token` 及带引号、连字符、大小写变体的键值表达。含凭据的字符串整段替换，保留同一结构内的非敏感字段。新增回归在修复前复现泄漏，修复后 TaskRun 更新、单标的失败日志及 `TASK_END` 均无合成凭据，保留 HTTP 503 与非敏感诊断码。URL 查询串和熔断的定向回归也通过。
- 服务端、Worker 全量及浏览器夹具均通过，输出见 `%TEMP%/portomind-TASK-074-r2-workspaces.log` 和 `%TEMP%/portomind-TASK-074-r2-browser.log`。R3 待独立复审。R2 / AC1 仍缺原始查询和历史部署 SHA，沿用本节的只读证据边界，保留待核。本轮未部署或修改业务数据。

## 12. Review Record

### 2026-11-19 · 第一轮独立审查

**判定：Fail。** 审查对象为独立工作树 `feature/TASK-074-price-pipeline-observability-and-robustness` @ `a8d8837` 及当前实施差异。D-f 取值依据为 §6 Human 裁决。Reviewer 未参与本次实现、业务测试或交付验收脚本编写。

| AC | 结论 | 依据 |
|---|---|---|
| AC1 | 无法确认原异常的根因 | 隔离库对 11-13、11-14 同日批次的独立读回有 `result.skippedCount` 0、44；生产字段现状和版本时序引用 §11。省略投影可复现原文本，但原查询和部署证据缺失（R2）。 |
| AC2 | 不满足 | 连续应采日提示有正反用例；单次最新批次全部跳过时复现与正常采集相同的 `ok` 和空提示，未形成 073 的灰/未知数据态（R1）。状态机与唯一索引未变。 |
| AC3 | 满足 | 独立只读调用验收库看板，旧价提示显示两只已知停更标的；新价、旧价和缺价的对照及浏览器提示引用 §11。原数值接口仍保留 `null`。 |
| AC4 | 熔断及诊断字段已验证，脱敏尚有 MAJOR | 在相同模拟上游、重试和延迟下，44 只资产由 176 次／4.65 秒降为 12 次／0.32 秒，并保存 HTTP 503。现有响应摘要脱敏遗漏见 R3。 |
| AC5 | 满足 | 实际隔离库只读看板列出两只达阈值标的，未达阈值的负向用例及可见提示沿用 §11。 |
| AC6 | 不满足 | 同版全量原始日志服务端 284/284、Worker 88/88，独立审查未通过。 |

| 编号 | 严重度 | 现象、证据和处置 |
|---|---|---|
| R1 | BLOCKER | [价格同步的结果](../../../../shared/tasks/dailySync.js#L135)仅写 `skippedCount`，[看板](../../../../shared/services/cronStatus.service.js#L224)只消费连续应采日信息。独立对照以同一份已有周五报价分别配上周六全跳过批次和仅周五成功批次，两者均为 `SUCCEEDED`、数据态 `ok`、提示为空。应复用 073 的全跳过表达，让用户可辨识最近批次未采集，同时保留已有目标行情覆盖的数据事实。 |
| R2 | 证据待补 | 当前实测未发现 057 的缺陷。§11 的投影对照只说明原异常的一种可能来源。按 AC1 需要原查询、同一历史快照或部署证据来确定根因；若这些证据不可取得，由 Human 明确是否按现有可核实事实验收。 |
| R3 | MAJOR | [错误响应摘要](../../../../shared/fetchers/errors.js#L16)会处理敏感字段，但测试发现响应描述字符串里带敏感查询参数的 URL 未脱敏。原始夹具值为合成标记。摘要现会写入 TaskRun 和任务日志，须在两处写入之前统一处理响应文本内的敏感值，或改存可控诊断字段。 |

本轮复用 §11 的全量和浏览器原始日志。独立执行一次性 stdin 夹具、隔离库只读复验和文档检查。未重新部署、未写库、未进行真实上游故障耗时对照。由 Orchestrator 协调 R1/R3 返工及 R2 原始证据。

### 2026-11-19 · 返工独立复审

**判定：Fail。R1 关闭，R3 尚未完全修复，R2 仍待补证。** 对象为 `feature/TASK-074-price-pipeline-observability-and-robustness` @ `a8d8837` 的当前返工工作区。Reviewer 未参与返工实现、业务测试或交付验收脚本。

| 验收项 | 复审结果 |
|---|---|
| AC1 / R2 | **根因未确认。** §11 返工仍明确缺原始查询和历史部署 SHA。已有同批次直接读回支持两条 `result` 均存在；投影遗漏只是能复现原报告的假设。仍需原始证据或 Human 明确验收裁决。 |
| AC2 / R1 | **通过。** 独立用同一份历史行情读回实际看板逻辑：最新批次全部休市跳过时返回 `unknown` 和「本次未采集价格」，覆盖仍为 1/1、运行态仍为 `SUCCEEDED`。正常批次仍为 `ok`；缺 `result` 的对照未误报全跳过。浏览器展示引用返工夹具。 |
| AC3、AC5 | **通过。** 沿用首轮真实库只读证据及同路径的返工回归。 |
| AC4 / R3 | **部分修复，仍有 MAJOR。** 通过实际任务流程、用夹具替代数据库和日志写入端，原来的嵌套 URL 参数泄漏已消失；同一合成值出现在普通上游描述中的 `access_token` 或 `refresh_token` 键值时，仍进入 TaskRun 更新、标的失败日志及 `TASK_END`。HTTP 503 保留。见[错误摘要处理](../../../../shared/fetchers/errors.js#L16)。请将这些常用凭据名称纳入文本脱敏，或限定持久化的诊断字段。 |
| AC6 | **未通过。** 服务端和 Worker 全量日志通过，独立复审尚未通过。 |

复用返工原始日志：服务端 285/285、Worker 89/89、浏览器夹具 50/50。独立补跑全跳过三组对照和上游摘要四组对照，均通过 stdin 执行，使用的敏感值为纯合成标记。未读写新数据库、未重新部署、未重跑浏览器与全量回归。由 Orchestrator 协调 R3 剩余文本脱敏及 R2 根因取证。

### 2026-11-19 · 文本脱敏修复后独立复审

**AC2–AC5 通过。整体暂不能给出 Pass，唯一待确认项为 AC1。** 对象为 `feature/TASK-074-price-pipeline-observability-and-robustness` @ `a8d8837` 当前工作区返工快照。Reviewer 未参与返工实现或交付验收。

- **R3 / AC4 已关闭。** 独立执行实际采集、错误分类及 TaskRun 序列化，数据库更新及两处日志写入端使用隔离夹具。原嵌套 URL、普通文本 `access_token`、原始文本 `refresh_token` 和带引号的大小写及连字符变体均未进入 TaskRun、单资产失败日志或 `TASK_END`。普通诊断对照仍保留诊断文字，结构化诊断码和 HTTP 503 保留。所用凭据值为合成标记。熔断沿用前轮定向测试和本轮回归日志。
- **R1 / AC2 维持通过。** 引用上一轮独立的全跳过、正常采集和缺 result 对照。返工日志的浏览器夹具再次通过。AC3、AC5 维持通过。
- **R2 / AC1 仍无法判定根因。** 本轮查阅原报告 P1-4 及返工记录，原报告只有格式化输出，尚无生成输出的查询或历史部署 SHA。两条原记录的 `result` 当前可读，省略投影只能复现现象。需要补齐原始证据，或由 Human 明确依据现有可核实事实验收。
- **AC6 的全量回归通过。** 复用返工原始日志，服务端 285/285、Worker 90/90、浏览器夹具 50/50。整体独立审查仍等待 AC1。

本轮独立补跑上述脱敏正反对照和文档检查，沿用其余已验证证据。未触发生产部署、数据库写入或真实上游请求。

### 2026-11-19 · AC1 验收裁决与复审结论

- **Human 验收裁决 / AC1。** 按现有证据验收。2026-11-13 和 2026-11-14 的两条原始 `TaskRun` 记录均有 `result`，原报告所述异常未复现，根因未确认。R2 依据此裁决关闭。
- **Reviewer 复审结论：Pass。** AC1 按上述裁决验收，AC2–AC5 沿用上一轮独立复审结论，AC6 依据上一轮全量回归记录和本次通过的独立复审验收。

## 13. Completion Record

2026-11-20，Human 确认结案。§11 的服务端、Worker 和浏览器回归及 §12 的独立复审支持 AC1–AC6，最终结论为 Pass。AC1 按 Human 裁决以已核实的 TaskRun 字段验收，原异常未复现，根因未确认。实现 `4904ce7` 随 PR #61 进入主干（`e9f81d2`）。

## 自检

- [x] Task 与批准依据对应，方案未改变需求（AC2 只复用 073 D-d，未改状态机/产品语义）。
- [x] 步骤可执行、依赖明确（D-f 阻塞 W2/W4/W5/W6；073 D-d 为 W3 前置）。
- [x] 记录可追溯且只存一处（事实引用卡与审阅，落点带行号；未复制验证命令）。
- [x] 章节编号与相对链接按本目录深度（active/）修正；§11–§13 留待后续角色。
