# TASK-073 — 价格链路 P0 代码层修复（symbol 派生与消费统一 / 完整性检查语义）

> **Status：Implementing**（2026-11-17，Human 批准计划后 Orchestrator 登记）。按 [DEV-ORDER-073-078](../DEV-ORDER-073-078.md) 顺序实施。
>
> ✅ **2026-11-17 范围再拆分（Human 指令）**：按"**073 处理代码逻辑、077 处理数据库、078 处理采集程序**"规则——原 P0-3/P2-8（采集时刻/归桶）拆至 [TASK-078](../active/TASK-078-price-collection-timing-bucketing.md)；历史数据迁移（原 AC2/AC3 的迁移部分）拆至 [TASK-077](../active/TASK-077-symbol-historical-data-migration.md)。本卡只保留**代码层**：symbol 派生/消费统一 + 价格完整性检查的"全跳过"语义。归一化目标以 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)（Accepted）为准。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Implementing**（2026-11-17，Human 批准计划后 Orchestrator 登记；按开发顺序实施） |
| 所属 Story | 无（独立维护任务） |
| 覆盖的验收条件 | 本卡 §3 AC（来源：[PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P0-1 代码层 / P0-2 检查语义；P0-3/P2-8 已拆至 TASK-078，历史迁移已拆至 TASK-077） |
| Priority | High（建议；按审阅 P0 分级，待 Human 确认） |
| Owner | 待指派 |
| Created | 2026-11-17 |
| Type | Bugfix（shared 代码层：口径统一 + 检查语义；无数据迁移） |
| 来源 | [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)（2026-11-15 独立审阅，基线 `main@d6e1413` = 当前 HEAD；发现的唯一事实来源，本卡不复制其细节） |
| Execution Plan | 已创建：[TASK-073 实施计划](./TASK-073-price-pipeline-p0-data-correctness-plan.md)（`Approved`，已批准，见计划 §Status）；跨模块代码改动按 [EXECUTION_PLANS §2](../../../os/process/EXECUTION_PLANS.md) 必写；口径以 ADR-003 为准，D-d 裁决见 §6 |

## 1. 问题

审阅（同步后真实库实测）发现的 P0 缺陷中，**本卡只承担代码层两件事**（按 2026-11-17 Human "073 代码 / 077 数据库 / 078 采集程序" 规则拆分）：

1. **P0-1（代码层）symbol 归一/派生无统一实现**：29 个场外基金 27 个查不到价——写入侧与读取侧各自实现一半归一化，历史数据因键不匹配查不到（**存量数据修复归 TASK-077；客户端查找归 TASK-075**）；本卡只交付 ADR-003 口径的**单一实现与四处消费接线**。
2. **P0-2（检查语义）完整性检查空转**：`launchDate` 全空导致全部跳过却记 `SUCCEEDED`（**launchDate 抓取/回填/前台编辑/资产信息检查归 TASK-076**）；本卡只保留价格完整性检查的"全跳过 ≠ 完好"语义（D-d）。

> 已拆出：P0-3/P2-8（采集时刻/归桶）→ [TASK-078](../active/TASK-078-price-collection-timing-bucketing.md)；历史数据迁移/D-b → [TASK-077](../active/TASK-077-symbol-historical-data-migration.md)。

## 2. 已核实的事实

审阅结论引用 [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)（每条附可复现实测数字）。Planner 2026-11-17 只读补充核对：

| 事实 | 落点 |
|---|---|
| 统一 symbol 归一化层**不存在**：仅 `priceFetch.service.js` 内部 `stripCnSuffix`，`marketData.getLatestPrices` 读取侧无任何归一化（P0-1 根因成立）。修复口径见 ADR-003（按 market 派生大写后缀，非 strip→裸码） | `shared/services/priceFetch.service.js`、`shared/services/marketData.service.js:12`、[ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) |
| `launchDate` 字段存在但从无数据（`asset.js:39`） | `shared/models/asset.js` |
| TASK-057 的 `result` 显式透传**已在 main**（`normalizeCounts` 保留 `result` 键）→ 审阅 P1-4「result 契约缺失」的"实现缺失"判断已过时，属部署核对问题，归 [TASK-074](./TASK-074-price-pipeline-observability-and-robustness.md) | `shared/services/taskRunner.js:21-24` |

证据边界：本轮未连库、未跑测试；数据事实以审阅的只读实测为准（其附录 A 记录了复核方式）。

## 3. Acceptance Criteria

> 每条可失败；期望值取自审阅实测数字与产品不变量，不从实现反推。

| # | 验收标准 | 来源 |
|---|---|---|
| AC1 | 统一 symbol 归一/派生层**单一实现**于 `shared/`：**按 `market` 派生大写后缀**（`STORAGE_SUFFIX` + `PROVIDER_SUFFIX` 两张表，`001180.cn`→`001180.CN`、`VOO`→`VOO.US`、`600519`→`600519.SS`；创建时由 market 自动派生，用户填不填/填错后缀结果一致；采集时按表去除或保留后缀）。资产建档 / `priceStorage` 写入 / `getLatestPrices` 读取 / `integrityCheck` 对比四处**消费同一实现**；检测式：`grep` 确认无第二份后缀派生/strip 实现（硬规则 #1/#8）。口径以 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 为唯一依据 | P0-1 / ADR-003 |
| AC2 | `getLatestPrices` 读取侧消费统一派生实现（AC1），新数据（建档/采集）按 ADR-003 存储键写入；**代码层断言**：同一 market 下用户填裸码/小写/大写/错后缀，落库 symbol 一致。存量数据的 44/44 命中与 32 持仓缺价 17→0 由 [TASK-077 AC5](../active/TASK-077-symbol-historical-data-migration.md) 验收，本卡不声称完成 | P0-1 代码层 / ADR-003 §10 |
| AC3 | **已拆至 [TASK-077 AC2/AC4](../active/TASK-077-symbol-historical-data-migration.md)**（历史序列删除/迁移与 D-b 口径），本卡不再验收数据迁移 | — |
| AC4 | **已拆至 [TASK-078](../active/TASK-078-price-collection-timing-bucketing.md)**（采集时刻/归桶时序与 P3-9c 同日覆盖），本卡不再验收采集程序 | — |
| AC5 | 完整性检查在 launchDate 可用时（由 [TASK-076](../active/TASK-076-asset-information-completeness-check.md) 提供，本卡**不**抓取/回填）`checkedCount > 0`（不再是 0/44 跳过）；**正向**：人为制造缺价样例能被检出（P0-1 类问题不再静默）。两卡分别验收，不得互相顶替 | P0-2 |
| AC6 | 全部跳过（`skippedCount === totalCount`）不得再呈现为"数据完好"；按 D-d 已裁决口径实现：作为**中间态**在 `result` 数据态中如实反映"全部跳过/未检查"，**不加入状态机、不新增状态值**，沿用 [TASK-057](../../delivery/completed/US-001/TASK-057.md) 四态（负向对照：全跳过时不得新增 `SKIPPED` 状态、不得改唯一索引、不得把 `status` 判成"完好"来掩盖未检查） | P0-2 / D-d |
| AC7 | 回归：`test:server` 与 `test:worker` 全量全绿（数量以实际为准，入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；独立 Reviewer 通过（Implementer 不自判） | — |

## 4. Scope

**In Scope**

- 【代码层】`shared/`：新增 `STORAGE_SUFFIX` / `PROVIDER_SUFFIX` 两张表 + `toStorageSymbol` / `toProviderSymbol` 单一实现并接线四处消费点（口径见 ADR-003）
- 【代码层】资产建档：创建/更新时按 `market` 自动派生后缀；`updateAsset` 拒绝变更 `market`
- 【代码层】价格侧 `integrityCheck` 生效化：D-d 语义处置（"全跳过"作为中间态在数据态如实反映，不加入状态机）；`launchDate` 数据准备依赖 TASK-076，本卡不抓取/回填

**Out of Scope**

- 历史数据迁移（双键删价、`assets`/`transactions`/`portfolio.targets` 归一）→ [TASK-077](../active/TASK-077-symbol-historical-data-migration.md)
- 采集时刻/归桶（P0-3/P2-8）→ [TASK-078](../active/TASK-078-price-collection-timing-bucketing.md)
- P1/P2 观测与健壮性（`SUCCEEDED` 语义细分核对、result 部署核对、新鲜度告警、熔断、NOT_FOUND 提示）→ [TASK-074](./TASK-074-price-pipeline-observability-and-robustness.md)
- 客户端展示（TASK-075）、资产信息检查（TASK-076）；估值/提醒/再平衡业务规则本身；不重开已结案任务与 US-001

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 代码层改动破坏既有精确匹配（`getStatus`/`getLatestPrices`） | 沿用 ADR-003 单一实现 + 全量回归（AC7） |
| R-2 | C-07 等下游依赖既有 symbol 形态 | 口径以 ADR-003 冻结，下游只消费不派生 |
| R-3 | 完整性检查代码与归桶新口径不一致 | 归桶归 TASK-078；本卡只处理"全跳过"语义（D-d），跨卡验收在 Story 层 |
| R-5 | 与 TASK-057 状态机锁定的冲突被实施者自行绕过 | D-d 已裁决"不加入状态机"；AC6 明示禁止改状态机/唯一索引 |

## 6. Human 裁决记录

> ✅ 归一化口径已由 ADR-003 冻结；D-a（采集时刻/归桶）→ TASK-078，D-b（历史数据）→ TASK-077，D-c（launchDate）→ TASK-076。**D-d 已于 2026-11-17 裁决，本卡无待裁决项**（见下表）。

| # | 决定 | 内容 |
|---|---|---|
| **D-d** | ✅ **已裁决（2026-11-17）** | 「全部跳过」（`skippedCount === totalCount`）是**中间态**，只作**数据态表达**，**不加入/不推翻状态机**——沿用 [TASK-057](../../delivery/completed/US-001/TASK-057.md) 锁定的 `RUNNING/SUCCEEDED/PARTIAL/FAILED` 四态，不新增 `SKIPPED` 等状态值。实现：完整性检查的 `result` 如实反映"全部跳过/未检查"的数据态（供看板如实呈现），但 TaskRun 的 `status` 仍按既有状态机判定（如 `failureCount=0 → SUCCEEDED`，不因全跳过而另造状态或误报"数据完好"）。不得改动 TASK-057 状态机与唯一索引。 |

## 7. Coordination Notes

- 与 [TASK-074](./TASK-074-price-pipeline-observability-and-robustness.md) 边界：本卡 = 代码层（口径统一 + 检查语义）；074 = 观测与健壮性。
- **「无数据/全部跳过」表达为共享单点，074 复用本卡 D-d**：本卡 AC6 / D-d 定义的「`skippedCount === totalCount` / `checkedCount=0` → `result` 数据态中间态（沿用 TASK-057 四态、不新增状态值、不改唯一索引）」是本语义的**唯一实现**（`shared/` 与 US-001 看板各一份，硬规则 #1）。074 的零采集 `SUCCEEDED`（P1-3）是同一语义的另一实例，已按 Human 2026-11-17 指令统一到本卡，不在 `shared/` 或看板另建第二套表达；074 仅额外交付「连续 N 天无新数据可见」。若该单点需加字段/改契约，须由本卡侧统一改并回报，074 不私自分叉。
- 与 [TASK-077](../active/TASK-077-symbol-historical-data-migration.md)：本卡只改代码（新数据按 ADR-003 写入/读取），077 处理历史数据库；**两卡零数据写入重叠**。
- 与 [TASK-078](../active/TASK-078-price-collection-timing-bucketing.md)：本卡不含采集时刻/归桶，D-a 归 078。**`saveLatest` 合并分工**：本卡只改 `priceStorage.service.js:8`（`normalizeDailyRecord` 的 symbol → `toStorageSymbol`），078 不碰该行、只在 `saveLatest` 主体前后加覆盖日志；两卡改同一文件不同行，合并后须跑 `priceStorage` 相关单测确认互不覆盖。**前置关系**：本卡是 078 AC4 日志正确性的前置——symbol 未归一前，同基金价格落 `001180` / `001180.CN` 双键而非同一 `(symbol, 日)` 键，078 所述「覆盖」事件与日志中的标准 symbol 均无从成立。
- 与 TASK-075：本卡负责服务端派生实现，TASK-075 负责客户端 `Today.jsx` 消费同一存储格式；client 零派生逻辑（硬规则 #3）。
- 与 [TASK-076](../active/TASK-076-asset-information-completeness-check.md)：D-c 归 076 D-i；两卡分别验收。
- 硬规则约束：归一化/派生属业务规则，**只放 `shared/`**；外部调用保持 `withMarketDataTimeout` + `fetchWithRetry` 包装（硬规则 #7）。

## 8. 本卡未做的事

未实施、ExecPlan **已创建但为 `Draft`（未批准，见 [计划](./TASK-073-price-pipeline-p0-data-correctness-plan.md)）**、**D-a～D-d 全部裁决完毕**（D-a 拆至 078 / D-b 拆至 077 / D-c 拆至 076 / D-d 见 §6）；Owner/Status 待 Orchestrator 登记（Planner 仅建卡内容）。

## 9. 记录

2026-11-17，Planner：依据 Human 指令「根据 PRICE-PIPELINE-REVIEW 创建独立 task」建卡。审阅发现为唯一事实来源（其附录 B 修订记录已含错误结论撤回，以本版为准）；Planner 补充核对见 §2。初始 Status 待 Orchestrator 登记；优先级建议 High（P0 数据正确性，CNY 估值整体不可算），最终以 Human 为准。D-a～D-d 裁决 + ExecPlan 批准前不得开工。

2026-11-17（同日追加）：Human 与 Reviewer 讨论后决定将归一化目标由「strip → 裸码」反转为「按 market 派生大写后缀」，产出 ADR-003（Accepted）。本卡 AC1 / AC2 / Scope / §2 / §6 / Coordination 已按 ADR-003 更新。原审阅文档 P0-1 建议段中「strip `.cn/.SS/.SZ` + upper」的表述为历史建议，已被 ADR-003 取代。

2026-11-17（范围再拆分）：Human 指令「073 处理代码逻辑、077 处理数据库、078 处理采集程序」——本卡剥离：历史数据迁移（→077）、P0-3/P2-8 采集时刻与归桶（→078）、D-b（→077）、D-a（→078）。本卡只保留：ADR-003 代码层统一 + P0-2"全跳过"语义（D-d 待裁决）。上文中涉及迁移/归桶的旧表述为历史记录，以本条与 §4 Scope 为准。

2026-11-17（D-d 裁决）：Human 裁决——「全部跳过」是**中间态**，只作数据态表达，**不加入状态机、不新增状态值**，沿用 TASK-057 锁定的四态。§6 由"待裁决"改为"裁决记录"，AC6 / §4 Scope / R-5 / Metadata 执行计划行 / §8 已同步。至此本卡 D-a～D-d 全部裁决完毕，AC1–AC7 与 Scope 齐备；仅剩 Owner/Status 登记（Orchestrator）与 ExecPlan 创建（Planner，可据 ADR-003 + D-d 成文）。未改任何 AC 实质意图外的状态机/索引，未改 Status。

2026-11-17（ExecPlan 起草）：Planner 创建 [TASK-073 实施计划](./TASK-073-price-pipeline-p0-data-correctness-plan.md)（Status `Draft`，未批准）。计划冻结派生模块 `shared/utils/symbol.js`、四处消费接线、读侧 market 来源方案（§4.3）、AC5/AC6 生效化与全跳过数据态（严格不改 TASK-057 状态机/索引）、074 单点共享、073→077→078 顺序与 W1–W8 步骤；明确与 078 的 `saveLatest` 合并边界。Metadata 执行计划行与 §8 已同步指向计划；本卡 Status 仍待 Orchestrator 登记，未改任何 AC 或 Status。
