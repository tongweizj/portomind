# TASK-076 — 资产信息完整性检查（launchDate 抓取 / 前台可编辑 / 手动检查 / 看板卡片与详情）执行计划

## Status

Status：Approved（2026-11-17，Human 批准「073～078 计划」；`Draft → Approved` 归 Human）

Owner：`Planner`（2026-11-17 起草）

Related Task：[TASK-076 任务卡](./TASK-076-asset-information-completeness-check.md)

Related Spec / ADR：
- [FS-cron-worker-status-board](../../requirements/specs/FS-cron-worker-status-board.md)（NG1/NG6/OQ6、§4.3）
- [FS-cron-worker-status-board-tasks](../../requirements/specs/FS-cron-worker-status-board-tasks.md)（C-01/C-02/C-07）
- [ADR-003 symbol 后缀契约](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)
- [ADR-002 单一调度器](../../../os/architecture/adr/ADR-002-single-scheduler.md)
- [TASK-053 AC 修订附录（D-j，5→6）](../../delivery/completed/US-001/TASK-053.md)
- [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)（P0-2 / D-c）

Branch / Base：待 Orchestrator 登记时从最新 `main` 建 `feature/TASK-076-asset-information-completeness-check`；本计划起草时基线 = 当前工作树（`main`，含未提交文档改动，见 §3.1）。

Approval：**已批准（2026-11-17，Human）**。本计划含多项需 Human 裁决事项（§6）；在 Human 明确批准当前设计前不得进入 `Implementing`。任务卡明确本卡为跨模块 Feature，按 [EXECUTION_PLANS §2](../../../os/process/EXECUTION_PLANS.md) 必写计划。

> 状态及权限见 [STATES.md](../../../os/process/STATES.md)：仅 Human 可将 Draft → Approved。任务卡 Status 待 Orchestrator 登记，本计划不改变任务状态。

---

## 1. Intent

### Goal

建立「资产信息完整性检查」体系：①抓取并允许人工修正 `launchDate`（修复 44/44 全空导致完整性检查空转）；②在看板新增「资产信息完整度」第 6 卡与详情页；③提供**看板卡片下方按钮手动触发**检查（取消每日自动运行）；④新增价格策略「最近 **3 个市场日**价格全为空 → 不完整并报告」（任务卡续 5/续 6，D-o）。

### Scope（来自任务卡 §4）

- `shared/`：市场日计算与资产信息完整性判定服务（单一业务实现，只读）、launchDate 抓取器/服务
- `cron-worker/`：检查任务执行入口（手动触发，经 server 调用）与抓取执行；**不注册每日自动 cron**
- `server/`：手动触发端点 + 只读完整度快照端点（消费 `shared/` 服务）
- `client/`：资产页 launchDate 展示/编辑；看板第 6 卡（只读）+ 卡下方「运行资产信息检查」按钮；详情页（只读列表 + 去资产域编辑）
- `docs/`：API_CONTRACT / DATA_MODEL / NG6 定向修订附录 / TASK-053 6 槽位回归基线

### Out of Scope（任务卡 §4 + 本计划补充）

- 每日自动 cron（D-m 取消）；价格双轨序列迁移/采集错位/时区（TASK-073）；P1/P2 观测（TASK-074/075）；C-07 再平衡详情页；`/logs` 子树内编辑资产；自动修改 metadata 5 字段中除 launchDate 之外任何字段；symbol 后缀迁移（归 TASK-073）
- **不修改已验收 TASK-054 的 `tasks[]` 长度恒为 5 契约**（见 §4.3 决策 OD-1）

### Constraints（硬规则 / 不变量）

1. 业务逻辑只在 `shared/`；调度只在 `cron-worker/`（ADR-002）；`server` 不注册 cron；跨包引用用 `@portomind/shared/...`
2. 不猜缺失数字：完整性字段缺失为 `null`/`—`，不填 `0`（不变量 2）
3. 外部调用一律 `withMarketDataTimeout` + `fetchWithRetry`（AGENTS §5.7）
4. 检查本身**只读**，仅报告，不改任何资产字段；launchDate 抓取写入是 AC1 单独授权路径
5. NG6：`/logs` 子树只读排障；D-m 是对 NG6 的**定向修订**（仅允许「运行资产信息检查」这一个只读触发入口），须先有 PM/Human 日期附录留痕，按钮方可上线
6. 6 卡须按 TASK-053 AC 修订附录（D-j=A）执行并复跑结构回归；新卡只读，编辑在资产域
7. 价格连续性口径：**最近 3 个市场日**（按资产所属 `market` 的目标市场日/开市日判定，非自然日；续 6 / D-o 裁决）

### Acceptance Criteria（任务卡 §3，逐条对应 §7 验证）

AC1 launchDate 抓取并写入 / AC2 前台可看可改 / AC3 手动触发检查（卡片下方按钮 + 5 元数据字段 + 价格连续性策略，只读，无每日 cron）/ AC4 看板第 6 卡 / AC5 详情页（资产域编辑，卡片只读）/ AC6 回归与验证（test:server/test:worker 全绿、独立 Reviewer 通过）。

---

## 2. Context

### 2.1 上下游与前置

| 关系 | 对象 | 说明 |
|---|---|---|
| 前置（已满足） | [TASK-053 AC 修订附录](../../delivery/completed/US-001/TASK-053.md)（D-j=A，2026-11-17） | 已把「恰好 5 灯/5 卡」日期附录修订为 6，原 AC 正文与验收证据不动；实施按 6 槽位并复跑结构回归 |
| 前置（**阻塞按钮上线**） | NG6 定向修订附录（D-m） | 尚未登记；须 PM/Human 以日期附录方式修订 [FS P0 NG6](../../requirements/specs/FS-cron-worker-status-board.md)，否则「运行资产信息检查」按钮不得上线 |
| 复用 | [TASK-054 `GET /api/cron/status`](../completed/TASK-054-cron-status-aggregate-api.md) | 只读快照；`tasks[]` 长度恒为 5（已冻结）。本卡以**新增顶层字段**方式扩展（OD-1） |
| 复用 | `cron-worker/src/tasks/integrityCheck.js`（`price-integrity-check`） | 既有价格完整性任务；本卡市场日判定复用同一日历口径，但用途不同（见 §4.4） |
| 相关 | [TASK-073](./../active/TASK-073-price-pipeline-p0-data-correctness.md) | symbol 后缀/价格采集修复归它；本卡不接手 |
| 约束 | [ADR-002](../../../os/architecture/adr/ADR-002-single-scheduler.md) / AGENTS §5 | 调度只在 worker；共享规则只在 shared；client 不算阈值、不 require shared、不转币种 |

### 2.2 术语

- **元数据 5 字段**（D-l）：`symbol`/`name`/`market`/`currency`/`launchDate`
- **价格连续性**（D-o，续 5/6）：最近 **3 个市场日**逐日价格均空 → 判不完整并报告「最近 3 个市场日价格全为空」；只读报告，不写价
- **市场日**：`isMarketOpenToday(market, date)` 为真的交易日（按该市场时区与节假日表）；与「自然日」严格区分

---

## 3. Repository Findings

> 2026-11-17 只读源码核对（本轮未连库、未跑应用、未跑测试）。三类独立探查 + 主 Agent 交叉复核。行号为起草时基线，实施时如漂移以符号名为准。

### 3.1 文档 / 工作树状态

- 任务卡位于 `docs/development/tasks/active/TASK-076-...md`，`??` 未跟踪（Planner 本轮创建/编辑），无 Status（待 Orchestrator 登记）。
- [TASK-053 AC 修订附录](../../delivery/completed/US-001/TASK-053.md) 已存在（2026-11-17，D-j=A），把 5 灯/5 卡日期附录修订为 6；历史验收仍基于原文，6 的要求由本卡验收。
- **NG6 定向修订附录（D-m）尚不存在**（任务卡 §8 自述「待 PM/Human 日期附录留痕」）——按钮上线的硬前置。
- 起草时工作树存在大量未提交文档改动（Many `M docs/**`）；本卡不得覆盖无关改动。

### 3.2 元数据 / 价格 / 日历（shared）

| 事实 | 落点 |
|---|---|
| `Asset` 11 字段；`launchDate` 可选 `Date`（L37-39）；`active` 默认 true（L41）；`symbol` 唯一 + 正则 + uppercase（L10-19） | `shared/models/asset.js` |
| 枚举 `ASSET_MARKETS`=['US','CA','CN-SH','CN-SZ','CN-FUND','HK']、`ASSET_CURRENCIES`=['USD','CAD','CNY','HKD']；**与 client/src/constants/enums.js 重复，改一处必改另一处** | `shared/constants/asset.constants.js:7-8`；AGENTS §5.8 |
| `Price`：`symbol`(uppercase) + `price` + `timestamp`(UTC，`MARKET_TIMEZONE` 归桶)；唯一索引 `(symbol,timestamp)`；**无 date 字段** | `shared/models/price.js:3-24` |
| 市场日判定 `isMarketOpenToday(market,date)`（按市场时区 + 节假日表，非法 market throw）；`normalizeMarket` 把 CN-SH/SZ/FUND→CN | `shared/services/calendar.service.js:16-20,146-169` |
| CN/HK 节假日静态表覆盖 2024–2026；未维护年份按空表告警 | `shared/config/markets.js:18-96` |
| `marketDate/dateBounds/canonicalDayTimestamp`：价格归桶唯一实现；候选日构造用 `${dateStr}T12:00:00Z` 保证跨时区不跨日 | `shared/utils/marketTime.js:19-63` |
| 「最近开市日」算法 `lastOpenDayBefore` 目前是 `cronStatus.service.js` **私有函数**（L110-119），未导出；`isMarketOpenOn` L100-102 | `shared/services/cronStatus.service.js` |
| `getActiveAssets()` L100-102；`getAssetsBySymbols()` L106-114（注释明确供回补/完整性检查用） | `shared/services/asset.service.js` |
| 超时/重试：`withMarketDataTimeout(provider,op,timeoutMs)`、`fetchWithRetry(fn,opts)` | `shared/fetchers/timeout.js:11`、`shared/utils/retry.js:20` |

### 3.3 完整性任务 / TaskRun 契约

| 事实 | 落点 |
|---|---|
| `price-integrity-check` 任务实现在 **`cron-worker/`，不在 shared/**；`TASK_NAME='price-integrity-check'` | `cron-worker/src/tasks/integrityCheck.js:34` |
| `runIntegrityCheck()` 报告含 `totals:{expectedCount,actualCount,missingCount}`/`checkedCount`/`skippedCount`/`assets[]`；无 launchDate 则 `SKIPPED_NO_LAUNCH_DATE` 跳过 | `integrityCheck.js:185-384`（报告骨架 L209-223，跳过 L239-246，totals L347-349） |
| `integrityCheck(options)` 用 `runTrackedTask`；`trigger:'MANUAL'` 已产出 `manual:<ISO>` runKey；`result:{totals,checkedCount,skippedCount,completenessRatio,gapAssets}` 需显式包在 `result` 键才落库 | `integrityCheck.js:386-414`；`shared/services/taskRunner.js:23-25` |
| `normalizeCounts` 白名单只透传显式 `result`；`TaskRun.result` 为 Mixed；`trigger` 枚举 ['SCHEDULED','MANUAL'] | `shared/services/taskRunner.js:14-27,51-119`；`shared/models/taskRun.js:6-15,30` |
| shared 侧只有 `buildIntegrityDataState` 适配器（读 `result.totals.*`/`skippedCount`/`gapAssets`，兼容旧 `{ok,gap}`），无 checkIntegrity 实现 | `shared/services/cronStatus.service.js:380-451` |

### 3.4 server / 手动触发

| 事实 | 落点 |
|---|---|
| 全局闸门 `app.use('/api', requireAuth)`（L109）；`/api/cron` 只读聚合（L120-121）；404 + errorHandler 收尾 | `server/app.js:104-124` |
| `/api/logs` 为 **GET-only**（NG6 数据面）；写端点须落在非 `/logs` 路由 | `server/routes/log.routes.js`；FS NG6 |
| 既有手动 POST 样例（均在全站闸门后、无角色限制）：`POST /api/alerts/evaluate`、`POST /api/family/fx/sync`、`POST /api/portfolios/:pid/rebalance/check`；rebalance execute 有 `mode==='MANUAL'` 显式守卫 | `alert.routes.js:11`、`family.routes.js:12`、`portfolio.routes.js:27-46` |
| 路由/控制器/响应封装：`*.routes.js` + `controllers/*.controller.js`；`success(res,data)` / `failure(...)`；错误 `next(err)` → `errorHandler` | `server/utils/apiResponse.js:1-17`、`server/middleware/errorHandler.js:20-54` |
| 跨包引用一律 `@portomind/shared/...`（无 `../../shared`） | `server/controllers/cron-status.controller.js:7-8` 等 |

### 3.5 client

| 事实 | 落点 |
|---|---|
| `/logs` → `<LogViewer>` → board tab `<CronBoard>`；tab 存 `?tab=`，默认 board；`logTabs.js` 注释已预留兄弟详情页并返回 `/logs?tab=board` | `router.jsx:84`、`LogViewer.jsx:77-81`、`constants/logTabs.js:6-18` |
| `BOARD_SLOTS` 恰好 5 槽；6 卡需：加槽（unknownValue.js:24-30）+ 视图 builder（taskDataViews.js 仿 buildIntegrityView L162-198）+ `CARD_COMPONENTS`（CronBoard.jsx:33-39）+ `cards`/`entries`（L75-119, L149-168）；SummaryShell/buildOverview 按 BOARD_SLOTS 自动扩 | `BoardShell.jsx:36-49`、`SummaryShell.jsx:74-80` |
| 数据链：`useCronStatus`→`cron-status.service.js`（GET `/cron/status`）→`api.client.js`；只读、首读+手动刷新无轮询 | `useCronStatus.js:9-31`、`cron-status.service.js:9-15` |
| 快照形状 `{generatedAt, tasks:[{taskName,dataState,dataStateLevel,contractReady,stale,lastRun,lastSkip,notes}]}`；按 `task.taskName` 建 Map | `CronBoard.jsx:137-141` |
| `/logs` 子树当前**零 mutation**（NG6 成立）：仅「刷新」GET 按钮 + 禁用态「异常」按钮 | `LogViewer.jsx:10`、`CronBoard.jsx:190-206`、`DataTaskCard.jsx:134-150` |
| 动作按钮范例：`useEvaluateAlerts`（useMutation）+ `api.post`（alert.service.js:24-25）+ invalidate | `hooks/useAlerts.js:89-99` |
| launchDate 在 client **完全不存在**：AssetList/AssetDetail/AssetForm/asset.service 均无；更新走 `updateAsset(id,data)` → PUT `/assets/:id` | `pages/Asset/*`、`services/asset.service.js:17-19` |
| 详情页只读列表 + 行尾 `<Link to="/instruments/edit/:id">编辑</Link>` 是既有模式；新页在 `router.jsx` AppLayout 内加 `<Route>` | `AssetList.jsx:247-278`、`router.jsx:48-105` |
| 状态色 token：`statusOk/Warn/Bad/Idle`（绿=好/红=坏），严禁与行情红涨绿跌混用 | `constants/design-tokens.js:32-38`、`statusTone.js` |
| 文档漂移：`client/AGENTS.md` 写 `services/api.js`，实际文件为 `services/api.client.js` | 以实际文件为准 |

### 3.6 验证入口（[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）

- `cd server && npm run validate`（语法）、`npm run verify`（+ MongoDB + 基线）、`npm test`（`node --test test/integration/*.test.js`）
- `cd cron-worker && npm test`（`node --test`，单测在 `test/`）
- `cd client && npm run build && npm run lint`
- 根 `npm test` 跑全部 workspace；本会话沙箱 shell 可能 `spawn EPERM`（子子进程派生受限），测试须在可派生子进程的终端/CI 执行（沿用 TASK-054 的处理，见其计划 §3.7）

### 3.7 未决 / 未知

| # | 未知 | 处理 |
|---|---|---|
| U-1 | launchDate 抓取的确切端点/字段（天天基金、Yahoo 网页） | 本轮 web_search 因无 API key 不可用；任务卡明确「ExecPlan 核实端点、不虚构」。列为 Implementer 第一项探查：**先用真实网页/API 验证端点再编码**；失败即标未知、不猜。见 §6 D5 |
| U-2 | CN/HK 2027+ 节假日表未维护 → 未来「市场日」高估 | 复用现有表 + 告警；不扩到维护新年份（归别的维护），在 §8 记风险 |
| U-3 | NG6 定向修订附录何时登记 | 阻塞按钮上线，非阻塞其余工作；§6 决策项 |

---

## 4. Proposed Design

### 4.1 分层与数据流

```
client (CronBoard 第6卡 + 卡下方按钮)
   │  GET  /api/cron/status            → 完整度快照(顶层 assetCompleteness)
   │  POST /api/asset-integrity/check  → 手动触发检查(写 TaskRun.result)
   ▼
server routes/controllers（参数校验 → 调 shared service → success()；不写业务规则）
   ▼
shared/services/assetIntegrity.service.js   ← 完整性判定唯一实现（只读）
   ├─ Asset.find({active:true})  → 5 元数据字段 + launchDate
   ├─ Price 查询（最近3市场日桶）→ 价格连续性判定
   └─ calendar.service / marketTime（市场日计算）
   ▼
cron-worker  tasks/assetIntegrityCheck.js（手动任务壳：runTrackedTask, trigger=MANUAL）
             tasks/launchDateFetch.js（抓取写入，独立授权 AC1；withMarketDataTimeout+fetchWithRetry）
```

**关键取舍**：判定逻辑放 `shared/`（硬规则 #1 + 可注入 `now` 便于测试）；触发壳在 `cron-worker/`（ADR-002，server 不注册 cron、也不直接 new 任务逻辑）；server 只编排。**市场日计算必须从 `cronStatus.service.js` 抽出为 `shared` 公共能力**（否则会出现第二份日历口径，违反硬规则 #1）——见 OD-2。

### 4.2 判定规则（§3.1 冻结）

对 `active:true` 资产逐项判定，5 元数据字段 + 价格连续性：

| 维度 | 完整 | 不完整理由码 |
|---|---|---|
| `symbol` | 正则 + trim/upper + ADR-003 按 market 后缀派生一致 | `SYMBOL_FORMAT` / `SYMBOL_SUFFIX` |
| `name` | 非空、trim 后 ≤120 | `NAME_EMPTY` / `NAME_TOO_LONG` |
| `market` | ∈ `ASSET_MARKETS` | `MARKET_INVALID` |
| `currency` | ∈ `ASSET_CURRENCIES` 且与 market 预期一致（映射表在 §4.2.1 冻结） | `CURRENCY_INVALID` / `CURRENCY_MISMATCH` |
| `launchDate` | 合法 Date、非未来 | `LAUNCH_DATE_MISSING` / `LAUNCH_DATE_INVALID` / `LAUNCH_DATE_FUTURE` |
| 价格连续性 | 最近 3 个市场日**每天**都有非空 Price | `PRICE_EMPTY_3_MARKET_DAYS` |

> 完整度 = 六项全合格的资产数 / active 资产总数；任一项不合格即计入不完整，并给出全部命中理由码（数组）。其它资产字段（type/assetClass/tags/active/watchlist/createdAt）不检查、不出理由、不进详情页。

#### 4.2.1 currency 与 market 预期映射（冻结）

`CN-FUND/CN-SH/CN-SZ → CNY`、`US → USD`、`CA → CAD`、`HK → HKD`。与 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 的 `STORAGE_SUFFIX` 表保持同一 market 源；非法 market 走 `MARKET_INVALID`，不再判 currency 一致性。

#### 4.2.2 市场日算法（最近 3 个市场日）

```
function lastNMarketDays(market, n, { now, tz }):
  days = []
  cursor = dayjs(now).tz(marketTimezone(market))   // 该市场本地「今天」
  guard = 0
  while days.length < n and guard++ < MAX_LOOKBACK_DAYS(15):
    dateStr = cursor.format('YYYY-MM-DD')
    if isMarketOpenToday(market, new Date(`${dateStr}T12:00:00.000Z`)):
      days.unshift(dateStr)          // 收集最近 n 个开市日
    cursor = cursor.subtract(1, 'day')
  return days                         // 不足 n 个时返回实际天数 + 说明
```
- 复用 `isMarketOpenToday` + 各市场时区（`config/markets.js`）；候选日构造沿用 `${dateStr}T12:00:00Z`（`cronStatus.service.js:99` 既有做法）。
- 对某资产：这 3 天逐日查 `Price(symbol, timestamp ∈ dateBounds(day))`，**3 天均无记录** → `PRICE_EMPTY_3_MARKET_DAYS`。
- CN 的 ET 桶偏差：`integrityCheck.js:expectedBucketCandidates` 已就 CN 处理「市场日可能落入前/当日 ET 桶」；本判定直接复用该 helper 的逻辑（抽取为共享函数，见 OD-2），避免判定与既有完整性任务互相矛盾。
- 不足 3 个市场日（如长假 + 15 天回退上限）→ 按实际天数判定并在理由附 `INSUFFICIENT_MARKET_DAYS` 说明；**不**把「无法判定」误报为「完整」。

### 4.3 对外契约（冻结；新增字段，不改已验收 AC）

#### 4.3.1 `GET /api/cron/status` 扩展（OD-1：tasks[] 保持 5）

在响应 `data` 新增**顶层** `assetCompleteness`（不改 `tasks[]` 长度/顺序/字段，TASK-054 AC1 零改动）：

```jsonc
Data = {
  "generatedAt": "...", "timezone": "...", "staleThresholdHours": 48,
  "tasks": [ /* 原 5 条，不变 */ ],
  "assetCompleteness": {                 // 新：可空；无数据时字段 null，不伪造
    "contractReady": true,
    "checkedAt": "2026-11-17T...Z",      // 最近一次检查的 TaskRun.endedAt；无记录 null
    "total": 44,
    "complete": 30,
    "incomplete": 14,
    "launchDateMissing": 44,
    "priceEmpty3MarketDays": 3,          // 最近3市场日价格全空的资产数
    "missingByReason": { "LAUNCH_DATE_MISSING": 44, "PRICE_EMPTY_3_MARKET_DAYS": 3, ... },
    "incompleteAssets": [                // 详情列表数据源（只读摘要）
      { "symbol": "VBG.TO", "name": "...", "market": "CA",
        "reasons": ["LAUNCH_DATE_MISSING", "PRICE_EMPTY_3_MARKET_DAYS"] }
    ],
    "notes": [ { "code": "NO_CHECK_RUN", "message": "尚未运行过资产信息检查" } ]
  }
}
```
- `incompleteAssets` 同时供第 6 卡与详情页消费；详情页也可另开 `GET /api/asset-integrity/incomplete` 专用端点（OD-3 二选一，§6 裁决）。
- `contractReady=false` 或从未运行 → 计数 `null`、`incompleteAssets: []`、`notes` 给原因；**不**把 0 当「全部完整」。

#### 4.3.2 `POST /api/asset-integrity/check`（手动触发）

- 挂载点：新 router `server/routes/assetIntegrity.routes.js`，在 `app.js` 全站闸门（L109）之后 `app.use('/api/asset-integrity', ...)`；**不得**挂在 `/api/logs` 下（NG6 数据面只读）。
- 请求体：`{}`（可选 `{dryRun?:boolean}`）；响应 `success(res, { taskName, runKey, status, startedAt, endedAt, summary })`。
- controller 调 `cron-worker` 暴露的手动执行函数（见 OD-4）；返回的是**本次同步执行结果**（不是异步队列），便于按钮即时反馈。
- 幂等/并发：复用 `runTrackedTask` 的 `activeTasks` 互斥 + `runKey=manual:<ISO>`；重复点击返回 `SKIPPED`（`ALREADY_RUNNING`/`DUPLICATE_RUN_KEY`），前端提示「检查进行中，请稍后」。
- 该端点是一次**只读检查 + 写 TaskRun.result 观测**；不改任何资产字段。launchDate 抓取写入（AC1）是独立动作，不由本端点触发（见 OD-5）。

#### 4.3.3 资产详情/列表 launchDate 读写

- 读：`GET /api/assets/:id` 已返回整条 asset（含 launchDate），client 只加展示，无需新端点。
- 写：复用 `PUT /api/assets/:id`，launchDate 随 `updateAsset(id, data)` 提交；沿用既有鉴权与 mongoose enum/类型校验；服务端若未对 launchDate 做专门校验，在 `shared/services/asset.service.js` 的更新路径补「合法 Date、非未来」校验（不变量 2，不猜日期）。

### 4.4 与既有 `price-integrity-check` 的边界（OD-6）

| | 既有价格完整性（`price-integrity-check`） | 本卡价格连续性（D-o） |
|---|---|---|
| 主语 | 某资产"理论上应有多少价格，实采多少" | 某资产"最近 3 个市场日是否连续为空" |
| 判定 | 全历史 [launchDate, today] 的缺口率 | 近端 3 个市场日的全空趋势 |
| 目标日 | 有效目标日（D-16，03:00 同步节奏） | 最近 3 个**已过**的市场日 |
| 动作 | 可自动回补（INTEGRITY_AUTO_REPAIR） | **只读报告，不回补** |

二者共享市场日口径（复用同一 helper），但**计数互不合并**：第 6 卡只看 assetCompleteness，既有「价格完整性」卡不变。此边界须在 §7 用测试防止误并。

---

## 5. Work Breakdown

- [ ] **W0（阻塞前置）**：PM/Human 登记 NG6 定向修订附录（D-m）；Human 批准本计划及 §6 全部决策。**未满足前不得实现看板按钮/触发端点**（其余工作可并行推进）。
- [ ] **W1（探查）**：Implementer 用真实页面/API 核实 launchDate 抓取端点（U-1）并冻结到实现记录；失败即标未知，不虚构。
- [ ] **W2（shared 基础）**：抽取市场日公共能力（`lastNMarketDays` + CN 桶候选）到 `shared/services/marketDay.service.js`（复用 calendar.service.js/marketTime.js，OD-2）；新增 `shared/services/assetIntegrity.service.js` 实现 §4.2 判定（可注入 `{now, assets, priceQuery}`）；补理由码常量 `shared/constants/assetIntegrity.constants.js`。产出：单元可测的纯判定服务。
- [ ] **W3（cron-worker 手动任务）**：新增 `tasks/assetIntegrityCheck.js`（壳，`runTrackedTask` + `trigger:'MANUAL'`，`result` 按 §4.3.1 落库）；新增 `tasks/launchDateFetch.js`（AC1 抓取写入，包 timeout+retry，来源标注，失败记未知）。**不注册 cron**（scheduler.js 不新增 job）。
- [ ] **W4（server）**：新增 `routes/assetIntegrity.routes.js` + `controllers/assetIntegrity.controller.js`（POST check + 可选 GET incomplete）；扩展 `cronStatus.service.getStatus` 顶层 `assetCompleteness`（只读聚合，OD-1）；asset 更新路径补 launchDate 校验。`app.js` 挂载新 router（闸门后、非 /logs）。文档：API_CONTRACT。
- [ ] **W5（client）**：资产页 launchDate 展示/编辑（AssetList 列、AssetDetail 行、AssetForm 控件 + updateAsset）；看板第 6 卡（BOARD_SLOTS 6 槽 + buildIntegrityView 风格新视图 + 卡下方「运行资产信息检查」按钮，useMutation POST + invalidate cron-status）；详情页（只读列表 + 行尾去 `/instruments/edit/:id`，返回 `/logs?tab=board`）；状态色用 status* token；复跑 TASK-053 6 槽结构回归。
- [ ] **W6（验证）**：按 §7 逐条验证（含「先红后绿」负向用例）；`test:server`/`test:worker`/client build+lint 全绿；独立 Reviewer 通过。
- [ ] **W7（收尾）**：文档同步（DATA_MODEL / API_CONTRACT / NG6 附录引用 / docs:check 0 ERROR）；计划 §11–§13 记录；交 Human 关闭。

---

## 6. Decisions

> 下列需 Human 裁决；本计划当前为 Draft，未获批准。任务卡已裁决 D-i/D-j/D-k/D-l/D-m/D-n/D-o 不再重复；此处只列**计划层新增**且影响实现/契约的事项。

| # | 决策事项 | 选项与建议 | 决定人 / 依据 |
|---|---|---|---|
| **D1** | NG6 定向修订附录（D-m）：看板按钮是 `/logs` 子树第一个写入口 | 建议：按任务卡 D-m 原文，**仅允许**「运行资产信息检查」一个只读触发入口，PM/Human 日期附录修订 NG6（FS §62/R12）后按钮方可上线。**这是阻塞前置** | Human / 任务卡 §6 D-m、§8 |
| **D2** | 市场日能力是否抽取为 shared 公共函数 | 建议：**抽取**（`shared/services/marketDay.service.js`），把 `cronStatus.service.js` 私有 `lastOpenDayBefore` 与 CN 桶候选一并下沉，避免第二份日历口径（硬规则 #1）。代价：改动一个已验收任务的下游依赖，需回归 | Human / 架构硬规则 #1；影响 W2 |
| **D3** | 6 卡对 `GET /api/cron/status` 契约的影响 | 建议：**OD-1**——`tasks[]` 保持 5，新增顶层 `assetCompleteness`（§4.3.1），TASK-054 AC1 零改动。备选：把第 6 条塞进 `tasks[]`（会破坏已验收的长度恒 5 断言，需改 TASK-054 AC，不建议） | Human / TASK-054 AC1 已冻结 |
| **D4** | 详情页数据来源：`assetCompleteness.incompleteAssets` 复用 vs 独立端点 | 建议：**先复用**同一快照字段；若列表需分页/筛选再开 `GET /api/asset-integrity/incomplete`（同一 service，OD-3） | Human / 范围与接口数量；影响 W4/W5 |
| **D5** | launchDate 抓取端点/字段（U-1） | 由 Implementer 先实测冻结（D-i 来源：CN-FUND 天天基金、US/CA/HK 雅虎网页）；失败标未知不猜。**不建议在计划里虚构端点** | Human 已裁来源（D-i），细节交实施核实；影响 W1/W3 |
| **D6** | 触发检查是否同时抓取 launchDate | 建议：**不**。`POST /check` 只跑完整性判定（只读）；launchDate 抓取写入是 AC1 单独授权，走独立显式动作/CLI（OD-5），避免"检查"偷偷写数据违反不变量 2 | Human / AC3 只读 + AC1 独立授权 |

---

## 7. Verification

> 逐条关联任务卡 AC；命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)。所有关键断言必须「可失败」（先红后绿）。

| AC | 验证方法 | 预期 / 覆盖缺口 |
|---|---|---|
| AC1 | W1 实现记录列出实测端点+字段；单测/集成测抓取写 `assets.launchDate`；猴补 fetcher 失败 → 字段仍 null 且记未知；`grep` 确认外部调用包了 timeout+retry | 成功写入真实成立日；失败不猜不填 0；外部调用无裸 axios。**U-1 未实测前此项不通过** |
| AC2 | client build + lint；手工/浏览器：AssetList/Detail 显示 launchDate（含 `—`/未知），AssetForm 编辑保存走 PUT `/assets/:id`，服务端拒未来日期；既有资产表单零回归 | 展示与编辑闭环；非法日期被拒；无回归 |
| AC3 | 集成测 `POST /api/asset-integrity/check`：返回 summary、`TaskRun.result` 落库（查库可读）；并发/重复返回 SKIPPED；**断言无资产字段被改**（读前后快照比对）；`grep -rn "cron.schedule" cron-worker/src` 无新增每日 job；按钮 DOM 在第 6 卡下方且 `/logs` 仅此一个写入口（NG6 附录已登记） | 只读检查 + 手动触发；无每日 cron；按钮位置正确；NG6 附录先于上线 |
| AC3（价格策略） | **先红后绿**：构造某资产最近 3 个市场日 Price 全空（含 CN 桶偏差场景），断言 `PRICE_EMPTY_3_MARKET_DAYS` 命中；第 3 日有价则不命中；不足 3 市场日给 `INSUFFICIENT_MARKET_DAYS`；与市场日私有算法/价格完整性卡计数互不串（OD-6） | 市场日口径正确、非自然日；不误报、不漏报；与价格完整性边界清晰 |
| AC4 | client 组件测/手工：6 卡渲染、新卡只读（无编辑控件）、计数来自 `assetCompleteness`；复跑 TASK-053 6 槽结构回归（健康灯 6、卡片 6）；无数据时灰/未知非默认绿 | 6 灯/6 卡且不回归；新卡只读 |
| AC5 | 详情页：从卡片进入，列表展示不完整资产 + 理由，行尾「编辑」跳 `/instruments/edit/:id`（资产域写），返回 `/logs?tab=board`；DOM 断言详情页无 mutation（NG6） | 只读详情 + 编辑在资产域；`/logs` 下无写控件 |
| AC6 | `cd server && npm test` + `npm run validate`(+`verify`)；`cd cron-worker && npm test`；`cd client && npm run build && npm run lint`；根 `npm test`；独立 Reviewer 通过；`node scripts/check-docs.cjs` 0 ERROR | 全绿；Reviewer 独立；文档链接 0 失效。沙箱 `spawn EPERM` 时在可派生子进程的终端/CI 重跑并留证 |

---

## 8. Risks

| # | 触发条件 | 影响 | 应对 |
|---|---|---|---|
| R-1 | NG6 附录未登记就上线按钮 | 违反硬约束 / Review BLOCKER | W0 阻塞前置；附录登记前按钮与 POST 端点不合并 |
| R-2 | 6 卡破坏 TASK-053 已验收结构 | 回归缺陷 | 按 D-j 附录 6 槽位实现；§7 复跑结构回归 |
| R-3 | launchDate 抓取来源不可靠/端点失效 | 写入错误日期污染完整性 | U-1 实测冻结；失败标未知不猜；来源标注；人工兜底（AC2） |
| R-4 | 市场日抽取改动已验收的 `cronStatus.service.js` | 价格卡目标日回归 | D2 需 Human 批；回归 `cronStatus.service` 价格数据态测试；抽取保持行为等价 |
| R-5 | CN/HK 节假日表未覆盖未来年份 | 未来市场日高估 → 价格连续性误判 | 复用现有表 + 告警；维护新年份另立任务；不足天数给说明 |
| R-6 | 手动触发并发/重复点击 | 重复 TaskRun / 冲突 | 复用 `runTrackedTask` 互斥 + runKey；前端禁用 + 提示 |
| R-7 | 沙箱 shell 无法派生测试子进程 | 验证无法在本会话完成 | 在可派生子进程的终端/CI 执行并留日志；不伪造 pass |

## 9. Rollback

- **代码**：各 workspace 独立改动，回滚 feature 分支即恢复；新增端点/路由为纯增量，删除即可。
- **数据**：唯一业务写是 launchDate 抓取（AC1，单独授权）与 `TaskRun` 观测记录；回滚不删除已写 launchDate（属修复数据），如需撤销用人工编辑（AC2）。`TaskRun` 为新任务记录，不影响既有任务历史。
- **文档**：TASK-053 附录、NG6 附录均为日期追加，不改原 AC 正文；回滚只删附录，不动历史验收。
- **不可逆影响**：无 schema 迁移、无跨币种、无交易写入（不变量 1/3 不受影响）。

## 10. Implementer Handoff

**下一角色**：Implementer（待 Orchestrator 登记并 Human 批准本计划后启动）。

**输入**：本计划 + 任务卡 + §2 链接的 Spec/ADR；§3 的全部 file:line 发现；§4 契约；§6 需 Human 批准的 D1–D6。

**范围 / 禁改**：
- 改：§5 W1–W7 列出的文件；新增 shared 服务与 cron-worker 任务壳；server 新 router/controller；client 6 卡 + 按钮 + 详情页 + 资产页 launchDate。
- 禁改：TASK-054 `tasks[]` 契约（OD-1）；`price-integrity-check` 任务语义；symbol 后缀（TASK-073）；`/logs` 子树其它写入口；每日 cron（scheduler.js 不新增 job）；已验收 Task 卡的 Status/AC 正文。
- 授权边界：D1（NG6 附录）与 D6（check 不抓 launchDate）为硬边界；D2 抽取需先获批准。

**依赖**：W0 前置（NG6 附录 + 本计划批准）；D2 抽取的回归基线；U-1 端点实测。

**预期产出**：可运行的手动检查链路 + 6 卡 + 详情页 + launchDate 读写；测试全绿；§7 证据；实现记录写入 §11。

**停止条件**：
- NG6 附录未登记 → 不做按钮/POST 端点；
- U-1 端点无法验证 → 不虚构实现，按 D5 记录并停止该子项；
- 发现与任务卡/AC 或已批准计划冲突 → 停止上报，不自行改需求。

**验证入口**：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；文档校验 `node scripts/check-docs.cjs`。

## 11. Implementation Record

> 待 Implementer 填写。

## 12. Review Record

> 待独立 Reviewer 填写（格式见 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7）；Implementer 不得自判。

## 13. Completion Record

> 待结案时填写：AC/验证证据引用、关闭依据、归档位置、`Merged` 由 Human 登记（本计划不自行判定）。计划完成后随独立任务留在 `development/tasks/active/`（或结案时随卡移入 `completed/`），不另设目录。

---

## 自检

- [x] Task 与批准依据对应，方案未改变需求（D-o 市场日按续 6 已裁决口径；新增 Decision 均标注待批）。
- [x] 步骤可执行、依赖明确、AC 有验证方法（W0–W7 + §7 逐条）。
- [x] 记录可追溯且只存一处，编号与相对链接正确（待 §5 链接校验确认）。
