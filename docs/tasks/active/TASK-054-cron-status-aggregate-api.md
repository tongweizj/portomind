# TASK-054 — 后端聚合接口 `GET /api/cron/status`（FS C-02）

## Metadata

**Status:**  
`Approved`（2026-10-26）—— Planner 已产出 ExecPlan，**待 Human Plan Review**。批准前不得改任何业务代码。B1（需求批准）视为已由「立项 + 下发规划」解除；仍需 Human 明确点头 **3 条**（`OD-4` / `OD-5` / `OD-6`，均动了 AC 措辞或架构约束措辞，见 §9.4 与 ExecPlan §9）。

**Priority:**  
`High`（P0 Must Have。看板所有数据态数字的唯一来源；没有它，`TASK-053` 只能渲染一片灰灯）

**Owner:**  
`Planner`（2026-10-26 已交付 ExecPlan）→ `Human`（Plan Review 待批）→ `Implementer`（待指派）→ 独立 `Reviewer`

**Created:**  
`2026-10-26`

**Updated:**  
`2026-10-26`（立项，含 2026-10-26 实码核查；发现 **3 处 FS 与实现口径不一致**，见 §2.3）· `2026-10-26`（Planner 产出 ExecPlan → `Plan Review`；规划期新发现 **2 处任务卡未记录的硬冲突**，见 §9）

**Type:**  
`Feature`（后端新增只读聚合接口）

**Related Product Spec:**  
`docs/product/specs/FS-cron-worker-status-board.md`（**C-02 基线**：R2、§4.5.2 列定义、§7.2 数据契约缺口、OQ2）· `docs/product/specs/FS-cron-worker-status-board-tasks.md`（§C-02）

**Related ADR:**  
`None`（不新增架构决策；`server` 仍不注册 cron，ADR-002 不受影响）。⚠️ 但 `ARCHITECTURE.md:136` 的「禁止暴露调度/TaskRun 查询接口」在本卡落地后失效，需同步改写为「禁止触发/写操作，仅允许只读聚合查询」——见 ExecPlan §4.8 D-10 与本卡 §9.2 F-7。

**Execution Plan:**  
[`docs/exec-plans/active/TASK-054-cron-status-aggregate-api.md`](../../exec-plans/active/TASK-054-cron-status-aggregate-api.md)（**`Plan Review`** 2026-10-26）

**来源：**  
FS 卡片 `C-02`（PM 拆分，2026-10-26）

---

## 1. 问题

看板要求"**数据态**为主信号"（FS §3）：不是"任务有没有抛异常"，而是"该采的数据到底采齐了没有"。当前：

- 没有任何 REST 接口暴露 `taskruns` —— `GET /api/logs` 与 `GET /api/logs/tasks` 都是**按日期读文本日志文件**（`app-{date}.log` / `task-{date}.log`），与 `taskruns` 集合是**两套互不相干的数据源**。
- 派生指标（价格完成度、完整性 ok/gap、汇率币种成功）**没有任何一处计算**，只散落在 worker 的 task 返回值里，且大部分被 `normalizeCounts()` 丢掉（见 `TASK-055` 前置的 C-05）。

本卡负责：新建一个**只读**聚合端点，把"每个任务最近一次运行 + 数据态派生指标"算好返回，前端**不重算**。

---

## 2. 已核实的代码事实（2026-10-26 亲读）

### 2.1 `taskruns` 的真实契约

| 事实 | 落点 |
|---|---|
| 字段：`taskName / runKey / trigger / status / startedAt / endedAt / durationMs / totalCount / successCount / failureCount / failures[]` | `shared/models/taskRun.js` |
| **无 `result` 字段**；mongoose strict 默认为真 → 写入被**静默丢弃** | 同上（FS §7.2-D1 成立） |
| `status` 枚举 `RUNNING \| SUCCEEDED \| PARTIAL \| FAILED`，**无 `SKIPPED`**；跳过路径只 `return` + 打日志，**不落库** | `shared/models/taskRun.js`、`shared/services/taskRunner.js:15-42` |
| `normalizeCounts()` 是**白名单**，只留 4 个字段，任务 `return {ok,gap,...}` 同样被吞 | `shared/services/taskRunner.js:6-13` |
| 唯一索引 `(taskName, runKey)`；排序索引 `(startedAt:-1, taskName:1)` | `shared/models/taskRun.js:29-30` |
| 落库的 `taskName` 实际取值 | `daily-price-sync`（`shared/tasks/dailySync.js:76-79`）· `price-integrity-check`（`cron-worker/src/tasks/integrityCheck.js:34,392`）· `alert-evaluate`（`alertScheduler.js:18`）· `fx-rate-sync`（`fxScheduler.js:19`）· `rebalance-suggestions:<pid>`（`rebalanceScheduler.js:89`） |
| ⚠️ `price-sync` / `health-check` **只是日志 scope**，不产生 `taskruns` 记录 | `priceScheduler.js:12`、`healthScheduler.js:13`（`createCronScheduler` 的 `taskName` 仅用于 `logCode`） |
| `runKey` 规则：价格 = `marketDate()`（当日日期）；提醒/汇率 = `daily:<marketDate>`；再平衡逐组合 = `<schedule>:<periodKey>` | 各 scheduler |
| 后端路由注册表：9 条 `app.use('/api/...')`，**无 `/api/cron`** | `server/app.js:41-49` |
| 统一响应封装 | `server/utils/apiResponse.js`（`success / failure / pagination / parsePagination`） |

### 2.2 派生指标的原始数据在哪

| 关注点 | 事实 | 落点 |
|---|---|---|
| 价格是否到手 | `Price` 以 **`(symbol, canonicalDayTimestamp)`** 唯一；`canonicalDayTimestamp()` 把任意时间戳归一到 `MARKET_TIMEZONE` 当日 0 点；`dateBounds(dateStr)` 给出当日 `{start,end}` | `shared/models/price.js:23`、`shared/utils/marketTime.js` |
| "应采"分母 | `getActiveAssets()` + `asset.market`（枚举 `US/CA/CN-SH/CN-SZ/CN-FUND/HK`）+ `asset.launchDate` | `shared/services/asset.service.js`、`shared/constants/asset.constants.js:7` |
| 交易日判定**已有现成能力**，且**支持任意日期** | `isMarketOpenToday(market, date = new Date())`，US/CA 按规则算节假日、CN/HK 查静态表 | `shared/services/calendar.service.js:146` |
| 完整性检查的**真实**返回 | `{totalCount, checkedCount, skippedCount, successCount, failureCount, assets[], totals:{expectedCount, actualCount, missingCount}}`；逐资产含 `status('GAP'\|'SKIPPED_NO_LAUNCH_DATE')`、`missingCount`、`completenessRatio`、`missingRanges[]` | `cron-worker/src/tasks/integrityCheck.js:209-232, 268-290` |
| 提醒评估的**真实**返回 | `{evaluated, created, archived, failed}` | `shared/services/alertEngine.service.js:198` |
| 汇率同步的**真实**返回 | `{totalCount:1, successCount:1, failureCount:0, fxCount}`，**无各币种成功标志** | `cron-worker/src/schedulers/fxScheduler.js:25` |
| 再平衡**已有汇总但只打日志** | `runRebalanceCheck` 内 `summary{taskName:'rebalance-check', totalCount, dueCount, skippedCount, failureCount, failures[]}`，仅 `taskLogger.info('REBALANCE_CHECK_DONE', ...)`，**没有 `runTrackedTask` 包裹**（FS §7.2-D4 成立） | `rebalanceScheduler.js:58-65`（summary）+ `:117`（仅 log）+ `:126-131`（`run: () => runRebalanceCheck()`，无 `runTrackedTask` 包裹） |
| 再平衡逐组合**不区分**是否生成建议 | 无论 `needsRebalance` 真假都 `return {totalCount:1, successCount:1, failureCount:0}`（D5 成立） | `rebalanceScheduler.js:94,106` |

### 2.3 ⚠️ FS 与实现的口径差（本卡新增发现，FS §7.2 未列全）

| # | FS 写的字段 | 实现里的真实字段 | 结论 |
|---|---|---|---|
| **X1** | 完整性检查返回 `{ok, gap, skippedNoLaunchDate}`（FS §4.3 / R2） | `{totals:{expectedCount, actualCount, missingCount}, skippedCount, assets[]}` | **字段名不存在**。必须映射：`ok ≈ ΣactualCount`、`gap ≈ ΣmissingCount`、`skippedNoLaunchDate = skippedCount`。语义可对上，**名字对不上** |
| **X2** | 提醒返回 `alertsFired`（FS §4.3） | `{evaluated, created, archived, failed}`，无 `alertsFired` | **字段不存在**。`created` 才是"命中并新建的提醒数"；`archived`（过期归档）不是"命中" |
| **X3** | 汇率返回"各币种成功标志" | 只有 `fxCount` 总数 | FS §7.2 已隐含承认（属 C-05 范围），但 FS §4.3 仍按"可展示"描述 → 本卡必须先降级 |

> **处理原则**：本卡的 AC 一律**以实现的真实语义为准**（用 `created` / `missingCount` / `skippedCount`），字段**对外命名**由 ExecPlan 冻结；`C-05` 落地后可再增字段，但**不得**为了对上 FS 的旧名字去改 `integrityCheck.js` 的业务输出（那会把口径改坏）。

---

## 3. Acceptance Criteria

> 期望值取自 §2 的实现语义与 FS R2 的约束文字，**不得**从"看起来合理"反推。

| # | 验收标准 |
|---|---|
| AC1 | 新增 `GET /api/cron/status`，走既有响应封装（`success()`），返回 5 个任务条目，每个条目同时含 **运行态**（`lastRun`: `status/startedAt/endedAt/durationMs/runKey/trigger`，无记录为 `null`）与 **数据态**（按任务而异，见 AC2–AC6）。 |
| AC2 | **价格同步**：返回 `{targetMarketDate, expected, fetched, missing[]}`。`targetMarketDate` = **上一开市日**（按 `isMarketOpenToday(market, date)` 逐日回退，**不是"今天"**，OQ2）；`expected` = 该日开市且 `active` 的资产数；`fetched` = 其中存在 `Price(symbol, canonicalDayTimestamp(该日))` 的数量；`missing[]` 逐项含 `symbol / name / market`。 |
| AC3 | **完整性检查**：返回 `{expectedCount, actualCount, missingCount, completenessRatio, skippedNoLaunchDate, gapAssets[]}`，数值来自 `taskruns` 里该次运行的 `result`（`C-05` 落地前为 `null`，**不得**用 `status` 冒充）；`gapAssets[]` 至少含 `symbol / missingCount`。 |
| AC4 | **提醒评估**：返回 `{evaluated, created, archived, failed}`（`created` 即"命中并新建的提醒数"，**不得**命名为 `alertsFired` 后又偷偷填别的值）；`created=0` 属正常态，**不得**映射成失败。 |
| AC5 | **汇率同步**：`C-05` 落地前返回 `{fxCount, currencies: null}` 并标记 `contractReady=false`；**不得**根据 `fxCount=3` 反推"USD/CAD/HKD 全成功"（数量相等 ≠ 币种正确，FS §7-E 的教训）。 |
| AC6 | **再平衡分发**：`due` 只来自父任务 `rebalance-check` 的 `result.perPortfolio[].due`；父任务 `result` 缺失（`C-05` 未落地）时该字段返回 `null` + `contractReady=false`，**严禁**用"是否存在逐组合 taskrun"反推 `due`（未到期与整批崩溃都零记录，D4）。`failures[]` 的 `category/message` **无论 `C-05` 是否落地都可得**（D6），必须原样透出。 |
| AC7 | **僵尸 RUNNING 判定**：某条 `status=RUNNING` 且 `startedAt` 早于「2 × 该任务周期」→ 该条目标 `stale=true` 且 `status` 对外呈现为「停滞」而非「正在运行」；阈值取**配置常量**（不硬编码在 controller 里）。 |
| AC8 | `?detail=rebalance&date=&portfolioId=` 返回逐组合明细（复用**同一**端点，**不新增第二个端点**）；`date` 非法（非 `YYYY-MM-DD`）→ 400；`portfolioId` 非法或不存在 → 空结果 + 明确提示，**不 500**。 |
| AC9 | **空态不撒谎**：无任何 `taskrun` → 返回 `null`/空数组的明确空态，HTTP 200，**不返回伪造的成功态**（负向对照：删空 `taskruns` 后断言返回里不出现任何 `SUCCEEDED`）。 |
| AC10 | **只读**：本端点不写任何集合（含 `taskruns` 的 `RUNNING` 清理）；实现中无 `create/update/delete` 调用。`grep -rn "TaskRun.create\|updateOne\|deleteOne" server/controllers/cronStatus.controller.js` → 0 行。 |
| AC11 | **不改调度语义**（NG2/NG3）：`cron-worker/` 的 cron 表达式、`runKey`、防重逻辑零改动；本卡**不重算**价格/汇率/再平衡（只用既有集合做聚合查询）。 |
| AC12 | **测试**：单元测试覆盖 AC2（含节假日回退、`expected=0`）、AC7、AC9；集成测试覆盖 AC1 全字段 + AC8 参数校验。**先红后绿**：AC2 的"上一开市日"用例必须先给出会失败的断言（构造一个只有周六日有价的数据集）。 |
| AC13 | 文档同步：`docs/dev/API_CONTRACT.md` 的「接口清单」新增本端点；`docs/manual/SERVER.md` 的手动 API 端点段落补一条（只读聚合，**不可**用于触发任务）。 |
| AC14 | 独立 Reviewer 复核通过；Implementer 不得自判。 |

---

## 4. Scope

**In Scope**

- 新增 `server/routes/cronStatus.routes.js` + `server/controllers/cronStatus.controller.js`（命名以既有 `*.routes.js` 约定为准），并在 `server/app.js` 注册 `app.use('/api/cron', cronStatusRoutes)`
- 只读聚合查询：`TaskRun`、`Asset`（`getActiveAssets`）、`Price`、`Portfolio`（再平衡卡的组合名/计划/accountType）
- 派生计算：上一开市日回退、价格 missing、僵尸 RUNNING 判定
- 测试与文档（AC12 / AC13）

**Out of Scope**

- **不改** `shared/models/taskRun.js` / `shared/services/taskRunner.js`（加 `result` / `SKIPPED` 是 `C-05`，**未立项**）
- **不改** `cron-worker/` 任何调度或任务代码（NG2；补父任务 taskrun 也是 C-05）
- **不改** `/api/logs`、`/api/logs/tasks`
- 不做前端渲染（`TASK-053` / `TASK-055`）
- 不做历史趋势（`C-09`，P2）
- 不做写操作 / 手动触发（NG1）

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **"上一开市日"按市场各不相同**：`ASSET_MARKETS` 有 6 个值、跨 4 个时区，US 与 CN 的"上一个开市日"可能不是同一天 | AC2 要求**按市场分别回退**，卡片上展示的是"本次同步的目标日"，多市场时取最晚的那个并在文案里写明（ExecPlan 需给出定论） |
| R-2 | **symbol 写法不一致会伪造缺口**：历史上有 `000191.cn`（transactions/targets）与 `000191`（assets/prices）两套写法 | `expected/fetched` 一律**从 `asset.symbol` 出发**去 `Price` 里找（同源于 assets），**不得**从 `Price` 反向聚合；ExecPlan 需实测一次真实库的 fetched 比例，若出现大面积 missing 先怀疑写法而非数据 |
| R-3 | **全市场同时停更时无基准可比**：如果所有资产都没价，`missing` = 全部，卡片会全红——这其实是**正确**的（真实故障），但用户可能误判 | AC9 之外的文案要求：`fetched=0` 时提示"可能是 fetch 源整体故障"，与"个别标的缺失"区分 |
| R-4 | **把 `status` 当完成度**：最容易的偷懒实现是"SUCCEEDED 就绿灯" | AC2–AC6 逐条要求派生字段；Review 时禁止仅返回 `status` 的实现 |
| R-5 | **N+1 查询**：5 个任务 × 逐资产 × 逐日回退，容易写成几百次查询 | ExecPlan 要求：`taskruns` 一次 `aggregate` 取 5 个任务各自最近一条；`prices` 用 `symbol $in` + 一次 `countDocuments/aggregate` 按 symbol 分组 |
| R-6 | **超期未运行判定的锚点选错**：再平衡用逐组合记录当锚点会永远"未超期" | AC7 + FS R6：再平衡锚点必须是**父任务** `rebalance-check`；C-05 未落地时该卡只能显示"数据契约未就绪" |
| R-7 | **端点被当成触发器**：`/api/cron/*` 的命名容易被误解为"能跑任务" | AC10 + `SERVER.md` 明确标注"只读，无触发能力"；不实现任何 POST |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | Human 批准本卡（含 §7 OQ-1 / OQ-2 的裁决） | ✅ **已解除**（2026-10-26 立项并下发规划；OQ-1/OQ-2/OQ-3 由 Planner 在 ExecPlan §4.8 D-1~D-4 裁定，Human 可在 Plan Review 推翻） |
| **B2** | Planner 产出 ExecPlan 并经 Human Plan Review（**须先冻结响应字段名**） | 🔄 **ExecPlan 已产出**（2026-10-26，状态 `Plan Review`）；字段名已在 ExecPlan §4.3 冻结 → **待 Human Plan Review** |
| **B3** | 独立 Reviewer 复核 | ⏳ 交付时 |
| B4 | `C-05`（数据契约增强，**未立项**） | ❌ **不阻塞**：本卡按"字段缺失→`null`+`contractReady=false`"降级；C-05 落地后同一接口自动填满 |

---

## 7. Open Questions（需 Human / PM 裁决）

### OQ-1：对外字段名用 FS 的旧名还是实现的真名？

| 方案 | 内容 | 代价 |
|---|---|---|
| **A（倾向）** | 对外用**实现真名**（`actualCount/missingCount/skippedCount`、`created`），并在 AC 里写明映射 | 与 FS §4.3 的 `{ok, gap, alertsFired}` 字面不符，需回改 FS 或加映射说明 |
| B | 对外用 FS 的 `{ok, gap, alertsFired}`，在 controller 里做映射 | 前端读到的名字与后台数据源脱节，排查时要在两套词之间来回翻译 |
| C | 改 `integrityCheck.js` / `alertEngine.service.js` 的输出字段 | **超出本卡范围**（会动 worker 业务输出），且会让既有日志与测试连带变更 |

### OQ-2："目标市场日"多市场时怎么显示？

当 US 与 CN 的上一开市日不同（例如 CN 春节长假），价格卡只能显示一个日期。选：① 取**最晚**的开市日（最严格要求）；② 取**最早**（最宽松）；③ 按市场分组各显示一行（卡片变高）。PM 建议 ①，需在 FS 里补一句口径。

### OQ-3：僵尸 `RUNNING` 的阈值是否要按任务分别配置？

FS 建议统一"2 × 周期"，但 5 个任务周期不同（日/日/日/日/日 + 再平衡按组合计划）。是否允许在 ExecPlan 里给每个任务单独阈值常量？

---

## 8. Coordination Notes

- **与 `TASK-053`（C-01）**：053 只消费本卡，文件集不重叠（053 纯 `client/`）。053 可先行，本卡合入后自动填色。
- **与 `TASK-055`（C-03）**：055 的完成度算法**必须**在本卡实现（AC2），055 只渲染。**禁止**前端二次计算 `fetched/expected`。
- **与 `C-07`（未立项）**：详情页复用 `?detail=rebalance`（AC8），不新增端点——这条是 FS §10 的硬约束，C-07 落地时不得另开接口。
- **与 `TASK-051`（汇率方向反了，已立项）**：AC5 的 `currencies` 一旦在 C-05 后接通，会**直接暴露**汇率方向错误（USD 0.1494）。这不是本卡的缺陷，但看板会成为该 bug 最显眼的展示面 → 建议 `TASK-051` 先于本卡结案，否则看板一上线就显示异常值。
- **与 `TASK-052`（docs 治理）**：AC13 的文档同步落在 `API_CONTRACT.md` / `SERVER.md`，与该任务的 `docs:check` 校验环可能有交集，实施时错峰。

---

## 9. Plan Review 提交（Planner，2026-10-26）

ExecPlan：[`docs/exec-plans/active/TASK-054-cron-status-aggregate-api.md`](../../exec-plans/active/TASK-054-cron-status-aggregate-api.md)

### 9.1 §2 代码事实复核：**全部成立**

逐条亲读核对（`main` = `cafcc5d`）无一处偏差：`taskRun.js:3-33`、`taskRunner.js:6-36`、`app.js:41-49`、`integrityCheck.js:209-260`、`alertEngine.service.js:196-198`、`rebalanceScheduler.js:56-131`、`calendar.service.js:146-169`、`marketTime.js:24-63`、`price.js:23`、`asset.constants.js:7`。

### 9.2 规划期新发现（本卡 §2 未记录）

| # | 事实 | 影响 | 处理 |
|---|---|---|---|
| **F-7** | `docs/architecture/ARCHITECTURE.md:136` 明文把「暴露调度/TaskRun 查询接口（**当前没有这类端点**）」列为 `server` 的**禁止项**；`docs/product/PRODUCT_LINES.md:170` 同样写「`server` … 也**不暴露**调度 / TaskRun 查询接口」 | 本卡落地后这两句立即变成假话。**AC13 只列了 2 份文档，漏了这 2 份** | 已扩进 ExecPlan §1 Scope / §4.8 D-10 / §8 R-8：约束措辞改为「不得暴露触发/写操作，**仅允许只读聚合查询**」。**属架构约束放松，需 Human 在 Plan Review 明确点头（OD-6）** |
| **F-8** | `docs/manual/SERVER.md:64` 把 `SCHEDULER_TIMEZONE` 描述为「仅供**只读的调度状态接口**按调度时区取当天日期」，但当前**没有任何调度状态接口**，真正读它的是 `log.controller.js:14` 的日志日期默认值 | 描述指错了消费方 | 已列入 ExecPlan W11（动 `SERVER.md` 时顺手改准） |

### 9.3 未闭环的证据缺口

R-2 要求「实测一次真实库的 fetched 比例」，本次规划**未能执行**：`mongodb://192.168.2.140:27017/portomind_dev` 返回 `Command find requires authentication`，凭据在 `server/.env`（Planner 未读取）。已移交 ExecPlan §7.4，由 Implementer 用 `MONGO_URI` 只读执行，结果回填 §11。**这是本计划唯一的证据缺口**（ExecPlan §8 R-1）。

### 9.4 计划中需 Human 明确点头的 3 条

| ID | 内容 | 为什么需要点头 |
|---|---|---|
| **OD-4** | AC2 的 `expected` **排除 `launchDate > 目标日`** 的资产（另返 `notListed[]`） | 是对 AC 措辞的**细化**；不排除则未上市标的长挂 `missing`，属"看板撒谎" |
| **OD-5** | 服务端额外返回 `dataStateLevel`（`ok/warn/bad/unknown`） | **AC1 未列的字段**；但 FS R2 要求「前端不重算」，不返回则 5 张卡各自推颜色会漂移 |
| **OD-6** | 一并改写 `ARCHITECTURE.md:136` / `PRODUCT_LINES.md:170` | **架构约束措辞放松**，按 `AGENTS.md` §6 属需 Human 批准的范畴 |

其余 OD-1/OD-2/OD-3/OD-7 为 OQ 的既定推荐（FS §9 已给方向），Planner 已裁定，Human 可推翻但不阻塞。

OD-4，OD-5，OD-6，都同意这样处理
