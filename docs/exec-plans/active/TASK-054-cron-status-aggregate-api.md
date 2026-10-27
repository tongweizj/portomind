# TASK-054 — 后端聚合接口 `GET /api/cron/status`（FS C-02）

## Status

Current status:

`Plan Review`（2026-10-26 Planner 起草并自查；**待 Human Plan Review**）→ `Approved` → `Implementing` → `Verifying` → `Reviewing`（独立 Reviewer）→ `Completed`

Owner:

`Planner`（2026-10-26 起草）/ `Human`（Plan Review 待批）/ `Implementer`（待指派）/ 独立 `Reviewer`（交付时）

Priority:

`High`（P0 Must Have。看板所有数据态数字的唯一来源；没有它，`TASK-053` 只能渲染一片灰灯）

Related task:

[`docs/tasks/active/TASK-054-cron-status-aggregate-api.md`](../../tasks/active/TASK-054-cron-status-aggregate-api.md)

Related spec:

`docs/product/specs/FS-cron-worker-status-board.md`（R2、§4.3、§4.5.2、§7.2、OQ2）· `docs/product/specs/FS-cron-worker-status-board-tasks.md`（§C-02）

Related ADR:

`None`（不新增架构决策；`server` 仍不注册 cron，ADR-002 不受影响。但 `ARCHITECTURE.md:136` 的「禁止暴露调度/TaskRun 查询接口」**约束措辞必须改写为「禁止暴露触发/写操作，仅允许只读聚合查询」**——见 §4.8 D-10）

Branch / Base:

`feature/TASK-054-cron-status-aggregate-api`（**待建**）/ 基线 `main` = `cafcc5d`

> 说明：`docs/templates/EXEC_PLAN_TEMPLATE.md` 仍为 0 字节空文件；`docs/process/EXECUTION_PLANS.md` 的 §8 结构在本仓尾部断尾（止于 §5 首个示例条目）。
> 本文结构依据 `EXECUTION_PLANS.md` §8 的可读部分，并参照 `docs/exec-plans/complete/TASK-050-portfolio-list-household-blocks.md` 的既有格式（§1 Intent / §2 Context / §3 Findings / §4 Design / §5 Work Breakdown / §6 Decisions / §7 Verification / §8 Risks）。

---

## 1. Intent

### Goal

新增**唯一一个**只读聚合端点 `GET /api/cron/status`，把「5 个定时任务的最近一次运行（运行态）」与「数据到底采齐了没有（数据态）」一次算好返回。前端看板（`TASK-053` / `TASK-055` / C-07）**只渲染，不重算**。

### Why

1. **没有任何 REST 接口暴露 `taskruns`**：`GET /api/logs` 与 `GET /api/logs/tasks` 读的是按日文本日志（`app-{date}.log` / `task-{date}.log`），与 `taskruns` 集合是**两套互不相干的数据源**。
2. **数据态派生指标一处都没有**：价格完成度、完整性缺口、汇率币种、再平衡到期，只在 worker 的 task 返回值里，且大多被 `normalizeCounts()` 丢掉（`TASK-057` 的 C-05 范围）。
3. **"任务跑绿 ≠ 数据到位"**：`successCount` 在 `persistPrice()` 之后计数、完整性检查每天 `SUCCEEDED` 却 ok=0/44。看板若只读 `status`，等于把 FS §3 批判的「全绿误导」原样搬到新界面。

### Scope

- 新增 `server/routes/cronStatus.routes.js`、`server/controllers/cronStatus.controller.js`
- 新增 `shared/services/cronStatus.service.js`（**派生逻辑的唯一实现**，见 D-9）
- 新增 `shared/constants/cronStatus.constants.js`（任务键、周期、僵尸阈值、回退上限）
- `server/app.js` 注册 `app.use('/api/cron', cronStatusRoutes)`
- 只读聚合查询：`TaskRun`、`Asset`（`active`）、`Price`、`Portfolio`
- 派生计算：上一开市日回退、`fetched/missing`、僵尸 `RUNNING` 判定、5 项数据态、`?detail=rebalance` 逐组合行
- 测试 2 个文件（单元 + HTTP 集成，均落 `server/test/integration/`，见 §3.7）
- 文档 5 处：`docs/dev/API_CONTRACT.md`、`docs/manual/SERVER.md`（含 `:64` 的 `SCHEDULER_TIMEZONE` 描述纠正）、`docs/architecture/ARCHITECTURE.md:136`、`docs/product/PRODUCT_LINES.md:170`、`docs/readme.md`（后三处见 §4.8 D-10）

### Out of Scope

| # | 不做 | 依据 |
|---|---|---|
| 1 | **不改** `shared/models/taskRun.js` / `shared/services/taskRunner.js`（加 `result`、`SKIPPED` 是 `TASK-057`/C-05） | 任务卡 §4 |
| 2 | **不改** `cron-worker/` 任何调度或任务代码（补父任务 taskrun 也是 C-05） | NG2 / AC11 |
| 3 | **不改** `/api/logs`、`/api/logs/tasks` 及其 controller | 任务卡 §4 |
| 4 | 不做前端渲染（`TASK-053` / `TASK-055` / C-07） | 任务卡 §4 |
| 5 | 不做历史趋势（C-09，P2）；**不做**多日循环查询 | NG4 |
| 6 | 不做任何写操作 / 手动触发 / 重跑 | NG1 / AC10 |
| 7 | **不回填**历史僵尸 `RUNNING`（读时标记即可） | `TASK-057` §4 |
| 8 | 不做 `taskruns` 的 TTL / 归档 | 容量议题另立卡 |

### Constraints

1. **只读**（AC10）：端点不得写任何集合，含「顺手把僵尸 `RUNNING` 改成 `FAILED`」这种清理动作。
2. **`server` 仍不注册 cron**（ADR-002）：本卡只新增查询端点。
3. **跨包引用必须 `@portomind/shared/...`**；`shared/` 内不得反向 require 进程目录。
4. **响应走既有统一封装**（`server/utils/apiResponse.js` 的 `success` / `failure`）。
5. **降级必须显式**：`contractReady=false` + `null`，**禁止**用 `0` / `false` / `status` 冒充（AC3/AC5/AC6/AC9）。
6. **不新增第二个端点**：`?detail=rebalance` 复用同一路由（AC8 / FS §10 硬约束）。
7. `?date` 非法必须 400（沿用 `log.controller.js:28-33` 的「正则 + 回环校验」写法）；`portfolioId` 非法/不存在必须 200 + 空结果，**不得 500**。

### Acceptance Criteria

逐字取自 [任务卡 §3](../../tasks/active/TASK-054-cron-status-aggregate-api.md)（AC1–AC14），未增删改。字段名的对外冻结见 §4.3；对 AC 措辞的两处**细化**见 §4.8 D-2 / D-6，均需 Human 在 Plan Review 一并确认。

| # | 验收标准 |
|---|---|
| AC1 | 新增 `GET /api/cron/status`，走既有响应封装（`success()`），返回 5 个任务条目，每个条目同时含 **运行态**（`lastRun`: `status/startedAt/endedAt/durationMs/runKey/trigger`，无记录为 `null`）与 **数据态**（按任务而异，见 AC2–AC6）。 |
| AC2 | **价格同步**：返回 `{targetMarketDate, expected, fetched, missing[]}`。`targetMarketDate` = **上一开市日**（按 `isMarketOpenToday(market, date)` 逐日回退，**不是"今天"**，OQ2）；`expected` = 该日开市且 `active` 的资产数；`fetched` = 其中存在 `Price(symbol, canonicalDayTimestamp(该日))` 的数量；`missing[]` 逐项含 `symbol / name / market`。 |
| AC3 | **完整性检查**：返回 `{expectedCount, actualCount, missingCount, completenessRatio, skippedNoLaunchDate, gapAssets[]}`，数值来自 `taskruns` 里该次运行的 `result`（`C-05` 落地前为 `null`，**不得**用 `status` 冒充）；`gapAssets[]` 至少含 `symbol / missingCount`。 |
| AC4 | **提醒评估**：返回 `{evaluated, created, archived, failed}`（`created` 即"命中并新建的提醒数"，**不得**命名为 `alertsFired` 后又偷偷填别的值）；`created=0` 属正常态，**不得**映射成失败。 |
| AC5 | **汇率同步**：`C-05` 落地前返回 `{fxCount, currencies: null}` 并标记 `contractReady=false`；**不得**根据 `fxCount=3` 反推"USD/CAD/HKD 全成功"。 |
| AC6 | **再平衡分发**：`due` 只来自父任务 `rebalance-check` 的 `result.perPortfolio[].due`；父任务 `result` 缺失时该字段返回 `null` + `contractReady=false`，**严禁**用"是否存在逐组合 taskrun"反推 `due`。`failures[]` 的 `category/message` **无论 `C-05` 是否落地都可得**，必须原样透出。 |
| AC7 | **僵尸 RUNNING 判定**：某条 `status=RUNNING` 且 `startedAt` 早于「2 × 该任务周期」→ 该条目标 `stale=true` 且 `status` 对外呈现为「停滞」而非「正在运行」；阈值取**配置常量**（不硬编码在 controller 里）。 |
| AC8 | `?detail=rebalance&date=&portfolioId=` 返回逐组合明细（复用**同一**端点，**不新增第二个端点**）；`date` 非法（非 `YYYY-MM-DD`）→ 400；`portfolioId` 非法或不存在 → 空结果 + 明确提示，**不 500**。 |
| AC9 | **空态不撒谎**：无任何 `taskrun` → 返回 `null`/空数组的明确空态，HTTP 200，**不返回伪造的成功态**（负向对照：删空 `taskruns` 后断言返回里不出现任何 `SUCCEEDED`）。 |
| AC10 | **只读**：本端点不写任何集合；`grep -rn "TaskRun.create\|updateOne\|deleteOne" server/controllers/cronStatus.controller.js` → 0 行。 |
| AC11 | **不改调度语义**（NG2/NG3）：`cron-worker/` 的 cron 表达式、`runKey`、防重逻辑零改动；本卡**不重算**价格/汇率/再平衡。 |
| AC12 | **测试**：单元测试覆盖 AC2（含节假日回退、`expected=0`）、AC7、AC9；集成测试覆盖 AC1 全字段 + AC8 参数校验。**先红后绿**。 |
| AC13 | 文档同步：`docs/dev/API_CONTRACT.md` 新增本端点；`docs/manual/SERVER.md` 手动 API 端点段落补一条（只读聚合，**不可**用于触发任务）。 |
| AC14 | 独立 Reviewer 复核通过；Implementer 不得自判。 |

---

## 2. Context

### 2.1 相关文档

- 需求与算法定义：`docs/product/specs/FS-cron-worker-status-board.md` §3（运行态 vs 数据态）、§4.3（5 任务完成度算法）、§4.5.2（详情页列定义）、§7.2（数据契约缺口 D1–D6）、§9（OQ2/OQ3 已决）
- 卡片验收：`docs/product/specs/FS-cron-worker-status-board-tasks.md` §C-02
- TaskRun 契约：`docs/dev/CRON_WORKER_DEV.md §5`（**注意 §5.1 只有 5 类，不含父任务 `rebalance-check`**；那是 `TASK-057` 待补）
- 架构边界：`docs/architecture/ARCHITECTURE.md` §模块边界（`:133-139` 的禁止表）、`ADR-002-single-scheduler.md`
- 响应契约：`docs/dev/API_CONTRACT.md` §通用响应 / §接口清单

### 2.2 上下游

| 关系 | 任务 | 说明 |
|---|---|---|
| 被消费 | `TASK-053`（C-01，前端 tab 骨架） | 只消费本卡；接口未就绪时渲染灰灯。053 **可先行** |
| 被消费 | `TASK-055`（C-03，价格完成度展示） | `expected/fetched/missing` 由本卡算好，055 **只渲染**，禁止前端二次计算 |
| 被消费 | C-07（未立项，`/logs/rebalance` 详情页） | 复用 `?detail=rebalance`，**不得另开端点** |
| 前置（非阻塞） | `TASK-057`（C-05，数据契约） | 本卡按「字段缺失 → `null` + `contractReady=false`」降级，**不等它**；它落地后同一接口自动填满 |
| 无关但需错峰 | `TASK-051`（汇率方向反了） | `currencies` 接通后会直接暴露 USD `0.1494` 这类异常值。**建议 051 先于本卡上线**，否则看板首日就在展示错误汇率 |
| 无关但需错峰 | `TASK-052`（docs 治理） | AC13 的文档改动与其 `docs:check` 校验环可能交集 |

### 2.3 职责边界（写死，防两卡打架）

| 侧 | 任务 | 内容 |
|---|---|---|
| **读侧** | 本卡（054） | stale 判定、`contractReady` 降级、聚合查询、对外字段命名 |
| **写侧** | `TASK-057` | schema `result`、`normalizeCounts` 透传、父任务 `rebalance-check`、`SKIPPED` 落库、僵尸阈值**常量定义** |

> 冲突点：`TASK-057` §8 写「本卡 = 写侧（…僵尸阈值常量）；`TASK-054` = 读侧」。但 054 又必须**不依赖** 057 就能判僵尸。
> **裁定（D-4）**：阈值常量归属 `shared/constants/cronStatus.constants.js`，**谁先落地谁建、后者复用**。实施前先跑 `grep -rn "STALE_FACTOR\|STALE_THRESHOLD" shared/ cron-worker/`：若已存在则复用并只补缺失项，不得新建第二份。

---

## 3. Repository Findings

> 全部为 2026-10-26 亲读源码核对（`main` = `cafcc5d`）。任务卡 §2 的事实**全部成立**；本节只记录**任务卡未写**或**需要更精确**的部分。

### 3.1 任务卡 §2 核对结果（全部成立）

| 任务卡断言 | 核对 |
|---|---|
| `taskruns` 无 `result`、`status` 无 `SKIPPED` | ✅ `shared/models/taskRun.js:3-30`；枚举仅 4 值 |
| `normalizeCounts()` 白名单 4 字段 | ✅ `shared/services/taskRunner.js:6-13` |
| 两条跳过路径不落库 | ✅ `taskRunner.js:16-21`（ALREADY_RUNNING）、`:30-36`（DUPLICATE_RUN_KEY） |
| 唯一索引 `(taskName,runKey)` + `(startedAt:-1,taskName:1)` | ✅ `taskRun.js:32-33` |
| 后端 9 条路由、无 `/api/cron` | ✅ `server/app.js:41-49` |
| 再平衡无父任务、summary 只打日志 | ✅ `rebalanceScheduler.js:56-65`（summary）、`:117-122`（仅 log）、`:126-131`（`run: () => runRebalanceCheck()` 裸调） |
| 完整性检查真实返回 | ✅ `integrityCheck.js:209-223`（`report` 骨架）＋ 逐资产 `:251-260`（`status='GAP'` / `SKIPPED_NO_LAUNCH_DATE'`） |
| 提醒评估真实返回 | ✅ `alertEngine.service.js:196-198`：`{evaluated, created, archived, failed}` |
| `isMarketOpenToday(market, date = new Date())` 支持任意日期 | ✅ `calendar.service.js:146-169`；`normalizeMarket` 把 `CN-SH/CN-SZ/CN-FUND` 归一为 `CN`（`:16-20`） |

### 3.2 `server` 侧现有模式（必须复用，不要另立一套）

| 关注点 | 事实 | 落点 |
|---|---|---|
| 路由文件命名 | `*.routes.js`，`express.Router()`，末尾 `module.exports = router` | `server/routes/valuation.routes.js`（最短样板） |
| 控制器风格 | `exports.xxx = async (req,res,next) => { try{...}catch(err){next(err)} }`；跨包用 `require('@portomind/shared/services/...')` | `server/controllers/valuation.controller.js:1-12` |
| 统一响应 | `success(res, data, {status}|{pagination})` / `failure(req,res,status,message,details)` | `server/utils/apiResponse.js:1-15` |
| 日期参数校验 | 正则 + `new Date(...)` 回环 + `error.status = 400` 抛出 | `server/controllers/log.controller.js:19-35` |
| 时区解析 | `SCHEDULER_TIMEZONE → MARKET_TIMEZONE → America/Toronto` | `cron-worker/src/schedulers/cronScheduler.js:8-10`、`log.controller.js:12-17` |
| 注册路由 | 顶部 `require` 分组 + 中间 `app.use('/api/xxx', x)` | `server/app.js:9-17, 41-49` |

### 3.3 可复用的既有能力（**不要重新造**）

| 能力 | 直接调用 | 备注 |
|---|---|---|
| 交易日判定（含节假日、任意日期） | `require('@portomind/shared/services/calendar.service').isMarketOpenToday(market, date)` | US/CA 按规则算、CN/HK 查静态表；**传非法 market 会 throw**，必须 try/catch（D-11） |
| 价格日边界 | `shared/utils/marketTime.js` 的 `dateBounds(date)` / `canonicalDayTimestamp(value)` / `marketDate(date, tz)` | `dateBounds` 对非法日期 **throw**；`marketDate` 默认优先 `SCHEDULER_TIMEZONE` |
| active 资产 | `shared/services/asset.service.js:100-102` 的 `getActiveAssets()` | 返回 mongoose 文档数组；本卡只要 `symbol/name/market/launchDate` → **改用 `Asset.find({active:true}).select(...).lean()`** 避免全字段（见 D-13） |
| 组合（未归档） | `Portfolio.find({archived:{$ne:true}})` | `rebalanceScheduler.js:57` 同口径；字段 `name / accountType / rebalanceSettings.rebalanceSchedule`（`shared/models/portfolio.js:19-61`） |

### 3.4 数据形态细节（影响实现正确性，任务卡未写）

| # | 事实 | 影响 |
|---|---|---|
| F-1 | `Price.symbol` 与 `Asset.symbol` 都在写入时 `uppercase`（`price.js:8`、`asset.service.js:39`） | 直接字符串比较安全；但**后缀差异不会被 uppercase 抹平**（`000191` vs `000191.CN`）→ R-2 的 symbol 写法风险依旧，见 §7.4 |
| F-2 | `Price` 唯一键 `(symbol, timestamp)`，同一交易日抓两次会有两条（`price.js:23`） | 判「有无价」只用 `countDocuments`/`distinct`，**不能**假设一天一条；取值时不要 `findOne` 取"最新" |
| F-3 | `isMarketOpenToday` 的时区解释：把传入 Date 按**市场本地时区**格式化成 `YYYY-MM-DD` | 候选日必须用 **`T00:00:00Z` 或 `T12:00:00Z`** 构造；用 `T12:00:00Z` 对 4 个时区（UTC-4 ~ UTC+8）都落在同一天，**不会跨日**（D-12） |
| F-4 | `dateBounds(date)` 用 `MARKET_TIMEZONE` 切日，而 `isMarketOpenToday` 用**市场本地时区**判交易日 | 两者不同源，但对"该日是否开市"无冲突：`dateBounds` 只负责把 `YYYY-MM-DD` 映射成价格桶的 UTC 边界（本仓价格按 `MARKET_TIMEZONE` 归桶，`marketTime.js:1-2` 明示唯一实现）。**不要自己写日边界** |
| F-5 | `Asset.market` 是 mongoose enum（`asset.js:26`），但历史数据可能不合规 | 遍历 market 时必须带 `try/catch`，落到 `unsupportedMarkets[]`，**不得整页 500** |
| F-6 | `rebalance-suggestions:<pid>` 的 `runKey = '<schedule>:<periodKey>'`，`periodKey = marketDate()`（`rebalanceScheduler.js:67,90`） | 按「哪一天」取子任务记录时，**不要用 runKey 匹配日期**（weekly/monthly 的 periodKey 语义不同），改用 `startedAt ∈ dateBounds(date)`（D-8） |

### 3.5 ⚠️ 任务卡未发现的两处硬冲突

| # | 冲突 | 事实 | 处理 |
|---|---|---|---|
| **F-7** | **架构文档明文禁止本卡要做的事** | `docs/architecture/ARCHITECTURE.md:136`：「`server` 禁止 … **暴露调度/TaskRun 查询接口（当前没有这类端点）**」；`docs/product/PRODUCT_LINES.md:170`：「`server` … 也**不暴露调度 / TaskRun 查询接口**」 | 两句在本卡落地后**立即变成假话**。AC13 未列这两份文档 → **必须补进 In Scope**（D-10）；约束措辞改为「不得暴露触发/写操作，仅允许只读聚合查询」 |
| **F-8** | **`SERVER.md:64` 对 `SCHEDULER_TIMEZONE` 的描述是错的** | 现写「**仅供只读的调度状态接口**按调度时区取当天日期」——但当前**没有任何调度状态接口**，真正读它的是 `log.controller.js:14` 的日志日期默认值 | 本卡落地后该描述「歪打正着」变得近似成立，但依然指错了消费方。AC13 动 `SERVER.md` 时**顺手改准**（D-10） |

### 3.6 数据库实测（引用 + 未完成项）

| 项 | 值 | 来源 |
|---|---|---|
| `taskruns` 总条数 | **204** | `TASK-057` §2.3（2026-10-26 只读查库 `portomind_dev`） |
| 含 `result` 的文档 | **0** | 同上 → 本卡上线首日 5 项数据态**必然全部 `contractReady=false`**（除价格同步） |
| `rebalance-check` 父任务记录 | **0** | 同上 → `rebalance.due` 首日必为 `null`（AC6 降级路径就是首日默认态） |
| 僵尸 `RUNNING` | **1 条**（`daily-price-sync`，`startedAt` 停在 2026-08-25，已僵 62 天） | 同上 → AC7 的 stale 路径**上线首日就会命中真实数据**，不是假设 |
| 未归档组合 | **4 个**（`A股-长钱`/`A股-稳钱`/`CA-RRSP`/`CA-家庭RESP`，`rebalanceSchedule` 全 `daily`） | 同上 → AC8 的 `perPortfolio.length` 期望值取 **4** |

> ⚠️ **本次规划未能执行实库探测**：`mongodb://192.168.2.140:27017/portomind_dev` 返回 `Command find requires authentication`，凭据在 `server/.env`（Planner 未读取，读取需人工授权）。
> 因此任务卡 R-2 要求的「实测一次真实库的 fetched 比例」**移交 §7.4，由 Implementer 用 `server/.env` 的 `MONGO_URI` 只读执行**。若上线前拿不到该数字，「上一开市日」的算法正确性只有单测保障、缺生产数据背书——这是本计划唯一的证据缺口，已在 §8 R-1 登记。

### 3.7 测试环境（决定 AC12 怎么写）

| 事实 | 说明 |
|---|---|
| 只有 **一个** 测试入口 | `server/package.json`：`"test": "node --test test/integration/*.test.js"`。**没有 `test/unit/` 目录**，`node --test` 也不会递归 |
| 既有「单测」也放在 `integration/` | `asset.service.test.js` / `position.calculator.test.js` / `taskrun.logging.test.js` 都在该目录，直接 require 被测模块，**不起 HTTP** |
| 无 DB 依赖的做法 | **猴补模型静态方法**：`TaskRun.create = async () => ...`，`test.afterEach` 还原（`taskrun.logging.test.js:21-27`）；或猴补 service 方法（`api-contract.test.js:18-49`） |
| HTTP 层做法 | `app.listen(0,'127.0.0.1')` + `fetch` + 统一 `request()` 辅助（`api-contract.test.js:90-107`） |
| `api-contract.test.js` 会不会被新增路由打断 | **不会**。它只断言既有端点的行为，**没有**「路由总数 / 404 白名单」这类穷举断言 |
| `node:test` 已内置，无测试框架依赖 | `server` 无 devDependencies（除 nodemon） |
| `shared/` 无 test 脚本 | 被测 service 落 `shared/`，测试文件落 `server/test/integration/` —— 与本仓现状一致（`taskrun.logging.test.js` 就是测 `shared` 代码） |

→ **AC12 的两类测试都放进 `server/test/integration/`**：
- `cronStatus.service.test.js`（单元：`require('@portomind/shared/services/cronStatus.service')`，猴补模型静态方法，覆盖 AC2/AC7/AC9）
- `cronStatus.api.test.js`（集成：起 `app` + `fetch`，覆盖 AC1 全字段 / AC8 参数校验）

### 3.8 依赖

| 包 | 可用性 |
|---|---|
| `dayjs` | ✅ `shared` 的依赖（`shared/package.json`）。**日期运算一律写在 `shared/` 侧**，`server` 无 dayjs |
| `mongoose` | ✅ `server` 与 `shared` 都有 |
| `express` | ✅ `server` 侧 |

### 3.9 未知项

| # | 未知 | 何时消除 |
|---|---|---|
| U-1 | 生产库 `fetched/expected` 的真实比例；是否存在 `assets` 用 `000191` 而 `prices` 用 `000191.CN` 的错配 | §7.4（Implementer 只读探测） |
| U-2 | `TASK-057` 落地后 `result` 的具体键名（尤其汇率用 `currencies` 还是 `rates`） | 本卡用**适配器**吸收（D-7），两种都能读；057 定稿后只需改一处映射 |
| U-3 | 前端是否愿意接受服务端算好的 `dataStateLevel`（D-6），还是坚持自己配色 | Plan Review 裁决 |

---

## 4. Proposed Design

### 4.1 分层与数据流（**核心决策**）

```
client  ──GET /api/cron/status──▶  routes/cronStatus.routes.js
                                        │
                                        ▼
                              controllers/cronStatus.controller.js   ← 只做：参数校验 → 调服务 → success()/failure()
                                        │
                                        ▼
                        shared/services/cronStatus.service.js        ← 唯一实现：6 次查询 + 全部派生
                                        │
                  ┌─────────────────────┼──────────────────────┐
                  ▼                     ▼                      ▼
              TaskRun               Asset / Price           Portfolio
             (只读聚合)             (只读派生)              (只读连接)
```

**为什么派生逻辑放 `shared/` 而不是 controller**（D-9）：

1. 仓库既有约定：`shared/` 是业务内核唯一实现；`server/controllers` 里已有 3 个直接 require `shared/models/*` 自行查询（分层未完全下沉），但**新功能应走 `shared/service`**（项目既有结论）。
2. 测试可行性：`server` 只有一个测试入口，若逻辑写在 controller 里，「单元测试 AC2」只能靠 HTTP 绕一圈，无法注入 `now`。
3. 可注入时间：AC2 的「上一开市日」和 AC7 的「僵尸阈值」都强依赖当前时间，service 必须接受 `{ now }` 参数（既有 `runRebalanceCheck({now})`、`evaluateAll({now})` 同惯例）。

**`?detail=rebalance` 与主端点共用同一个 row builder**（D-8）：一次实现、两处使用，避免 C-07 落地时出现第二份「到期/生成/失败」的口径。

### 4.2 查询预算（R-5 要求：禁止 N+1）

| # | 查询 | 次数 |
|---|---|---|
| Q1 | `TaskRun.aggregate` 取 5 个任务各自最近一条（`$match taskName $in` → `$sort startedAt:-1` → `$group by taskName $first`） | **1** |
| Q2 | `Asset.find({active:true}).select('symbol name market launchDate').lean()` | **1** |
| Q3 | `Price.find({symbol:{$in:...}, $or:[各市场目标日的 dateBounds]}).select('symbol timestamp').lean()` | **1** |
| Q4 | `Portfolio.find({archived:{$ne:true}}).select('name accountType rebalanceSettings.rebalanceSchedule').lean()` | **1** |
| Q5 | `TaskRun.aggregate` 取指定日的 `rebalance-check`（父）+ `rebalance-suggestions:*`（子） | **1**（`$or` 一次取回，JS 内分组） |
| Q6 | 仅当 `fetched===0 && expected>0`：`Price.distinct('symbol', {timestamp: 目标日 bounds})` 的 `length`（诊断用） | **0 或 1** |

→ 稳态 **5 次**，最差 6 次。**不得**写成「逐资产查价」「逐组合查 taskrun」。Review 时以此表为准。

### 4.3 对外响应契约（**冻结**）

> 冻结含义：`TASK-053` / `TASK-055` / C-07 直接照此写前端，**不得**各自另起字段名。变更需回改本 ExecPlan 并通知下游。

```jsonc
// GET /api/cron/status  →  { "success": true, "data": <Data> }
Data = {
  "generatedAt": "2026-10-26T22:15:00.000Z",   // 快照时间（ISO）
  "timezone": "America/Toronto",                // 解析「今天」所用时区
  "staleThresholdHours": 48,                    // 对外可见的僵尸阈值（D-4），便于前端解释
  "tasks": [ TaskEntry, TaskEntry, TaskEntry, TaskEntry, TaskEntry ]   // 固定顺序，长度恒为 5
}

TaskEntry = {
  "taskName": "daily-price-sync",   // 5 个固定值，见下表
  "lastRun": RunSummary | null,     // null = 无任何 taskrun 记录
  "stale": false,                   // true 仅当原始状态 RUNNING 且超阈值（AC7）
  "contractReady": true,            // 该任务「数据态」字段是否完整可得
  "dataState": { ... },             // 见 4.4
  "dataStateLevel": "ok",           // "ok" | "warn" | "bad" | "unknown"（D-6）
  "note": null                      // { "code": "...", "message": "..." } | null，降级/空态解释
}

RunSummary = {
  "runKey": "2026-10-25",
  "trigger": "SCHEDULED",
  "status": "SUCCEEDED",   // RUNNING | SUCCEEDED | PARTIAL | FAILED | STALE（stale 时替换 RUNNING）
  "rawStatus": "SUCCEEDED",// 库内原值（STALE 时仍能看出原本是 RUNNING）
  "startedAt": "...", "endedAt": "...", "durationMs": 1234,
  "totalCount": 40, "successCount": 40, "failureCount": 0
}
```

`tasks[]` 顺序与 `taskName`（**这是落库名的真实取值，不是日志 scope**）：

| # | `taskName` | 中文短名（供前端兜底） | 落库来源 |
|---|---|---|---|
| 1 | `daily-price-sync` | 价格同步 | `shared/tasks/dailySync.js` |
| 2 | `price-integrity-check` | 完整性检查 | `cron-worker/src/tasks/integrityCheck.js` |
| 3 | `alert-evaluate` | 提醒评估 | `alertScheduler.js` |
| 4 | `fx-rate-sync` | 汇率同步 | `fxScheduler.js` |
| 5 | `rebalance-check` | 再平衡分发 | **`TASK-057` 才会产生**（当前恒 `lastRun: null`） |

> ⚠️ `price-sync` / `health-check` 只是 `createCronScheduler` 的日志 scope，**永不落库**，不得拿去查 `taskruns`。

### 4.4 五项 `dataState`（逐项冻结）

#### ① 价格同步 `dataState`（AC2）

```jsonc
{
  "targetMarketDate": "2026-10-23",        // 上一开市日；多市场取「最晚」（D-3）；无法判定 → null
  "expected": 40,
  "fetched": 38,
  "missing": [ { "symbol": "VBG.TO", "name": "...", "market": "CA" } ],
  "byMarket": {                            // 按市场明细，证明「最晚」不是编的（D-3）
    "US": { "targetMarketDate": "2026-10-23", "expected": 20, "fetched": 20 },
    "CA": { "targetMarketDate": "2026-10-23", "expected": 12, "fetched": 10 },
    "CN-SH": { "targetMarketDate": "2026-10-23", "expected": 8, "fetched": 8 }
  },
  "notListed": [ { "symbol": "NEW1", "launchDate": "2026-11-01" } ],  // launchDate 晚于目标日，不计入 expected（D-2）
  "unsupportedMarkets": [ "CRYPTO" ],      // 日历无法识别的历史脏数据 market（D-11），不计入 expected、不 500
  "dayPriceSymbolCount": null              // 仅 fetched===0 时填：该日库内有价的 distinct symbol 数（R-3 诊断）
}
```

算法（伪代码，**日期运算全部在 `shared/`**）：

```js
// 1) 逐市场求「上一开市日」
const todayStr = marketDate(now, tz);                       // 调度时区「今天」
for (const market of marketsWithActiveAssets) {
  let d = dayjs.tz(todayStr, tz).subtract(1, 'day');         // 从「昨天」起，绝不含今天
  let found = null;
  for (let i = 0; i < PRICE_TARGET_MAX_LOOKBACK_DAYS; i++) { // 上限常量，防死循环（D-4）
    if (isMarketOpenToday(market, new Date(`${d.format('YYYY-MM-DD')}T12:00:00Z`))) { found = d.format('YYYY-MM-DD'); break; }
    d = d.subtract(1, 'day');
  }
  targetByMarket[market] = found;                            // null = 长假超上限
}

// 2) expected：该市场该日应采的 active 资产（排掉 launchDate > 目标日，进 notListed）
// 3) fetched：上述资产里，Price(symbol, timestamp ∈ dateBounds(targetDate)) 存在的
// 4) targetMarketDate = max(targetByMarket.values())  ← 「最晚」，D-3
```

- `expected === 0` → `dataStateLevel = 'unknown'`（AC9 的「不撒谎」在此生效；FS §4.3 亦规定「expected=0（节假日）→ 灰」）。
- `fetched === 0 && expected > 0` → `'bad'`，且填 `dayPriceSymbolCount`：若它 `> 0`，说明**不是采集源全挂，而是 symbol 写法对不上**（R-2/R-3 的区分依据）。该字段只做诊断，**不改变 level**。

#### ② 完整性检查 `dataState`（AC3）

```jsonc
{
  "expectedCount": 880,        // ← result.totals.expectedCount
  "actualCount": 792,
  "missingCount": 88,          // ← result.totals.missingCount
  "completenessRatio": 0.9,    // 服务端算：actualCount/expectedCount；分母 0 或缺失 → null
  "skippedNoLaunchDate": 2,    // ← result.skippedCount（**不是** skippedNoLaunchDate，057 落地时统一）
  "gapAssets": [ { "symbol": "VBG.TO", "missingCount": 61 } ]   // ← result.gapAssets（057 裁剪口径 OQ-2 待定）
}
```

- `lastRun` 存在但 `lastRun.result` 缺失（**当前 100% 的情况**）→ **全部数值字段 `null`、`gapAssets: []`、`contractReady: false`、`note.code = 'CONTRACT_NOT_READY'`**。
- **禁止**用 `lastRun.status === 'SUCCEEDED'` 推出 `missingCount: 0`（AC3 原文）。
- 兼容性：若 057 落地后 `result` 用的是 `totals` 嵌套，本卡读 `result.totals.*`；若同时并列了顶层 `expectedCount`，优先 `totals`（**一个取值顺序，写死在 service 里**）。

#### ③ 提醒评估 `dataState`（AC4）

```jsonc
{ "evaluated": 12, "created": 3, "archived": 1, "failed": 0 }   // ← result.*；缺失时四个全 null
```
- `created === 0` 是**正常态**，`dataStateLevel` 不因此变黄（AC4）。
- `failed > 0` → `'warn'`；`lastRun.status === 'FAILED'` → `'bad'`。

#### ④ 汇率同步 `dataState`（AC5）

```jsonc
{
  "fxCount": 3,
  "currencies": null   // C-05 前恒 null；057 落地后为 { "USD": { "ok": true, "rateToCny": 7.13 }, ... }
}
```
- `contractReady = currencies !== null`。
- **禁止**用 `fxCount === 3` 反推三币种成功（AC5）。
- 适配器（D-7）：057 若写 `result.rates = {USD:7.13,...}`（OQ-4 方案②），本卡把 `{[k]:number}` 归一为 `{[k]:{ok:true, rateToCny:number}}`；若写 `result.currencies`（方案①），直接透传并补 `rateToCny:null`。**两种都只改一个 20 行内的映射函数**。

#### ⑤ 再平衡分发 `dataState`（AC6）

```jsonc
{
  "due": null,               // 父任务 result.perPortfolio[].due 为 true 的条数；父 result 缺失 → null（**严禁**用子记录反推）
  "totalPortfolios": null,   // 父 result.totalPortfolios
  "skippedCount": null,      // 父 result.skippedCount
  "generatedCount": null,    // perPortfolio 里 suggestionsCount > 0 的条数
  "perPortfolio": [          // 与 ?detail=rebalance 的 rows **同源同构**（D-8）
    {
      "portfolioId": "65f...", "portfolioName": "A股-长钱", "accountType": "tiantian",
      "schedule": "daily",
      "due": null, "needsRebalance": null, "suggestionsCount": null, "recordId": null,
      "runStatus": "FAILED",            // ← 子 taskrun.status（永远可得）
      "failures": [ { "category": "SYMBOL_NOT_FOUND", "message": "..." } ]   // ← 子 taskrun.failures[]（永远可得）
    }
  ],
  "failures": [ { "portfolioId": "65f...", "item": "...", "category": "...", "message": "..." } ]
}
```
- `perPortfolio` 在父 `result` 缺失时**仍然返回**（每项 `due/needsRebalance/suggestionsCount/recordId` 全 `null`，`runStatus/failures` 照常可读）——这是 AC6「`failures` 无论 C-05 是否落地都可得」的落点，也是 C-07 降级黄条下唯一有内容的列。
- `contractReady = 父 result 存在且含 perPortfolio`。
- `note.code = 'CONTRACT_NOT_READY'`（同 ②）。

**`dataStateLevel` 判定表（D-6，冻结）**

| 任务 | `unknown` | `bad` | `warn` | `ok` |
|---|---|---|---|---|
| 价格同步 | `expected===0` 或 `targetMarketDate===null` | `fetched===0 && expected>0`，或 `lastRun.status==='FAILED'` | `0<fetched<expected`，或 `status==='PARTIAL'` | `fetched>=expected>0` |
| 完整性 | `contractReady===false` | `status==='FAILED'` | `missingCount>0` 或 `PARTIAL` | `missingCount===0` |
| 提醒 | `contractReady===false` | `status==='FAILED'` | `failed>0` 或 `PARTIAL` | 其余（含 `created===0`） |
| 汇率 | `currencies===null` | `status==='FAILED'`，或三币全缺 | 部分币种 `ok=false`，或 `PARTIAL` | 全部 `ok` |
| 再平衡 | `contractReady===false` | `due>0 && generatedCount<due`，或 `status==='FAILED'` | `failures.length>0` 或 `PARTIAL` | `due===0` 且无失败 |

> 运行态与数据态取**更差**者（FS §3：「`status` 仅作为辅助信号，用于解释为什么数据态没达标」）。
> 若 Human 否决 D-6，删掉 `dataStateLevel` 字段即可，**不影响任何其他字段**；颜色规则则下放给 C-04/C-03。

### 4.5 `?detail=rebalance`（AC8）

```
GET /api/cron/status?detail=rebalance&date=2026-10-26&portfolioId=65f...
→ { success: true, data: {
      date, contractReady, generatedAt,
      summary: { totalPortfolios, due, generated, failed, skipped },   // 缺契约时后四项 null
      rows: [ <与 4.4⑤ 的 perPortfolio 完全同构> ],
      note: { code, message } | null
    } }
```

| 参数 | 规则 |
|---|---|
| `detail` | 缺省 = 主视图；`rebalance` = 详情；**其他非空值 → 400** `detail must be rebalance`（D-14：宁可显式报错，不静默忽略） |
| `date` | 缺省 = 父任务最近一次分发日；无父任务 → `marketDate(now, tz)`。校验走「正则 + 回环」，非法 → **400**（沿用 `log.controller.js:28-33`） |
| `portfolioId` | `mongoose.isValidObjectId` 失败 → **200 + `rows: []` + `note.code='PORTFOLIO_ID_INVALID'`**；合法但库里没有 → `note.code='PORTFOLIO_NOT_FOUND'`；合法且已归档 → `note.code='PORTFOLIO_ARCHIVED'`（仍返回该行，`archived: true`）。**一律不 500**（AC8） |

取值方式（F-6）：

```js
// 父：指定日期的 rebalance-check（$or startedAt ∈ dateBounds(date)）
// 子：taskName $in ['rebalance-suggestions:<pid>' ...]，startedAt ∈ dateBounds(date)，按 startedAt desc 取每组首条
// Portfolio 名/accountType/schedule：一次 find 全量，JS 内 join
```

`note.code` 全集（前端据此写文案，**不得**靠字符串匹配 message）：

`CONTRACT_NOT_READY` · `NO_TASK_RUN` · `NO_OPEN_DAY` · `EXPECTED_ZERO` · `PORTFOLIO_ID_INVALID` · `PORTFOLIO_NOT_FOUND` · `PORTFOLIO_ARCHIVED` · `UNSUPPORTED_MARKET`

### 4.6 常量文件（AC7 的「配置常量」，D-4）

`shared/constants/cronStatus.constants.js`（新建；若 057 已建同名/同类文件则**复用并只补缺失项**）：

```js
// 5 个落库任务名（顺序即对外 tasks[] 顺序）
const CRON_TASK_NAMES = Object.freeze([
  'daily-price-sync', 'price-integrity-check', 'alert-evaluate', 'fx-rate-sync', 'rebalance-check'
]);
// 逐任务周期（小时）。当前 5 个 cron 全为「每天一次」，故全 24；
// 结构上支持逐任务不同值（再平衡日分发同为 daily），避免将来改周期时改逻辑。
const TASK_PERIOD_HOURS = Object.freeze({ 'daily-price-sync':24, 'price-integrity-check':24, 'alert-evaluate':24, 'fx-rate-sync':24, 'rebalance-check':24 });
const STALE_FACTOR = 2;                                  // AC7「2 × 周期」
const PRICE_TARGET_MAX_LOOKBACK_DAYS = 15;               // 上一开市日回退上限（CN 春节/国庆 ≤ 9 天）
const REBALANCE_CHILD_PREFIX = 'rebalance-suggestions:';
function staleThresholdHours(taskName) { return (TASK_PERIOD_HOURS[taskName] ?? 24) * STALE_FACTOR; }
```

- 阈值**不写进 controller**（AC7 原文）；controller 只 `require` 常量。
- 实测佐证：`priceScheduler` `0 3 * * *`、`healthScheduler` `30 3 * * *`、`alertScheduler` `0 4 * * *`、`fxScheduler` `30 9 * * *`、`rebalanceScheduler` `0 0 * * *` → **全部每日一次**，`2×24=48h` 对 5 个任务同时成立。
- 首日即有真实命中：那条 62 天的 `RUNNING`（§3.6）会立刻被判 `stale`。

### 4.7 空态与降级（AC9 / AC3 / AC5 / AC6）

| 场景 | 表现 | 禁止 |
|---|---|---|
| `taskruns` 整集合为空 | 5 项 `lastRun: null`、`contractReady: false`；**价格同步仍给真实 `expected/fetched`**（它不依赖 taskruns）；其余 4 项数值全 `null`；HTTP **200** | 返回任何 `SUCCEEDED`；把 `null` 当 `0` |
| `result` 缺失（当前常态） | 4 项 `contractReady:false` + `note.code='CONTRACT_NOT_READY'` | 用 `status` 冒充完成度 |
| 父任务 `rebalance-check` 缺失 | `due/totalPortfolios/skippedCount/generatedCount = null`；`perPortfolio` 仍返（字段 null，`runStatus/failures` 可读） | 用「有无子记录」反推 `due`；把「无记录」渲染成「未到期」 |
| 某日无分发记录（detail） | `rows: []` + `note.code='NO_TASK_RUN'` + `date` 回显 | 返回 `summary` 全 0 冒充「全部正常」 |
| 某市场连续长假超回退上限 | 该市场 `targetMarketDate: null`，计入 `note.code='NO_OPEN_DAY'` | 回退到今天 / 编一个日期 |
| `asset.market` 非法（enum 外的历史脏数据） | 该资产进 `unsupportedMarkets[]`，不影响其余 | 整页 500 |

### 4.8 关键决策（Planner 已裁定，Human 可在 Plan Review 推翻）

| ID | 决策 | 理由 | 若被推翻的影响 |
|---|---|---|---|
| **D-1** | **OQ-1 → 方案 A：对外用实现真名**（`actualCount/missingCount/skippedCount`、`created`），不做 `{ok,gap,alertsFired}` 翻译 | 任务卡 AC3/AC4 **已经**按真名写死，方案 A 与 AC 一致，不是 Planner 擅改需求；FS §4.3 的旧名需由 PM 回改（记 §9 T-2） | 若选 B，需在 controller 加一层翻译，且前端与后台数据源各用一套词 |
| **D-2** | 价格 `expected` **排除 `launchDate > 目标日` 的资产**，并单独返回 `notListed[]` | AC2 字面是「该日开市且 active 的资产数」，但未成立/未上市的资产**不可能有价**，计入即永远黄灯 —— 正是 FS 明令禁止的「看板撒谎」。与 `integrityCheck` 的 `SKIPPED_NO_LAUNCH_DATE` 语义对齐 | 若要求严格按字面，删掉排除逻辑即可；但 `launchDate` 非空的资产会长期挂在 `missing` 里 |
| **D-3** | **OQ-2 → 方案 ①「取最晚开市日」**，同时返回 `byMarket` 明细 | PM 建议 ①（最严格要求）；`byMarket` 让「最晚」可被复核，不必信任服务端。FS 需补一句口径（登记 §9 T-2） | 若选 ③（按市场分行），`byMarket` 已备好，前端改渲染即可，接口不用改 |
| **D-4** | **OQ-3 → 阈值常量表按任务配置**，当前 5 项全 `24h × STALE_FACTOR(2) = 48h`；文件单一归属 `shared/constants/cronStatus.constants.js`，与 057 **谁先落地谁建** | 5 个 cron 实测全为每日一次，无需差异化；但结构上支持逐任务，避免将来改周期时二次重构。与 057 的 OQ-5 是同一问题，一次裁完 | 若要求每任务不同值，只改常量表，逻辑零改动 |
| **D-5** | 顶层用 `tasks[]` **数组**（固定 5 项、固定顺序），不用 `{priceSync:..., integrity:...}` 对象 | AC1 原文「返回 5 个任务条目」；数组天然适合卡网格 `map`，顺序即视觉顺序 | 改对象只需前端换取值方式 |
| **D-6** | 每个任务返回 `dataStateLevel`（`ok/warn/bad/unknown`），规则见 §4.4 表 | FS R2 验收要求「前端据此渲染，**不依赖前端重算**」；若不返回，5 张卡（`TASK-053`/`055`/`056`/C-07）会各自重推颜色，必然漂移 | 删字段即可；颜色规则下放给 C-03/C-04 |
| **D-7** | 汇率走**适配器**：优先 `result.currencies`，退回 `result.rates` | 057 的 OQ-4 未决（成功标志 vs 实际数值），本卡不能等它；适配器让两种形态都能读，057 定稿后只改一处 | 若 057 定死形态，删掉一条分支 |
| **D-8** | `?detail=rebalance` 与主视图**共用同一 row builder**；子任务按 `startedAt ∈ dateBounds(date)` 取，**不按 runKey 匹配日期** | 两处只实现一次，杜绝 C-07 时出现第二套「到期/生成」口径；`runKey` 的 `periodKey` 对 weekly/monthly 语义不同（F-6），不能当日期键 | 若要求 detail 独立实现，重复代码 + 漂移风险 |
| **D-9** | 派生逻辑落 `shared/services/cronStatus.service.js`，controller 仅做参数校验与响应封装 | 见 §4.1；且只有这样才能单测注入 `now` | 若塞进 controller，AC12 的单元测试退化为 HTTP 测试 |
| **D-10** | AC13 之外**追加** 4 处文档：`ARCHITECTURE.md:136`、`PRODUCT_LINES.md:170`、`SERVER.md:64`、`docs/readme.md`（活跃计划索引） | F-7/F-8：本卡落地后前两处成为**假话**（明文宣称「没有这类端点」），第三处描述的消费方是错的。文档不得留假事实 | 若只改 AC13 的两处，架构文档会与实现矛盾（Reviewer 必拦） |
| **D-11** | 遍历 market 时 `try/catch`，非法 market 落 `unsupportedMarkets[]` | `isMarketOpenToday` 对未知 market **throw**（`calendar.service.js:149`），历史脏数据会 500 | 不加护栏则违反 AC8「不 500」的精神（虽 AC8 只提参数） |
| **D-12** | 候选日用 **`T12:00:00Z`** 构造后再交给 `isMarketOpenToday` | 该函数把 Date 按市场本地时区格式化（F-3）；`T12:00:00Z` 对 UTC-4 ~ UTC+8 都落在同一天 | 用 `T00:00:00Z` 会让 CN/HK 落到次日，交易日判定错一天 |
| **D-13** | 不用 `getActiveAssets()`，改 `Asset.find({active:true}).select('symbol name market launchDate').lean()` | `getActiveAssets` 返回全字段文档（含 targets/tags 等），5 张卡只需 4 个字段 | 用它也能跑，只是多传无用字段 |
| **D-14** | `detail` 非空且 ≠ `rebalance` → 400 | 静默忽略非法参数会让前端以为"过滤生效了" | 改为忽略亦可 |
| **D-15** | **不改** `server/middleware/*`、`app.js` 的 CORS/bodyParser/traceId 顺序；只在 `:49` 后插一行 `app.use('/api/cron', cronStatusRoutes)` | 保持 9 → 10 条路由的**增量**改动，零副作用 | — |

> D-2 与 D-6 是对 AC 措辞的**细化/增补**，按 AGENTS.md §5「不得静默修改 Human Intent」，在此显式提请确认。

### 4.9 明确不改

- `shared/models/taskRun.js`、`shared/services/taskRunner.js`（057）
- `cron-worker/**`（NG2）
- `server/controllers/log.controller.js`、`server/routes/logs.routes.js`
- `client/**`（053/055/056/C-07）
- `docs/dev/CRON_WORKER_DEV.md §5`（057 的 AC11）
- `docs/dev/DATA_MODEL.md`（本卡无 schema 变更）

---

## 5. Work Breakdown

> 顺序即依赖顺序。W1 完成前不得动 W3+（常量是 W3 的地基）。

- [ ] **W0 分支准备**：`git checkout main && git pull`，确认 `main` 含 `cafcc5d`；`git checkout -b feature/TASK-054-cron-status-aggregate-api`。
      先跑 `grep -rn "STALE_FACTOR\|STALE_THRESHOLD\|cronStatus" shared/ server/` 确认无既有实现（防与 057 撞车）。
- [ ] **W1 常量**：新建 `shared/constants/cronStatus.constants.js`（§4.6）。
- [ ] **W2 服务层骨架**：新建 `shared/services/cronStatus.service.js`，先只导出 `buildLastRuns(now)`（Q1）+ `pickLastOpenDay(market, now, tz)`（纯函数）+ `resolveStale(lastRun, now)`。
- [ ] **W3 单元测试（先红）**：新建 `server/test/integration/cronStatus.service.test.js`，写入 AC2/AC7/AC9 用例并**确认全部失败**（此时 service 尚无完整实现）。红的具体形态见 §7.2。
- [ ] **W4 价格数据态**：`buildPriceDataState(now)`——逐市场回退 → expected/fetched/missing/byMarket/notListed → `dayPriceSymbolCount`（Q2/Q3/Q6）。
- [ ] **W5 另四项数据态 + 降级**：`buildIntegrity/Alerts/Fx/Rebalance`，含 `contractReady` / `note` / `dataStateLevel`（§4.4）。
- [ ] **W6 再平衡 row builder**：`buildRebalanceRows({date, portfolioId})`（Q4/Q5），供主视图与 detail 共用。
- [ ] **W7 对外编排**：`getStatus({now, detail, date, portfolioId})` 返回 §4.3 / §4.5 的完整结构；参数校验逻辑以「抛 `error.status=400`」的形式留在 controller（与 `log.controller.js` 一致），service 只接收已校验参数。
- [ ] **W8 控制器 + 路由 + 注册**：`controllers/cronStatus.controller.js`（`getStatus`）、`routes/cronStatus.routes.js`（`router.get('/', ...)`）、`app.js` 插 1 行（D-15）。
- [ ] **W9 集成测试**：`server/test/integration/cronStatus.api.test.js`（AC1 全字段、AC8 参数校验）。
- [ ] **W10 回归**：`npm run test:server`（基线 **152** 条全绿，见 §8 R-6）、`npm run test:worker`（**77** 条，应零变化）、`node --check` 新增文件。
- [ ] **W11 文档**：`API_CONTRACT.md` 接口清单加 1 行；`SERVER.md` §5 加 1 行 + 修 `:64` 的 `SCHEDULER_TIMEZONE` 描述；`ARCHITECTURE.md:136` + `PRODUCT_LINES.md:170` 约束措辞改写；`docs/readme.md` 活跃计划索引。
- [ ] **W12 真实库只读探测**（§7.4）：拿到 `fetched/expected` 真实比例与 symbol 写法核对结论，写进本计划 §11。
- [ ] **W13 交接 Reviewer**：按 §10 逐项自检，附 §7 全部实测输出。

---

## 6. 与 `TASK-057`（C-05）的先后顺序

| 顺序 | 后果 | 判断 |
|---|---|---|
| **057 → 054**（PM 推荐） | 054 上线即有完整数据态，`contractReady` 全 `true` | 最优，但会推迟看板 |
| **054 → 057**（本计划假定） | 054 首日：价格卡有真实数字；其余 4 卡 `contractReady=false` + 黄条「数据契约未就绪」。057 落地后**同一个接口自动填满**，054 零改动（除 D-7 适配器如需微调） | **可行**，且这是 AC3/AC5/AC6 明文设计的降级路径 |

**结论：054 不等 057，但不得在 057 落地前宣称「数据态完成」。** 两条铁律：

1. 057 冻结的 `result` 键名与 054 的读取键必须一致；不一致时**改 054 的映射，不改 057 的写入**（读侧适配写侧，避免动数据）。
2. 任一卡都**不得**为了「让数字好看」去改 `integrityCheck.js` / `alertEngine.service.js` 的业务输出。

---

## 7. Verification

### 7.1 静态检查（AC10 / AC11 / 结构）

```bash
# ① 只读：controller 与 service 都不得出现写调用（AC10 原文 + service 加强）
grep -rn "TaskRun.create\|TaskRun.updateOne\|TaskRun.deleteOne\|insertMany\|bulkWrite\|\$set" \
  server/controllers/cronStatus.controller.js shared/services/cronStatus.service.js   # 期望 0 行

# ② 路由注册恰好 1 行，且路由总数 9 → 10
grep -c "app.use('/api/" server/app.js            # 期望 10
grep -n "app.use('/api/cron'" server/app.js       # 期望 1 行

# ③ cron-worker 零改动（AC11）
git diff --stat main -- cron-worker/              # 期望空

# ④ 阈值常量不在 controller（AC7 原文）：不得出现 48 / 2 * 24 之类的字面量
grep -n "48\|STALE_FACTOR\|TASK_PERIOD_HOURS" server/controllers/cronStatus.controller.js   # 期望 0 行
grep -n "cronStatus.constants" server/controllers/cronStatus.controller.js                  # 期望 1 行（仅 require 常量模块，由 service 消费亦可为 0）

# ⑤ 未新增第二个端点（AC8 / FS §10）
grep -rn "router\.\(get\|post\|put\|delete\)" server/routes/cronStatus.routes.js  # 期望恰好 1 行 get('/')

# ⑥ 共享内核分层约束
grep -rn "require('\.\./\.\./server\|require('\.\./\.\./cron-worker" shared/services/cronStatus.service.js  # 期望 0 行
```

### 7.2 单元测试（AC12，**先红后绿**）

`server/test/integration/cronStatus.service.test.js`——猴补模型静态方法（`TaskRun.aggregate` / `Asset.find` / `Price.find` / `Portfolio.find`），`afterEach` 还原。

| # | 用例 | 断言（必须能失败） | 红的具体形态 |
|---|---|---|---|
| U1 | **AC2 上一开市日**：`now = 2026-10-25T12:00:00Z`（周日）；US 资产 2 个，`prices` 只在 `2026-10-24/25`（周六、周日）有记录 | `targetMarketDate === '2026-10-23'`（周五）；**且** `fetched === 0`（周末那两条价不算） | 先把 `pickLastOpenDay` 写成返回 `todayString()` → 得到 `'2026-10-24'` → 断言失败；改为逐日回退后通过 |
| U2 | **AC2 节假日回退**：`market='CN-SH'`，`now` 落在国庆长假区间 | `targetMarketDate` 早于长假首日，且 `expected > 0` | 只回退 1 天（不做循环）→ 失败 |
| U3 | **AC2 `expected=0`**：`active` 资产为空 | `expected === 0`、`fetched === 0`、`missing: []`、`dataStateLevel === 'unknown'`（**不得**是 `'ok'`） | 把 `fetched>=expected` 判成 ok → 失败（0/0 不是"齐了"） |
| U4 | **AC2 多市场取最晚**（D-3）：US 目标日 `10-23`、CN 目标日 `10-20` | 顶层 `targetMarketDate === '2026-10-23'`；`byMarket.US.targetMarketDate==='2026-10-23'`、`byMarket['CN-SH'].targetMarketDate==='2026-10-20'` | 取 `Math.min` → 失败 |
| U5 | **AC7 僵尸**：`status='RUNNING'`、`startedAt = now - 3d` | `stale===true`、`lastRun.status==='STALE'`、`lastRun.rawStatus==='RUNNING'` | 不判 stale → `status==='RUNNING'` 时失败 |
| U6 | **AC7 负向对照**：`status='RUNNING'`、`startedAt = now - 1h` | `stale===false`、`lastRun.status==='RUNNING'` | 判据写成 `status==='RUNNING'` 就 stale → 失败 |
| U7 | **AC9 空态**：三个集合全空 | 5 项 `lastRun===null`、`contractReady===false`；`JSON.stringify(data)` **不含 `'SUCCEEDED'`**；价格项 `expected===0` | 任何"没记录就当成功"的兜底 → 失败 |
| U8 | **AC3 不得用 status 冒充**：`lastRun.status='SUCCEEDED'` 但无 `result` | `missingCount===null`（**不是 0**）、`contractReady===false` | 把 `missingCount` 默认成 0 → 失败 |
| U9 | **AC6 不得反推 due**：父任务无记录、4 条子任务记录全 `SUCCEEDED` | `due===null`（**不是 0**，也不是 4） | 用子记录数当 due → 失败 |
| U10 | **AC5 不得用 fxCount 反推币种**：`fxCount=3`、无 `result` | `currencies===null`、`contractReady===false` | 编造 `{USD:ok,CAD:ok,HKD:ok}` → 失败 |

### 7.3 集成测试（AC1 / AC8）

`server/test/integration/cronStatus.api.test.js`——`app.listen(0)` + `fetch`，猴补模型静态方法。

| # | 用例 | 断言 |
|---|---|---|
| A1 | AC1 全字段 | 200；`body.success===true`；`data.tasks.length===5`；`taskName` 顺序与 §4.3 表一致；每项含 `lastRun/stale/contractReady/dataState/dataStateLevel`；`data.generatedAt` 可被 `Date.parse` |
| A2 | AC1 有记录时 | `lastRun` 含 `runKey/trigger/status/rawStatus/startedAt/endedAt/durationMs/totalCount/successCount/failureCount` |
| A3 | AC8 `date` 非法 | `?detail=rebalance&date=2026-13-40` → 400；`?detail=rebalance&date=../../etc` → 400；`body.success===false`、`body.traceId` 存在 |
| A4 | AC8 `portfolioId` 非法 | `?detail=rebalance&portfolioId=not-an-id` → **200**、`data.rows:[]`、`data.note.code==='PORTFOLIO_ID_INVALID'` |
| A5 | AC8 `portfolioId` 不存在 | 合法 ObjectId 但库里无 → 200、`rows:[]`、`note.code==='PORTFOLIO_NOT_FOUND'` |
| A6 | AC8 detail 正常 | 返回 `summary` 五项 + `rows[]`，且 `rows[0]` 字段集与主视图 `dataState.perPortfolio[0]` **一致**（D-8 同构性断言） |
| A7 | AC9 空态 HTTP 层 | 全空集合 → 200，`body.data` 不含任何 `SUCCEEDED` |
| A8 | detail 非 rebalance | `?detail=foo` → 400 |

### 7.4 真实库只读探测（R-2 / U-1，**Implementer 执行**）

> 现状：Planner 无法执行（`portomind_dev` 需认证，凭据在 `server/.env`，未读取）。这是本计划唯一未闭环的证据项。

```bash
# 只读；URI 取 server/.env 的 MONGO_URI（替换 <DB> 为 portomind_dev）
node -e '
const m=require("mongoose");
(async()=>{
 await m.connect(process.env.MONGO_URI);
 const db=m.connection.db;
 const assets=await db.collection("assets").find({active:true}).project({symbol:1,market:1,launchDate:1}).toArray();
 console.log("active assets =",assets.length,"| null launchDate =",assets.filter(a=>!a.launchDate).length);
 console.log("by market =",assets.reduce((o,a)=>(o[a.market]=(o[a.market]||0)+1,o),{}));
 const days=await db.collection("prices").aggregate([{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$timestamp",timezone:"America/Toronto"}},n:{$sum:1}}},{$sort:{_id:-1}},{$limit:5}]).toArray();
 console.log("最近 5 个有价日 =",days);
 const syms=assets.map(a=>a.symbol);
 const latest=days[0]._id;
 const got=await db.collection("prices").distinct("symbol",{symbol:{$in:syms},timestamp:{$gte:new Date(latest+"T04:00:00Z"),$lt:new Date(new Date(latest+"T04:00:00Z").getTime()+864e5)}});
 console.log("目标日",latest,"| expected =",syms.length,"| fetched =",got.length);
 console.log("missing 样例 =",syms.filter(s=>!got.includes(s)).slice(0,10));
 await m.disconnect();
})();'
```

要记录到 §11 的四个数：**active 资产数 / 最近有价日 / expected / fetched**，以及 `missing` 里是否出现「库里有价但 symbol 写法不同」的假缺口。

### 7.5 回归

```bash
npm run test:server     # 基线 152 条（2026-10-26 main 实测）+ 新增 ≥18 条
npm run test:worker     # 基线 77 条，期望零变化
node --check shared/services/cronStatus.service.js
node --check shared/constants/cronStatus.constants.js
node --check server/controllers/cronStatus.controller.js
node --check server/routes/cronStatus.routes.js
```

> 不接受「build/lint 通过」当交付依据（TASK-043 教训）；必须附测试条数与失败数为 0 的实际输出。

### 7.6 AC 覆盖矩阵

| AC | 覆盖手段 |
|---|---|
| AC1 | A1 / A2 |
| AC2 | U1–U4 + §7.4 实测 |
| AC3 | U8 |
| AC4 | U-V1（`created=0` → level 不降级，并入 U7 同文件） |
| AC5 | U10 |
| AC6 | U9 + A6 |
| AC7 | U5 / U6 |
| AC8 | A3–A6 / A8 |
| AC9 | U7 / A7 |
| AC10 | §7.1 ①（controller + service 双查） |
| AC11 | §7.1 ③ |
| AC12 | §7.2 + §7.3 全部执行输出 |
| AC13 | §7.1 之外的人工核对：4 份文档改动 + `grep -rn "cron/status" docs/` 命中 4 处 |
| AC14 | 独立 Reviewer 按 §10 复核 |

---

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| **R-1** | **「上一开市日」缺生产数据背书**：本次规划无法只读查库（认证被拦），U1–U4 只是构造数据；若真实库的 `prices.timestamp` 写入时刻与 `dateBounds` 口径不一致，`fetched` 可能系统性偏低 | §7.4 上线前必跑；先看「最近 5 个有价日」分布再判。**若 fetched 异常低，先查 symbol 写法与 timestamp 口径，不要先改算法** |
| **R-2** | **symbol 写法不一致伪造缺口**（P0 历史缺陷）：`transactions/targets` 用 `000191.cn`，`assets/prices` 用 `000191` | `expected` 一律**从 `asset.symbol` 出发**去找 `Price`，**不得**从 `Price` 反向聚合；`dayPriceSymbolCount` 提供「库里有价但一个都对不上」的诊断信号 |
| **R-3** | **全市场同时停更时全红**：`missing` = 全部，卡片全红。这其实是**正确**的（真实故障） | `fetched=0` 时靠 `dayPriceSymbolCount` 区分「源整体故障」与「symbol 对不上」，文案由 C-03 负责；本卡只保证信号可区分 |
| **R-4** | **用 `status` 当完成度**（最省事的偷懒实现） | U8/U9/U10 三条负向断言专门打这个；Reviewer 见「只返回 status 的实现」直接 BLOCKER |
| **R-5** | **N+1 查询**：5 任务 × 140+ 资产 × 逐日回退，容易写成几百次 | §4.2 的查询预算表是硬约束；Reviewer 用 `grep -c "await Price\|await Asset\|await TaskRun"` 粗查循环内查询 |
| **R-6** | **既有 152 条 server 测试被打断**：`api-contract.test.js` 会 `require('../../app')`，新增路由会在该层被加载 | 新路由**不得**在 require 时连接数据库或做同步 IO（只在 handler 内查询）；W10 先跑全量再交付 |
| **R-7** | **与 `TASK-057` 撞车**：两卡都想要「僵尸阈值常量」，可能各建一份 | D-4：单一归属 `cronStatus.constants.js`，先落地者建；W0 先 grep 确认 |
| **R-8** | **文档留假事实**：`ARCHITECTURE.md:136` / `PRODUCT_LINES.md:170` 明文「没有这类端点」 | D-10 列入 In Scope；Reviewer 用 `grep -rn "不暴露调度\|没有这类端点" docs/` → 期望 0 行 |
| **R-9** | **时区错一天**（F-3/D-12）：用 `T00:00:00Z` 构造候选日会让 CN/HK 跨日 | U2（CN 节假日）专门覆盖；实现里统一用 `T12:00:00Z` |
| **R-10** | **`dataStateLevel` 越权**（D-6 是我加的字段，FS 没写） | 已在 §4.8 标注为「可推翻」；若 Human 否决，删字段 + 把规则移交 C-03/C-04 |
| **R-11** | **`?detail` 变成事实上的第二端点**，将来 C-07 再塞更多参数 | 只接受 `detail/date/portfolioId` 三个参数，其余一律忽略；新增参数需回改本计划（FS §10 硬约束） |
| **R-12** | **首日全黄条引发误判**：上线时 4 张卡都是「数据契约未就绪」，用户可能以为接口坏了 | 该状态是**预期**（§3.6：204 条历史 `result` 为 0）。交付说明里必须写明，并告知 057 落地才消失 |

---

## 9. Open Decisions（需 Human / PM 确认）

| ID | 问题 | Planner 裁定 | 需确认的点 |
|---|---|---|---|
| **OD-1** | OQ-1 字段名 | 方案 A（实现真名，D-1） | 是否接受与 FS §4.3 字面不符（`{ok,gap,alertsFired}`） |
| **OD-2** | OQ-2 多市场目标日 | 方案 ①「取最晚」+ `byMarket`（D-3） | 是否要在 FS 里补这句口径（**FS 改动属 PM/Human，Planner 不动**） |
| **OD-3** | OQ-3 僵尸阈值 | 逐任务常量表，当前全 48h（D-4） | 是否现在就给不同任务不同值 |
| **OD-4** | **AC2 的 `expected` 是否排除未成立资产**（D-2） | 排除 + `notListed[]` | **这是对 AC 措辞的细化，须明确批准** |
| **OD-5** | **是否接受服务端返回 `dataStateLevel`**（D-6） | 返回 | 若否，颜色规则下放 C-03/C-04 |
| **OD-6** | 是否同意把 `ARCHITECTURE.md:136` / `PRODUCT_LINES.md:170` 一并改写（D-10） | 必改（否则文档留假事实） | 这是**架构约束措辞的放松**，按 AGENTS.md §6 需 Human 点头 |
| **OD-7** | `TASK-057` 与 `TASK-054` 的落地顺序 | 054 先（降级路径已设计） | 若要求 057 先，本计划的 `contractReady` 分支仍要写（历史数据仍无 `result`），但验收可更严格 |

> 除 OD-4/OD-5/OD-6 这三条**动了 AC 或架构约束措辞**的以外，其余均为实现层裁定，可在 Plan Review 一并过。

---

## 10. Implementer 交接说明

**开工前必读**：本文件 §4.3（字段冻结）、§4.4（逐项算法）、§4.8（15 条决策）、§7（验证）。

**必须遵守**：

1. **只读**：不得在 service/controller 里出现任何写调用。看到僵尸 `RUNNING` 想"顺手修一下"——不许（AC10 / 057 §4）。
2. **不改 `cron-worker/` 与 `shared/models/`**：一行都不许（NG2 / 057 范围）。
3. **不重算业务数据**：价格只查库、不调 fetcher；再平衡只读 `taskruns`、不调 `ThresholdChecker`（NG3）。
4. **`null` ≠ `0`**：`contractReady=false` 时数值字段一律 `null`。任何 `|| 0` 都是缺陷。
5. **日期运算只在 `shared/` 侧**：`server` 没有 dayjs。
6. **候选日用 `T12:00:00Z`**（D-12）。
7. **先红后绿**：W3 必须在 W4/W5 之前写完并看到失败（红的形态见 §7.2「红的具体形态」列），不许回头补测试。
8. **字段名照抄 §4.3**，不许"顺手改名更好听"。

**交付时必须附**：§7.1 五条 grep 的实际输出、§7.2/§7.3 的测试条数与失败数、§7.4 的四个数、§7.5 全量回归输出。缺一项视为未完成（TASK-043 教训：build/lint 通过不能当交付依据）。

**完成后写 §11 Implementation Record**，并在 §7.4 处填真实数字。

---

## 11. Implementation Record

> 由 Implementer 填写。Planner 不预填任何"结果"。

- [ ] W1–W11 完成情况
- [ ] §7.1 输出
- [ ] §7.2 / §7.3 测试条数与失败数
- [ ] §7.4 真实库四个数（active 数 / 最近有价日 / expected / fetched）+ symbol 写法结论
- [ ] 与计划的差异（含任何不得不偏离 §4 的地方及理由）
- [ ] 新发现（未擅自处理，提请 Human / Reviewer 裁决）

---

## 12. Review Record

> 由独立 Reviewer 填写，Implementer 不得自评（AC14）。
> 复核重点：**R-4（不得用 status 冒充完成度）**、R-5（查询预算）、R-8（文档假事实）、AC9 的负向对照是否真的能失败。
