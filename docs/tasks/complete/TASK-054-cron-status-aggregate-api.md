# TASK-054 — 后端聚合接口 `GET /api/cron/status`（FS C-02）

## Metadata

**Status:**  
`COMPLETED`（2026-10-27）—— 已实施完成 + **三轮独立复核 + 一轮回归复核全部通过**（无 BLOCKER / 无 MAJOR；8 条 MINOR 已整改，余 2 条 FX 适配器边界项移交 `TASK-057`）：新增 `shared/constants/cronStatus.constants.js`、`shared/services/cronStatus.service.js`、controller / routes、`app.js` 注册 1 行；新增 **28 条测试**（U1–U17 + A1–A11 全绿）；全量回归 `test:server` **180/0**、`test:worker` **77/0**；开发库 + 生产库只读冒烟均通过。**⚠️ 代码尚未合入 `main`**（分支 `feature/TASK-054-cron-status-aggregate-api` = `c7389d1`；`main` / `origin/main` = `1895530`），合并属 Human 职权，见 §11.3。

**Priority:**  
`High`（P0 Must Have。看板所有数据态数字的唯一来源；没有它，`TASK-053` 只能渲染一片灰灯）

**Owner:**  
`Planner`（2026-10-26 交付并修订 ExecPlan）→ `Human`（2026-10-26 Plan Review 通过）→ `Implementer`（2026-10-26 实施完成）→ 独立 `Reviewer`（**2026-10-27 三轮复核 + 回归复核通过**）→ `Orchestrator`（2026-10-27 归档）→ `Human`（验收 + 合入 `main`，**已关闭**）

**Created:**  
`2026-10-26`

**Updated:**  
`2026-10-26`（立项，含实码核查；发现 3 处 FS 与实现口径不一致，见 §2.3）· `2026-10-26`（Planner 产出 ExecPlan → `PLAN_REVIEW`）· **`2026-10-26`（Human Plan Review 通过 → `APPROVED`；ExecPlan 按 OD-4/5/6 + 4 项新裁决修订；只读实库探测完成，原唯一证据缺口关闭，见 §2.4）** · **`2026-10-26`（实施完成 → `REVIEWING`：新增 5 个代码/路由文件 + 2 个测试文件 + 1 个测试辅助文件；24 条新测试全绿，全量 176/0、77/0；生产库只读冒烟通过；待独立 Reviewer）** · **`2026-10-27`（两轮独立复核通过 → `REVIEWED`：8 条 MINOR 全整改；新增 4 条测试后共 28 条，全量 180/0、77/0）** · **`2026-10-27`（第四轮回归复核 PASS + Human 验收 → `COMPLETED`，归档 `complete/`；见 §11 Completion Record）**

**Type:**  
`Feature`（后端新增只读聚合接口）

**Related Product Spec:**  
`docs/product/specs/FS-cron-worker-status-board.md`（**C-02 基线**：R2、§4.5.2 列定义、§7.2 数据契约缺口、OQ2）· `docs/product/specs/FS-cron-worker-status-board-tasks.md`（§C-02）

**Related ADR:**  
`None`（不新增架构决策；`server` 仍不注册 cron，ADR-002 不受影响）。⚠️ 但 `ARCHITECTURE.md:136` 的「禁止暴露调度/TaskRun 查询接口」在本卡落地后失效，需同步改写为「禁止触发/写操作，仅允许只读聚合查询」——**OD-6 已批准**（ExecPlan §4.8 D-10）。

**Execution Plan:**  
[`docs/exec-plans/complete/TASK-054-cron-status-aggregate-api.md`](../../exec-plans/complete/TASK-054-cron-status-aggregate-api.md)（`Approved` 2026-10-26 → **`Completed` 2026-10-27**，见其 §13）

**来源：**  
FS 卡片 `C-02`（PM 拆分，2026-10-26）

---

## 1. 问题

看板要求"**数据态**为主信号"（FS §3）：不是"任务有没有抛异常"，而是"该采的数据到底采齐了没有"。当前：

- 没有任何 REST 接口暴露 `taskruns` —— `GET /api/logs` 与 `GET /api/logs/tasks` 都是**按日期读文本日志文件**（`app-{date}.log` / `task-{date}.log`），与 `taskruns` 集合是**两套互不相干的数据源**。
- 派生指标（价格完成度、完整性 ok/gap、汇率币种成功）**没有任何一处计算**，只散落在 worker 的 task 返回值里，且大部分被 `normalizeCounts()` 丢掉（见 `TASK-055` 前置的 C-05）。
- 实库已证「全绿 ≠ 数据到位」：`daily-price-sync` 在周末 `status=SUCCEEDED` 但 `successCount=0`（整批休市跳过）；`price-integrity-check` 最新一条同样 `SUCCEEDED`/`successCount=0`（44 个资产全部缺 `launchDate` 被跳过）。

本卡负责：新建一个**只读**聚合端点，把"每个任务最近一次运行 + 数据态派生指标"算好返回，前端**不重算**。

---

## 2. 已核实的代码事实

### 2.1 `taskruns` 的真实契约（2026-10-26 亲读 + 实库复核）

| 事实 | 落点 |
|---|---|
| 字段：`taskName / runKey / trigger / status / startedAt / endedAt / durationMs / totalCount / successCount / failureCount / failures[]` | `shared/models/taskRun.js` |
| **无 `result` 字段**；mongoose strict 默认为真 → 写入被**静默丢弃** | 同上（FS §7.2-D1 成立） |
| `status` 枚举 `RUNNING \| SUCCEEDED \| PARTIAL \| FAILED`，**无 `SKIPPED`**；跳过路径只 `return` + 打日志，**不落库** | `shared/models/taskRun.js`、`shared/services/taskRunner.js:15-42` |
| `normalizeCounts()` 是**白名单**，只留 4 个字段，任务 `return {ok,gap,...}` 同样被吞 | `shared/services/taskRunner.js:6-13` |
| 唯一索引 `(taskName, runKey)`；排序索引 `(startedAt:-1, taskName:1)` | `shared/models/taskRun.js:32-33`；**实库 `indexes()` 复核一致** |
| 落库的 `taskName` 实际取值 | `daily-price-sync`（`shared/tasks/dailySync.js:76-79`）· `price-integrity-check`（`cron-worker/src/tasks/integrityCheck.js:34,392`）· `alert-evaluate`（`alertScheduler.js:18`）· `fx-rate-sync`（`fxScheduler.js:19`）· `rebalance-suggestions:<pid>`（`rebalanceScheduler.js:89`） |
| ⚠️ `price-sync` / `health-check` **只是日志 scope**，不产生 `taskruns` 记录 | `priceScheduler.js:12`、`healthScheduler.js:13`（`createCronScheduler` 的 `taskName` 仅用于 `logCode`） |
| `runKey` 规则：价格 = `marketDate()`（当日日期）；提醒/汇率 = `daily:<marketDate>`；再平衡逐组合 = `<schedule>:<periodKey>` | 各 scheduler |
| 后端路由注册表：9 条 `app.use('/api/...')`，**无 `/api/cron`** | `server/app.js:41-49` |
| 统一响应封装 | `server/utils/apiResponse.js`（`success / failure / pagination / parsePagination`） |

### 2.2 派生指标的原始数据在哪

| 关注点 | 事实 | 落点 |
|---|---|---|
| 价格是否到手 | `Price` 以 **`(symbol, canonicalDayTimestamp)`** 唯一（`saveLatest` 为 upsert，一天一条）；`canonicalDayTimestamp()` 把任意时间戳归一到 `MARKET_TIMEZONE` 当日 0 点；`dateBounds(dateStr)` 给出当日 `{start,end}` | `shared/models/price.js:23`、`shared/services/priceStorage.service.js:16-19`、`shared/utils/marketTime.js` |
| "应采"分母 | `getActiveAssets()` + `asset.market`（枚举 `US/CA/CN-SH/CN-SZ/CN-FUND/HK`）+ `asset.launchDate` | `shared/services/asset.service.js`、`shared/constants/asset.constants.js:7` |
| 交易日判定**已有现成能力**，且**支持任意日期** | `isMarketOpenToday(market, date = new Date())`，US/CA 按规则算节假日、CN/HK 查静态表 | `shared/services/calendar.service.js:146` |
| 完整性检查的**真实**返回 | `{totalCount, checkedCount, skippedCount, successCount, failureCount, assets[], totals:{expectedCount, actualCount, missingCount}}`；逐资产含 `status('GAP'\|'SKIPPED_NO_LAUNCH_DATE')`、`missingCount`、`completenessRatio`、`missingRanges[]` | `cron-worker/src/tasks/integrityCheck.js:209-232, 268-290, 347-380` |
| 提醒评估的**真实**返回 | `{evaluated, created, archived, failed}` | `shared/services/alertEngine.service.js:198` |
| 汇率同步的**真实**返回 | `{totalCount:1, successCount:1, failureCount:0, fxCount}`，**无各币种成功标志** | `cron-worker/src/schedulers/fxScheduler.js:25` |
| 再平衡**已有汇总但只打日志** | `runRebalanceCheck` 内 `summary{taskName:'rebalance-check', totalCount, dueCount, skippedCount, failureCount, failures[]}`，仅 `taskLogger.info('REBALANCE_CHECK_DONE', ...)`，**没有 `runTrackedTask` 包裹**（FS §7.2-D4 成立） | `rebalanceScheduler.js:58-65`、`:117`、`:126-131` |
| 再平衡逐组合**不区分**是否生成建议 | 无论 `needsRebalance` 真假都 `return {totalCount:1, successCount:1, failureCount:0}`（D5 成立） | `rebalanceScheduler.js:94,106` |

### 2.3 ⚠️ FS 与实现的口径差（FS §7.2 未列全）

| # | FS 写的字段 | 实现里的真实字段 | 结论 |
|---|---|---|---|
| **X1** | 完整性检查返回 `{ok, gap, skippedNoLaunchDate}`（FS §4.3 / R2） | `{totals:{expectedCount, actualCount, missingCount}, skippedCount, assets[]}` | **字段名不存在**。映射：`ok ≈ ΣactualCount`、`gap ≈ ΣmissingCount`、`skippedNoLaunchDate = skippedCount`。语义可对上，**名字对不上** |
| **X2** | 提醒返回 `alertsFired`（FS §4.3） | `{evaluated, created, archived, failed}`，无 `alertsFired` | **字段不存在**。`created` 才是"命中并新建的提醒数"；`archived`（过期归档）不是"命中" |
| **X3** | 汇率返回"各币种成功标志" | 只有 `fxCount` 总数 | FS §7.2 已隐含承认（属 C-05 范围），FS §4.3 仍按"可展示"描述 → 本卡先降级 |

> **处理原则**：本卡的 AC 一律**以实现的真实语义为准**（用 `created` / `missingCount` / `skippedCount`），字段**对外命名**由 ExecPlan §4.3 冻结；`C-05` 落地后可再增字段，但**不得**为了对上 FS 的旧名字去改 `integrityCheck.js` / `alertEngine.service.js` 的业务输出（那会把口径改坏）。FS 旧名回改由 PM 处理（ExecPlan §9 T-1/T-2）。

### 2.4 只读实库探测（2026-10-26 已完成，原证据缺口关闭）

> 方法：`server/.env` 的 `MONGO_URI`（指向 `portomind_dev`）替换库名为 `portomind` 后只读查询；**无写操作**。未使用 `npm run sync:db`（读生产库已足够，且避免 `--drop` 覆盖开发库）。

| 项 | 实测值 | 对实现的影响 |
|---|---|---|
| active 资产 | **44** = `CN-FUND 29` + `CA 11` + `US 4` | AC2 `expected` 基准 |
| `launchDate` 为空 | **44 / 44** | `notListed[]` 当前恒空（OD-4 逻辑仍需实现）；完整性检查全被 `SKIPPED_NO_LAUNCH_DATE` 跳过 |
| 最近有价日 | `2026-10-21`（42 条）；`10-22` 起无新桶 | 最后一条有效采集 = 10-21 |
| 目标日（日历口径 10-23）桶 | **0 条** | 按有效目标日口径今天（10-26 无 run）应判红——正确 |
| 周末桶 | `10-24 = 0`、`10-25 = 0` | 「休市整批跳过」的直接证据 |
| `taskruns` / 含 `result` | **244 / 0** | 本卡首日 4 项 `contractReady=false` |
| 状态分布 | `SUCCEEDED 154` / `PARTIAL 45` / `FAILED 44` / `RUNNING 1` | — |
| 僵尸 `RUNNING` | `daily-price-sync` `manual:2026-08-25T23:07:45.616Z`（**不是最新一条**；最新 10-25 `SUCCEEDED`） | AC7 只判最新 → 该僵尸不会被本接口展示（OD-11） |
| 各任务最近一条 | price 10-25 `SUCCEEDED` 0/44 · integrity 10-25 `SUCCEEDED` 0/44 · fx 10-25 **`FAILED`** · alert 10-25 `SUCCEEDED` · rebalance **无记录** | 「全绿但 0 采集」真实样本 |
| 未归档组合 | 4（`A股-长钱组合`/`A股-稳钱组合`/`CA-RRSP组合`/`CA-家庭RESP组合`，全 `daily`） | AC8 的 `perPortfolio.length` 期望值 = 4 |
| symbol 精确匹配 | **44/44**；另有 27 条无后缀历史别名行（同一批 `.CN` 基金） | AC2 一律精确匹配（ExecPlan D-20） |
| 最新 `FxRate` | 2026-10-22：USD `0.149493` / CAD `0.210155` / HKD `1.173012`（方向反，`TASK-051`） | AC5 的 `fxCount=3` 可只读得到，但不得反推币种成功 |

**残留（不影响编码）**：采样时 2026-10-26 无任何 `taskrun`（最新 10-25），说明当时 worker 未在当日 03:00 运行；看板首日会因此显示价格红/汇率 FAILED，属**正确信号**（ExecPlan R-14）。

---

## 3. Acceptance Criteria

> 期望值取自 §2 的实现语义、§2.4 实测与 FS R2 的约束文字，**不得**从"看起来合理"反推。
> **2026-10-26 经 Human Plan Review 批准细化 AC2 / AC5 / AC6 / AC7 / AC12**（`OD-4` / `OD-5` / `OD-6` + `OD-8`~`OD-11`）；其余 AC 未变。

| # | 验收标准 |
|---|---|
| AC1 | 新增 `GET /api/cron/status`（**路径精确**：`app.use('/api/cron', …)` + `router.get('/status')`），走既有响应封装（`success()`），返回 5 个任务条目，每个条目同时含 **运行态**（`lastRun`: `status/startedAt/endedAt/durationMs/runKey/trigger`，无记录为 `null`）与 **数据态**（按任务而异，见 AC2–AC6），并含 `stale / contractReady / dataStateLevel / notes[]`。 |
| AC2 | **价格同步**：返回 `{targetMarketDate, calendarPrevOpenDay, expected, fetched, missing[], byMarket, notListed[], unsupportedMarkets[]}`。`targetMarketDate` = **有效目标日**：该市场最近一个「03:00 同步时点已过且开市」的交易日**之前**的最近开市日——**周末/休市日/当日 03:00 前不得把尚未到采集时点的交易日计入缺口**；`calendarPrevOpenDay` 同时返回日历口径「上一开市日」，两者不同时给 `notes[].code='TARGET_LAGGED'`。每个市场 `expected` = 该市场目标日开市且 `active` 的资产数（排除 `launchDate > 目标日`，进 `notListed[]`）；顶层 `expected/fetched` = **各市场按其自身目标日分别统计后求和**，顶层 `targetMarketDate` = 各市场目标日**最晚**者，`byMarket` 保留逐市场口径。`fetched` = 上述资产中存在 `Price(symbol, canonicalDayTimestamp(该市场目标日))` 的数量；`missing[]` 逐项含 `symbol / name / market`。**符号一律精确字符串匹配**，不做后缀归一。 |
| AC3 | **完整性检查**：返回 `{expectedCount, actualCount, missingCount, completenessRatio, skippedNoLaunchDate, gapAssets[]}`，数值来自 `taskruns` 里该次运行的 `result`（`C-05` 落地前为 `null`，**不得**用 `status` 冒充）；`gapAssets[]` 至少含 `symbol / missingCount`。读取顺序：`result.totals.*` → 顶层同名 → `{ok,gap}` 旧名兼容。 |
| AC4 | **提醒评估**：返回 `{evaluated, created, archived, failed}`（`created` 即"命中并新建的提醒数"，**不得**命名为 `alertsFired` 后又偷偷填别的值；`alertsFired` 仅作旧名回退）；`created=0` 属正常态，**不得**映射成失败。 |
| AC5 | **汇率同步**：`C-05` 落地前返回 `{fxCount, currencies: null}` 并标记 `contractReady=false`；`fxCount` = **只读** `FxRate` 最新汇率日的币种记录数，**不得**根据 `fxCount=3` 反推"USD/CAD/HKD 全成功"（数量相等 ≠ 币种正确，FS §7-E 的教训）。C-05 落地后 `currencies` 取 `result`，`fxCount` 优先取 `result`。 |
| AC6 | **再平衡分发**：`due` 只来自父任务 `rebalance-check` 的 `result.perPortfolio[].due`；父任务 `result` 缺失（`C-05` 未落地）时该字段返回 `null` + `contractReady=false`，**严禁**用"是否存在逐组合 taskrun"反推 `due`（未到期与整批崩溃都零记录，D4）。`failures[]` 的 `category/message` **无论 `C-05` 是否落地都可得**，必须原样透出。`perPortfolio[]` 所属的分发日必须显式返回（`dataState.perPortfolioDate`，主视图取**最近一次有子记录的分发日**）。 |
| AC7 | **僵尸 RUNNING 判定**：仅对**每个任务最新一条** taskrun 判定；`status=RUNNING` 且 `startedAt` 早于「2 × 该任务周期」→ `stale=true`、对外 `status='STALE'`、`rawStatus='RUNNING'`；阈值取**配置常量**（不硬编码在 controller 里）。**历史（非最新）RUNNING 记录不由本端点暴露**（实库那条 08-25 僵尸不是最新一条，清理/统计归 `TASK-057` 与运维）。 |
| AC8 | `?detail=rebalance&date=&portfolioId=` 返回逐组合明细（复用**同一**端点，**不新增第二个端点**）；`date` 非法（非 `YYYY-MM-DD`）→ 400；`portfolioId` 非法或不存在 → 空结果 + 明确提示，**不 500**；`detail` 非空且 ≠ `rebalance` → 400。 |
| AC9 | **空态不撒谎**：无任何 `taskrun` → 返回 `null`/空数组的明确空态，HTTP 200，**不返回伪造的成功态**（负向对照：`taskruns` 集合为空时断言返回 JSON 里不出现任何 `SUCCEEDED`；用猴补模型静态方法模拟空集合与"物理删空"等价）。 |
| AC10 | **只读**：本端点不写任何集合（含 `taskruns` 的 `RUNNING` 清理）；实现中无 `create/update/delete` 调用。`grep -rn "TaskRun.create\|updateOne\|deleteOne" server/controllers/cronStatus.controller.js shared/services/cronStatus.service.js` → 0 行。 |
| AC11 | **不改调度语义**（NG2/NG3）：`cron-worker/` 的 cron 表达式、`runKey`、防重逻辑零改动；本卡**不重算**价格/汇率/再平衡（只用既有集合做聚合查询）。 |
| AC12 | **测试**：单元测试覆盖 AC2（含节假日回退、**周末/未到采集时点的有效目标日回退**、`expected=0`、多市场按各自目标日统计）、AC4（`created=0` 不降级）、AC7（只判最新 + 非最新 `RUNNING` 不被误判）、AC9；集成测试覆盖 AC1 全字段 + AC8 参数校验（若 `TASK-058` 先落地，测试须走会话 stub、保留真实闸门）。**先红后绿**：AC2 的"有效目标日"用例必须先给出会失败的断言（构造周末/长假场景，断言不会把尚未采集的交易日算成缺口）。 |
| AC13 | 文档同步：`docs/dev/API_CONTRACT.md` 的「接口清单」新增本端点；`docs/manual/SERVER.md` 的手动 API 端点段落补一条（只读聚合，**不可**用于触发任务；并写明 `PRICE_SYNC_CRON` 与 `PRICE_SYNC_DUE_HOUR` 的联动）；另按 OD-6 改写 `ARCHITECTURE.md:136`、`PRODUCT_LINES.md:170`、`SERVER.md:64` 与 `docs/readme.md` 状态。 |
| AC14 | 独立 Reviewer 复核通过；Implementer 不得自判。 |

---

## 4. Scope

**In Scope**

- 新增 `server/routes/cronStatus.routes.js`（`router.get('/status')`）+ `server/controllers/cronStatus.controller.js`（命名以既有 `*.routes.js` 约定为准），并在 `server/app.js` 注册 `app.use('/api/cron', cronStatusRoutes)`
- 新增 `shared/services/cronStatus.service.js`（派生逻辑唯一实现）与 `shared/constants/cronStatus.constants.js`（阈值 + **同步时点**常量）
- 只读聚合查询：`TaskRun`、`Asset`（`getActiveAssets` 口径）、`Price`、`Portfolio`、**`FxRate`（仅 AC5 的 `fxCount`）**
- 派生计算：**有效目标日**回退（周末/假日/03:00 前不误报）、价格 missing、僵尸 RUNNING 判定、`dataStateLevel`（只由数据态决定）、`notes[]`
- 测试与文档（AC12 / AC13）

**Out of Scope**

- **不改** `shared/models/taskRun.js` / `shared/services/taskRunner.js`（加 `result` / `SKIPPED` 是 `C-05`，**未立项**）
- **不改** `cron-worker/` 任何调度或任务代码（NG2；补父任务 taskrun 也是 C-05）
- **不改** `/api/logs`、`/api/logs/tasks`
- **不修**采集节奏本身（周五价要到下周一 03:00 才采是采集侧缺陷；本卡只把目标日口径改准，绝不制造假缺口）
- 不做前端渲染（`TASK-053` / `TASK-055`）
- 不做历史趋势（`C-09`，P2）
- 不做写操作 / 手动触发（NG1）；**不清理**僵尸 RUNNING
- 不做 `taskruns` TTL / 归档（另立卡）

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | ~~「上一开市日」缺生产数据背书~~ **已关闭**（§2.4 探测） | 残留：采样时 worker 当日未运行，属真实停摆信号（见 R-9） |
| R-2 | **symbol 写法不一致会伪造缺口**：历史上有 `000191.cn` 与 `000191` 两套写法；实库确有 27 对双写法，但 **44/44 active 资产精确匹配** | `expected/fetched` 一律**从 `asset.symbol` 出发精确匹配**（ExecPlan D-20），**不得**从 `Price` 反向聚合、**不得**做后缀归一；`dayPriceSymbolCount` + `SYMBOL_FORMAT_MISMATCH` 提供诊断 |
| R-3 | **全市场同时停更时无基准可比**：如果所有资产都没价，`missing` = 全部，卡片会全红——这其实是**正确**的（真实故障），但用户可能误判 | `fetched=0` 时靠 `dayPriceSymbolCount` 区分「源整体故障」与「symbol 对不上」；文案由 C-03 负责 |
| R-4 | **把 `status` 当完成度**：最容易的偷懒实现是"SUCCEEDED 就绿灯" | AC2–AC6 逐条要求派生字段；`dataStateLevel` 只由数据态决定（OD-5 批准条件）；Review 时禁止仅返回 `status` 的实现 |
| R-5 | **N+1 查询**：5 个任务 × 44 资产 × 逐日回退，容易写成几百次查询 | ExecPlan §4.2 查询预算（主视图稳态 5 次 / 最差 6 次；detail 3 次）；Reviewer 以预算表为准 |
| R-6 | **超期未运行判定的锚点选错**：再平衡用逐组合记录当锚点会永远"未超期" | AC7 + FS R6：再平衡锚点必须是**父任务** `rebalance-check`；C-05 未落地时该卡只能显示"数据契约未就绪" |
| R-7 | **端点被当成触发器**：`/api/cron/*` 的命名容易被误解为"能跑任务" | AC10 + `SERVER.md` 明确标注"只读，无触发能力"；不实现任何 POST |
| R-8 | **采集节奏造成的周末假缺口**（本版新识别，最实质） | **OD-8（有效目标日）已解决**：周末/假日/每日 03:00 前不把尚未采集的交易日算缺口；真实停摆仍会红（实库现状即如此）。AC12 增加该场景测试 |
| R-9 | **采样时 worker 未运行**（2026-10-26 无 taskrun，最新 10-25） | 看板首日价格红/汇率 FAILED 属**正确信号**；交付说明须写明「先确认 worker 在跑」；长期兜底归 C-06（P1） |
| R-10 | **`TASK-058` 认证互锁**：058 合入后本端点需登录，集成测试未登录会 401 | 测试按 058 ED-5 只 stub `session.service.resolve`、保留真实闸门；两卡合入顺序由 Human 排 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | Human 批准本卡（含 OQ-1/OQ-2/OQ-3 的裁决） | ✅ **已解除**（2026-10-26 立项并下发规划） |
| **B2** | Planner 产出 ExecPlan 并经 Human Plan Review（**须先冻结响应字段名**） | ✅ **已解除（2026-10-26）**：ExecPlan 已修订并 `Approved`；字段名冻结于 ExecPlan §4.3；`OD-4/5/6 + OD-8~OD-11` 全部采纳建议 |
| **B3** | 独立 Reviewer 复核 | ✅ **已解除（2026-10-27）**：两轮独立复核通过（第一轮 PASS WITH FINDINGS → 8 条 MINOR 修复；第二轮 PASS，仅 4 条文档台账项已收尾） |
| **B4** | `C-05`（数据契约增强，**未立项**） | ❌ **不阻塞**：本卡按"字段缺失→`null`+`contractReady=false`"降级；C-05 落地后同一接口自动填满（读取顺序见 ExecPlan D-21） |
| **B5** | `TASK-058`（认证内核，APPROVED）与本卡的合入顺序 | ⚠️ **不阻塞但需协调**：058 先合入则本端点需登录、测试需会话 stub；见 R-10 |

---

## 7. Open Questions（**2026-10-26 已全部裁决**）

### OQ-1：对外字段名用 FS 的旧名还是实现的真名？

**已决（2026-10-26）**：方案 A —— 对外用**实现真名**（`actualCount/missingCount/skippedCount`、`created`），AC 与 ExecPlan 已按此写死；FS §4.3 的旧名由 PM 回改（ExecPlan §9 T-1）。

### OQ-2："目标市场日"多市场时怎么显示？

**已决（2026-10-26）**：方案 ①「取**最晚**开市日」+ 返回 `byMarket` 逐市场明细；并进一步细化：**顶层 `expected/fetched` = 各市场按其自身目标日分别统计之和**（ExecPlan D-3 / D-17）。FS 需补一句口径（ExecPlan §9 T-2）。

### OQ-3：僵尸 `RUNNING` 的阈值是否要按任务分别配置？

**已决（2026-10-26）**：按任务配置的常量表，当前 5 项全 `24h × 2 = 48h`；常量归属 `shared/constants/cronStatus.constants.js`，与 `TASK-057` 谁先落地谁建（ExecPlan D-4）。**且 AC7 范围收窄为「只判每任务最新一条」**（OD-11）。

---

## 8. Coordination Notes

- **与 `TASK-053`（C-01）**：053 只消费本卡，文件集不重叠（053 纯 `client/`）。053 可先行，本卡合入后自动填色。
- **与 `TASK-055`（C-03）**：055 的完成度算法**必须**在本卡实现（AC2），055 只渲染。**禁止**前端二次计算 `fetched/expected`；055 AC7「配色不得读 `lastRun.status`」与 OD-5 的批准条件一致。
- **与 `TASK-057`（C-05）**：本卡不阻塞、不等它；`result` 键名由 057 冻结、本卡用适配器承接（ExecPlan D-21）。057 落地后同一接口自动填满。
- **与 `C-07`（未立项）**：详情页复用 `?detail=rebalance`（AC8），不新增端点——这条是 FS §10 的硬约束，C-07 落地时不得另开接口。
- **与 `TASK-058`（认证，APPROVED）**：058 会加 `app.use('/api', requireAuth)` 与 CORS 白名单；本卡集成测试需按 058 ED-5 加会话 stub，`app.use('/api/')` 计数断言放宽（见 ExecPlan M-7 / R-15 / R-10）。
- **与 `TASK-051`（汇率方向反了，已立项）**：AC5 的 `currencies` 一旦在 C-05 后接通，会**直接暴露**汇率方向错误（实库 2026-10-22：USD `0.149493`）。这不是本卡的缺陷，但看板会成为该 bug 最显眼的展示面 → 建议 `TASK-051` 先于本卡结案，否则看板一上线就显示异常值。
- **与 `TASK-052`（docs 治理）**：AC13 的文档同步落在 `API_CONTRACT.md` / `SERVER.md` / `ARCHITECTURE.md` / `PRODUCT_LINES.md` / `readme.md`；文档基线已于 2026-10-26 提交（`97ccfc7` / `1895530`），实施时错峰。

---

## 9. Plan Review 结论（2026-10-26，Human 已批准）

ExecPlan：[`docs/exec-plans/complete/TASK-054-cron-status-aggregate-api.md`](../../exec-plans/complete/TASK-054-cron-status-aggregate-api.md)（`Approved` → `Completed`，归档后路径）

### 9.1 批准范围（Human 审批原文）

Human 2026-10-26 在任务卡末尾明确批示：

> **「OD-4，OD-5，OD-6，都同意这样处理」**

并结合对话中「裁完 OD-4/5/6 + 4 条新裁决，按照你的建议修改」的要求，落实为：

| ID | 内容 | 结论 |
|---|---|---|
| **OD-4** | AC2 的 `expected` 排除 `launchDate > 目标日` 的资产（另返 `notListed[]`） | ✅ 采纳；`null` launchDate 视为已上市 |
| **OD-5** | 服务端额外返回 `dataStateLevel` | ✅ 采纳，**条件：只由数据态决定，`status` 不参与** |
| **OD-6** | 一并改写 `ARCHITECTURE.md:136` / `PRODUCT_LINES.md:170`（及 `SERVER.md:64`、`readme.md`） | ✅ 采纳；文档基线已提交，锚点已在 HEAD 复核 |
| **OD-8**（新） | AC2 目标日改用**有效目标日**（周末/假日/03:00 前不报假缺口） | ✅ 采纳（ExecPlan D-16） |
| **OD-9**（新） | 多市场 `expected` 口径 = 各市场按其目标日分别统计之和 | ✅ 采纳（ExecPlan D-17） |
| **OD-10**（新） | AC5 `fxCount` 只读 `FxRate` 最新汇率日计数 | ✅ 采纳（ExecPlan D-18） |
| **OD-11**（新） | AC7 只判每任务最新一条；历史 `RUNNING` 不暴露 | ✅ 采纳（ExecPlan D-19） |

OD-1/OD-2/OD-3/OD-7 维持 Planner 原裁定（实现真名 / 取最晚 + byMarket / 逐任务阈值 / 054 先于 057），未推翻。

### 9.2 §2 代码事实复核：**全部成立**

逐条亲读核对（基线 = 分支 HEAD：`cafcc5d` + 文档提交 `97ccfc7`/`1895530`）无一处偏差：`taskRun.js:3-33`、`taskRunner.js:6-36`、`app.js:41-49`、`integrityCheck.js:209-260,347-380`、`alertEngine.service.js:196-198`、`rebalanceScheduler.js:56-131`、`calendar.service.js:146-169`、`marketTime.js:24-63`、`price.js:23`、`asset.constants.js:7`。另修正初稿两条事实：`Price` 同一交易日抓两次**不会**产生两条（`saveLatest` 是 upsert）；采集节奏为「运行日 − 1」写入价格桶（见 §2.4）。

### 9.3 证据缺口：**已关闭（2026-10-26）**

原「无法只读查库」问题已解决：用 `server/.env` 的 `MONGO_URI`（`portomind_dev`）替换库名为 `portomind` 后只读查询，得到 §2.4 全部数字。`active=44`、最近有价日 `2026-10-21`、目标日 `2026-10-23` 桶 `0`、`taskruns=244/含 result=0`、僵尸非最新、`44/44` symbol 精确匹配、最新 FxRate `2026-10-22`（方向反）。

### 9.4 规划期发现的 9 处计划硬伤（已在 ExecPlan 修订）

M-1 路由路径写成 `/api/cron`（应为 `/api/cron/status`）· M-2 AC5 `fxCount` 无来源 · M-3 多市场 `expected` 口径冲突 · M-4 AC7「首日命中僵尸体」不成立 · M-5 主视图 `perPortfolio` 无日期基准 · M-6 U4 用例日期在真实日历下不可能 · M-7 未考虑 `TASK-058` 认证互锁 · M-8 AC4 无测试 · M-9 `gapAssets` 依赖 057 未决 OQ-2。逐项修法见 ExecPlan §11.2。

### 9.5 进度状态

- [x] Human 批准本卡（含 OD-4/5/6 + OD-8~OD-11）
- [x] ExecPlan 修订并 `Approved`，字段名冻结
- [x] 分支 `feature/TASK-054-cron-status-aggregate-api` 已建；文档基线已提交
- [x] 只读实库探测完成（证据缺口关闭）
- [x] Implementer 实施完成（W1–W11 + W13；2026-10-26）
- [x] 测试：新增 **28** 条（U1–U17 + A1–A11）；全量 `test:server` **180/0**、`test:worker` **77/0**；生产库只读冒烟通过
- [x] 独立 Reviewer 第一轮：**PASS WITH FINDINGS**（无 BLOCKER/MAJOR，8 条 MINOR 已整改）
- [x] Reviewer 复检（第二轮）：**PASS WITH FINDINGS（仅 4 条文档台账项）** → 台账项已收尾，无代码/测试/AC 问题
- [x] 第四轮回归复核（2026-10-27，Human 指令）：**PASS**，AC1–AC14 全满足，新增 2 条不阻塞 MINOR（见 §10）
- [x] Human 验收并归档 `complete/`（2026-10-27）
- [ ] **合入 `main`**（属 Human 职权；当前分支 `c7389d1` 尚未合入，见 §11.3）

### 9.6 实施期差异（2026-10-26，供 Human 复核）

| # | 差异 | 影响 | 处理 |
|---|---|---|---|
| 1 | **价格项 `contractReady` 恒为 `true`**（原计划 §4.7/U7 写「5 项 false」，与 §3.6「除价格同步」冲突） | 仅澄清语义，不改字段集合；价格数据态确实不依赖 `taskruns.result` | 计划 §4.7/U7 已统一为「4 项 false + 价格 true」；U7 已按此断言。**若 Human 要求严格按计划原文，可回退为 `false`（1 行改动 + U7 同步）** |
| 2 | **主视图预算由 5 次改为 6 次**（最差 7 次） | Q6 主视图也要取子 taskrun 的 `runStatus/failures`（AC6 要求「failures 无论 C-05 是否落地都可得」） | 计划 §4.2 已按实现更新；仍无 N+1 |
| 3 | **新增 `server/test/helpers/modelStubs.js` 测试辅助** | 仅测试内使用，不进入生产代码 | 计划 §11.3 已记录 |
| 4 | **脏数据护栏 `safeDate()` + `result` 内 null 元素过滤** | 防止 C-05 Mixed 数据/历史脏值让只读端点 500（AC8「不 500」精神） | U16 覆盖；Reviewer F2 整改 |
| 5 | **新增 U15/U16/U17/A10/A11 五条测试**（真实停摆、脏 result、查询形状、detail 空日、date 作用域） | 补 AC12 覆盖 + Reviewer F1/F4/F6 回归 | 计划 §7.2/§7.3 已补行 |

> 以上均为实施层澄清/加固，**未新增/删除对外字段、未改变 AC 语义**；按 AGENTS.md §6 显式提请 Human 复核（尤其差异 1）。

---

## 10. 第四轮独立复核（2026-10-27，Human 指令「审核 TASK-054 的代码」）

**结论：PASS —— AC1–AC14 全部满足，无 BLOCKER / 无 MAJOR。** 新增 **2 条 MINOR（P1/P2，汇率适配器边界）**，不在 `C-05` 落地前的生效路径上，**不阻塞合入**，建议随 `TASK-057` 处理。完整证据（含真机响应逐字段、负向对照）见 ExecPlan **§12.5**。

### 10.1 我独立复跑的（不采信前几轮台账）

| 项 | 结果 |
|---|---|
| `npm run test:server` / `test:worker` | ✅ **180 / 0** · **77 / 0** |
| AC10 零写 / AC11 cron-worker 零改 / AC7 阈值不在 controller | ✅ 全部成立 |
| `app.use('/api')` = 10 / `shared` 无反向 require | ✅ |
| 真机（开发库，只读）`GET /api/cron/status` | ✅ 200；价格 `target=2026-10-26` `0/44` → **bad（真实停摆信号）**；其余四项 `contractReady=false` + 数值全 `null`；`fxCount=3`；再平衡 `perPortfolio=4`（`failures` 已透出真实 `INTERNAL / 000191.CN`） |
| AC8 参数分支 | ✅ 400 / 400 / 200+`PORTFOLIO_ID_INVALID` / 200+`PORTFOLIO_NOT_FOUND` / `/api/cron` 404 |
| 负向对照（注入初稿口径） | ✅ U2 / U12 / U13 变红（14/17），还原后 17/17 —— D-16 真被测试钉住 |

### 10.2 待办（不阻塞合入）

| # | 内容 | 建议归属 |
|---|---|---|
| P1 | `result.rates` 为**数字形态**时每币种 `ok:false` → `level='bad'` 且 `notes=[]`；适配器既接受数字就不该判失败 | `TASK-057`（冻结 `result` 形态时一并定） |
| P2 | `currencies:{}` → `contractReady=true`、`level='bad'`；空对象应为 `unknown` + note | 同上 |

> 观测项（`portfolioId` 早退查询数、`totalCount` 归一、`SERVER.md` 的 `CORS_ORIGINS` 既有错述）见 ExecPlan §12.5.5，均不需在本卡处理。

---

## 11. Completion Record（2026-10-27）

### 11.1 结案依据与状态流转

| 项 | 内容 |
|---|---|
| Human 指令 | 2026-10-27「TASK-054 任务完成，请修改状态，搬迁文档」 |
| 状态流转 | `PLANNING`（2026-10-26 立项）→ `PLAN_REVIEW`（同日产出 ExecPlan）→ `APPROVED`（2026-10-26 Human Plan Review，`OD-4/5/6` + `OD-8~OD-11` 全采纳）→ `Implementing` → `Verifying`（176/0、77/0）→ `Reviewing`（两轮独立复核）→ `REVIEWED`（2026-10-27，8 条 MINOR 全整改）→ 第四轮回归复核 **PASS** → **`COMPLETED`（2026-10-27 归档）** |
| 归档位置 | 任务卡 `docs/tasks/complete/TASK-054-cron-status-aggregate-api.md`；ExecPlan `docs/exec-plans/complete/TASK-054-cron-status-aggregate-api.md`（均 `git mv`，保留历史） |

### 11.2 归档前复跑（本分支实测，不采信前几轮台账）

| 项 | 命令 | 结果 |
|---|---|---|
| 服务端全量 | `npm run test:server` | **180 pass / 0 fail**（exit 0） |
| worker 全量 | `npm run test:worker` | **77 pass / 0 fail**（exit 0） |
| AC1 路由 | `grep -c "app.use('/api" server/app.js` / `grep -n "app.use('/api/cron'"` | **10** / 恰 **1 行**（`:52`） |
| AC8 单端点 | `grep -c "router\.\(get\|post\|put\|patch\|delete\)" server/routes/cronStatus.routes.js` | **1**（只有 `router.get('/status')`） |
| AC10 只读 | `grep -rn "\.create(|updateOne|deleteOne|findOneAndUpdate|\.save(" controller + service` | **0 行** |
| AC11 不改调度 | `git diff --stat main..HEAD -- cron-worker` | **空**（零改动） |
| AC7 阈值归位 | `grep -nE "24|48|STALE|threshold" controller` | **0 行**；常量集中在 `shared/constants/cronStatus.constants.js`（`STALE_FACTOR=2` + 逐任务 `TASK_PERIOD_HOURS`） |
| 分层 | `shared/**` 反向 require `server/client/cron-worker` | **0 行** |
| AC13 文档 | `git diff --stat main..HEAD -- ARCHITECTURE/API_CONTRACT/SERVER/PRODUCT_LINES/readme` | **5 份全部改动**（17 增 9 删），`ARCHITECTURE.md:136` 禁令已改为「禁止触发/写操作，只读聚合除外」 |

### 11.3 ⚠️ 合并状态：**尚未合入 `main`**

| 项 | 实测 |
|---|---|
| 本任务分支 | `feature/TASK-054-cron-status-aggregate-api` = **`c7389d1`**（`feat(TASK-054): 新增只读聚合接口 GET /api/cron/status（FS C-02）`，另含文档提交 `fcaecef`） |
| `main` / `origin/main` | 均为 **`1895530`**（`更新文档`）→ `git merge-base --is-ancestor c7389d1 main` **失败** |
| 含义 | 「任务完成」= 实施 + 四轮复核 + 文档同步完成；**代码尚未进入主线**。合并 / 推送 / PR 属 Human 职权，本次归档**未做任何 git 提交或合并** |
| 合并时注意 | ① 工作树里 `docs/product/specs/FS-authentication.md`、`TASK-058` / `TASK-059` / `TASK-060` 卡、`docs/ui/2.0/*` 属**其他任务**的未提交改动，不要一并提交；② 本次归档还改了 `TASKS.md` / `readme.md` / `API_CONTRACT.md` / 三张下游卡（053/055/057），与代码同批提交即可 |

### 11.4 用户可见结果

- **本卡对界面零可见变化**：只新增一个后端只读端点 `GET /api/cron/status`，前端尚未消费（看板 tab 在 `TASK-053`、完成度展示在 `TASK-055`）。
- 真机（开发库，只读）返回：5 条任务按冻结顺序；价格 `expected=44 / fetched=0` → `bad`（**真实停摆信号**，开发库最新有价日 10-20）；其余四项 `contractReady=false` + 数值 `null` + `CONTRACT_NOT_READY`；`fxCount=3`；再平衡 `perPortfolio=4`、`due=null`，但 `failures[]` 在 `C-05` 前已真实透出（`A股-长钱组合 / INTERNAL / Latest price is required for 000191.CN`）。

### 11.5 遗留与移交

| # | 内容 | 去向 |
|---|---|---|
| P1 | `result.rates` 为**数字形态**时每币种判 `ok:false` → `level='bad'` 且 `notes=[]`（适配器既接受数字就不该判失败） | `TASK-057`（冻结 `result` 形态时一并定） |
| P2 | `currencies:{}` → `contractReady=true`、`level='bad'`；空对象应为 `unknown` + note | 同上 |
| 数据态空转 | `C-05`（`TASK-057`）未落地 → 完整性 / 提醒 / 汇率 / 再平衡四项数值恒 `null`；**这是设计内的降级**，不是缺陷。057 落地后同一接口自动填满（适配器读 `result`，不改对外字段） | `TASK-057` |
| FS 旧名字段 | FS §4.3 仍写 `{ok,gap,skippedNoLaunchDate}` / `alertsFired` / 「各币种成功标志」，与本卡冻结的实现真名不一致（§2.3 X1/X2/X3） | PM 回改 FS（ExecPlan §9 T-1/T-2） |
| 文档既有错述 | `docs/manual/SERVER.md` 的 `CORS_ORIGINS` 行写「该变量未被读取」，与实测（`app.js:21-24` 读了、`:34` 走 `origin:true`）不符 —— **既有事实错误**，不在本卡 AC13 范围 | `TASK-052`（docs 治理批） |
| 下游解锁 | `TASK-055` 的硬前置 B4（`TASK-054`）**已解除**；`TASK-053` 可继续以空态骨架先行 | 已在两卡登记 |

> 本卡归档后不再变更。后续问题一律在对应任务卡内跟踪，不回写本文。
