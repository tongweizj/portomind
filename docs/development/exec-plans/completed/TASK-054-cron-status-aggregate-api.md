# TASK-054 — 后端聚合接口 `GET /api/cron/status`（FS C-02）

## Status

Current status:

`Completed`（2026-10-27 归档：两轮独立复核 + 第四轮回归复核全部 PASS，8 条 MINOR 已整改，余 2 条 FX 适配器边界项移交 `TASK-057`；**代码尚未合入 `main`**，合并属 Human 职权，见 §13）

> 实施记录见 §11.3，复核记录见 §12。状态流：`Approved`（2026-10-26 Human Plan Review 通过）→ `Implementing` → `Verifying`（176/0、77/0）→ `Reviewing`（两轮独立复核通过）→ `REVIEWED`（2026-10-27）→ `Completed`（2026-10-27 第四轮回归复核 PASS 后归档）。

Owner:

`Planner`（2026-10-26 起草 → 2026-10-26 依 Human 裁决修订为 Approved）/ `Implementer`（2026-10-26 实施）/ 独立 `Reviewer`（2026-10-26/27 三轮复核 + 2026-10-27 回归复核 §12.5）

Priority:

`High`（P0 Must Have。看板所有数据态数字的唯一来源；没有它，`TASK-053` 只能渲染一片灰灯）

Related task:

[`docs/development/tasks/completed/TASK-054-cron-status-aggregate-api.md`](../../tasks/completed/TASK-054-cron-status-aggregate-api.md)（`COMPLETED`，2026-10-27 归档）

Related spec:

`docs/development/requirements/specs/FS-cron-worker-status-board.md`（R2、§4.3、§4.5.2、§7.2、OQ2）· `docs/development/requirements/specs/FS-cron-worker-status-board-tasks.md`（§C-02）

Related ADR:

`None`（不新增架构决策；`server` 仍不注册 cron，ADR-002 不受影响）。`ARCHITECTURE.md:136` / `PRODUCT_LINES.md:170` 的约束措辞改写已由 Human 批准（OD-6 → D-10），但**不属于** ADR 变更，只纠正与实现矛盾的文档事实。

Branch / Base:

`feature/TASK-054-cron-status-aggregate-api`（**已建，2026-10-26**；顶端 = **`c7389d1`**）/ 基线 = `main` `cafcc5d` + 两份文档基线提交（`97ccfc7`、`1895530`）

> **合并落点（2026-10-27 归档时实测）**：分支 HEAD `c7389d1` **尚未**进入 `main`（`main` = `origin/main` = `1895530`）。归档只搬文档，未做提交与合并。

> **2026-10-26 修订说明（Human Plan Review 后）**：本版相对 2026-10-26 初稿的改动 = ①采纳 OD-4/OD-5/OD-6；②新增并采纳 4 项裁决（D-16 目标日锚点 / D-17 多市场 `expected` 口径 / D-18 `fxCount` 来源 / D-19 AC7 范围）；③修复初稿的 9 处硬伤（M-1~M-9，见 §11.2 修订对照）；④用 2026-10-26 **只读实库探测**（§3.6 / §7.4）关闭原计划唯一的证据缺口，并据实修正 3 条事实（F-2 / F-9 / F-10）。
>
> 分支与文档基线已就绪：`git log --oneline` = `1895530 更新文档` / `97ccfc7 更新文档` / `cafcc5d Merge PR #35`；`ARCHITECTURE.md:136`、`PRODUCT_LINES.md:170`、`SERVER.md:64` 在**已提交的 HEAD 上**逐一复读过，D-10 的编辑目标真实存在。

---

## 1. Intent

### Goal

新增**唯一一个**只读聚合端点 `GET /api/cron/status`，把「5 个定时任务的最近一次运行（运行态）」与「数据到底采齐了没有（数据态）」一次算好返回。前端看板（`TASK-053` / `TASK-055` / C-07）**只渲染，不重算**。

### Why

1. **没有任何 REST 接口暴露 `taskruns`**：`GET /api/logs` 与 `GET /api/logs/tasks` 读的是按日文本日志（`app-{date}.log` / `task-{date}.log`），与 `taskruns` 集合是**两套互不相干的数据源**。
2. **数据态派生指标一处都没有**：价格完成度、完整性缺口、汇率币种、再平衡到期，只在 worker 的 task 返回值里，且大多被 `normalizeCounts()` 丢掉（`TASK-057` 的 C-05 范围）。
3. **"任务跑绿 ≠ 数据到位"**：实库已证实——`daily-price-sync` 在周六/周日 `status=SUCCEEDED` 但 `successCount=0`（整批休市跳过），2026-10-25 的 `price-integrity-check` 同样 `SUCCEEDED`/`successCount=0`（44 个资产全部缺 `launchDate` 被跳过）。若看板只读 `status`，等于把 FS §3 批判的「全绿误导」原样搬到新界面。

### Scope

- 新增 `server/routes/cronStatus.routes.js`（`router.get('/status')`）、`server/controllers/cronStatus.controller.js`
- 新增 `shared/services/cronStatus.service.js`（**派生逻辑的唯一实现**，见 D-9）
- 新增 `shared/constants/cronStatus.constants.js`（任务键、周期、僵尸阈值、回退上限、**同步时点**）
- `server/app.js` 注册 `app.use('/api/cron', cronStatusRoutes)`（路由总数 9 → 10）
- 只读聚合查询：`TaskRun`、`Asset`（`active`）、`Price`、`Portfolio`、`FxRate`（D-18）
- 派生计算：**有效目标日**（D-16）、`fetched/missing`、僵尸 `RUNNING` 判定、5 项数据态、`?detail=rebalance` 逐组合行
- 测试 2 个文件（单元 + HTTP 集成，均落 `server/test/integration/`，见 §3.7）
- 文档 5 处：`docs/handbook/technical/API_CONTRACT.md`、`docs/handbook/ops/SERVER.md`（含 `:64` 的 `SCHEDULER_TIMEZONE` 描述纠正）、`docs/os/architecture/ARCHITECTURE.md:136`、`docs/handbook/product/PRODUCT_LINES.md:170`、`docs/readme.md`（后三处见 §4.8 D-10）

### Out of Scope

| # | 不做 | 依据 |
|---|---|---|
| 1 | **不改** `shared/models/taskRun.js` / `shared/services/taskRunner.js`（加 `result`、`SKIPPED` 是 `TASK-057`/C-05） | 任务卡 §4 |
| 2 | **不改** `cron-worker/` 任何调度或任务代码（补父任务 taskrun 也是 C-05） | NG2 / AC11 |
| 3 | **不改** `/api/logs`、`/api/logs/tasks` 及其 controller | 任务卡 §4 |
| 4 | 不做前端渲染（`TASK-053` / `TASK-055` / C-07） | 任务卡 §4 |
| 5 | 不做历史趋势（C-09，P2）；**不做**多日循环查询 | NG4 |
| 6 | 不做任何写操作 / 手动触发 / 重跑；**不清理**僵尸 `RUNNING` | NG1 / AC10 |
| 7 | **不修**「周五收盘价要等下周一才采集」的采集节奏（改采集属 NG2/NG3）；本卡只把口径改准（D-16） | FS §7.2 / NG2 |
| 8 | 不做 `taskruns` 的 TTL / 归档 | 容量议题另立卡 |
| 9 | **不修**汇率方向（`TASK-051`）；**不修** `launchDate` 缺位（C-10 P2） | 任务卡 §8 |

### Constraints

1. **只读**（AC10）：端点不得写任何集合，含「顺手把僵尸 `RUNNING` 改成 `FAILED`」这种清理动作。
2. **`server` 仍不注册 cron**（ADR-002）：本卡只新增查询端点。
3. **跨包引用必须 `@portomind/shared/...`**；`shared/` 内不得反向 require 进程目录。
4. **响应走既有统一封装**（`server/utils/apiResponse.js` 的 `success` / `failure`）。
5. **降级必须显式**：`contractReady=false` + `null`，**禁止**用 `0` / `false` / `status` 冒充（AC3/AC5/AC6/AC9）。
6. **不新增第二个端点**：`?detail=rebalance` 复用同一路由（AC8 / FS §10 硬约束）。
7. `?date` 非法必须 400（沿用 `log.controller.js:28-33` 的「正则 + 回环校验」写法）；`portfolioId` 非法/不存在必须 200 + 空结果，**不得** 500。
8. **路径必须精确等于 `GET /api/cron/status`**（AC1）：挂载点 `/api/cron` + `router.get('/status')`。**M-1 修复项**：初稿写成 `router.get('/')`，实际只产出 `/api/cron`。
9. **目标日必须按「有效目标日」口径**（D-16），不得直接把「昨天的上一开市日」当分母；周末/休市日/凌晨不得把「尚未到采集时点」的交易日算作缺口。
10. **符号匹配一律精确字符串比对**（`asset.symbol` 与 `Price.symbol`，均为写入时 uppercase），**禁止**做后缀归一/模糊匹配（D-20）。
11. **`dataStateLevel` 只由数据态决定**，运行态 `status` 不得参与配色计算（OD-5 批准条件）。

### Acceptance Criteria

> 逐条来自任务卡 §3（AC1–AC14）；**AC2 / AC5 / AC6 / AC7 / AC12 的措辞已随 OD-4/5/6 与 D-16~D-19 于 2026-10-26 经 Human 批准细化**，任务卡同日同步。字段名冻结见 §4.3。

| # | 验收标准 |
|---|---|
| AC1 | 新增 `GET /api/cron/status`，走既有响应封装（`success()`），返回 5 个任务条目，每个条目同时含 **运行态**（`lastRun`: `status/startedAt/endedAt/durationMs/runKey/trigger`，无记录为 `null`）与 **数据态**（按任务而异，见 AC2–AC6），并含 `stale/contractReady/dataStateLevel/notes[]`。 |
| AC2 | **价格同步**：返回 `{targetMarketDate, calendarPrevOpenDay, expected, fetched, missing[], byMarket, notListed[], unsupportedMarkets[]}`。`targetMarketDate` = **有效目标日**（D-16）：该市场最近一个「同步时点已过且开市」的交易日**之前**的最近开市日——**周末/休市日/当日 03:00 前不把尚未到采集时点的交易日计入**，`calendarPrevOpenDay` 同时返回日历口径「上一开市日」，两者不同时给 `TARGET_LAGGED` 说明。每个市场的 `expected` = 该市场目标日开市且 `active` 的资产数（排除 `launchDate > 目标日`，进 `notListed[]`）；顶层 `expected/fetched` = 各市场之和，顶层 `targetMarketDate` = 各市场目标日**最晚**者（D-3），`byMarket` 保留逐市场口径。`fetched` = 上述资产中存在 `Price(symbol, canonicalDayTimestamp(该市场目标日))` 的数量；`missing[]` 逐项含 `symbol / name / market`。 |
| AC3 | **完整性检查**：返回 `{expectedCount, actualCount, missingCount, completenessRatio, skippedNoLaunchDate, gapAssets[]}`，数值来自 `taskruns` 里该次运行的 `result`（`C-05` 落地前为 `null`，**不得**用 `status` 冒充）；`gapAssets[]` 至少含 `symbol / missingCount`。键名读取顺序见 D-21（`result.totals.*` → 顶层同名 → `{ok,gap}` 兼容）。 |
| AC4 | **提醒评估**：返回 `{evaluated, created, archived, failed}`（`created` 即"命中并新建的提醒数"，**不得**命名为 `alertsFired` 后又偷偷填别的值；`alertsFired` 仅在 `result` 只提供旧名时作为 `created` 回退）；`created=0` 属正常态，**不得**映射成失败。 |
| AC5 | **汇率同步**：`C-05` 落地前返回 `{fxCount, currencies: null}` 并标记 `contractReady=false`；`fxCount` = **只读** `FxRate` 最新汇率日的币种记录数（D-18），**不得**根据 `fxCount=3` 反推"USD/CAD/HKD 全成功"。C-05 落地后 `currencies` 取 `result`，`fxCount` 优先取 `result`、缺失时回退 `FxRate` 计数。 |
| AC6 | **再平衡分发**：`due` 只来自父任务 `rebalance-check` 的 `result.perPortfolio[].due`；父任务 `result` 缺失（`C-05` 未落地）时该字段返回 `null` + `contractReady=false`，**严禁**用"是否存在逐组合 taskrun"反推 `due`。`failures[]` 的 `category/message` **无论 `C-05` 是否落地都可得**，必须原样透出。`perPortfolio[]` 所属的分发日必须显式返回（`dataState.perPortfolioDate`，主视图取**最近一次有子记录的分发日**，见 §4.4⑤）。 |
| AC7 | **僵尸 RUNNING 判定**：仅对**每个任务最新一条** `taskrun` 判定；`status=RUNNING` 且 `startedAt` 早于「2 × 该任务周期」→ `stale=true`、对外 `status='STALE'`、`rawStatus='RUNNING'`，阈值取**配置常量**（不硬编码在 controller 里）。**历史（非最新）`RUNNING` 记录不由本端点暴露**（D-19）。 |
| AC8 | `?detail=rebalance&date=&portfolioId=` 返回逐组合明细（复用**同一**端点，**不新增第二个端点**）；`date` 非法（非 `YYYY-MM-DD`）→ 400；`portfolioId` 非法或不存在 → 空结果 + 明确提示，**不 500**；`detail` 非空且 ≠ `rebalance` → 400。 |
| AC9 | **空态不撒谎**：无任何 `taskrun` → 返回 `null`/空数组的明确空态，HTTP 200，**不返回伪造的成功态**（负向对照：`taskruns` 集合为空时断言返回 JSON 里不出现任何 `SUCCEEDED`；用猴补模型静态方法模拟空集合与"物理删空"等价）。 |
| AC10 | **只读**：本端点不写任何集合（含 `taskruns` 的 `RUNNING` 清理）；实现中无 `create/update/delete` 调用。`grep -rn "TaskRun.create\|updateOne\|deleteOne" server/controllers/cronStatus.controller.js shared/services/cronStatus.service.js` → 0 行。 |
| AC11 | **不改调度语义**（NG2/NG3）：`cron-worker/` 的 cron 表达式、`runKey`、防重逻辑零改动；本卡**不重算**价格/汇率/再平衡（只用既有集合做聚合查询）。 |
| AC12 | **测试**：单元测试覆盖 AC2（含节假日回退、**周末/未到采集时点的有效目标日回退**、`expected=0`、多市场按各自目标日统计）、AC4（`created=0` 不降级）、AC7（只判最新 + 非最新 `RUNNING` 不被误判）、AC9；集成测试覆盖 AC1 全字段 + AC8 参数校验（若 `TASK-058` 先落地，测试须走会话 stub、保留真实闸门）。**先红后绿**：AC2 的"有效目标日"用例必须先给出会失败的断言（构造一个周末/长假场景，断言不会把尚未采集的交易日算成缺口）。 |
| AC13 | 文档同步：`docs/handbook/technical/API_CONTRACT.md` 的「接口清单」新增本端点；`docs/handbook/ops/SERVER.md` 的手动 API 端点段落补一条（只读聚合，**不可**用于触发任务）；另按 D-10 改写 `ARCHITECTURE.md:136`、`PRODUCT_LINES.md:170`（含 `SERVER.md:64` 的 `SCHEDULER_TIMEZONE` 描述纠正）与 `docs/readme.md` 状态。 |
| AC14 | 独立 Reviewer 复核通过；Implementer 不得自判。 |

---

## 2. Context

### 2.1 相关文档

- 需求与算法定义：`docs/development/requirements/specs/FS-cron-worker-status-board.md` §3（运行态 vs 数据态）、§4.3（5 任务完成度算法）、§4.5.2（详情页列定义）、§7.2（数据契约缺口 D1–D6）、§9（OQ2/OQ3 已决）
- 卡片验收：`docs/development/requirements/specs/FS-cron-worker-status-board-tasks.md` §C-02
- TaskRun 契约：`docs/handbook/technical/CRON_WORKER_DEV.md §5`（**注意 §5.1 只有 5 类，不含父任务 `rebalance-check`**；`§5.3` 还错写了 `SKIPPED` 四态——那是 `TASK-057` 的 AC11 要改的文档）
- 架构边界：`docs/os/architecture/ARCHITECTURE.md` §模块边界（`:136` 禁止表）、`ADR-002-single-scheduler.md`
- 响应契约：`docs/handbook/technical/API_CONTRACT.md` §通用响应 / §接口清单
- 数据模型：`docs/handbook/technical/DATA_MODEL.md`（`:318` 建议聚合带时间范围；TaskRun 无 TTL）

### 2.2 上下游

| 关系 | 任务 | 说明 |
|---|---|---|
| 被消费 | `TASK-053`（C-01，前端 tab 骨架） | 只消费本卡；接口未就绪时渲染灰灯。053 **可先行** |
| 被消费 | `TASK-055`（C-03，价格完成度展示） | `expected/fetched/missing` 由本卡算好，055 **只渲染**，禁止前端二次计算；055 AC7 要求「配色不得读 `lastRun.status`」→ 与 OD-5 的批准条件一致（level 只看数据态） |
| 被消费 | C-07（未立项，`/logs/rebalance` 详情页） | 复用 `?detail=rebalance`，**不得另开端点**；`rows[]` 字段集与本卡主视图同构 |
| 前置（非阻塞） | `TASK-057`（C-05，数据契约） | 本卡按「字段缺失 → `null` + `contractReady=false`」降级，**不等它**；它落地后同一接口自动填满（读取顺序见 D-21） |
| **发布互锁** | `TASK-058`（认证内核，APPROVED） | 058 会插入 `app.use('/api', requireAuth)` + CORS 白名单。若 058 先合入，`/api/cron/status` 将要求登录（**符合产品预期**），但本卡集成测试必须改为会话 stub/登录助手；`app.use('/api/')` 计数断言也要放宽（见 §7.1 / M-7） |
| 无关但需错峰 | `TASK-051`（汇率方向反了） | 实库已证实：最新 `FxRate`（2026-10-22）USD `0.149493` / CAD `0.210155` / HKD `1.173012`——方向反了。C-05 接通后看板会直接显示异常值。**建议 051 先于本卡上线**；本卡不修 |
| 无关但需错峰 | `TASK-052`（docs 治理） | AC13 的文档改动与其 `docs:check` 校验环可能交集；本卡文档基线已在 `97ccfc7`/`1895530` 提交 |

### 2.3 职责边界（写死，防两卡打架）

| 侧 | 任务 | 内容 |
|---|---|---|
| **读侧** | 本卡（054） | 有效目标日、stale 判定、`contractReady` 降级、聚合查询、对外字段命名 |
| **写侧** | `TASK-057` | schema `result`、`normalizeCounts` 透传、父任务 `rebalance-check`、`SKIPPED` 落库、僵尸阈值**常量定义** |

> 冲突点：`TASK-057` §8 写「本卡 = 写侧（…僵尸阈值常量）；`TASK-054` = 读侧」。但 054 又必须**不依赖** 057 就能判僵尸。
> **裁定（D-4）**：阈值常量归属 `shared/constants/cronStatus.constants.js`，**谁先落地谁建、后者复用**。实施前先跑 `grep -rn "STALE_FACTOR\|STALE_THRESHOLD" shared/ cron-worker/`：若已存在则复用并只补缺失项，不得新建第二份。

---

## 3. Repository Findings

> §3.1–§3.5 为 2026-10-26 亲读源码核对（基线 = 分支 HEAD：`main` `cafcc5d` + 文档提交 `97ccfc7`/`1895530`）；§3.6 为 2026-10-26 新增的**只读实库探测**结果（原计划唯一的证据缺口，已关闭）。

### 3.1 任务卡 §2 核对结果（全部成立）

| 任务卡断言 | 核对 |
|---|---|
| `taskruns` 无 `result`、`status` 无 `SKIPPED` | ✅ `shared/models/taskRun.js:11-33`；枚举仅 4 值 |
| `normalizeCounts()` 白名单 4 字段 | ✅ `shared/services/taskRunner.js:6-13` |
| 两条跳过路径不落库 | ✅ `taskRunner.js:16-21`（ALREADY_RUNNING）、`:30-36`（DUPLICATE_RUN_KEY） |
| 唯一索引 `(taskName,runKey)` + `(startedAt:-1,taskName:1)` | ✅ `taskRun.js:32-33`；实库 `indexes()` 复核一致 |
| 后端 9 条路由、无 `/api/cron` | ✅ `server/app.js:41-49` |
| 再平衡无父任务、summary 只打日志 | ✅ `rebalanceScheduler.js:56-65`（summary）、`:117-122`（仅 log）、`:126-131`（`run: () => runRebalanceCheck()` 裸调） |
| 完整性检查真实返回 | ✅ `integrityCheck.js:209-223`（report 骨架）＋逐资产 `:251-260`；`report.totals` 聚合在 `:347-349`、`:367-380` |
| 提醒评估真实返回 | ✅ `alertEngine.service.js:196-198`：`{evaluated, created, archived, failed}` |
| `isMarketOpenToday(market, date = new Date())` 支持任意日期 | ✅ `calendar.service.js:146-169`；`normalizeMarket` 把 `CN-SH/CN-SZ/CN-FUND` 归一为 `CN`（`:16-20`） |

### 3.2 `server` 侧现有模式（必须复用，不要另立一套）

| 关注点 | 事实 | 落点 |
|---|---|---|
| 路由文件命名 | `*.routes.js`，`express.Router()`，末尾 `module.exports = router` | `server/routes/valuation.routes.js`（最短样板） |
| 控制器风格 | `exports.xxx = async (req,res,next) => { try{...}catch(err){next(err)} }`；跨包用 `require('@portomind/shared/services/...')` | `server/controllers/valuation.controller.js:1-12` |
| 统一响应 | `success(res, data, {status}|{pagination})` / `failure(req,res,status,message,details)` | `server/utils/apiResponse.js:1-15` |
| 日期参数校验 | 正则 + `new Date(...)` 回环 + `error.status = 400` 抛出 | `server/controllers/log.controller.js:19-35` |
| 时区解析 | `SCHEDULER_TIMEZONE → MARKET_TIMEZONE → America/Toronto` | `cron-worker/src/schedulers/cronScheduler.js:8-10`、`log.controller.js:12-17`、`shared/utils/marketTime.js:46` |
| 注册路由 | 顶部 `require` 分组 + 中间 `app.use('/api/xxx', x)` | `server/app.js:9-17, 41-49` |

### 3.3 可复用的既有能力（**不要重新造**）

| 能力 | 直接调用 | 备注 |
|---|---|---|
| 交易日判定（含节假日、任意日期） | `require('@portomind/shared/services/calendar.service').isMarketOpenToday(market, date)` | US/CA 按规则算、CN/HK 查静态表；**传非法 market 会 throw**，必须 try/catch（D-11）。已实测：`2026-10-23` 三市场全开、`2026-10-01` CN/HK 休、`CRYPTO` throw |
| 价格日边界 | `shared/utils/marketTime.js` 的 `dateBounds(date)` / `canonicalDayTimestamp(value)` / `marketDate(date, tz)` | `dateBounds` 对非法日期 **throw**；`marketDate` 默认优先 `SCHEDULER_TIMEZONE`；已实测 `dateBounds('2026-10-23')` = `04:00Z–04:00Z` |
| dayjs 时区能力 | `shared` 内已 `dayjs.extend(utc)` + `extend(timezone)` | `marketTime.js:4-9`；新 service 里可安全用 `dayjs.tz(...)` / `.subtract(...)` |
| active 资产 | `shared/services/asset.service.js:100-102` 的 `getActiveAssets()` | 本卡只要 `symbol/name/market/launchDate` → **改用 `Asset.find({active:true}).select(...).lean()`**（D-13） |
| 组合（未归档） | `Portfolio.find({archived:{$ne:true}})` | `rebalanceScheduler.js:57` 同口径；实库 4 个，全部 `daily` |
| 汇率最新日 | `FxRate.find().sort({date:-1})` 或 `aggregate($group by date, $max)` | 仅用于 AC5 的 `fxCount`（D-18）；**不得**据此反推币种成功 |

### 3.4 数据形态细节（影响实现正确性）

| # | 事实 | 影响 |
|---|---|---|
| F-1 | `Price.symbol` 与 `Asset.symbol` 均在写入时 `uppercase`；**实库精确匹配成立**：44/44 active symbol 在 `prices` 中都有精确同名记录 | 直接字符串比较安全（D-20）。⚠️ 历史库里同一支场外基金还有**无后缀别名行**（27 对：`001180` + `001180.CN`），那是旧写法残留，**不是** active 资产名 → 严禁做后缀归一，否则会重复计数或错配 |
| F-2 | ~~同一交易日抓两次会有两条~~（**初稿判断错误，已纠正**）：`saveLatest` 是 `(symbol,timestamp)` **upsert**（`priceStorage.service.js:16-19`），唯一索引兜底；正常路径一天一条。只有手工 `Price.create` 路径可能留下额外行 | 判「有无价」用 `distinct`/`countDocuments` 即可，**不要**假设多行、也不要 `findOne` 取"最新" |
| F-3 | `isMarketOpenToday` 把传入 Date 按**市场本地时区**格式化成 `YYYY-MM-DD` | 候选日必须用 **`T12:00:00Z`** 构造（D-12，已实测对 UTC−4…+8 均不跨日） |
| F-4 | `dateBounds(date)` 用 `MARKET_TIMEZONE` 切日，`isMarketOpenToday` 用市场本地时区判交易日 | 两者职责不同、对"该日是否开市"无冲突；价格按 `MARKET_TIMEZONE` 归桶（`marketTime.js:1-2` 明示唯一实现），**不要自己写日边界** |
| F-5 | `Asset.market` 是 mongoose enum，但历史数据可能不合规 | 遍历 market 必须 `try/catch`，落 `unsupportedMarkets[]`，**不得整页 500**（实库当前 3 个 market 均合法：`CN-FUND/CA/US`） |
| F-6 | `rebalance-suggestions:<pid>` 的 `runKey = '<schedule>:<periodKey>'`，`periodKey = marketDate()` | 取「哪一天」的记录必须用 `startedAt ∈ dateBounds(date)`，**不要用 runKey 匹配日期**（D-8） |
| F-9 | **采集节奏（实库实证）**：价格桶的日期 = 运行日 − 1（例：周一 `10-19` 的 run 写入周五 `10-16` 桶 41 条；周四 `10-22` 的 run 写入周三 `10-21` 桶 42 条）；周六/周日 run `successCount=0`（整批休市跳过，但 `status=SUCCEEDED`） | 周五收盘价要到**下周一 03:00**才入库；「上一开市日」按日历直接取会在周末/假日/每日 03:00 前产生稳定假缺口 → **D-16 的直接依据** |
| F-10 | **44/44 active 资产 `launchDate` 全为 `null`** | OD-4 的 `notListed[]` 当前恒为空（逻辑仍需实现，防将来补数据后误报）；同时解释了 `price-integrity-check` 为何 `SUCCEEDED` 却 `successCount=0`（全部 `SKIPPED_NO_LAUNCH_DATE`） |
| F-11 | 实库最新 `FxRate` = 2026-10-22，USD `0.149493` / CAD `0.210155` / HKD `1.173012`（方向反了，`TASK-051`） | AC5 的 `fxCount` 可只读得到（=`3`），但 `currencies` 必须 `null` 到 C-05 落地；C-05 后看板会直接暴露 051 的错误值 |

### 3.5 ⚠️ 任务卡未发现的两处文档冲突（D-10 依据）

| # | 冲突 | 事实 | 处理 |
|---|---|---|---|
| **F-7** | **架构文档明文禁止本卡要做的事** | `docs/os/architecture/ARCHITECTURE.md:136`：「`server` 禁止 … **暴露调度/TaskRun 查询接口（当前没有这类端点）**」；`docs/handbook/product/PRODUCT_LINES.md:170`：「`server` … 也**不暴露调度 / TaskRun 查询接口**」 | 两句在本卡落地后**立即变成假话**。AC13 未列这两份文档 → **必须补进 In Scope**（D-10，已获 OD-6 批准）；约束措辞改为「不得暴露触发/写操作，**仅允许只读聚合查询**」。✅ 已提交版本（`1895530`）上复核：两行真实存在（`:136` / `:170`） |
| **F-8** | **`SERVER.md:64` 对 `SCHEDULER_TIMEZONE` 的描述是错的** | 现写「**仅供只读的调度状态接口**按调度时区取当天日期」——但当前**没有任何调度状态接口**；真正读它的是 `server/controllers/log.controller.js:14`、`shared/utils/marketTime.js:46`（`marketDate()` 默认时区）、`cron-worker/src/schedulers/cronScheduler.js:9` | AC13 动 `SERVER.md` 时**顺手改准**（D-10） |

### 3.6 只读实库探测（2026-10-26 已执行，关闭原 U-1）

> 方法：`server/.env` 的 `MONGO_URI`（指向 `portomind_dev`）替换库名为 `portomind`（**生产库**），用 mongoose 只读查询；全程无写操作。未使用 `npm run sync:db`（读生产库已足够，且避免覆盖开发库）。脚本与完整输出记录在 §7.4。

| 项 | 实测值 | 含义／影响 |
|---|---|---|
| active 资产 | **44** 个 = `CN-FUND 29` + `CA 11` + `US 4` | AC2 的 `expected` 基准；无 CN-SH/SZ/HK |
| `launchDate` 为空 | **44 / 44** | `notListed` 恒空；完整性检查全部 `SKIPPED_NO_LAUNCH_DATE`（F-10） |
| 最近有价日 | `10-21(42)`、`10-20(42)`、`10-19(41)`、`10-18(1)`、`10-16(41)`、`10-14(42)` … | 最后一条有效采集 = 10-21；10-22 起无新桶（10-23 run 全失败、10-24/25 周末跳过、10-26 无 run） |
| 目标日（日历口径 10-23） | 桶内 **0** 条 | 若按初稿口径，今天（10-26）会显示 `fetched 0/44` 全红——**恰好正确**（10-26 03:00 的同步没跑） |
| 周末桶 | `10-24 = 0`、`10-25 = 0` | 休市跳过的直接证据 |
| `taskruns` | **244** 条；含 `result` 的 **0** 条 | D1/D2 在生产数据上再次确认；本卡首日 4 项 `contractReady=false` |
| 状态分布 | `SUCCEEDED 154` / `PARTIAL 45` / `FAILED 44` / `RUNNING 1` | — |
| 僵尸 `RUNNING` | `daily-price-sync`，`runKey=manual:2026-08-25T23:07:45.616Z`，`startedAt=2026-08-25` | **不是该任务最新一条**（最新 = 10-25 `SUCCEEDED`）→ Q1 取最新永远看不到它，D-19 据此删掉"首日真实命中"的说法 |
| 各任务最近一条 | `daily-price-sync` 10-25 `SUCCEEDED` `total=44 success=0`；`price-integrity-check` 10-25 `SUCCEEDED` `total=44 success=0`；`fx-rate-sync` 10-25 **`FAILED`**；`alert-evaluate` 10-25 `SUCCEEDED`；`rebalance-check` **无记录** | 「全绿但 0 采集」的真实样本；父任务确实从未存在 |
| 最近 8 次 `daily-price-sync` | 10-25 `SUCCEEDED` 0/44；10-24 `SUCCEEDED` 0/44；10-23 `PARTIAL` 0/44（44 失败）；10-22 `PARTIAL` 42；10-21 `PARTIAL` 42；10-20 `PARTIAL` 41；10-19 `PARTIAL` 42；10-18 `SUCCEEDED` 0/44 | F-9 的采集节奏证据链 |
| 未归档组合 | **4** 个（`A股-长钱组合` / `A股-稳钱组合` / `CA-RRSP组合` / `CA-家庭RESP组合`），`rebalanceSchedule` 全 `daily` | AC8 的 `perPortfolio.length` 期望值 = 4 |
| 符号匹配 | `prices.symbol` 71 个，其中 44 个与 active 资产**精确同名**；其余 27 个是 27 支 `.CN` 场外基金的**无后缀历史别名**（同一支基金两种写法） | R-2 风险**当前不成立**（没有 active 资产对不上）；但别名行会干扰"从 Price 反向聚合"，所以 D-20 要求一律从 `asset.symbol` 出发精确匹配 |
| 最新 `FxRate` | 2026-10-22：USD `0.149493` / CAD `0.210155` / HKD `1.173012`，`source=er-api` | TASK-051 方向反了的实证 |
| `taskruns` 索引 | `{_id:1}`、`taskName_1_runKey_1 (unique)`、`startedAt_-1_taskName_1` | 与模型一致 |

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
| **2026-10-26 实测基线** | `npm run test:server` = **152 pass / 0 fail**（17 文件）；`npm run test:worker` = **77 pass / 0 fail**（11 文件）；两条命令均 exit 0 |
| ⚠️ 执行环境限制（2026-10-26 实测） | `node --test` 要为每个测试文件**派生子进程**，在本会话的沙箱 shell 里会被拦为 `spawn EPERM`；既有子目录（`server/` `shared/` `logs/`）对沙箱 shell 也不可写。**验收必须在能派生子进程的终端/CI 里跑**，或按 §7.5 的方式（本机终端）执行；测试基线数字已由本机正常执行确认 |

→ **AC12 的两类测试都放进 `server/test/integration/`**（本卡不新增 `test/unit/` 目录，避免引入第二套测试入口）：
- `cronStatus.service.test.js`（单元：`require('@portomind/shared/services/cronStatus.service')`，猴补模型静态方法，覆盖 AC2/AC4/AC7/AC9）
- `cronStatus.api.test.js`（集成：起 `app` + `fetch`，覆盖 AC1 全字段 / AC8 参数校验）

### 3.8 依赖

| 包 | 可用性 |
|---|---|
| `dayjs` | ✅ `shared` 的依赖（`shared/package.json`），且 `marketTime.js` 已 extend `utc`/`timezone`。**日期运算一律写在 `shared/` 侧**，`server` 无 dayjs |
| `mongoose` | ✅ `server` 与 `shared` 都有 |
| `express` | ✅ `server` 侧 |

### 3.9 未知项（2026-10-26 修订后）

| # | 未知 | 状态 |
|---|---|---|
| U-1 | ~~生产库 `fetched/expected` 真实比例；symbol 写法是否错配~~ | ✅ **已关闭**（§3.6：44/44 精确匹配，最后有价日 10-21，目标日 0/44 因 10-26 未运行） |
| U-2 | `TASK-057` 落地后 `result` 的具体键名（汇率 `currencies` vs `rates`；完整性 `totals` vs `ok/gap`） | 仍开放 → 本卡用**适配器**吸收（D-7 / D-21），两种都能读 |
| U-3 | 前端是否愿意接受服务端算好的 `dataStateLevel` | ✅ **已关闭**：OD-5 批准，条件是 level 只看数据态 |

---

## 4. Proposed Design

### 4.1 分层与数据流（**核心决策**）

```
client  ──GET /api/cron/status──▶  routes/cronStatus.routes.js   (router.get('/status'))
                                        │
                                        ▼
                              controllers/cronStatus.controller.js   ← 只做：参数校验 → 调服务 → success()/failure()
                                        │
                                        ▼
                        shared/services/cronStatus.service.js        ← 唯一实现：主视图 6–7 次查询 + 全部派生
                                        │
                  ┌─────────────────────┼──────────────────────┬─────────────┐
                  ▼                     ▼                      ▼             ▼
              TaskRun               Asset / Price          Portfolio       FxRate
             (只读聚合)             (只读派生)              (只读连接)      (只读计数)
```

**为什么派生逻辑放 `shared/` 而不是 controller**（D-9）：

1. 仓库既有约定：`shared/` 是业务内核唯一实现；`server/controllers` 里已有 3 个直接 require `shared/models/*` 自行查询（分层未完全下沉），但**新功能应走 `shared/service`**（项目既有结论）。
2. 测试可行性：`server` 只有一个测试入口，若逻辑写在 controller 里，「单元测试 AC2」只能靠 HTTP 绕一圈，无法注入 `now`。
3. 可注入时间：AC2 的「有效目标日」和 AC7 的「僵尸阈值」都强依赖当前时间，service 必须接受 `{ now }` 参数（既有 `runRebalanceCheck({now})`、`evaluateAll({now})` 同惯例）。

**`?detail=rebalance` 与主端点共用同一个 row builder**（D-8）：一次实现、两处使用，避免 C-07 落地时出现第二份「到期/生成/失败」的口径。

### 4.2 查询预算（R-5 要求：禁止 N+1）

| # | 查询 | 次数（主视图） | 次数（detail） |
|---|---|---|---|
| Q1 | `TaskRun.aggregate` 取 5 个任务各自最近一条（`$match taskName $in` → `$sort startedAt:-1` → `$group by taskName $first`） | **1** | 1（复用，用于默认日期） |
| Q2 | `Asset.find({active:true}).select('symbol name market launchDate').lean()` | **1** | 0 |
| Q3 | `Price.find({ $or:[各市场目标日的 dateBounds] }).select('symbol timestamp').lean()`，桶内 symbol 集合在 JS 内构建（从 `asset.symbol` 出发精确匹配；不按 symbol 预过滤，避免漏掉同一 symbol 的跨市场/多写法行） | **1** | 0 |
| Q4 | `Portfolio.find({archived:{$ne:true}}).select('name accountType rebalanceSettings.rebalanceSchedule').lean()` | **1** | **1** |
| Q5 | `FxRate.aggregate` 取最新汇率日的币种计数（AC5 `fxCount`，D-18） | **1** | 0 |
| Q6 | `TaskRun.aggregate` 取 `rebalance-check`（父）+ `rebalance-suggestions:*`（子）各自最近一条；**主视图也需 1 次**（`perPortfolio[].runStatus/failures` 来自子记录），detail 用 `startedAt ∈ dateBounds(date)` | **1** | **1** |
| Q7 | 仅当 `fetched===0 && expected>0`：`Price.distinct('symbol', {timestamp: 目标日 bounds})` 的 `length`（诊断用） | **0 或 1** | 0 |

→ 主视图稳态 **6 次**、`fetched===0` 时最差 7 次；detail 稳态 **2–3 次**（带 `date` 2 次；缺省 `date` 时多 1 次确定默认分发日）。**不得**写成「逐资产查价」「逐组合查 taskrun」「逐个市场查价」。Review 时以此表为准。
>
> **实施期修正（2026-10-26）**：初稿把 Q6 记为「主视图 0 次」，但主视图 `dataState.perPortfolio[].runStatus/failures` 必须来自子 taskrun（AC6），故主视图也需 1 次 Q6；已按实现更新上表，总预算 6–7 次仍远低于 N+1 风险阈值。

> 已知张力：`DATA_MODEL.md:318` 建议聚合带时间范围。Q1 是为满足 AC1「该任务最近一条」而设计的跨任务分组，`$match` 走 `taskName` 后由 `(startedAt:-1,taskName:1)` 索引支撑排序；当前 244 条、增长可控（`taskruns` 无 TTL 属另立卡）。Reviewer 若要求加窗口，**必须同时改 AC1 的 null 语义**，不得单方面加窗口。

### 4.3 对外响应契约（**冻结**）

> 冻结含义：`TASK-053` / `TASK-055` / C-07 直接照此写前端，**不得**各自另起字段名。变更需回改本 ExecPlan 并通知下游。2026-10-26 经 Human Plan Review 批准（含 `notes[]` 数组化、`calendarPrevOpenDay`、`perPortfolioDate`、`fxCount` 来源）。

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
  "stale": false,                   // true 仅当最新一条 status=RUNNING 且超阈值（AC7）
  "contractReady": true,            // 该任务「数据态」字段是否完整可得
  "dataState": { ... },             // 见 4.4
  "dataStateLevel": "ok",           // "ok" | "warn" | "bad" | "unknown"；只由数据态决定（OD-5）
  "notes": [ { "code": "...", "message": "..." } ]   // 0..n 条，见下方 code 全集
}

RunSummary = {
  "runKey": "2026-10-25",
  "trigger": "SCHEDULED",
  "status": "SUCCEEDED",   // RUNNING | SUCCEEDED | PARTIAL | FAILED | STALE（stale 时替换 RUNNING）
  "rawStatus": "SUCCEEDED",// 库内原值（STALE 时仍能看出原本是 RUNNING）
  "startedAt": "...", "endedAt": "...", "durationMs": 1234,
  "totalCount": 40, "successCount": 40, "failureCount": 0
}
// RUNNING 记录本就没有 endedAt/durationMs → 必须归一为 null（不能省略键，见 M-minor）
```

`tasks[]` 顺序与 `taskName`（**这是落库名的真实取值，不是日志 scope**）：

| # | `taskName` | 中文短名（供前端兜底） | 落库来源 | 实库现状 |
|---|---|---|---|---|
| 1 | `daily-price-sync` | 价格同步 | `shared/tasks/dailySync.js` | 52 条，最新 10-25 |
| 2 | `price-integrity-check` | 完整性检查 | `cron-worker/src/tasks/integrityCheck.js` | 12 条，最新 10-25 |
| 3 | `alert-evaluate` | 提醒评估 | `alertScheduler.js` | 8 条，最新 10-25 |
| 4 | `fx-rate-sync` | 汇率同步 | `fxScheduler.js` | 8 条，最新 10-25（FAILED） |
| 5 | `rebalance-check` | 再平衡分发 | **`TASK-057` 才会产生** | 0 条 → 恒 `lastRun: null` |

> ⚠️ `price-sync` / `health-check` 只是 `createCronScheduler` 的日志 scope，**永不落库**，不得拿去查 `taskruns`。

**`notes[].code` 全集（前端据此写文案，**不得**靠字符串匹配 message）**

`CONTRACT_NOT_READY` · `NO_TASK_RUN` · `NO_OPEN_DAY` · `EXPECTED_ZERO` · `TARGET_LAGGED` · `SYMBOL_FORMAT_MISMATCH` · `UNSUPPORTED_MARKET` · `DETAIL_NOT_REBALANCE` · `PORTFOLIO_ID_INVALID` · `PORTFOLIO_NOT_FOUND` · `PORTFOLIO_ARCHIVED` · `NO_DISTRIBUTION_RECORD`

> 同一任务可同时命中多条（例：`NO_OPEN_DAY` + `EXPECTED_ZERO`），因此 `notes` 为**数组**、按「严重度高→低」排序；level 冲突时以 §4.4 判定表为准，不依赖 note 顺序。
>
> **实施期澄清（Reviewer F1）**：`NO_TASK_RUN` 当前**没有触发路径**（detail 空日改用 `NO_DISTRIBUTION_RECORD`，见 §4.7）；保留在 code 集合里供 C-07/未来复用，避免前端二次改词。detail 空日必须出现 `NO_DISTRIBUTION_RECORD`。

### 4.4 五项 `dataState`（逐项冻结）

#### ① 价格同步 `dataState`（AC2 + D-16 / D-17）

```jsonc
{
  "targetMarketDate": "2026-10-22",         // 有效目标日（各市场最晚者）；无法判定 → null
  "calendarPrevOpenDay": "2026-10-23",      // 日历口径「上一开市日」（今日之前最近开市日）
  "expected": 44,
  "fetched": 44,
  "missing": [ { "symbol": "VBG.TO", "name": "...", "market": "CA" } ],
  "byMarket": {                             // 逐市场明细，证明「最晚」不是编的（D-3 / D-17）
    "US":      { "targetMarketDate": "2026-10-22", "calendarPrevOpenDay": "2026-10-23", "expected": 4,  "fetched": 4  },
    "CA":      { "targetMarketDate": "2026-10-22", "calendarPrevOpenDay": "2026-10-23", "expected": 11, "fetched": 9  },
    "CN-FUND": { "targetMarketDate": "2026-10-22", "calendarPrevOpenDay": "2026-10-23", "expected": 29, "fetched": 29 }
  },
  "notListed": [ { "symbol": "NEW1", "launchDate": "2026-11-01" } ],  // launchDate 晚于目标日，不计入 expected（OD-4 / D-2）
  "unsupportedMarkets": [ "CRYPTO" ],      // 日历无法识别的历史脏数据 market（D-11），不计入 expected、不 500
  "dayPriceSymbolCount": null              // 仅 fetched===0 时填：该日库内有价的 distinct symbol 数（R-3 / D-20 诊断）
}
```

> 以上 JSON 为字段示意（示例值，非实库快照）；实库 2026-10-26 快照见 §3.6 / §7.4。

算法（伪代码，**日期运算全部在 `shared/`**）：

```js
// D-16 有效目标日：最近一个「同步时点已过且该市场开市」的交易日 → 再往前取一个开市日
const todayStr = marketDate(now, tz);                       // 调度时区「今天」
const syncHour = PRICE_SYNC_DUE_HOUR;                       // 常量 = 3（与 PRICE_SYNC_CRON 默认 '0 3 * * *' 对齐）
const syncAt = dayjs.tz(`${todayStr} ${String(syncHour).padStart(2, '0')}:${String(PRICE_SYNC_DUE_MINUTE).padStart(2, '0')}:00`, tz);
const todaySyncPassed = !syncAt.isAfter(dayjs(now));        // now >= 今日同步时点

function lastOpenDayBefore(market, dateStr) {               // 从 dateStr 前一天起逐日回退，上限 PRICE_TARGET_MAX_LOOKBACK_DAYS
  let d = dayjs.tz(dateStr, tz).subtract(1, 'day');
  for (let i = 0; i < PRICE_TARGET_MAX_LOOKBACK_DAYS; i++) {
    if (isOpen(market, d.format('YYYY-MM-DD'))) return d.format('YYYY-MM-DD');
    d = d.subtract(1, 'day');
  }
  return null;                                              // 长假超上限 → NO_OPEN_DAY
}

// dEff(market)：最近一个满足「开市 + 同步时点已过」的交易日
const dEff = isOpen(market, todayStr) && todaySyncPassed
  ? todayStr
  : lastOpenDayBefore(market, todayStr);

target  = lastOpenDayBefore(market, dEff);                  // ★ 有效目标日
calendar = lastOpenDayBefore(market, todayStr);             // 日历口径上一开市日（仅供展示/解释）

// expected：该市场目标日开市且 active（排除 launchDate > 目标日 → notListed；null launchDate 视为已上市）
// fetched ：上述资产里，Price(symbol, timestamp ∈ dateBounds(target)) 存在者
// 顶层 targetMarketDate = max(各市场 target)；expected/fetched = Σ 各市场（D-17）
```

- 为什么不是「昨天起回退」（初稿做法）：实库（§3.6）证明周五收盘价要到**下周一 03:00**才入库（周六/周日 run 整批跳过）。初稿口径会在每个周末/市场假日/每日 03:00 前稳定报 44 个缺口，属于**看板撒谎**。D-16 让「目标日」始终等于**最近一次已到点的采集所应覆盖的交易日**：

| 时刻 | `dEff` | 有效目标日 | 结果 |
|---|---|---|---|
| 周二 10:00 | 周二 | 周一 | 正常 |
| 周一 01:00（03:00 前） | 周五 | 周四 | 不报周五缺口（周五价尚未采集） |
| 周六/周日全天 | 周五 | 周四 | 不报假缺口，`notes` 给 `TARGET_LAGGED` |
| 今天 03:00 前 / 今天非开市 | 上一开市日 | 再前一开市日 | 同上 |

- **真实故障仍然暴露**：若某天 03:00 的同步没跑/失败，`dEff` 仍按日历取到该开市日，目标日就是该采的交易日 → `fetched` 少 → 黄/红。实库当前就命中此路（10-26 无 run → 目标 10-23 → 0/44 → 红，**正确**）。
- `targetMarketDate === null`（某市场长假超回退上限）→ 该市场 `notes` 给 `NO_OPEN_DAY`，不计入顶层 `expected`。
- `expected === 0` → `dataStateLevel = 'unknown'` + `EXPECTED_ZERO`（AC9；不把 0/0 当"齐了"）。
- `fetched === 0 && expected > 0` → `'bad'`，并填 `dayPriceSymbolCount`：若它 `> 0`，附加 `SYMBOL_FORMAT_MISMATCH` 提示（诊断用，**不改变 level**）。
- `calendarPrevOpenDay !== targetMarketDate` → 追加 `TARGET_LAGGED`，message 写清「日历上一开市日的价将在下次 03:00 同步采集」。

#### ② 完整性检查 `dataState`（AC3 + D-21）

```jsonc
{
  "expectedCount": 0,          // ← result.totals.expectedCount（缺失 → null）
  "actualCount": 0,            // ← result.totals.actualCount
  "missingCount": 0,           // ← result.totals.missingCount
  "completenessRatio": null,   // 服务端算：actualCount/expectedCount；分母 0 或缺失 → null
  "skippedNoLaunchDate": 44,   // ← result.skippedCount（**不是** skippedNoLaunchDate，057 落地时统一）
  "gapAssets": [ { "symbol": "VBG.TO", "missingCount": 61 } ]   // ← result.gapAssets；缺该键时回退 result.assets[]
}
```

- `lastRun` 存在但 `lastRun.result` 缺失（**当前 100% 的情况**）→ **全部数值字段 `null`、`gapAssets: []`、`contractReady: false`、`notes: [CONTRACT_NOT_READY]`**。
- **禁止**用 `lastRun.status === 'SUCCEEDED'` 推出 `missingCount: 0`（AC3 原文；实库 10-25 就是 SUCCEEDED + 0 采集）。
- **D-21 取值顺序（写死在 service 里）**：`result.totals.{expectedCount,actualCount,missingCount}` → `result.{同名}` → `result.{ok,gap}`（`ok→actualCount`、`gap→missingCount`、`expectedCount=ok+gap`，兼容 FS §4.3/C-05 的旧名）。`skippedNoLaunchDate` ← `result.skippedCount ?? result.skippedNoLaunchDate`。

#### ③ 提醒评估 `dataState`（AC4）

```jsonc
{ "evaluated": 12, "created": 3, "archived": 1, "failed": 0 }   // ← result.*；缺失时四个全 null
```
- `created === 0` 是**正常态**，`dataStateLevel` 不因此变黄（AC4）。
- 读取顺序（D-21）：`result.evaluated/created/archived/failed`；`created` 缺失而 `result.alertsFired` 存在时回退 `alertsFired`（旧名兼容）。
- `failed > 0` → `'bad'`（数据态失败数）；`missingCount` 类判断不适用。

#### ④ 汇率同步 `dataState`（AC5 + D-18）

```jsonc
{
  "fxCount": 3,        // ← FxRate 最新汇率日的币种记录数（C-05 前）；C-05 后优先取 result.fxCount
  "currencies": null   // C-05 前恒 null；057 落地后为 { "USD": { "ok": true, "rateToCny": 7.13 }, ... }
}
```
- `contractReady = currencies !== null`。
- **禁止**用 `fxCount === 3` 反推三币种成功（AC5；实库 fx 最新日确实 3 条，但方向是反的）。
- 适配器（D-7 + D-21）：057 若写 `result.rates = {USD: 7.13, ...}` → 归一为 `{USD:{ok:true, rateToCny:7.13}}`；若写 `result.currencies`（含 `ok`/`rateToCny`）→ 直接透传并补缺省键。**两种都只改一个 20 行内的映射函数**。

#### ⑤ 再平衡分发 `dataState`（AC6 + D-8）

```jsonc
{
  "perPortfolioDate": "2026-10-26",   // 主视图取「最近一次有子记录的分发日」；无任何子记录 → null
  "due": null,               // 父任务 result.perPortfolio[].due 为 true 的条数；父 result 缺失 → null（**严禁**用子记录反推）
  "totalPortfolios": null,   // 父 result.totalPortfolios
  "skippedCount": null,      // 父 result.skippedCount
  "generatedCount": null,    // perPortfolio 里 suggestionsCount > 0 的条数
  "perPortfolio": [          // 与 ?detail=rebalance 的 rows **同源同构**（D-8）
    {
      "portfolioId": "65f...", "portfolioName": "A股-长钱组合", "accountType": "tiantian",
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
- 主视图没有 `date` 参数 → `perPortfolioDate` 显式回传（取最近一次有子记录的分发日；今天有则今天），供前端展示「这是哪天的分发」。
- `contractReady = 父 result 存在且含 perPortfolio`。
- `notes: [CONTRACT_NOT_READY]`（同 ②）。

**`dataStateLevel` 判定表（D-6 / OD-5 批准条件：只由数据态决定，`status` 不参与）**

| 任务 | `unknown` | `bad` | `warn` | `ok` |
|---|---|---|---|---|
| 价格同步 | `targetMarketDate===null` 或 `expected===0` | `fetched===0 && expected>0` | `0<fetched<expected` | `fetched>=expected>0` |
| 完整性 | `contractReady===false` | `missingCount===expectedCount && expectedCount>0`（全缺） | `missingCount>0` | `missingCount===0` |
| 提醒 | `contractReady===false` | `failed>0` | — | 其余（含 `created===0`） |
| 汇率 | `currencies===null` | 全部币种 `ok=false` | 部分币种 `ok=false` | 全部 `ok` |
| 再平衡 | `contractReady===false` | `due>0 && generatedCount<due` | `failures.length>0` | `due===0` 且 `failures.length===0` |

> **运行态不并入 level**：`lastRun.status` 只作为第二行徽章文案展示（`TASK-055` AC7 明确「配色与完成度不得读取 `lastRun.status`」；FS §3 亦称 status 为辅助信号）。若 Human 将来要求「取更差者」，须同时改 `TASK-055` AC7 与 FS §3 措辞，**本卡不擅自实施**。

### 4.5 `?detail=rebalance`（AC8）

```
GET /api/cron/status?detail=rebalance&date=2026-10-26&portfolioId=65f...
→ { success: true, data: {
      date, contractReady, generatedAt,
      summary: { totalPortfolios, due, generated, failed, skipped },   // due/generated/skipped 缺契约时 null；failed 恒可算
      rows: [ <与 4.4⑤ 的 perPortfolio 完全同构> ],
      notes: [ ... ]
    } }
```

| 参数 | 规则 |
|---|---|
| `detail` | 缺省 = 主视图；`rebalance` = 详情；**其他非空值 → 400** `DETAIL_NOT_REBALANCE`（D-14：宁可显式报错，不静默忽略） |
| `date` | 缺省 = 父任务最近一次分发日 → 无父任务时取**最近一次有子记录的分发日** → 再无则 `marketDate(now, tz)`。校验走「正则 + 回环」，非法 → **400**（沿用 `log.controller.js:28-33`） |
| `portfolioId` | `mongoose.isValidObjectId` 失败 → **200 + `rows: []` + `notes:[PORTFOLIO_ID_INVALID]`**；合法但库里没有 → `PORTFOLIO_NOT_FOUND`；合法且已归档 → `PORTFOLIO_ARCHIVED`（仍返回该行，`archived: true`）。**一律不 500**（AC8） |

取值方式（F-6）：

```js
// 父：指定日期的 rebalance-check（startedAt ∈ dateBounds(date)）
// 子：taskName $in ['rebalance-suggestions:<pid>' ...]，startedAt ∈ dateBounds(date)，按 startedAt desc 取每组首条
// Portfolio 名/accountType/schedule：一次 find 全量（含 archived，供 ARCHIVED 提示），JS 内 join
```

`summary.failed` 恒由 `rows[].runStatus === 'FAILED'` 计数得出（M-4 修复：初稿写"缺契约时 null"，但该值本就可从子记录得到，属"前端重算"范畴）。

### 4.6 常量文件（AC7 的「配置常量」，D-4）

`shared/constants/cronStatus.constants.js`（新建；若 057 已建同名/同类文件则**复用并只补缺失项**）：

```js
// 5 个落库任务名（顺序即对外 tasks[] 顺序）
const CRON_TASK_NAMES = Object.freeze([
  'daily-price-sync', 'price-integrity-check', 'alert-evaluate', 'fx-rate-sync', 'rebalance-check'
]);
// 逐任务周期（小时）。当前 5 个 cron 全为「每天一次」，故全 24；
// 结构上支持逐任务不同值，避免将来改周期时改逻辑。
const TASK_PERIOD_HOURS = Object.freeze({ 'daily-price-sync':24, 'price-integrity-check':24, 'alert-evaluate':24, 'fx-rate-sync':24, 'rebalance-check':24 });
const STALE_FACTOR = 2;                                  // AC7「2 × 周期」
const PRICE_TARGET_MAX_LOOKBACK_DAYS = 15;               // 目标日回退上限（CN 春节/国庆 ≤ 9 天）
const PRICE_SYNC_DUE_HOUR = 3;                           // ★ 与 PRICE_SYNC_CRON 默认 '0 3 * * *' 对齐；改 cron 需同步改此常量
const PRICE_SYNC_DUE_MINUTE = 0;
const REBALANCE_CHILD_PREFIX = 'rebalance-suggestions:';
function staleThresholdHours(taskName) { return (TASK_PERIOD_HOURS[taskName] ?? 24) * STALE_FACTOR; }
```

- 阈值**不写进 controller**（AC7 原文）；controller 只 `require` 常量。
- 实测佐证 cron：`priceScheduler 0 3 * * *`、`healthScheduler 30 3 * * *`、`alertScheduler 0 4 * * *`、`fxScheduler 30 9 * * *`、`rebalanceScheduler 0 0 * * *` → **全部每日一次**，`2×24=48h` 对 5 个任务同时成立。
- ⚠️ `PRICE_SYNC_DUE_HOUR` 必须与 `PRICE_SYNC_CRON` 保持一致：若运维改了 `PRICE_SYNC_CRON`，D-16 的 `dEff` 会偏一天。计划把「部署时若改 PRICE_SYNC_CRON 需同步该常量」写进 `SERVER.md` 的手动端点段落。

### 4.7 空态与降级（AC9 / AC3 / AC5 / AC6 / AC2）

| 场景 | 表现 | 禁止 |
|---|---|---|
| `taskruns` 整集合为空 | 5 项 `lastRun: null`；**价格同步 `contractReady: true`**（其数据态不依赖 taskruns，仍给真实 `expected/fetched`）；其余 4 项 `contractReady: false`、数值全 `null`；HTTP **200** | 返回任何 `SUCCEEDED`；把 `null` 当 `0` |
| `result` 缺失（当前常态） | 4 项 `contractReady:false` + `notes:[CONTRACT_NOT_READY]` | 用 `status` 冒充完成度 |
| 父任务 `rebalance-check` 缺失 | `due/totalPortfolios/skippedCount/generatedCount = null`；`perPortfolio` 仍返（字段 null，`runStatus/failures` 可读） | 用「有无子记录」反推 `due`；把「无记录」渲染成「未到期」 |
| 某日无分发记录（detail） | `rows: []` + `notes:[NO_DISTRIBUTION_RECORD]` + `notes:[CONTRACT_NOT_READY]`（父任务缺失时）+ `date` 回显 | 返回 `summary` 全 0 冒充「全部正常」 |
| 某市场连续长假超回退上限 | 该市场 `targetMarketDate: null`，`notes:[NO_OPEN_DAY]`，不计入顶层 `expected` | 回退到今天 / 编一个日期 |
| 目标日尚未到采集时点 | 自动回退到有效目标日（D-16），`calendarPrevOpenDay` 回显 + `notes:[TARGET_LAGGED]` | 把「尚未采集的交易日」算作缺口（周末全红） |
| `asset.market` 非法（enum 外的历史脏数据） | 该资产进 `unsupportedMarkets[]`，不影响其余 | 整页 500 |
| `FxRate` 集合为空 | `fxCount: null` + `contractReady:false` + `notes:[CONTRACT_NOT_READY]` | 用 `0` 冒充「没有币种」 |

### 4.8 关键决策（D-1~D-15 初稿 + D-16~D-21 本版新增；**状态标注 2026-10-26 结论**）

| ID | 决策 | 理由 | 状态 |
|---|---|---|---|
| **D-1** | **OQ-1 → 方案 A：对外用实现真名**（`actualCount/missingCount/skippedCount`、`created`），不做 `{ok,gap,alertsFired}` 翻译 | 任务卡 AC3/AC4 已按真名写死；FS §4.3 旧名由 PM 回改（登记 §9 T-2） | ✅ 维持 |
| **D-2** | 价格 `expected` **排除 `launchDate > 目标日`** 的资产，并单独返回 `notListed[]` | AC2 字面之外的必要细化，否则未上市标的长挂 missing（看板撒谎） | ✅ **OD-4 批准**；比较时把 `launchDate` 归一到 `MARKET_TIMEZONE` 日期；`null` 视为已上市 |
| **D-3** | **OQ-2 → 方案 ①「取最晚开市日」**，同时返回 `byMarket` 明细 | PM 建议 ①；`byMarket` 让「最晚」可被复核 | ✅ 维持（§4.4① 顶层 `targetMarketDate` = 各市场最晚） |
| **D-4** | **OQ-3 → 阈值常量表按任务配置**，当前 5 项全 `24h × 2 = 48h`；单一归属 `cronStatus.constants.js`，与 057 谁先落地谁建 | 5 个 cron 实测全为每日一次；结构支持逐任务 | ✅ 维持 |
| **D-5** | 顶层用 `tasks[]` **数组**（固定 5 项、固定顺序） | AC1 原文「返回 5 个任务条目」；数组天然适合卡网格 `map` | ✅ 维持 |
| **D-6** | 每个任务返回 `dataStateLevel`（`ok/warn/bad/unknown`） | FS R2 要求「前端不重算」 | ✅ **OD-5 批准**；**条件：只由数据态决定**，`status` 不参与（§4.4 表） |
| **D-7** | 汇率走**适配器**：优先 `result.currencies`，退回 `result.rates` | 057 的 OQ-4 未决，不能等 | ✅ 维持 |
| **D-8** | `?detail=rebalance` 与主视图**共用同一 row builder**；子任务按 `startedAt ∈ dateBounds(date)` 取 | 一次实现两处使用；runKey 的 periodKey 语义不同（F-6） | ✅ 维持；新增 `perPortfolioDate`（M-5） |
| **D-9** | 派生逻辑落 `shared/services/cronStatus.service.js`，controller 仅参数校验 + 响应封装 | 只有这样才能单测注入 `now` | ✅ 维持 |
| **D-10** | AC13 之外**追加** 4 处文档：`ARCHITECTURE.md:136`、`PRODUCT_LINES.md:170`、`SERVER.md:64`、`docs/readme.md` | F-7/F-8：文档不得留假事实 | ✅ **OD-6 批准**；文档基线已提交，锚点已在 HEAD 复核 |
| **D-11** | 遍历 market 时 `try/catch`，非法 market 落 `unsupportedMarkets[]` | `isMarketOpenToday` 对未知 market 会 throw（已实测 `CRYPTO`） | ✅ 维持 |
| **D-12** | 候选日用 **`T12:00:00Z`** 构造后再交给 `isMarketOpenToday` | UTC−4…+8 均不跨日 | ✅ 维持 |
| **D-13** | 不用 `getActiveAssets()`，改 `Asset.find({active:true}).select(...).lean()` | 5 张卡只需 4 个字段 | ✅ 维持 |
| **D-14** | `detail` 非空且 ≠ `rebalance` → 400 | 静默忽略会让前端以为过滤生效 | ✅ 维持 |
| **D-15** | **不改** `server/middleware/*`、`app.js` 的 CORS/bodyParser/traceId 顺序；只在 `:49` 后插 1 行注册 | 9 → 10 条路由的增量改动，零副作用 | ✅ 维持（注意 058 会再改 `app.js`，见 M-7） |
| **D-16** | **目标日 = 有效目标日**：`dEff` = 最近一个「开市 + 03:00 同步时点已过」的交易日，`target = dEff 之前最近开市日`；另返 `calendarPrevOpenDay`，不同则 `TARGET_LAGGED` | 实库证明周五价 → 下周一 03:00 才入库；日历口径会在每个周末/假日/03:00 前稳定假红（F-9） | ✅ **新裁决，Human 批准** |
| **D-17** | 顶层 `expected/fetched` = **各市场按其自身目标日分别统计后求和**；顶层 `targetMarketDate` = 各市场最晚者；`byMarket` 保留逐市场口径 | AC2 字面「该日开市且 active」在多市场不同目标日时不可解释；按市场求和才能反映真实完整性 | ✅ **新裁决，Human 批准**（AC2 措辞同步细化） |
| **D-18** | `fxCount` 只读 `FxRate` 最新汇率日的币种记录数（Q5）；C-05 后优先 `result.fxCount`，缺失回退 | 初稿未给 `fxCount` 来源；`normalizeCounts` 丢弃 `fxCount`，taskruns 不可得 | ✅ **新裁决，Human 批准**（查询预算 +1） |
| **D-19** | AC7 只判**每个任务最新一条**；历史 `RUNNING` 不暴露；删除「首日真实命中僵尸体」说法 | 实库僵尸（08-25）不是最新一条（最新 10-25 SUCCEEDED），Q1 看不到；历史清理归 057/运维 | ✅ **新裁决，Human 批准** |
| **D-20** | `expected/fetched` 用 `asset.symbol` 与 `Price.symbol` **精确字符串**匹配；**禁止**后缀归一；`dayPriceSymbolCount>0 && fetched===0` 时给 `SYMBOL_FORMAT_MISMATCH` 诊断 | 实库 44/44 精确匹配成立；27 个无后缀别名是同一批场外基金的历史残留，归一反而会重复计数/错配 | ✅ **新裁决，Human 批准** |
| **D-21** | `taskruns.result` 读取用**一层适配器**：完整性 `totals.* → 顶层同名 → {ok,gap}`；提醒 `created` 缺失回退 `alertsFired`；汇率 `currencies`/`rates`；再平衡 `perPortfolio` 原样 | 057 的 `result` 键名未冻结（U-2），而 FS 旧名与 057 AC3 之名不一致；适配器让两种都能读，057 定稿后只改一处映射 | ✅ **新裁决（实现层，Plan Review 一并通过）** |

> D-2 与 D-6 是对 AC 措辞的细化/增补，D-16/D-17 是对 AC2 的细化，均已按 AGENTS.md §6 显式提请 Human 并获批准（2026-10-26，见 §9）。

### 4.9 明确不改

- `shared/models/taskRun.js`、`shared/services/taskRunner.js`（057）
- `cron-worker/**`（NG2）
- `server/controllers/log.controller.js`、`server/routes/logs.routes.js`
- `client/**`（053/055/056/C-07）
- `docs/handbook/technical/CRON_WORKER_DEV.md §5`（057 的 AC11；其 `:132` 错写 `SKIPPED` 的修复归 057）
- `docs/handbook/technical/DATA_MODEL.md`（本卡无 schema 变更）
- `docs/development/requirements/specs/FS-cron-worker-status-board*.md`（字段旧名回改由 PM 处理，登记 §9 T-2）

---

## 5. Work Breakdown

> 顺序即依赖顺序。**W0 / W12（规划期准备与证据）已由 Planner 完成**；W1 完成前不得动 W3+（常量是 W3 的地基）。

- [x] **W0 分支准备**（2026-10-26 完成）：分支 `feature/TASK-054-cron-status-aggregate-api` 已建并基于含文档基线的 HEAD；`grep -rn "STALE_FACTOR\|STALE_THRESHOLD\|cronStatus" shared/ server/` → 0 命中（无既有实现，不与 057 撞车）。
- [x] **W1 常量**：新建 `shared/constants/cronStatus.constants.js`（§4.6，含 `PRICE_SYNC_DUE_HOUR`）。
- [x] **W2 服务层骨架**：新建 `shared/services/cronStatus.service.js`，先导出 `buildLastRuns(now)`（Q1）+ `pickTargetDay(market, now, tz)`（D-16 纯函数）+ `resolveStale(lastRun, now)`。
- [x] **W3 单元测试（先红）**：新建 `server/test/integration/cronStatus.service.test.js`，写入 §7.2 全部用例并**确认全部失败**（红的具体形态见 §7.2）。**实测红形态**：service 尚未创建时运行 → `MODULE_NOT_FOUND`（require stack 指向本测试文件）；实现后由 15/15 绿，Reviewer 整改后 17/17 绿。
- [x] **W4 价格数据态**：`buildPriceDataState(now)`——D-16 锚点 → expected/fetched/missing/byMarket/notListed/unsupportedMarkets → `dayPriceSymbolCount`（Q2/Q3/Q7）。
- [x] **W5 另四项数据态 + 降级**：`buildIntegrity/Alerts/Fx/Rebalance`，含 `contractReady` / `notes` / `dataStateLevel`（§4.4；fxCount 走 Q5）。
- [x] **W6 再平衡 row builder**：`buildRebalanceRows({date, portfolioId})`（Q4/Q6），供主视图与 detail 共用；返回 `perPortfolioDate`。
- [x] **W7 对外编排**：`getStatus({now, detail, date, portfolioId})` 返回 §4.3 / §4.5 的完整结构；参数校验逻辑以「抛 `error.status=400`」的形式留在 controller。
- [x] **W8 控制器 + 路由 + 注册**：`controllers/cronStatus.controller.js`（`getStatus`）、`routes/cronStatus.routes.js`（**`router.get('/status')`**）、`app.js` 插 1 行（D-15）。
- [x] **W9 集成测试**：`server/test/integration/cronStatus.api.test.js`（AC1 全字段、AC8 参数校验；若 058 已落地则加会话 stub）。
- [x] **W10 回归**：`npm run test:server`（基线 **152** 条全绿 → 实测 **180/0**）、`npm run test:worker`（**77/0**，零变化）、`node --check` 新增文件。
- [x] **W11 文档**：`API_CONTRACT.md` 接口清单加 1 行（含 `notes`/`targetMarketDate` 语义）；`SERVER.md` §5 加 1 行 + 修 `:64` + 写明 `PRICE_SYNC_CRON` 与 `PRICE_SYNC_DUE_HOUR` 的联动；`ARCHITECTURE.md:136`（另修 `:174/:224/:225`）+ `PRODUCT_LINES.md:170` 约束措辞改写；`docs/readme.md` 状态更新为 `REVIEWED`。
- [x] **W12 真实库只读探测**（2026-10-26 完成，见 §3.6 / §7.4）：`active=44`、最近有价日 `2026-10-21`、目标日 `2026-10-23` 桶 `0`、`taskruns=244/含 result=0`、僵尸 RUNNING 非最新、44/44 symbol 精确匹配。
- [x] **W13 交接 Reviewer**：按 §10 逐项自检，附 §7 全部实测输出；第一轮 PASS WITH FINDINGS → 8 条修复 → 第二轮复检 PASS（仅 4 条文档台账项，已收尾）。

---

## 6. 与 `TASK-057`（C-05）的先后顺序

| 顺序 | 后果 | 判断 |
|---|---|---|
| **057 → 054**（PM 推荐） | 054 上线即有完整数据态，`contractReady` 全 `true` | 最优，但会推迟看板 |
| **054 → 057**（本计划假定） | 054 首日：价格卡有真实数字；其余 4 卡 `contractReady=false` + 黄条「数据契约未就绪」。057 落地后**同一个接口自动填满**，054 零改动（除 D-21 适配器如需微调） | **可行**，且这是 AC3/AC5/AC6 明文设计的降级路径 |

**结论：054 不等 057，但不得在 057 落地前宣称「数据态完成」。** 三条铁律：

1. 057 冻结的 `result` 键名与 054 的读取键必须一致；不一致时**改 054 的映射（D-21 适配器），不改 057 的写入**（读侧适配写侧，避免动数据）。
2. 任一卡都**不得**为了「让数字好看」去改 `integrityCheck.js` / `alertEngine.service.js` 的业务输出。
3. 文档口径有两处已发现的内部不一致，随 057/A 卡处理，**不由 054 擅自修改**：①`FS-tasks C-05:109` 仍写「必须先于 C-02 与 C-07」，而 `BOARD.md` 已裁定互不阻塞；②`CRON_WORKER_DEV.md:132` 把 `SKIPPED` 写成四态之一，实际 schema 没有。

---

## 7. Verification

### 7.1 静态检查（AC10 / AC11 / 结构）

```bash
# ① 只读：controller 与 service 都不得出现写调用（AC10 原文 + service 加强）
grep -rn "TaskRun.create\|TaskRun.updateOne\|TaskRun.deleteOne\|insertMany\|bulkWrite\|\$set" \
  server/controllers/cronStatus.controller.js shared/services/cronStatus.service.js   # 期望 0 行

# ② 路由注册恰好 1 行；路由总数 9 → 10（若 TASK-058 已合入，则断言「≥10 且 /api/cron 恰好 1 行」，不要死锁 10）
grep -c "app.use('/api/" server/app.js            # 期望 10（058 合入后放宽为 >=10）
grep -n "app.use('/api/cron'" server/app.js       # 期望 1 行

# ③ 路径必须精确 /api/cron/status（M-1）
grep -n "router.get('/status')" server/routes/cronStatus.routes.js   # 期望 1 行
grep -rn "router.get('/')" server/routes/cronStatus.routes.js        # 期望 0 行

# ④ cron-worker 零改动（AC11）
git diff --stat <base> -- cron-worker/            # 期望空

# ⑤ 阈值/常量不在 controller（AC7 原文）
grep -n "48\|STALE_FACTOR\|TASK_PERIOD_HOURS\|PRICE_SYNC_DUE_HOUR" server/controllers/cronStatus.controller.js   # 期望 0 行

# ⑥ 未新增第二个端点（AC8 / FS §10）
grep -rn "router\.\(get\|post\|put\|delete\)" server/routes/cronStatus.routes.js  # 期望恰好 1 行 get('/status')

# ⑦ 共享内核分层约束
grep -rn "require('\.\./\.\./server\|require('\.\./\.\./cron-worker" shared/services/cronStatus.service.js  # 期望 0 行

# ⑧ 禁止符号归一（D-20）
grep -rn "stripSuffix" shared/services/cronStatus.service.js   # 期望 0 行
```

### 7.2 单元测试（AC12，**先红后绿**）

`server/test/integration/cronStatus.service.test.js`——猴补模型静态方法（`TaskRun.aggregate` / `Asset.find` / `Price.find` / `Portfolio.find` / `FxRate.aggregate`），`afterEach` 还原。

| # | 用例 | 断言（必须能失败） | 红的具体形态 |
|---|---|---|---|
| U1 | **AC2 日期归桶**：`now = 2026-10-23T14:00:00Z`（周五，03:00 后）；US 资产 3 个（`AAA`/`BBB` 周四桶有价、`CCC` **只在周五桶有价**），另有一条周五桶的 `AAA` 价 | `targetMarketDate === '2026-10-22'`；`expected===3`、`fetched===2`、`missing===['CCC']`、`dataStateLevel==='warn'`（证明按 timestamp 归桶、且错日期的价不得计数） | 直接把「今天」或「昨天」当目标日、或忽略 timestamp 归桶 → 断言失败 |
| U2 | **AC2 节假日回退**：`now = 2026-10-05T14:00:00Z`（CN 国庆长假内）；仅 CN-FUND 资产 | `targetMarketDate` 早于 `2026-10-01`；`expected > 0`；不出现 `NaN` | 只回退 1 天（不做循环）→ 失败 |
| U3 | **AC2 `expected=0`**：`active` 资产为空 | `expected===0`、`fetched===0`、`missing: []`、`dataStateLevel==='unknown'`（**不得**是 `'ok'`）、`notes` 含 `EXPECTED_ZERO` | 把 `fetched>=expected` 判成 ok → 失败（0/0 不是"齐了"） |
| U4 | **AC2 多市场不同目标日（D-17）**：`now = 2026-10-08T14:00:00Z`（周四；US/CA 上一开市日 10-07，CN 因 10-01~07 长假上一开市日 **09-30**） | 顶层 `targetMarketDate === '2026-10-07'`；`byMarket.US.targetMarketDate==='2026-10-07'`、`byMarket['CN-FUND'].targetMarketDate==='2026-09-30'`；**顶层 `expected` = 各市场 expected 之和** | 取 `Math.min`，或只按顶层单一日期统计 expected → 失败 |
| U5 | **AC7 僵尸（最新一条）**：最新 `status='RUNNING'`、`startedAt = now - 3d` | `stale===true`、`lastRun.status==='STALE'`、`lastRun.rawStatus==='RUNNING'` | 不判 stale → `status==='RUNNING'` 时失败 |
| U6 | **AC7 负向对照**：最新 `status='RUNNING'`、`startedAt = now - 1h` | `stale===false`、`lastRun.status==='RUNNING'` | 判据写成 `status==='RUNNING'` 就 stale → 失败 |
| U7 | **AC9 空态**：三个集合全空 | 5 项 `lastRun===null`；**4 项 `contractReady===false`**（完整性/提醒/汇率/再平衡）+ **价格项 `contractReady===true`**（其数据态不依赖 taskruns，实现期修正见 §11.3）；`JSON.stringify(data)` **不含 `'SUCCEEDED'`**；价格项 `expected===0` | 任何"没记录就当成功"的兜底 → 失败 |
| U8 | **AC3 不得用 status 冒充**：`lastRun.status='SUCCEEDED'` 但无 `result` | `missingCount===null`（**不是 0**）、`contractReady===false`、`notes` 含 `CONTRACT_NOT_READY` | 把 `missingCount` 默认成 0 → 失败 |
| U9 | **AC6 不得反推 due**：父任务无记录、4 条子任务记录全 `SUCCEEDED` | `due===null`（**不是 0**，也不是 4）；`failures` 仍可读 | 用子记录数当 due → 失败 |
| U10 | **AC5 不得用 fxCount 反推币种**：`FxRate` 最新日 3 条、无 `result` | `fxCount===3`、`currencies===null`、`contractReady===false` | 编造 `{USD:ok,CAD:ok,HKD:ok}` → 失败 |
| U11 | **AC4 `created=0` 正常态**：`result={evaluated:12,created:0,archived:1,failed:0}` | 四项数值透传；`dataStateLevel==='ok'`（**不得** `'warn'`/`'bad'`） | 把 created=0 映射成失败/黄 → 失败 |
| U12 | **D-16 周末有效目标日**：`now = 2026-10-25T14:00:00Z`（周日）；价格只有 `10-22(周四)` 桶 | `targetMarketDate === '2026-10-22'`；`calendarPrevOpenDay === '2026-10-23'`（周五）；`notes` 含 `TARGET_LAGGED`；`fetched===expected` → `'ok'` | 用日历口径取 10-23 → 得 0/44 `'bad'` → 失败 |
| U13 | **D-16 未到采集时点**：`now = 2026-10-26T06:00:00Z`（周一 02:00 EDT，03:00 前） | `targetMarketDate === '2026-10-22'`（周四）；**不得**取 10-23（周五价尚未采集） | 只要「今天开市」就取昨天 → 失败 |
| U14 | **D-19 只判最新**：stub 只返回每任务最新一条（Q1 的 `$sort startedAt:-1` + `$group $first` 由 **U17** 直接断言管线形状）；测试世界给最新一条 `SUCCEEDED` | `stale===false`、`lastRun.status==='SUCCEEDED'`（历史 RUNNING 被 Q1 天然排除，不另扫全表） | 改成扫全表找 RUNNING → 与 U17 的管线断言冲突 → 失败 |
| U15 | **真实停摆仍报红**（D-16 不得掩盖故障）：`now = 2026-10-26T14:00:00Z`（周一 10:00 EDT，03:00 已过），价格只有 `10-22` 桶 | `targetMarketDate==='2026-10-23'`、`fetched===0`、`dataStateLevel==='bad'` | 把「今天没采集」也回退成上周四 → 掩盖真实停摆 → 失败 |
| U16 | **脏 `result` 不 500**（Reviewer F2）：`gapAssets:[null,{…}]`、父 `perPortfolio:[null,{…}]`、子 `failures:[null,{…}]` | 端点不抛错；`null` 元素被过滤，正常项照常透出 | 无护栏 → TypeError 500 → 失败 |
| U17 | **查询形状**（Reviewer F4）：Q1 必须 `$sort startedAt:-1` + `$group $first`；Q5 必须 `$dateToString` + `$sum` + `$limit`；Q6 必须同时匹配 `rebalance-check` 与 `rebalance-suggestions:` | 断言被记录的 aggregate 管线 | 改成全表扫描 / 全量取回 → 失败 |

> 给 U4 用的真实日历数据：2026 CN 休市 = `10-01/02/05/06/07`（`shared/config/markets.js:36-44`），不存在"10-21~23 连休"——初稿 U4 的日期组合在真实日历下不可能成立（M-6）。

### 7.3 集成测试（AC1 / AC8）

`server/test/integration/cronStatus.api.test.js`——`app.listen(0)` + `fetch`，猴补模型静态方法。若 `TASK-058` 已合入，按 058 ED-5 的做法**只 stub `session.service.resolve`、保留真实闸门**（禁止测试绕过开关）。

| # | 用例 | 断言 |
|---|---|---|
| A1 | AC1 全字段 | 200；`body.success===true`；`data.tasks.length===5`；`taskName` 顺序与 §4.3 表一致；每项含 `lastRun/stale/contractReady/dataState/dataStateLevel/notes`；`data.generatedAt` 可被 `Date.parse` |
| A2 | AC1 有记录时 | `lastRun` 含 `runKey/trigger/status/rawStatus/startedAt/endedAt/durationMs/totalCount/successCount/failureCount`；`RUNNING` 记录 `endedAt===null`（键存在） |
| A3 | AC8 `date` 非法 | `?detail=rebalance&date=2026-13-40` → 400；`?detail=rebalance&date=../../etc` → 400；`body.success===false`、`body.data.traceId`（或 `X-Trace-Id` 头）存在 |
| A4 | AC8 `portfolioId` 非法 | `?detail=rebalance&portfolioId=not-an-id` → **200**、`data.rows:[]`、`notes[].code==='PORTFOLIO_ID_INVALID'` |
| A5 | AC8 `portfolioId` 不存在 | 合法 ObjectId 但库里无 → 200、`rows:[]`、`notes[].code==='PORTFOLIO_NOT_FOUND'` |
| A6 | AC8 detail 正常 | 返回 `summary` 五项 + `rows[]`，且 `rows[0]` 字段集与主视图 `dataState.perPortfolio[0]` **一致**（D-8 同构性断言） |
| A7 | AC9 空态 HTTP 层 | 全空集合 → 200，`JSON.stringify(body.data)` 不含任何 `SUCCEEDED` |
| A8 | detail 非 rebalance | `?detail=foo` → 400、`notes[].code==='DETAIL_NOT_REBALANCE'`（经 `failure()` 返回时为 `error.code` 或 message，按既有封装实测） |
| A9 | AC1 路由精确性 | `GET /api/cron/status` → 200；`GET /api/cron` → 404（M-1 回归） |
| A10 | AC8 detail 空日 | 该日无分发记录 → 200、`rows:[]`、`notes[].code==='NO_DISTRIBUTION_RECORD'`（Reviewer F1 回归） |
| A11 | AC8 date 作用域 | 主视图 `?date=garbage` → **200**（date 仅 detail 校验；不让 URL 里的旧 date 拖垮看板，Reviewer F6 回归） |

### 7.4 真实库只读探测（**2026-10-26 已执行，原 §7.4 的"待 Implementer 执行"取消**）

> 方法：读 `server/.env` 的 `MONGO_URI`（`portomind_dev`），把库名替换为 `portomind` 后用 mongoose 只读查询；**全程无写操作**。未跑 `npm run sync:db`（生产库可直接只读，且避免 `--drop` 覆盖开发库）。
> 若要为前端联调准备本地数据，再另行执行 `npm run sync:db`（镜像 `portomind → portomind_dev`，需 MongoDB Database Tools）。

```bash
node - <<'EOF'
const dotenv = require('dotenv'); dotenv.config({ path: 'server/.env' });
const uri = process.env.MONGO_URI.replace(/^(mongodb(?:\+srv)?:\/\/[^/]+\/)[^?]*/, '$1portomind');
// ... 只读 find/aggregate/distinct（完整脚本见任务卡 §2.4 / 本次探测记录）
EOF
```

| 项 | 值 |
|---|---|
| active 资产 / 分市场 | 44 = `CN-FUND 29` + `CA 11` + `US 4` |
| `launchDate` 为空 | 44/44 |
| 最近有价日 | `2026-10-21`（42 条）；`10-22` 起无新桶 |
| 目标日（日历口径 `2026-10-23`）桶 | 0 条 |
| 周末桶 | `10-24 = 0`、`10-25 = 0` |
| `taskruns` / 含 `result` | 244 / **0** |
| 状态分布 | `SUCCEEDED 154` / `PARTIAL 45` / `FAILED 44` / `RUNNING 1` |
| 僵尸 `RUNNING` | `daily-price-sync` `manual:2026-08-25T23:07:45.616Z`（**非最新**） |
| 各任务最近一条 | price 10-25 `SUCCEEDED` 0/44；integrity 10-25 `SUCCEEDED` 0/44；fx 10-25 `FAILED`；alert 10-25 `SUCCEEDED`；rebalance 无记录 |
| 未归档组合 | 4（`A股-长钱组合`/`A股-稳钱组合`/`CA-RRSP组合`/`CA-家庭RESP组合`，全 `daily`） |
| symbol 精确匹配 | 44/44 ✅；另有 27 条无后缀历史别名行（同一批 `.CN` 基金） |
| 最新 FxRate | 2026-10-22：USD `0.149493` / CAD `0.210155` / HKD `1.173012`（方向反，TASK-051） |

**证据缺口状态：已关闭。** 残留（不影响编码，记 §8 R-14）：采样时 2026-10-26 无任何 `taskrun`，说明采样时点的 worker 未在当日 03:00 运行；看板首日会因此显示价格红/汇率 FAILED——**这是正确信号**，交付说明需写明「首日红灯可能是真实停摆，不是接口缺陷」。

### 7.5 回归

```bash
npm run test:server     # 基线 152 条（2026-10-26 实测）+ 新增 ≥20 条
npm run test:worker     # 基线 77 条，期望零变化
node --check shared/services/cronStatus.service.js
node --check shared/constants/cronStatus.constants.js
node --check server/controllers/cronStatus.controller.js
node --check server/routes/cronStatus.routes.js
```

> 不接受「build/lint 通过」当交付依据（TASK-043 教训）；必须附测试条数与失败数为 0 的实际输出。
> 本仓沙箱 shell 不能跑 `node --test`（子进程 `spawn EPERM`）且既有子目录不可写——回归请在本机终端/CI 执行，或先解决 shell 写权限；`npm run test:server` 的正常输出形如 `tests 152 / pass 152 / fail 0`。

### 7.6 AC 覆盖矩阵

| AC | 覆盖手段 |
|---|---|
| AC1 | A1 / A2 / A9 |
| AC2 | U1–U4 / U12 / U13 + §7.4 实测 |
| AC3 | U8 / U11（结果缺失与 `totals` 回退） |
| AC4 | U11 |
| AC5 | U10 |
| AC6 | U9 + A6 |
| AC7 | U5 / U6 / U14 / U17 |
| AC8 | A3–A6 / A8 |
| AC9 | U7 / A7 |
| AC10 | §7.1 ① |
| AC11 | §7.1 ④ |
| AC12 | §7.2 + §7.3 全部执行输出 |
| AC13 | §7.1 之外的人工核对：5 份文档改动 + `grep -rn "cron/status" docs/` 命中 ≥4 处 |
| AC14 | 独立 Reviewer 按 §10 复核 |

---

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| **R-1** | ~~「上一开市日」缺生产数据背书~~ **已关闭**（§3.6） | 探测已在规划期完成；残留：采样时 worker 当日未运行，属真实停摆信号（R-14） |
| **R-2** | **symbol 写法不一致伪造缺口**（P0 历史缺陷）：`transactions/targets` 用 `000191.cn`，`assets/prices` 用 `000191`；实库另有 27 对 `001180`/`001180.CN` 双写法，但 **44/44 active 资产精确匹配** | `expected` 一律**从 `asset.symbol` 出发精确匹配**（D-20），**不得**从 `Price` 反向聚合、**不得**做后缀归一；`dayPriceSymbolCount` + `SYMBOL_FORMAT_MISMATCH` 提供诊断 |
| **R-3** | **全市场同时停更时全红**：`missing` = 全部，卡片全红。这其实是**正确**的（真实故障） | `fetched=0` 时靠 `dayPriceSymbolCount` 区分「源整体故障」与「symbol 对不上」；文案由 C-03 负责 |
| **R-4** | **用 `status` 当完成度**（最省事的偷懒实现） | U8/U9/U10 三条负向断言 + OD-5 的 level 只看数据态；Reviewer 见「只返回 status 的实现」直接 BLOCKER |
| **R-5** | **N+1 查询**：5 任务 × 44 资产 × 逐日回退，容易写成几百次 | §4.2 的查询预算表是硬约束；Reviewer 用 `grep -c "await Price\|await Asset\|await TaskRun"` 粗查循环内查询 |
| **R-6** | **既有 152 条 server 测试被打断**：`api-contract.test.js` 会 `require('../../app')`，新增路由会在该层被加载 | 新路由**不得**在 require 时连接数据库或做同步 IO（只在 handler 内查询）；W10 先跑全量再交付 |
| **R-7** | **与 `TASK-057` 撞车**：两卡都想要「僵尸阈值常量」，可能各建一份 | D-4：单一归属 `cronStatus.constants.js`，先落地者建；W0 已 grep 确认无既有实现 |
| **R-8** | **文档留假事实**：`ARCHITECTURE.md:136` / `PRODUCT_LINES.md:170` 明文「没有这类端点」 | D-10 列入 In Scope（OD-6 批准）；Reviewer 用 `grep -rn "不暴露调度\|没有这类端点" docs/` → 期望 0 行 |
| **R-9** | **时区错一天**（F-3/D-12）：用 `T00:00:00Z` 构造候选日会让 CN/HK 跨日 | U2/U4 覆盖；实现里统一 `T12:00:00Z` |
| **R-10** | ~~`dataStateLevel` 越权~~ **已解决**：OD-5 批准，且 level 只由数据态决定 | Reviewer 检查 level 判定表不出现 `status` |
| **R-11** | **`?detail` 变成事实上的第二端点**，将来 C-07 再塞更多参数 | 只接受 `detail/date/portfolioId` 三个参数，其余一律忽略；新增参数需回改本计划 |
| **R-12** | **首日全黄条引发误判**：上线时 4 张卡都是「数据契约未就绪」，用户可能以为接口坏了 | 该状态是**预期**（§3.6：244 条历史 `result` 为 0）。交付说明里必须写明，并告知 057 落地才消失 |
| **R-13** | **采集节奏导致的周末假缺口**（本版新识别，最实质） | **D-16 + U12/U13 已解决**：目标日跟随「已到点的采集」，不再把未采集交易日算缺口；真实停摆仍会红（U13/实库现状） |
| **R-14** | **采样时 worker 未运行**（2026-10-26 无 taskrun；最新为 10-25） | 看板首日价格红/汇率 FAILED 属正确信号；交付说明与截图须写明「先确认 worker 在跑」；C-06（停滞提示，P1）负责长期兜底 |
| **R-15** | **`TASK-058` 认证互锁**：058 合入后本端点需要登录，A1–A9 未登录会 401；`app.use('/api/')` 计数也会变 | 测试按 058 ED-5 只 stub `session.service.resolve`、保留真实闸门；§7.1② 计数断言放宽为 `>=10`；两卡合入顺序由 Human 排 |
| **R-16** | **`TASK-057` 的 `result` 键名未冻结**（U-2），且与 FS 旧名/057 AC3 新名不一致 | D-21 适配器（完整性 `totals` → 顶层 → `{ok,gap}`；提醒 `created`→`alertsFired`；汇率 `currencies`/`rates`）；057 定稿后只改一处映射，不动写入侧 |
| **R-17** | **历史别名行干扰**：`prices` 里有 27 条无后缀的旧写法行 | 所有查询都以 `asset.symbol` 为出发点（D-20）；`dayPriceSymbolCount` 只做诊断，不参与计数 |

---

## 9. Open Decisions（**2026-10-26 已全部裁定**）

> Human（Max）2026-10-26 在对话中明确：「裁完 OD-4/5/6 + 4 条新裁决，按照你的建议修改」——即 **OD-4/OD-5/OD-6 与新增 4 项（D-16~D-19）全部采纳 Planner/Review 建议**；OD-1/OD-2/OD-3/OD-7 维持 Planner 原裁定（未推翻）。

| ID | 问题 | 裁定 | 批准日 |
|---|---|---|---|
| **OD-1** | OQ-1 字段名 | 方案 A（实现真名，D-1） | 2026-10-26（随卡批准） |
| **OD-2** | OQ-2 多市场目标日 | 方案 ①「取最晚」+ `byMarket`（D-3），并由 D-17 细化「顶层=各市场之和」 | 2026-10-26 |
| **OD-3** | OQ-3 僵尸阈值 | 逐任务常量表，当前全 48h（D-4） | 2026-10-26 |
| **OD-4** | **AC2 的 `expected` 是否排除未成立资产**（D-2） | **排除 + `notListed[]`**；`launchDate` 归一到 `MARKET_TIMEZONE` 比较，`null` 视为已上市 | ✅ 2026-10-26 |
| **OD-5** | **是否接受服务端返回 `dataStateLevel`**（D-6） | **返回**；**条件：level 只由数据态决定，`status` 不参与**（与 TASK-055 AC7 / FS §3 对齐） | ✅ 2026-10-26 |
| **OD-6** | 是否同意把 `ARCHITECTURE.md:136` / `PRODUCT_LINES.md:170` 一并改写（D-10） | **同意**；文档基线已提交（`97ccfc7`/`1895530`），锚点已在 HEAD 复核；改写为「不得暴露触发/写操作，仅允许只读聚合查询」 | ✅ 2026-10-26 |
| **OD-7** | 057 与 054 的落地顺序 | 054 先（降级路径已设计） | 2026-10-26 |
| **OD-8** | **AC2 目标日锚点**（D-16） | **有效目标日**：`target` = 最近一个「开市 + 03:00 已过」交易日之前的最近开市日；另返 `calendarPrevOpenDay` + `TARGET_LAGGED`；周末/假日/03:00 前不报假缺口 | ✅ 2026-10-26 |
| **OD-9** | **多市场 `expected` 口径**（D-17） | 顶层 = **各市场按其目标日分别统计之和**；顶层 `targetMarketDate` = 各市场最晚者；`byMarket` 保留 | ✅ 2026-10-26 |
| **OD-10** | **AC5 `fxCount` 来源**（D-18） | 只读 `FxRate` 最新汇率日的币种记录数（Q5，预算 +1）；C-05 后优先 `result.fxCount` | ✅ 2026-10-26 |
| **OD-11** | **AC7 范围**（D-19） | 只判每任务**最新一条**；历史 `RUNNING` 不暴露；删除「首日真实命中僵尸体」的说法 | ✅ 2026-10-26 |

**遗留（不由本卡处理，登记以便跟踪）**

| # | 事项 | 归属 |
|---|---|---|
| T-1 | FS §4.3 / `FS-tasks C-02:59` 的旧字段名（`{ok,gap,alertsFired}`、汇率「各币种成功标志」）与已批准实现口径不一致 | PM（FS 回改） |
| T-2 | FS OQ2 需补一句「多市场目标日」口径（D-3/D-17） | PM（FS 回改） |
| T-3 | `TASK-051` 汇率方向反了（实库最新值 USD `0.149493`） | `TASK-051` |
| T-4 | 采集节奏「周五价 → 下周一 03:00 才采」是采集侧缺陷（不是看板缺陷） | 运维/新卡（本卡只把口径改准） |
| T-5 | `CRON_WORKER_DEV.md:132` 把 `SKIPPED` 写成已实现四态；`FS-tasks C-05:109` 与 `BOARD.md` 对 057→054 顺序表述不一致 | `TASK-057` / PM |
| T-6 | 44/44 资产缺 `launchDate`，导致完整性检查形同虚设（C-10 P2） | `TASK-057` 后 / C-10 |

---

## 10. Implementer 交接说明

**开工前必读**：本文件 §4.3（字段冻结）、§4.4（逐项算法，尤其 D-16）、§4.8（21 条决策）、§7（验证）。

**必须遵守**：

1. **只读**：不得在 service/controller 里出现任何写调用。看到僵尸 `RUNNING` 想"顺手修一下"——不许（AC10 / 057 §4）。
2. **不改 `cron-worker/` 与 `shared/models/`**：一行都不许（NG2 / 057 范围）。
3. **不重算业务数据**：价格只查库、不调 fetcher；再平衡只读 `taskruns`、不调 `ThresholdChecker`（NG3）。
4. **`null` ≠ `0`**：`contractReady=false` 时数值字段一律 `null`。任何 `|| 0` 都是缺陷。
5. **日期运算只在 `shared/` 侧**：`server` 没有 dayjs。
6. **候选日用 `T12:00:00Z`**（D-12）；**目标日用 D-16 的 `dEff` 公式**，不许退回「昨天起回退」。
7. **符号匹配精确比对**（D-20），不许 strip 后缀。
8. **路径必须是 `GET /api/cron/status`**：`app.use('/api/cron', …)` + `router.get('/status')`（M-1）。
9. **`dataStateLevel` 只看数据态**（OD-5 条件），不得把 `status` 塞进判定表。
10. **先红后绿**：W3 必须在 W4/W5 之前写完并看到失败（红的形态见 §7.2），不许回头补测试。
11. **字段名照抄 §4.3**，不许"顺手改名更好听"；`notes` 是数组，不是单对象。
12. **若 `TASK-058` 已合入**：测试按 058 ED-5 只 stub `session.service.resolve`，保留真实闸门；不得加测试绕过开关。

**交付时必须附**：§7.1 八条 grep 的实际输出、§7.2/§7.3 的测试条数与失败数、§7.5 全量回归输出、§7.4 的探测数字（已预填，复核即可）。缺一项视为未完成（TASK-043 教训：build/lint 通过不能当交付依据）。

**完成后写 §11 Implementation Record**（核对预填的规划期证据，补 W1–W13 实施结果）。

---

## 11. Implementation Record

> 规划期证据由 Planner 于 2026-10-26 填写；W1–W13 由 Implementer 填写。

### 11.1 规划期已闭环项（2026-10-26）

- [x] 分支 `feature/TASK-054-cron-status-aggregate-api` 建立；文档基线提交 `97ccfc7` / `1895530`；工作区代码目录干净（`git status -- server shared cron-worker` 为空）
- [x] Human Plan Review：OD-4 / OD-5 / OD-6 + 新增 4 项（D-16~D-19）全部采纳建议；ExecPlan 状态 → `Approved`
- [x] 只读实库探测（§3.6 / §7.4）：active 44（CN-FUND 29 / CA 11 / US 4）；最近有价日 2026-10-21；目标日 2026-10-23 桶 0；周末桶 0；taskruns 244 / 含 `result` 0；僵尸 RUNNING 非最新；44/44 symbol 精确匹配；最新 FxRate 2026-10-22（方向反）
- [x] 证据缺口 U-1 关闭；U-3 随 OD-5 关闭；U-2 由 D-21 适配器吸收
- [x] 基线测试：`test:server` 152 pass / 0 fail；`test:worker` 77 pass / 0 fail（本机终端实测）

### 11.2 初稿修订对照（9 处硬伤 + 2 条事实纠错）

| # | 初稿问题 | 本版处理 |
|---|---|---|
| M-1 | 挂载 `/api/cron` + `router.get('/')` → 实际 `/api/cron`，与 AC1 的 `/api/cron/status` 不符 | 改 `router.get('/status')`；§7.1③、A9 回归 |
| M-2 | AC5 的 `fxCount` 无合法来源（`normalizeCounts` 丢弃、预算无 FxRate） | D-18 + Q5（只读 `FxRate` 最新日计数） |
| M-3 | 多市场 `expected` 与 AC2 单日定义冲突 | D-17（顶层 = 各市场之和）+ AC2 细化 + U4 |
| M-4 | AC7「首日真实命中僵尸体」不成立（僵尸非最新） | D-19 删该说法 + U14 负向用例 |
| M-5 | 主视图 `perPortfolio` 无日期基准；detail 默认日依赖不存在的父任务 | 新增 `perPortfolioDate`；detail 默认日三级回退（§4.5） |
| M-6 | U4 用例日期在真实日历下不可能（CN 无 10-21~23 连休） | U4 改用 `now=2026-10-08`（CN 09-30 / US 10-07）；U12/U13 补周末/凌晨 |
| M-7 | 未考虑 `TASK-058` 认证互锁（401 / `app.use` 计数） | §7.1② 放宽、§7.3 会话 stub、R-15 |
| M-8 | AC4 无测试（§7.6 引用不存在的 U-V1） | U11 + AC4 覆盖 |
| M-9 | `gapAssets` 依赖 057 未决的 OQ-2 | D-21 回退 `result.assets[]`；R-16 |
| F-2 | 初稿称「同一交易日抓两次会有两条」 | 纠正：`saveLatest` 是 upsert，一天一条（§3.4 F-2） |
| F-9/F-10 | 初稿未识别采集节奏与 `launchDate` 全空 | 新增 F-9/F-10 + D-16 / OD-4 说明 |

### 11.3 实施结果（2026-10-26，Implementer）

**交付文件**

| 文件 | 状态 |
|---|---|
| `shared/constants/cronStatus.constants.js` | 新增（5 任务名 / 周期 / 48h 阈值 / 回退上限 / **03:00 同步时点** / 再平衡前缀） |
| `shared/services/cronStatus.service.js` | 新增（唯一派生实现：Q1–Q7 只读查询 + 5 项数据态 + detail） |
| `server/controllers/cronStatus.controller.js` | 新增（参数校验 + `success`/`failure`） |
| `server/routes/cronStatus.routes.js` | 新增（`router.get('/status')`） |
| `server/app.js` | 修改（+1 require、+1 `app.use('/api/cron', …)`，路由 9 → 10） |
| `server/test/integration/cronStatus.service.test.js` | 新增（U1–U17，17 条） |
| `server/test/integration/cronStatus.api.test.js` | 新增（A1–A11，11 条） |
| `server/test/helpers/modelStubs.js` | 新增（测试替身，仅测试用） |
| `docs/handbook/technical/API_CONTRACT.md` / `docs/handbook/ops/SERVER.md` / `docs/os/architecture/ARCHITECTURE.md` / `docs/handbook/product/PRODUCT_LINES.md` | 修改（AC13 + D-10） |

**验证证据（本机执行，2026-10-26）**

- §7.1 静态检查：写调用 **0**；`app.use('/api/')` = **10** 且 `/api/cron` 1 行；`router.get('/status')` 1 行、`router.get('/')` 0 行；`cron-worker/` 改动 **0**；controller 内阈值常量 **0**；`shared` 反向 require **0**；`stripSuffix` **0**；`node --check` 5 个文件全部通过。
- 新增测试：`cronStatus.service.test.js` **17 pass / 0 fail**；`cronStatus.api.test.js` **11 pass / 0 fail**（含 Reviewer 整改后新增的 U16/U17/A10/A11）。
- 全量回归（Reviewer 整改后复跑）：`npm run test:server` = **180 pass / 0 fail**（基线 152 + 新增 28）；`npm run test:worker` = **77 pass / 0 fail**（零变化）。
- 真实库只读冒烟（生产库 `portomind`，无写操作）：
  - `now=2026-10-26` 快照：价格目标日 `2026-10-23`、`expected=44 / fetched=0` → `bad`；完整性/提醒 `contractReady=false`；汇率 `fxCount=3 / currencies=null`；再平衡 `perPortfolioDate=2026-10-25`、4 行、`due=null`、`failures=1`；detail `rows=4 / failed=1`；非法/不存在 portfolioId → `PORTFOLIO_NOT_FOUND` 且 200。
  - `now=2026-10-22`（历史）快照：目标日 `2026-10-21`、`expected=44 / fetched=42`（CN-FUND 29/29、CA 9/11、US 4/4）、missing=`VBU.TO,VBG.TO` → `warn`。**精确符号匹配在真实数据上成立**（D-20）。
  - 同一快照证明 D-16：周末/03:00 前目标日自动回退，而真实停摆（10-26 无 run）仍报 `bad`。

**与计划的差异（4 处，均已回写计划/测试）**

1. **价格项 `contractReady` 恒为 `true`**：价格数据态只依赖 `assets/prices`，不依赖 `taskruns.result`，为空集合时仍可计算 → 实施取 `true`；计划 §4.7/U7 的「5 项 false」已改为「4 项 false + 价格 true」。理由：`contractReady` 的语义是「该任务数据态字段是否完整可得」，价格项恒可得。
2. **Q6 主视图也需要 1 次查询**（子 taskrun 的 `runStatus/failures`）：主视图预算 5 → **6**（最差 7），§4.2 已更新。
3. **新增测试辅助文件** `server/test/helpers/modelStubs.js`（测试替身集中一处，避免两个测试文件重复猴补；不进入生产代码、不被 `test/integration/*.test.js` 入口单独执行）。另按 §7.2 新增 U15 用例（真实停摆不得被 D-16 掩盖）。
4. **脏数据护栏 `safeDate()`**：把 `launchDate` / `startedAt` / `endedAt` / 父任务日期统一做「非法 → null」处理，避免 C-05 的 Mixed 数据或历史脏值让只读端点 500（Reviewer F2 整改的一部分；U16 覆盖 `result` 内 null 元素）。

> ⚠️ **计划变更追认（供 Human 复核，AGENTS.md §6）**：以上 1–4 项均为**实施层澄清/加固**，不新增/删除任何对外字段，不改变 AC1–AC14 的语义；`contractReady` 对价格项的含义此前计划自相矛盾（§3.6 与 §4.7 表述冲突），本次按语义统一并回写。若 Human 认为需走正式计划变更审批，请驳回，我将回退为计划原文（价格项 `contractReady=false`）并相应改 U7。

**Reviewer 整改记录（2026-10-26，PASS WITH FINDINGS → 已修）**

| 编号 | 严重度 | 问题 | 整改 |
|---|---|---|---|
| F1 | MINOR | detail 空日发 `NO_TASK_RUN`，冻结契约要求 `NO_DISTRIBUTION_RECORD`，后者从不触发 | 改用 `NO_DISTRIBUTION_RECORD`；新增 A10 回归；§4.3 注明 `NO_TASK_RUN` 暂无触发路径 |
| F2 | MINOR | `result` 内 `null` 元素（Mixed 未校验）会 TypeError → 500 | `gapAssets` / `perPortfolio` / `failures` 全部过滤非对象元素；新增 U16 |
| F3 | MINOR | `ARCHITECTURE.md:174/224/225` 仍宣称「无调度状态接口 / 无 TaskRun 端点 / 9 个 controller」 | 已改写为「只读聚合已建立」并更正 controller 计数；FS 旧措辞仍由 PM 回改（§4.9） |
| F4 | MINOR | U14/D-19 与 D-18 只测结果不测管线；U1 未覆盖「仅错误日期有价」 | 新增 U17 断言 Q1/Q5/Q6 的聚合管线形状；U1 增加只在周五桶有价的 `CCC` → `expected=3/fetched=2/warn` |
| F5 | MINOR | `result` 缺失但 `FxRate` 有数据时汇率卡无 `CONTRACT_NOT_READY` 解释 | 改为 `contractReady=false` 必带 note；U10 增加断言 |
| F6 | MINOR | 主视图也校验 `date`（文档说仅 detail），URL 旧 date 会 400 | 仅 `detail=rebalance` 时校验/使用 `date`；新增 A11；API_CONTRACT 同步 |
| F7 | MINOR | `completenessRatio` 透传 `result` 值，计划要求服务端算 | 改为服务端 `actualCount/expectedCount` |
| F8 | MINOR | 计划变更未记录 Human 追认、代码与 §11.3 短暂不一致 | 本表 + 上方「计划变更追认」补齐；测试条数/回归数已更新 |

**实施期新发现**

1. 实库 `asset.symbol` 存的是小写 `.cn`（如 `015532.cn`），而 `Price.symbol` 写入即 uppercase；实施在比较两侧都做 `trim().toUpperCase()`（**大小写归一 ≠ 后缀归一**，不违反 D-20）。
2. 采样时（2026-10-26 23:26 EDT）生产库最新 `taskrun` 仍是 10-25，且 10-23 的 `daily-price-sync` 44/44 全失败 → 看板首日会红，属真实数据状态（R-14）。
3. `FxRate` 最新日为 2026-10-22（USD `0.149493`），`fx-rate-sync` 最新一次为 FAILED；C-05 接通后看板会直接暴露 `TASK-051` 的方向错误。
4. `launchDate` 44/44 全空，`notListed[]` 当前恒空——逻辑已实现，待资产补数据后才会生效。

---

## 12. Review Record

> 由独立 Reviewer 填写，Implementer 不得自评（AC14）。
> 复核重点：**R-4（不得用 status 冒充完成度）**、R-5（查询预算）、R-8（文档假事实）、AC9 的负向对照是否真的能失败、**D-16 的目标日公式是否真的不产生周末假缺口**、**D-20 是否严格精确匹配**、**`notes` 数组与 level 判定表是否与 OD-5 条件一致**。

### 12.1 第一轮（2026-10-26，独立 Reviewer）

- **结论：PASS WITH FINDINGS**（无 BLOCKER、无 MAJOR）。
- 复核范围：工作区快照 @ `2026-10-26 23:38 EDT`；AC1–AC14 逐条给出证据（AC14 = 本次复核本身）。
- 查询次数实测：主视图 **6**（`fetched===0` 时 **7**）、detail 带 `date` **2** / 缺省 `date` **3**、无效 `portfolioId` 0（早退）；无 N+1。
- 复核确认：R-4（5 个 builder 的 `dataStateLevel` 均无 `status` 输入）、R-5（6–7 次预算内）、R-8（`ARCHITECTURE:136`/`PRODUCT_LINES:170`/`SERVER:64` 已改，FS 旧措辞按 §4.9 转 PM）、AC9 负向断言可真实失败、D-16 与 U12/U13/U15 一致、D-20 严格精确匹配（未做后缀归一）。
- **8 条 MINOR（F1–F8）→ 整改记录见 §11.3「Reviewer 整改记录」，已全部修复。**

### 12.2 第二轮（复检，2026-10-27）

- **结论：PASS WITH FINDINGS**（无 BLOCKER、无 MAJOR）。F1–F8 全部 **RESOLVED**；新增 3 条 MINOR（N1/N2/N3）为文案/文档计数/计划行漂移，复检后已一并修复（见 §12.3）。
- 复核快照：`cronStatus.service.js` sha256 `D1C093E6…`（827 行）· controller `C81A6622…` · service test `B8DCCA76…` · api test `D35101EF…` · helper `0812D911…`。
- 验证：新增测试 service **17/17**、api **11/11**；Reviewer 用「每文件独立进程」等价执行全量：server **180/180**、worker **77/77**（单进程全量会因既有测试相互污染出现 12 fail，剔除 054 文件后的基线 152 用例同样 12 fail，证明与 054 无关；`npm test` 走进程隔离，即 180/0 路径）。
- F1（`service.js` detail 空日 → `NO_DISTRIBUTION_RECORD` + A10）、F2（`gapAssets`/`perPortfolio`/`failures` 过滤 + U16）、F3（`ARCHITECTURE.md:174/224/225`、`readme.md`、TASKS 头）、F4（U1 的 `CCC` 错桶 + U17 管线断言）、F5（FX 降级必带 note + U10）、F6（`date` 仅 detail + A11 + API_CONTRACT）、F7（服务端算 `completenessRatio`）、F8（§11.3 差异 4 + 追认 + 整改表）：**均复核通过**。
- 查询预算复测：主视图 **6**（`fetched===0` 时 **7**）、detail **2/3**、无效 `portfolioId` **0**；静态检查复跑 0 写调用、`app.use('/api/')=10`、controller 无阈值常量、无反向 require、无 `stripSuffix`、`cron-worker/` 与 `shared/models/` 零改动。

### 12.3 二轮遗留 MINOR（复检后已于收尾修复）

| # | 内容 | 处理 |
|---|---|---|
| N1 | FX 降级文案在 `result` 存在但缺 `currencies/rates` 时仍称「result 缺失」 | ✅ 已按 `result` 是否存在区分文案（`service.js` FX builder） |
| N2 | 任务卡 / BOARD.md / readme / ExecPlan §Status 仍写「24 条 / 176/0」 | ✅ 已统一为 **28 条（U1–U17 + A1–A11）/ server 180/0** |
| N3 | §7.2 U1 行仍是旧 2 资产口径；U14 的「60 天前 RUNNING」无法由 stub 构造 | ✅ U1 已改 3 资产（含 `CCC` 错桶）；U14 已改为「只判最新」，D-19 的管线保证由 U17 断言 |

**最终结论：无 BLOCKER / 无 MAJOR；F1–F8 与 N1–N3 全部关闭。AC1–AC14 满足（AC14 由两轮独立复核保证）。**

### 12.4 第三轮（收尾台账，2026-10-27）

第二轮遗留的 4 条**纯文档台账项**已修，Reviewer 确认无代码/测试/AC 问题：

1. 任务卡 Owner 由「复核中」改为「两轮复核通过」；
2. 任务卡 B3 依赖标记为 ✅ 已解除；
3. 任务卡 §9.5 的「Reviewer 复检」勾选并注明第二轮 PASS；
4. §5 Work Breakdown 的 W1–W11 / W13 全部勾选，并补记 W3 的真实红形态（`MODULE_NOT_FOUND` → 实现后 15/15 → 整改后 17/17）。

> ~~未执行项：Human 合入 `main` 与归档 `complete/`。~~ **2026-10-27 更新**：归档已由 `Orchestrator` 完成（`git mv` → `development/exec-plans/completed/`）；**合入 `main` 仍未执行**（分支 `c7389d1`，`main`/`origin/main` = `1895530`），属 Human 职权，见 §13.3。

### 12.5 第四轮（回归复核，2026-10-27，Human 指令「审核 TASK-054 的代码」）

**结论：PASS（AC1–AC14 全部满足）**，无 BLOCKER / 无 MAJOR；新增 **2 条 MINOR（P1/P2）**，都不在 `C-05` 落地前的生效路径上，**不阻塞合入**，建议随 `TASK-057` 一并处理。

#### 12.5.1 我独立复跑的证据（不采信 §12.1–12.4 台账）

| 项 | 我的做法 | 结果 |
|---|---|---|
| server 全量 | `npm run test:server` | ✅ **180 pass / 0 fail**（与台账一致） |
| worker 全量 | `npm run test:worker` | ✅ **77 pass / 0 fail** |
| AC10 只读 | `grep -E "\.create\(|updateOne|deleteOne|findOneAndUpdate|bulkWrite|save\(\)"` 两份文件 | ✅ 0 行 |
| AC11 不改调度 | `git diff --stat main...HEAD -- cron-worker/ shared/models/ shared/services/taskRunner.js` | ✅ 空 |
| AC7 阈值归位 | controller 内 `24\|48\|threshold\|STALE` | ✅ 无命中 |
| 结构 | `app.use('/api` 计数 / `shared` 反向 require | ✅ **10** / 0 |
| AC13 文档 | 逐份 diff | ✅ API_CONTRACT、SERVER、ARCHITECTURE（3 处）、PRODUCT_LINES、readme 均已改 |

#### 12.5.2 真机端到端（起 `server` 连开发库，全程只读）

`GET /api/cron/status` → **200**，5 条任务按冻结顺序（`timezone=America/Toronto`、`staleThresholdHours=48`）：

| 任务 | level | contractReady | lastRun |
|---|---|---|---|
| `daily-price-sync` | **bad** | true | PARTIAL · `2026-10-20` · 41/44 |
| `price-integrity-check` | unknown | false | SUCCEEDED · 0/44 |
| `alert-evaluate` | unknown | false | SUCCEEDED |
| `fx-rate-sync` | unknown | false | SUCCEEDED |
| `rebalance-check` | unknown | false | **null**（父任务尚无记录，符合 AC6） |

- 价格数据态：`targetMarketDate=2026-10-26` / `calendarPrevOpenDay=2026-10-26` / `expected=44` / `fetched=0` / `missing=44` / `byMarket` = CN-FUND 29 + CA 11 + US 4 / `notListed=[]` / `dayPriceSymbolCount=0` → **0/44 判红，正是「停摆真实信号」**（开发库最新有价日 10-20）。
- 完整性/提醒/汇率/再平衡：四项 `contractReady=false` + `CONTRACT_NOT_READY`，数值全 `null`（**没有用 `status` 冒充**，R-4 成立）；`fxCount=3` 只读得到、`currencies=null`（AC5 成立）。
- 再平衡：`perPortfolioDate=2026-10-20`、`perPortfolio=4`（= 未归档组合数）、`due=null`；**`failures` 在 `C-05` 前就真实透出**：`A股-长钱组合 / INTERNAL / "Latest price is required for 000191.CN"`（AC6 后半段成立，且正是 `TASK-051`/symbol 双写法那条老账）。
- detail：缺省 `date=2026-10-20`、`rows=4`、`failed=1`；`?date=2026-10-20` 同结果。
- 参数分支实测：`detail=foo` **400** · `date=2026-13-40` **400** · `portfolioId=bad-id` **200 + `PORTFOLIO_ID_INVALID`** · 合法但不存在 **200 + `PORTFOLIO_NOT_FOUND`** · `/api/cron` **404**（AC8 / A9 全对）。

#### 12.5.3 负向对照（我自己注入，验证 AC12「先红后绿」不是纸面承诺）

把 `pickTargetInfo` 的有效目标日换回**初稿口径**（`targetMarketDate = calendarPrevOpenDay`），跑 17 条 service 测试：

- **14/17**：`U2`（CN 长假）、`U12`（周末）、`U13`（03:00 前）**变红** —— D-16 确实被测试钉住；
- 还原后 md5 一致（`RESTORE_OK`），17/17 恢复全绿，工作树无残留。

#### 12.5.4 新增 MINOR（不阻塞）

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| **P1** | **汇率数字形态被判「全币种失败」**：`result.rates={USD:7.1,…}` → 每币种 `ok:false` → `dataStateLevel='bad'` 且 **`notes` 为空**（我实测）。适配器本身接受数字形态（`rateToCny: numOrNull(value)`），却把它判成失败，自相矛盾；`C-05` 若按数字形态落库，看板会直接全红且无任何解释 | `service.js:464-481`，实测输出 `{"USD":{"ok":false,"rateToCny":7.1},…}` + `notes=[]` | 数字 > 0 视为 `ok:true`，或至少补 `CONTRACT_NOT_READY` 之外的一条说明性 note |
| **P2** | **空对象被判 bad**：`currencies:{}` → `contractReady=true`、`level='bad'`、`notes=[]` | 同上实测 | 空对象应 `unknown` + note（「无币种记录」≠「全部失败」） |

#### 12.5.5 观测（不阻塞，不必改）

- `getRebalanceDetail` 对**格式合法但不存在**的 `portfolioId` 仍先跑 3 次查询才早退；§12.2 的「无效 portfolioId 0 次」只对格式非法成立（口径差异，非缺陷）。
- `buildRunSummary` 把 `totalCount:null` 归一为 `0`，与文件头「null ≠ 0」原则轻微不一致（实库该字段恒为数字，暂无影响）。
- `docs/handbook/ops/SERVER.md` 的 `CORS_ORIGINS` 行仍写「该变量**未被读取**」，与实测（`app.js:21-24` 读了、`:34` 走 `origin:true`）不符 —— **既有事实错误**，不在本卡 AC13 范围，建议随 `TASK-052` 清。
- 本轮为**只读复核**：起 `server` 连开发库、调用端点、随后停止；未写任何集合，`git status shared/ server/` 干净。

---

## 13. Completion Record（Orchestrator，2026-10-27）

### 13.1 结案依据

| 项 | 内容 |
|---|---|
| Human 指令 | 2026-10-27「TASK-054 任务完成，请修改状态，搬迁文档」 |
| 复核结论 | 三轮独立复核 + 第四轮回归复核：**无 BLOCKER / 无 MAJOR**，AC1–AC14 全满足（§12.1–§12.5） |
| 归档前复跑（本分支实测） | `test:server` **180-0** · `test:worker` **77-0** · AC1 路由 `app.use('/api` 计数 10 且 `/api/cron` 恰 1 行 · AC8 单端点 `router.get` 恰 1 · AC10 零写 0 行 · AC11 `cron-worker` 零 diff · AC7 controller 无阈值 · `shared` 零反向 require · AC13 五份文档全改 |

> 复跑在本任务分支（`c7389d1`）上执行——即**尚未合入主线的那份代码**。这与 `TASK-050`（在 `main` 上复跑）不同，原因见 13.3。

### 13.2 归档动作

| 对象 | 动作 |
|---|---|
| 本 ExecPlan | `git mv` `development/exec-plans/active/` → `development/exec-plans/completed/`；Status → `Completed`；`Related task` 改指 `development/tasks/completed/`；`Branch / Base` 补合并状态；§12.4「未执行项」改写 |
| 任务卡 | `git mv` `development/tasks/active/` → `development/tasks/completed/`；Status → `COMPLETED`；Owner 关闭；`Execution Plan` 指针改 `complete/`；§9.5 进度表补两行（归档 ✅ / 合入 ⏳）；补 **§11 Completion Record** |
| `docs/BOARD.md` | Active 移除本卡（封面段改写为「在途 = TASK-058 + TASK-060」）；Done 新增 TASK-054 行；Blocked 的批次说明与「五卡均未开工」更新 |
| `docs/readme.md` | 活跃任务行改指剩余在途；Done 补 TASK-054；执行计划归档段与活跃段更新 |
| 交叉引用 | `docs/handbook/technical/API_CONTRACT.md` 的 ExecPlan 链接改指 `complete/`；`FS-cron-worker-status-board-tasks.md` 映射行补完成状态；`TASK-055` B4 硬前置解除；`TASK-053` B4 表述更新 |

### 13.3 合并状态（需 Human 处理）

| 项 | 实测 |
|---|---|
| 分支 | `feature/TASK-054-cron-status-aggregate-api` = **`c7389d1`** |
| `main` / `origin/main` | **`1895530`**；`git merge-base --is-ancestor c7389d1 main` → **不成立** |
| 结论 | 任务**已完成**（实施 + 复核 + 文档），但**未进主线**。本次归档只动文档，无 `git commit` / `git merge` / `git push` |
| 提交时隔离 | 工作树内 `FS-authentication.md`、`TASK-058/059/060` 卡、`docs/development/prototypes/2.0/*` 是他人在途改动，勿混入本批 |

### 13.4 遗留移交

| # | 内容 | 去向 |
|---|---|---|
| P1 / P2 | FX 适配器的数字形态与空对象误判为 `bad`（§12.5.4） | `TASK-057` |
| 数据态 | `C-05` 落地前四项数值恒 `null`（设计内降级） | `TASK-057` |
| FS 旧名 | FS §4.3 的 `{ok,gap,skippedNoLaunchDate}` / `alertsFired` / 币种标志 | PM 回改（§9 T-1/T-2） |
| 文档错述 | `SERVER.md` 的 `CORS_ORIGINS`「未被读取」 | `TASK-052` |
| 下游 | `TASK-055` 硬前置解除；`TASK-053` 可空态先行 | 两卡已登记 |

> 本 ExecPlan 归档后不再变更。
