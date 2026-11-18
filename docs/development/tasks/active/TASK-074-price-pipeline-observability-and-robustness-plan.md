# TASK-074 — 价格链路观测与健壮性 实施计划

## Status

Status：Approved（2026-11-17，Human 批准「073～078 计划」；`Draft → Approved` 归 Human）

Owner：Planner（起草）；Implementer（待指派）

Related Task：[TASK-074-price-pipeline-observability-and-robustness](./TASK-074-price-pipeline-observability-and-robustness.md)（独立维护任务，无 Story）

Related Spec / ADR：无 Spec；依据为 [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P1-3 / P1-4 / P1-5 / P2-6 / P2-7、任务卡 §6 裁决（D-e 已收敛）、[TASK-073 AC6 / D-d](./TASK-073-price-pipeline-p0-data-correctness.md)（「无数据」单点语义）、[TASK-057](../../delivery/completed/US-001/TASK-057.md) 四态、[US-001 数据态契约](../../delivery/completed/US-001/readme.md)、[ADR-002 单一调度](../../../os/architecture/adr/ADR-002-single-scheduler.md)、[AGENTS.md §5](../../../../AGENTS.md) 硬规则

Branch / Base：当前 `main` @ `d6e1413`（起草时）；实施从最新 `main` 开 `feature/TASK-074-price-pipeline-observability-and-robustness`

Approval：**已批准（2026-11-17，Human）**。卡 §6 D-e 已收敛（与 073 D-d 统一，本计划据此成文）；**D-f 阈值、D-g 币种桶策略仍待 Human 裁决**，本计划对 D-f 相关项给出建议值但不把它写成已批准；`Draft → Approved` 须 Human 明确批准当前设计。D-g（产品语义）不在本卡范围，本计划不涵盖。

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
2. 与 [TASK-077 AC7](../completed/TASK-077-symbol-historical-data-migration.md) 的一次性只读探测、[TASK-076](./TASK-076-asset-information-completeness-check.md) 的升级入口保持边界：074 负责**持续告警**，077 负责**一次性报告**（卡 §7 其它重叠项未处理，实施时以"不重复造检测逻辑"为最低要求，复用同一分类实现）。

### 4.6 兼容性 / 关键取舍

- 不改 `TaskRun` 状态机与唯一索引（D-e/D-d 锁定）；不改 `fetchWithRetry` 通用重试语义；不改 chart 以外的产品行为。
- `getLatestPrices` 返回形状变更须评估三处调用方兼容性（F-05），优先选用可向后兼容的扩展方式。
- 熔断按 provider 连续失败计（非单资产），防止单资产瞬时故障放大成整轮不采（R-4）。

## 5. Work Breakdown

- [ ] W1：**AC1 部署核对**——查生产 cron-worker 部署 commit 含 057、查 11-13/14 `taskruns.result` 与时间；产出根因判定记录；按结论部署或修复并实证（前置：无）
- [ ] W2：**D-f 阈值冻结**——将 stale N 交易日 / NOT_FOUND 连续天数 / 熔断连续失败次数提交 Human 裁决；未冻结前 W4/W5 不得按建议值实现（前置：W1 无依赖，但阻塞 W4/W5）
- [ ] W3：**AC2 连续无数据可见**——在 `cronStatus` 数据态单点之上加连续 N 天信号（复用 073 D-d `result`），看板灰/未知表达（前置：073 D-d 单点可用；不新增状态/子系统）
- [ ] W4：**AC3 新鲜度信号**——`getLatestPrices` 扩展 timestamp/stale + 一处消费端提示；三处调用方兼容回归（前置：D-f stale 阈值冻结）
- [ ] W5：**AC4 熔断 + 错误分类**——`dailySync` 遍历层 provider 连续失败短路 + `failures[]` 保留 status/原始报文；时序单测对比基线（前置：D-f 熔断阈值冻结）
- [ ] W6：**AC5 NOT_FOUND 提示**——复用 NOT_FOUND 分类做连续失败用户可见提示（复用既有通道，不新建）（前置：D-f NOT_FOUND 阈值冻结）
- [ ] W7：**回归与审查**——`test:server` / `test:worker` 全量全绿；AC1 实证记录复核；独立 Reviewer 通过（前置：W1、W3–W6 完成）

## 6. Decisions

| # | 决定 | 状态 / 内容 |
|---|---|---|
| **D-e** | 零采集 `SUCCEEDED` 语义 | ✅ 已收敛（卡 §6 与 073 D-d）：「无数据/全部跳过」仅作 `result` 数据态表达，沿用四态，不新增状态值；074 只加「连续 N 天无新数据可见」，不另建第二套。要新增状态值须 Human 显式推翻 TASK-057 锁定并同步改 073/074 两卡 |
| **D-f** | 阈值取值 | ⏳ **待 Human 裁决**（阻塞 W2/W4/W5/W6）：stale=N 个交易日（建议 2）；NOT_FOUND 连续天数（建议 3）；provider 熔断连续失败次数（建议 3～5）。裁决前不得按建议值擅自实现 |
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

（待 Implementer 填写：实际改动、基线与版本、偏差及依据、验证结果、遗留事项。）

## 12. Review Record

（待独立 Reviewer 按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 填写：结论、AC 对照、findings、实跑/引用证据、残余风险与独立性。）

## 13. Completion Record

（待 Human 关闭时填写：AC 与验证证据引用、关闭依据、归档与移交；Merged 仅引用 Human 登记，不自行判定。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求（AC2 只复用 073 D-d，未改状态机/产品语义）。
- [x] 步骤可执行、依赖明确（D-f 阻塞 W2/W4/W5/W6；073 D-d 为 W3 前置）。
- [x] 记录可追溯且只存一处（事实引用卡与审阅，落点带行号；未复制验证命令）。
- [x] 章节编号与相对链接按本目录深度（active/）修正；§11–§13 留待后续角色。
