# PL-2 行情数据线（Market Data）

> 版本：v1.0 · 日期：2026-10-15
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-2** 的明细子文件
> 内容范围：① 成熟度快评（总表 §2.4） ② 产品线 → 产品模块归属（总表 §3） ③ 全量功能评估 ④ 已实现功能点清单 ⑤ 架构实现明细（合并自原 `architecture/functions.md` §4.2 / §4.9，原文件已[归档](../../archive/functions.md)）
> 功能编码：`AS-04~08` / `AS-10`（行情价格）· `AS-11`（估值分位），沿用 [PRD](../specs/PRD.md)

---

## 1. 定位与价值主张

**价值主张：每日自动获取多市场行情与估值分位，是估值 / 盈亏 / 提醒的输入底座。**

本线是「看不见的基础设施」——用户很少直接操作它，但一旦出错，全站以「—」呈现。它决定 PL-1 的市值、PL-3 的漂移、PL-4 的建议、PL-6 的家庭总额能否算得出来。

- **上游依赖**：无（外部数据源：Yahoo / 东方财富 / 天天基金 / er-api）。
- **下游影响**：PL-1 市值与盈亏 → PL-3 漂移 → PL-4 建议 → PL-6 家庭折算；PL-5 的全部价格类规则。
- **断链后果**：缺价 → 市值 `null` → 漂移 `null` → 再平衡 `MISSING_MARKET_PRICE` → 家庭该组合不计入总额。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 高 | 美股 / 加股 / 港股 / A 股场内 / 场外基金全路由，抓取容错工程成熟 |
| 用户体验 | **低（无质量看板）** | 用户看不到「今天哪些没同步上」，数据质量不可见 |
| 数据可信 | 中高 | 幂等入库 + 完整性检查已具备；但截断无提示、估值分位纯手动 |

**主要短板**：① 估值分位纯手动（导致 AL-10 大概率长期静默）；② 完整性检查截断无提示；③ 无数据质量看板。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 用户价值 | 现状 |
|---|---|---|---|
| **M2.1 行情采集** | AS-06 每日同步、AS-07 完整性检查、AS-08 港股、AS-10 A股个股 | 无人值守拿到多市场日线 | ✅ 已统一：内核收敛至 `shared/`，双份实现消除 |
| **M2.2 行情查询** | AS-04 今日价格页、AS-05 历史价格页 | 查看最新价与历史走势 | 完整；但无「同步状态」可视化 |
| **M2.3 估值分位** | AS-11 估值分位录入与查询 | 为「高估 / 低估」类判断提供输入 | 仅手动录入，可持续性弱 |

---

## 4. 全量功能评估

> 判定标准见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码。

| 编号 | 功能 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| AS-04 | 今日价格页 | **强化** | 只有价格，没有「今日哪些资产没同步上」的显性反馈 | 增加同步状态列（成功 / 休市 / 失败）与失败原因入口 | P1 |
| AS-05 | 历史价格页 | 保留 | 折线 + 表格 + 年月筛选，足够 | — | — |
| AS-06 | 每日同步 | ✅ **已完成** | 原：`server/tasks` 与 `cron-worker/tasks` 双份实现且能力已分化，改动需双向同步 | 已统一调度所有权 + 抽公共实现（TASK-005 / ADR-002） | ~~P0~~ 已闭环 |
| AS-07 | 完整性检查 | **强化** | 缺口超 `maxRepairRanges` 时**静默截断**，用户不知道数据不完整 | 截断必须显式提示；产出「数据质量看板」（覆盖率 / 缺口 / 上次修复） | **P1** |
| AS-08 | 港股支持 | 保留 | 枚举 / 路由 / 日历 / 实测四项齐全 | — | — |
| AS-10 | A股个股 | 保留 | secid 路由明确，已实测 | — | — |
| AS-11 | 估值分位 | **强化** | 仅手动录入，无批量 / 半自动导入；导致 AL-10 规则**大概率长期静默** | 增加 CSV / 批量导入或半自动采集；规则面板提示「数据缺失」 | **P1** |

---

## 5. 已实现功能点清单

### M2.1 行情采集

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| AS-06 | 每日价格同步 | 默认 **03:00**（`PRICE_SYNC_CRON`）：逐资产「**开市校验 → fetcher 路由 → 幂等入库**」，休市记 `skip`，**逐资产故障隔离** | 定时（cron-worker） |
| AS-07 | 完整性检查 | 默认 **03:30**（`HEALTH_CHECK_CRON`）：按 `launchDate` 推断应有交易日数，比对实际采集，缺口**可选自动补全**（`INTEGRITY_AUTO_REPAIR` 默认开） | 定时 + CLI |
| AS-08 | 港股支持 | `market=HK` / `currency=HKD` / 路由 Yahoo（`0700.HK`）/ 交易日历含 HK 节假日 | 资产配置 + 抓取路由 |
| AS-10 | A 股个股日线 | 东方财富 fetcher 按 `secid` 路由：`5/6/9` 开头 → 上海 `1.x`，其余 → 深圳 `0.x` | `eastmoneyFetcher` |
| — | 多源抓取路由 | 优先按 `asset.market`，否则按 symbol 特征 → 天天基金（`CN-FUND`/`.CN`）/ 东方财富（A 股场内）/ Yahoo（US/CA/HK + 兜底） | `priceFetch.service.js` |
| — | 幂等入库 | `Price` 集合 `{symbol,timestamp}` **唯一索引** + upsert；写入前将时间戳规范到**市场日边界**（`canonicalDayTimestamp`） | `priceStorage.service.js` |
| — | 抓取容错与限流 | 单请求粒度超时、错误分类（TIMEOUT/RATE_LIMIT/NOT_FOUND/INVALID_RESPONSE/UPSTREAM）、Yahoo `query1→query2` 主备回退、东财 `push2→push2delay` 回退、`p-limit` 并发控制、指数退避 + 全量抖动重试 | `shared/utils/retry.js` |
| — | 历史回补 CLI | `npm run sync:history -- --from ... [--to] [--symbols] [--concurrency N]` | cron-worker CLI |

### M2.2 行情查询

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| AS-04 | 今日价格页 | 各资产**最近一条**价格（`$group` 去重 + `$facet` 分页，`pageSize ≤ 200`）；支持指定日期查询；手动刷新；响应头带 `X-Market-Timezone` | `/prices` |
| AS-05 | 历史价格页 | 单资产价格历史：折线图 + 每日价格表格 + 年月筛选（或 `from/to`）+ 分页 | `/prices/:symbol/history` |
| — | 价格记录 CRUD | `POST/GET/PUT/DELETE /api/prices` 维护兜底接口（写入主路径是同步任务，接口为人工纠错） | API |

### M2.3 估值分位

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| AS-11 | 估值分位录入与查询 | `Valuation` 模型（`indexCode` / `indexName` / `metric(pe\|pb)` / `value` / `percentile` / `date` / `source` / `note`），按 `(indexCode,metric,date)` 幂等 upsert；列表取各指数最新一条；**无自动抓取，以手动录入为主**（衔接 `index-valuation-selfcalc` 自算结果），作为 AL-10 的评估输入 | `GET /api/valuations`、`PUT /api/valuations/:indexCode/:metric` |

---

## 6. 架构实现明细（合并自原 functions.md §4.2 / §4.9）

**承载**：`client/src/pages/Prices/*`、`shared/services/price*.service.js`、`shared/fetchers/*`、`cron-worker/src/tasks/*`

### 6.1 价格查询（读侧）

| 功能 | 说明 | 前端入口 |
|---|---|---|
| AS-04 今日价格页 | 各资产**最近一条**价格（聚合去重）；支持指定日期查询；手动刷新 | `/prices` |
| AS-05 历史价格页 | 单资产价格历史：折线图 + 每日表格 + 年月筛选 + 分页 | `/prices/:symbol/history` |

**API（全部只读为主）**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/prices/today` | 当前市场日各 symbol 最新价（`$group` 去重 + `$facet` 分页），`pageSize ≤ 200`，响应头 `X-Market-Timezone` |
| GET | `/api/prices/date/:date` | 指定市场日（`YYYY-MM-DD`）价格 |
| GET | `/api/prices/symbol/:symbol/history` | 历史：`year/month`（需成对）或 `from/to`（互斥），分页 |
| POST / GET / PUT / DELETE | `/api/prices`、`/api/prices/:id` | 价格记录 CRUD（写入主路径是同步任务，接口为维护兜底） |

### 6.2 行情同步（写侧）

| 功能 | 说明 |
|---|---|
| AS-06 每日同步 | 默认 **03:00**（`PRICE_SYNC_CRON`）：逐资产「**开市校验 → fetcher 路由 → 幂等入库**」，休市记 `skip`，逐资产**故障隔离** |
| AS-07 完整性检查 | 默认 **03:30**（`HEALTH_CHECK_CRON`）：按 `launchDate` 推断应有交易日数，比对实际采集，缺口**可选自动补全**（`INTEGRITY_AUTO_REPAIR` 默认开） |
| AS-08 港股支持 | `market=HK`、`currency=HKD`、路由 Yahoo（`0700.HK`）、交易日历含 HK 节假日 |
| AS-10 A 股个股 | 东方财富 fetcher 按 `secid` 路由：`5/6/9` 开头 → 上海 `1.x`，其余 → 深圳 `0.x` |

**幂等机制**：`Price` 集合 `{symbol, timestamp}` **唯一索引** + upsert；写入前将时间戳规范到**市场日边界**（`canonicalDayTimestamp`）。

**实现归属（TASK-005 后）**：抓取与入库引擎统一位于 `shared/`，`server`（API 手动触发）与 `cron-worker`（定时触发）**调用同一实现**，不再存在两份拷贝：

| 能力 | 位置 | 说明 |
|---|---|---|
| 抓取路由 / 超时 / 错误分类 | `shared/services/priceFetch.service.js` | 两进程共用 |
| 幂等入库 | `shared/services/priceStorage.service.js` | 两进程共用 |
| 每日同步任务体 | `shared/tasks/dailySync.js` | 纯模块，不读 `.env`、不建连 |
| A 股场内 fetcher | `shared/fetchers/eastmoneyFetcher.js` | server 与 worker 都能用 |
| 交易日历 | `shared/services/calendar.service.js` + `shared/config/markets.js` | 两进程共用 |
| 开市校验（skip） | `shared/tasks/dailySync.js` | 两进程共用 |
| 历史回补并发 | `shared/tasks/historySync.cjs`（`p-limit`，默认 3） | cron-worker 任务 |
| 重试退避 | `shared/utils/retry.js`（指数退避 + 抖动） | 两进程共用 |
| 日志 | `shared/config/logger.js`（`app-%DATE%.log` + `task-%DATE%.log`，含脱敏） | 两进程共用同一目录与配置 |
| 完整性检查 | `cron-worker/src/tasks/integrityCheck.js` | 仅 worker 持有（无 API 手动端点） |
| CLI 薄壳 | `server/tasks/dailySync.js`、`cron-worker/src/tasks/dailySync.js` | 只负责 `.env` + 建连 + 调用内核 + 断开 |

### 6.3 行情抓取适配与容错

**路由**（`shared/services/priceFetch.service.js`，**优先按 `asset.market`，否则按 symbol 特征**）：

| market / 特征 | provider | 处理 |
|---|---|---|
| `CN-FUND` / `*.CN` | TIANTIAN | 去 `.(SS\|SZ\|CN)` 后缀 |
| `CN` / `CN-SH` / `CN-SZ` / `*.SS` / `*.SZ` / 6 位数字码 | EASTMONEY | 去后缀 |
| `US` / `CA` / `HK` / `*.HK` / `*.TO` | YAHOO | 原样透传 |
| 兜底 | YAHOO | 原样 |

**超时与错误分类**：

- `MARKET_DATA_TIMEOUT_MS`（默认 10000），**单请求粒度**超时（保证 host 回退在超时场景仍生效）。
- `MARKET_DATA_ERROR = {TIMEOUT, RATE_LIMIT, NOT_FOUND, INVALID_RESPONSE, UPSTREAM}`；`retryable` 默认对 TIMEOUT/RATE_LIMIT/UPSTREAM 为 true。
- `classifyMarketDataError`：`ECONNABORTED/ETIMEDOUT/AbortError` → TIMEOUT；HTTP 429 → RATE_LIMIT；404 或消息含 `not found/no data` → NOT_FOUND；其余 → UPSTREAM。

**限流策略**：Yahoo `query1` 被限流回退 `query2`；东财 `push2` 主用 → `push2delay` 回退；`historySync` 用 `p-limit`（默认 3）控制并发；`fetchWithRetry` 指数退避 + **全量抖动**（`random() × min(base × factor^(n-1), max)`）。

### 6.4 完整性检查（AS-07，worker 独有）

`integrityCheck.js`：回答「每支基金理论上应有多少价格、实际采了多少」。

- `expectedTradingDates`：按 `launchDate` → 今日，逐日判开市累加 **Expected**。
- `expectedBucketCandidates`：交易日可能落入的 ET 桶日期（**US/CA 即当日；CN 返回 `[etDate, etDate+1]`**，因 CN 白天价按 ET 归桶可能跨日）。
- `missingDates` = Expected 中「任一候选桶都不存在」的日期；产出 `completenessRatio`。
- `groupMissingRanges`（间隔 ≤3 天合并）→ `clipRepairRanges`（仅保留最近 `INTEGRITY_REPAIR_MAX_DAYS`，默认 30 天窗口）→ `repairAsset`（逐区间调 `historySync`）→ **重查收敛**。
- 参数：`maxRepairRanges` 默认 50；未填 `launchDate` → `SKIPPED_NO_LAUNCH_DATE`。

**CLI 入口**（脚本定义在 `cron-worker/package.json`；仓库根 `package.json` 转发了前两条与第三条中常用的两个）

| 命令 | 说明 |
|---|---|
| `npm run sync:prices` | 手动跑价格同步（`trigger=MANUAL`）；根目录与 `cron-worker/` 下均可执行 |
| `npm run sync:history -- --from ... [--to ...] [--symbols ...] [--concurrency N]` | 历史回补（需在 `cron-worker/` 下执行） |
| `npm run check:integrity [--symbols ...] [--from ...] [--to ...] [--no-repair] [--dry-run]` | 完整性检查；根目录与 `cron-worker/` 下均可执行 |

> CLI 薄壳统一模式：加载自身 `.env` → 建 Mongo 连接 → 调用 `shared/` 内核 → 断开。因此手动执行与定时执行**结果一致**，仅 `trigger` 字段不同（`MANUAL` vs `SCHEDULED`）。

### 6.5 估值分位（AS-11）

**承载**：`shared/services/valuation.service.js`、`shared/models/valuation.js`

- **Valuation** 字段：`indexCode`（如 `000300` 沪深300）、`indexName`、`metric`（`pe`/`pb`）、`value`（≥0）、`percentile`（0–100）、`date`、`source`（`manual`/`external`）、`note`。
- 按 `(indexCode, metric, date)` 幂等 upsert；列表每 `indexCode + metric` 取最新一条。
- **无自动抓取**，以手动录入为主（衔接 `index-valuation-selfcalc` 自算结果）；作为 **AL-10 估值分位规则的评估输入**。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/valuations` | 各指数最新分位列表 |
| PUT | `/api/valuations/:indexCode/:metric` | 手动录入（`metric ∈ {pe, pb}`） |

**数据模型**（`shared/models/*.js`）

| 模型 | 关键字段 | 唯一索引 / 主索引 |
|---|---|---|
| **Price** | `symbol`、`name`、`price`、`currency`、`market`、`timestamp`(UTC 市场日边界) | `{symbol,timestamp}` **unique**；`{timestamp:-1,symbol:1}` |
| **Valuation** | `indexCode`、`indexName`、`metric`(pe/pb)、`value`、`percentile`、`date`、`source`、`note` | `{indexCode,metric,date:-1}` **unique** |

---

## 7. 边界与已知缺口

- **完整性检查截断无提示**：缺失区间超 `maxRepairRanges=50` 时静默截断（与 AS-07 同一动作）。
- **`integrityCheck.js` 偏大**（约 386 行），待拆分。
- **节假日表需逐年维护**：CN/HK `2027+` 未维护，未维护年份按空表处理（已加 warn）。
- **估值分位无自动抓取**：可持续性弱，间接使 AL-10 长期静默。

---

## 8. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级）
- [PL-0 平台基座线](./PL-0-platform-foundation.md) — 调度清单 / 交易日历 / 数据模型总表
- [PL-5 提醒与通知线](./PL-5-alerting.md) — AS-11 的消费方（AL-10 估值分位规则）
- [PL-6 家庭总览线](./PL-6-household.md) — 价格是家庭折算的输入
- [CRON_WORKER.md](../../manual/CRON_WORKER.md) — 调度所有权、价格同步、完整性检查、历史回补
- [functions.md（已归档）](../../archive/functions.md) — 本文 §6 的原始来源
