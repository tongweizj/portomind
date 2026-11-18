# TASK-078 — 价格采集时刻与归桶修正（P0-3 / P2-8：采集程序问题）

> **Status：Planning**（2026-11-17，Orchestrator 按 Human 指令登记）。优先级与范围仍为建议值，待 Human 最终确认；计划为 `Draft` 未批准，批准前不得进入实施。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Planning**（2026-11-17，Orchestrator 按 Human 指令登记；计划未批准，不进入实施） |
| 所属 Story | 无（独立维护任务；从 [TASK-073](../active/TASK-073-price-pipeline-p0-data-correctness.md) 剥离的采集程序问题，2026-11-17 Human 指令独立成卡） |
| 覆盖的验收条件 | 本卡 §3 AC（来源：[PRICE-PIPELINE-REVIEW P0-3 / P2-8](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)） |
| Priority | High（建议；采集日期错位导致价格覆盖 + 场外基金恒定滞后一天，待 Human 确认） |
| Owner | 待指派 |
| Created | 2026-11-17 |
| Type | Bugfix（cron-worker 调度 + shared 归桶逻辑） |
| 来源 | Human 2026-11-17 指令「P0-3 是价格采集程序的问题，请独立成新的 task」 |
| Execution Plan | 已创建：[TASK-078 实施计划](./TASK-078-price-collection-timing-bucketing-plan.md)（`Draft`，未批准）。时区/归桶语义变更必写；D-a 已裁决 |

## 1. 问题

[PRICE-PIPELINE-REVIEW P0-3](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) 实测（`portomind_dev` 同步后真实库）：

```
11-13 08:00Z 那次 daily-price-sync 报 ok=42
  → prices 中写入时刻 ≈ 11-13T08:00Z 的 42 条文档
  → timestamp 全部是 2026-11-12（前一日桶）
```

即：**采集成功、也落库了，但 42 条记录全被归到前一天的桶，并覆盖了 11-12 的原值**。根因（实测确认）：cron `0 3 * * *` 在 ET 凌晨 3 点触发 = 上海 16:00，A 股已收盘但**场外基金净值当晚才发布**，Tiantian 的 `FSRQ` 拿到的是前一交易日净值 → `canonicalDayTimestamp` 忠实归到前一日。行为每天稳定发生，不是偶发。

D-a 改成按市场分组调度后，同一天会出现 CN 组（ET 12:00）与 US/CA 组（ET 03:00）两个批次；不同 symbol 分组写入同一天的桶属正常，不产生冲突（唯一键含 symbol）。「同一 symbol 同一天被多批次写入」才触发后写覆盖语义，按 D-a-附带裁决接受该语义（详见 §6）。

[P2-8](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) 是同一问题设计层：归桶用**单一全局时区** `MARKET_TIMEZONE`（默认 ET），CN 市场比 ET 早 12–13 小时，A 股/场外基金价格会落进前一日 ET 桶；`integrityCheck` 已有 CN 补偿代码（近似，非精确）。审阅明确 P0-3 与 P2-8 **同一问题两层，合并处置**。

## 2. 已核实的事实

| 事实 | 落点 |
|---|---|
| 调度链 `priceScheduler.js → createCronScheduler({envKey:'PRICE_SYNC_CRON', defaultCron:'0 3 * * *'})`；时区 `SCHEDULER_TIMEZONE || MARKET_TIMEZONE || America/Toronto` | 审阅 §1.4 |
| `canonicalDayTimestamp` 函数本身**行为正确**（审阅做过直接验证：`2026-11-13T15:00Z → 11-13`）；问题在**采集时刻** | 审阅 P0-3 |
| 三 Fetcher 口径：Yahoo/Eastmoney=盘中/收盘价；**Tiantian=已发布净值（通常 T 日晚或 T+1 公布）** | 审阅 §1.6 |
| `integrityCheck` 已有 CN 补偿：`expectedBucketCandidates` 返回 `[etDate, etDate+1]` 近似 | 审阅 P2-8 |
| 同一天被覆盖两次不留历史（P3-9c）；旧价无新鲜度校验（P1-5，归 TASK-074） | 审阅 P3-9 |

证据边界：本轮只读文档与审阅记录，未连库、未触发采集。

## 3. Acceptance Criteria

| # | 验收标准 | 来源 |
|---|---|---|
| AC1 | 按 D-a 裁决（按市场分组调度）：**CN 组**（CN-SH/CN-SZ/CN-FUND/HK）在 **ET 12:00** 触发采集、**US/CA 组**保持 **ET 03:00**；CN-FUND 在 T 日采集时取到**当日已发布净值**，`FSRQ` 不再落进 T-1 桶；时序断言：采集于 ET 12:00 的 T 日净值落 T 日桶且**不覆盖** T-1 已有记录；P0-3 实测的"ok=42 但 11-13 无桶、11-12 被覆盖"模式不复现 | P0-3 / D-a |
| AC2 | 归桶逻辑**保持现状**（`MARKET_TIMEZONE` 不变，仍按 ET 归桶）——D-a 选了"改采集时刻"而非"改归桶时区"，故 `canonicalDayTimestamp` 不改；须有时序单测覆盖 ET/SH 跨日边界；价格一日一桶幂等语义（`(symbol, 日)` 唯一）不变 | P2-8 / D-a |
| AC3 | `integrityCheck` 的 CN 近似补偿（`expectedBucketCandidates` 等）在采集时刻调整后**复核是否仍成立**：CN 价格现在按 T 日净值落 T 日 ET 桶（ET 12:00 = 上海午夜，同日），补偿理论上不再需要但须实测确认；如确认不需，移除补偿并回归；如需保留则更新注释说明 | P2-8 |
| AC4 | **D-a-附带已裁决 = 接受后写覆盖先写**：保留 `(symbol, 日)` 唯一索引与幂等 upsert 语义，同一天多批次（CN 组 ET 12:00 / US-CA 组 ET 03:00、手动+定时）后写覆盖先写——不同 symbol 互不冲突，同一 symbol 的重复写入后者覆盖前者，**不保留历史版本、不扩 schema、不需数据迁移**；须补充写入日志（记录批次/来源/写入时刻/symbol/日/值），使覆盖前后值可追溯，消除 P3-9c「无声覆盖不可追溯」 | P3-9c / D-a-附带 |
| AC5 | 回归：`test:worker` 全量全绿（入口 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）；真实/模拟时序用例覆盖 ET/SH 跨日；独立 Reviewer 通过 | — |

## 4. Scope

**In Scope**

- `cron-worker/`：PRICE_SYNC 按市场分组注册**两个 cron**（CN 组 ET 12:00 / US-CA 组 ET 03:00），沿用 `createCronScheduler`
- `shared/`：`dailySync` 支持按 market 过滤参数（分组执行），归桶逻辑（`marketTime.js`）**保持不变**（D-a 不改归桶）；`integrityCheck` CN 补偿复核（AC3）
- 相关单测与文档（CRON_WORKER_DEV / CRON_WORKER_OPS 环境变量说明）

**Out of Scope**

- symbol 归一代码（TASK-073）与历史数据迁移（TASK-077）
- `launchDate` 与资产信息检查（TASK-076）；客户端显示（TASK-075）
- 观测健壮性（TASK-074）；P1-5 新鲜度告警（TASK-074）

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 采集时刻变更影响外部 API 请求分布，可能触发限流 | 按市场错峰（CN ET 12:00 / US-CA ET 03:00）；保留 `fetchWithRetry` 包装（硬规则 #7） |
| R-2 | 归桶语义变更使历史价格不可比（新旧桶错位） | 与 TASK-077 历史数据处置协同排期；文档说明口径切换点 |
| R-3 | T+1 净值被误判为"当天价格" | AC1 时序断言 + 文案明确"目标市场日" |

## 6. Human 裁决记录（2026-11-17）

| # | 决定 | 内容 |
|---|---|---|
| **D-a** | ✅ **已裁决 = A** | **按市场分组多次调度**：CN 市场组（`CN-SH`/`CN-SZ`/`CN-FUND`/HK）改到 **ET 12:00** 采集（Human 原话"上海时间 24 点，价格应该出来了"）；US/CA 组保持原 **ET 03:00**（美东收盘后）。实现上 `dailySync` 须支持按 market 过滤参数、`priceScheduler` 注册多个 cron 表达式（沿 `createCronScheduler`，cron-worker 仍为唯一调度所有者）。**时区事实**：`SCHEDULER_TIMEZONE` 默认 `America/Toronto`，node-cron 按此时区解释表达式（`cronScheduler.js:43`）；`MARKET_TIMEZONE` 默认同为 ET，用于价格归桶——两者当前相同，改调度时刻**不动** `MARKET_TIMEZONE`（避免历史日期边界重排）。ET 12:00 在夏令时 = 上海 00:00、冬令时 = 上海 01:00，两个时段当日净值均已发布 |
| **D-a-附带** | ✅ **已裁决 = 接受后写覆盖先写** | 同一天多批次写入（CN 组 ET 12:00 / US-CA 组 ET 03:00，以及手动+定时）**接受 `(symbol, 日)` 唯一索引语义**：不同 symbol 互不冲突；同一 symbol 同一天被多次写入时后写覆盖先写，**保留日线快照语义，不追加历史版本、不扩 schema、无需数据迁移**。为消除 P3-9c「无声覆盖不可追溯」，须在写入处补日志（批次/来源/写入时刻/symbol/日/值），使覆盖前后值可查（对应 AC4）。此裁决与 D-a 分组调度一致，不改变归桶时区与 `canonicalDayTimestamp`。 |

> 旧 A/B/C 三选项已由本裁决收敛，B（市场本地日归桶）与 C（接受 T+1 标注）不再实施。

## 7. Coordination Notes

- 与 [TASK-073](../active/TASK-073-price-pipeline-p0-data-correctness.md)：本卡承接其 P0-3/P2-8 与 D-a；073 保留 symbol 归一代码逻辑与"全跳过"语义（D-d）。两卡分别验收。**AC4 前置**：本卡覆盖日志的 symbol 用 073 的 `toStorageSymbol` 统一格式；073 未落地前同基金落双键而非同一 `(symbol, 日)` 键，AC4 所述「覆盖」与可追溯日志不成立。两卡同改 `priceStorage.service.js`（073 改第 8 行归一化、本卡改 `saveLatest` 主体加日志），合并分工见 [078 计划 §4.3](./TASK-078-price-collection-timing-bucketing-plan.md)。
- 与 [TASK-077](../active/TASK-077-symbol-historical-data-migration.md)：本卡改**新采集的归桶规则**，077 处理**已有历史数据**；排期上建议 077 先迁移（清掉双键/旧桶），本卡再切换口径，避免新旧数据二次错位。
- 与 [TASK-074](../active/TASK-074-price-pipeline-observability-and-robustness.md)：R-1 的熔断属 074 范围，本卡只保留既有 `fetchWithRetry`。

## 8. 本卡未做的事

未实施、未创建 ExecPlan、**D-a 已裁决（方案 A：CN ET 12:00 分组调度）**、**D-a-附带已裁决（同日多批次接受后写覆盖先写 + 写入日志留痕）**、未改任何 AC/Status（Planner 仅建卡内容）。

## 9. 记录

2026-11-17，Planner：依据 Human 指令「P0-3 是价格采集程序的问题，独立成新 task」建卡，从 TASK-073 剥离 P0-3/P2-8 与 D-a。初始 Status 待 Orchestrator 登记；优先级建议 High，最终以 Human 为准。D-a 裁决 + ExecPlan 批准前不得开工。

2026-11-17（续）：Human 问询两件事——①"服务器 03 点是否多伦多时间"：**是**，`SCHEDULER_TIMEZONE` 默认 `America/Toronto`，node-cron 按此时区解释 `0 3 * * *`（`cronScheduler.js:43`；`CRON_WORKER_OPS.md:31`）；②"中国市场何时采集"：Human 指定 **ET 12:00（上海 24:00/01:00，净值已出）**。裁决 **D-a = A 按市场分组多次调度**：CN 组 ET 12:00、US/CA 组 ET 03:00，`dailySync` 加 market 过滤参数、`priceScheduler` 注册两个 cron；**归桶时区与 `canonicalDayTimestamp` 不动**（避免历史日期边界重排）；`integrityCheck` CN 补偿须复核。附带项 D-a-附带同日敲定：**接受 `(symbol, 日)` 唯一索引的后写覆盖先写语义**，不保留历史、不扩 schema、无迁移，改以写入日志（批次/来源/时刻/symbol/日/值）消除「无声覆盖不可追溯」（AC4）。

2026-11-17（Planner 补记）：依 Human 对附带项的裁决，更新 AC4、§6 D-a-附带、§8 与本节，明确「CN 组/US 组同日不同批次写入，不同 symbol 无冲突、同一 symbol 后写覆盖先写并留日志」的口径；未改 Status、未扩 Scope 至 schema/迁移。
