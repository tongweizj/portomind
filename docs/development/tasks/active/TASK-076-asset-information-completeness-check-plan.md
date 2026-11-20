# TASK-076 — 资产信息完整性检查（launchDate 抓取 / 前台可编辑 / 手动检查 / 看板卡片与详情）执行计划

## Status

Status：Implementing（2026-11-19，Human 指示开工。2026-11-17 批准「073～078 计划」）

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
| 前置（已满足） | NG6 定向修订附录（D-m） | Human 已批准，见 [FS NG6/R12 定向修订](../../requirements/specs/FS-cron-worker-status-board.md#appendix-b--2026-11-19-ng6--r12-定向修订) |
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
shared/tasks/assetIntegrityCheck.js（API 与 CLI 共用：runTrackedTask, trigger=MANUAL）
cron-worker  tasks/assetIntegrityCheck.js（手动 CLI 入口）
             tasks/launchDateFetch.js（抓取写入，独立授权 AC1；withMarketDataTimeout+fetchWithRetry）
```

判定与手动任务共用 `shared/` 实现，API 和 CLI 只负责入口编排。价格同步看板与本检查共用 TASK-078 的目标日算法，历史价格完整性任务与本检查共用 CN 桶候选算法。

### 4.2 判定规则（§3.1 冻结）

对 `active:true` 资产逐项判定，5 元数据字段 + 价格连续性：

| 维度 | 完整 | 不完整理由码 |
|---|---|---|
| `symbol` | 正则 + trim/upper + ADR-003 按 market 后缀派生一致 | `SYMBOL_FORMAT` / `SYMBOL_SUFFIX` |
| `name` | 非空、trim 后 ≤120 | `NAME_EMPTY` / `NAME_TOO_LONG` |
| `market` | ∈ `ASSET_MARKETS` | `MARKET_INVALID` |
| `currency` | ∈ `ASSET_CURRENCIES` 且与 market 预期一致（映射表在 §4.2.1 冻结） | `CURRENCY_INVALID` / `CURRENCY_MISMATCH` |
| `launchDate` | 合法 Date、非未来 | `LAUNCH_DATE_MISSING` / `LAUNCH_DATE_INVALID` / `LAUNCH_DATE_FUTURE` |
| 价格连续性 | 完整窗口中至少有一个有效价格 | 三个开市日全空 `PRICE_EMPTY_3_MARKET_DAYS`，窗口不足 `INSUFFICIENT_MARKET_DAYS` |

> 完整度 = 六项全合格的资产数 / active 资产总数；任一项不合格即计入不完整，并给出全部命中理由码（数组）。其它资产字段（type/assetClass/tags/active/watchlist/createdAt）不检查、不出理由、不进详情页。

#### 4.2.1 currency 与 market 预期映射（冻结）

`CN-FUND/CN-SH/CN-SZ → CNY`、`US → USD`、`CA → CAD`、`HK → HKD`。与 [ADR-003](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md) 的 `STORAGE_SUFFIX` 表保持同一 market 源；非法 market 走 `MARKET_INVALID`，不再判 currency 一致性。

#### 4.2.2 市场日算法（最近 3 个市场日）

第一天为 TASK-078 分组规则所算目标日，再取前两个开市日。窗口从目标日最多回看 15 个自然日，休市日不计入。
- 复用 `isMarketOpenToday` + 各市场时区（`config/markets.js`）；候选日构造沿用 `${dateStr}T12:00:00Z`（`cronStatus.service.js:99` 既有做法）。
- 对某资产：这 3 天逐日查 `Price(symbol, timestamp ∈ dateBounds(day))`，**3 天均无记录** → `PRICE_EMPTY_3_MARKET_DAYS`。
- CN 的旧桶复用共享候选函数。窗口内开市日直接查价，窗外旧桶候选仅在该市场休市时纳入。窗外正常开市日的价格不归入窗口。历史完整性任务保留原来的全历史容差。
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
- 请求体 `{}`，响应 `success(res, { taskName, runKey, status, startedAt, endedAt, summary })`。
- API 调用与 CLI 共用的 `shared` 手动检查任务，同步返回本次结果。
- 并发：进程内复用 `runTrackedTask` 锁。API 和 CLI 争用 `taskruns` 已有唯一索引上的 `manual:active`，只有持锁者读取资产和价格。完成时原子改用带 TaskRun ID 的历史运行键。活跃记录超过 15 分钟后可由下次触发留为 `FAILED` 并接管，过期执行不能发布结果。防重返回 `SKIPPED` / `ALREADY_RUNNING`。
- 该端点是一次**只读检查 + 写 TaskRun.result 观测**；不改任何资产字段。launchDate 抓取写入（AC1）是独立动作，不由本端点触发（见 OD-5）。

#### 4.3.3 资产详情/列表 launchDate 读写

- 读：`GET /api/assets/:id` 已返回整条 asset（含 launchDate），client 只加展示，无需新端点。
- 写：复用 `PUT /api/assets/:id`，launchDate 随 `updateAsset(id, data)` 提交；沿用既有鉴权与 mongoose enum/类型校验；服务端若未对 launchDate 做专门校验，在 `shared/services/asset.service.js` 的更新路径补「合法 Date、非未来」校验（不变量 2，不猜日期）。

### 4.4 与既有 `price-integrity-check` 的边界（OD-6）

| | 既有价格完整性（`price-integrity-check`） | 本卡价格连续性（D-o） |
|---|---|---|
| 主语 | 某资产"理论上应有多少价格，实采多少" | 某资产"最近 3 个市场日是否连续为空" |
| 判定 | 全历史 [launchDate, today] 的缺口率 | 近端 3 个市场日的全空趋势 |
| 目标日 | 历史任务按其既有执行窗口检查 | 从 TASK-078 分组目标日（含）往前取 3 个开市日 |
| 动作 | 可自动回补（INTEGRITY_AUTO_REPAIR） | **只读报告，不回补** |

二者共享市场日口径（复用同一 helper），但**计数互不合并**：第 6 卡只看 assetCompleteness，既有「价格完整性」卡不变。此边界须在 §7 用测试防止误并。

---

## 5. Work Breakdown

- [x] **W0（前置）**：Human 已于 2026-11-19 批准登记 [NG6/R12 定向修订](../../requirements/specs/FS-cron-worker-status-board.md#appendix-b--2026-11-19-ng6--r12-定向修订)、复用 TASK-078 分组目标日及 shared 手动检查入口。
- [x] **W1（探查）**：真实页面及字段核对，来源与覆盖见 §11。
- [x] **W2（shared 基础）**：抽取 TASK-078 目标日、开市日和 CN 桶候选，完成资产完整性只读判定及理由码。
- [x] **W3（手动任务）**：API 与 CLI 共用 `shared` 检查任务。日期抓取独立运行，默认预览。调度注册未变。
- [x] **W4（server）**：鉴权 POST、顶层 `assetCompleteness` 只读快照和现有资产更新入口日期校验。
- [x] **W5（client）**：资产日期展示与编辑、六槽看板、卡下按钮和资产域详情。六灯结构回归见 §11。
- [ ] **W6（验证）**：按 §7 逐条验证（含「先红后绿」负向用例）；`test:server`/`test:worker`/client build+lint 全绿；独立 Reviewer 通过。
- [ ] **W7（收尾）**：文档同步（DATA_MODEL / API_CONTRACT / NG6 附录引用 / docs:check 0 ERROR）；计划 §11–§13 记录；交 Human 关闭。

---

## 6. Decisions

> 2026-11-19 Human 确认 D1、D2 与 OD-4 的实施口径：三个开市日从 TASK-078 的分组目标日（含）向前取，API 与 CLI 共用 `shared` 手动任务。D3、D4 与 D6 沿用 §4 已批准契约，D5 实测见 §11。

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


### 2026-11-19 · 开工、日期编辑与抓取预览

- 从含 TASK-074 的 `origin/main` `e9f81d2`（PR #61）创建 `feature/TASK-076-asset-information-completeness-check`，使用独立工作树 `D:/projects/portomind-task-076`。TASK-053 已登记 6 卡附录。FS 的 NG6 定向附录仍缺，W0 未满足。
- **W1 / AC1 来源核实。** [天天基金 001180](https://fundf10.eastmoney.com/001180.html) 返回 `基金代码` 与 `成立日期`。[Yahoo VOO](https://finance.yahoo.com/quote/VOO/) 和 [Yahoo 加拿大 VFV.TO](https://ca.finance.yahoo.com/quote/VFV.TO/) 返回 `Inception Date`。[Yahoo 0700.HK](https://finance.yahoo.com/quote/0700.HK/) 的单标的内嵌报价返回 `firstTradeDateMilliseconds`，按该市场日期解释。Yahoo 美国站的部分加拿大报价页返回 404，改用加拿大站后复验。CN-SH/CN-SZ 未在 D-i 指定日期来源，保留为未支持。
- **W3 / AC1 实作与覆盖。** 独立 Worker CLI 默认预览，显式 `--apply` 才写入。更新同时核对资产仍 active、键未变、日期仍为空，保留抓取期间人工录入的值。`portomind_task077_restore_test` 只读预览为 41/44，CN-FUND 29/29、US 3/4、CA 9/11。库内无 active HK 资产，HK 单独实探。`CQQQ.US`、`VBG.TO`、`VBU.TO` 的指定 Yahoo 页面返回 404，日期维持未知。逐条结果在 `%TEMP%/portomind-TASK-076-launch-date-preview-final.json`。写入条件用测试替身验证，未对真实库执行 `--apply`。
- **W4/W5 / AC2 进展。** 列表与详情显示日期或「未知」。表单提交实际改动，日期校验走既有资产 API。后端按 UTC 正午保存逻辑日期，兼容价格完整性检查按市场时区读取。只更新其它字段时省略日期，以免覆盖并发回填。鉴权集成测试已验证设置、清空、无效及未来日期。浏览器编辑保存及检查结果随编辑更新尚未验收。
- **待协调。** NG6/R12 附录登记前暂缓按钮与 POST。计划 §4.3.2 的 server 调 Worker 与架构 §4 的 workspace 依赖约束冲突，建议 API 与 CLI 共用 `shared` 手动任务。计划 §4.2.2 的市场本地「今天」与 §4.4「已过」及任务卡共用目标市场日口径不一致，W2 的市场日抽取与价格连续性待 Planner/Human 统一到 TASK-078 分组目标日后继续。
- **验证。** 服务端和 Worker 全量通过，日志 `%TEMP%/portomind-TASK-076-start-workspaces.log`。Client build 和 lint 通过，仍有既有分块和 Fast Refresh 警告。Server `validate` 遇到基线脚本仍扫描已不存在的 `server/config`，改用 `node --check` 补验本轮的后端 JavaScript 文件。

### 2026-11-19 · 手动检查与看板实施

- **授权与基线。** `e9f81d2` 的 TASK-076 独立工作树继续开发。Human 确认 TASK-078 分组目标日与 API/CLI 共用手动任务，批准 NG6/R12 的一个例外，已先登记附录。调度器注册维持五类六个触发器。
- **AC1。** 临时独立 MongoDB 的实采回填把 `001180.CN` 的 `2015-05-06` 写入日期，重跑保留该值。`VBG.TO` 的上游 404 保持空值，事先人工填写的 VOO 日期保留。隔离验收镜像的 41/44 为只读预览覆盖，未在该镜像执行回填。
- **AC2、AC5。** 浏览器夹具通过第六卡到资产域详情、缺失原因、跳转编辑、按原日期保存、返回看板重新检查并从 0/1 更新至 1/1 的闭环。详情页只有查看和导航动作。
- **AC3。** 复用原分组目标日及历史任务的 CN 桶候选，测试覆盖周末、旧桶、CN 午间边界、US 前一交易日、三个开市日全空及窗口内至少一个有效价格。真实 HTTP 集成用模型替身验证鉴权、空请求体、防重、回读与资产未改变。临时真实 MongoDB 回读两条手动 TaskRun，检查本身未改资产。`portomind_task077_restore_test` 于 11-18 15:00 ET 的只读核对为完整 0/44、日期缺失 44、三个市场日无价 2。
- **AC4、AC6。** 浏览器验证六卡与六灯、未检查时灰色、按钮仅出现在第六卡下方、一次点击后刷新一次。API `tasks[]` 仍为 5 项。服务端与 Worker 全量、Client build/lint、TASK-063 与 TASK-056 浏览器夹具、文档检查、新改动后端文件语法检查通过。自动校验脚本的已知路径故障见上文。尚待独立 Reviewer。

### 2026-11-19 · 第一轮审查返工

- **R1 / AC3。** 11-23 13:00 ET 样例的窗口为 11-23、11-20、11-19。仅有 11-18 时全空计数由 0 修正为 1，改给 11-19 时全空仍为 0。休市日旧桶对照保留。回归先红后绿。
- **R2 / AC3。** API 和 CLI 通过 `TaskRun` 已有唯一索引共用活跃键。临时 MongoDB 中两个独立 Node 进程以相差 1 ms 的参数运行且首个保持活跃，仅首个创建 TaskRun，后一个返回 `SKIPPED / ALREADY_RUNNING` 并留下跳过事件。还验证了过期活跃记录可回收且旧进程不能发布结果。测试仅写入新建的临时库。索引定义未变。
- **R3 / AC2。** Human 确认保存后立即刷新报告的上市／成立日期判定。`GET /api/cron/status` 以最近一次检查的受检资产清单为范围，按当前日期字段更新该项理由和计数。价格、其它字段理由、报告时间和历史 TaskRun 保留原值。浏览器验证资产保存后仅追加一次 GET，详情立即更新。服务端验证日期补齐及清空、历史数据保持、未受检资产排除。旧运行如缺少受检资产 ID 清单，仅读取并更新原已列入缺失项的资产日期。
- **R3 真实库对照。** 临时 MongoDB 上实际保存与清空日期后，GET 的缺日期计数依次为 `1 → 0 → 1`，三个市场日全空计数始终为 1。原 TaskRun 逐文档一致，运行记录总数仍为 1。
- **AC6 验证入口。** 修正标准服务端语法脚本的目录清单，并纳入 `app.js`。该入口现通过。
- 全量服务端和 Worker、浏览器报告刷新夹具、Client build/lint、标准语法校验和文档检查通过。日志 `%TEMP%/portomind-TASK-076-r1-workspaces.log`、`%TEMP%/portomind-TASK-076-r1-browser.log`。验收待独立复审。

### 2026-11-19 · AC2 停用受检资产返工

- **R3 / AC2。** 报告沿用上次手动检查的资产 ID。未出现在当前启用列表的受检资产按 ID 批量补查日期，包含已停用资产。价格看板和下次手动检查仍按当前启用状态选取资产。保存补日期并同时停用的 HTTP 回归先红后绿，校验日期理由消失，受检分母、价格理由和 `checkedAt` 保留，TaskRun 未新增或修改。
- 临时 MongoDB 实测缺日期 `1 → 0`，受检分母和三日全空各为 `1 → 1`，仅一条原始 TaskRun 且逐文档一致。浏览器夹具实测同次保存停用后仅发 GET，下一次手动检查才从范围中移除该资产。服务端和 Worker 全量、浏览器、标准 `validate` 和 lint 通过，工作区日志 `%TEMP%/portomind-TASK-076-r2-workspaces.log`、`%TEMP%/portomind-TASK-076-r2-browser.log`。待独立复审。

## 12. Review Record

### 2026-11-19 · 独立审查

**Fail。** 审查对象为 `feature/TASK-076-asset-information-completeness-check` @ `e9f81d2` 的当前工作树，包含尚未提交的 TASK-076 改动及新增文件。Reviewer 未参与实现或编写交付验收脚本。范围限于本卡 AC 和直接受影响的看板、目标市场日与资产日期契约。

| AC | 结论与证据 |
|---|---|
| AC1 | 通过。查阅 §11 的来源核实、预览覆盖率和隔离 MongoDB 回填记录。独立复跑抓取与回填测试，验证各来源解析、预览及失败保留未知。核对外部请求同时使用超时和重试包装。 |
| AC2 | 部分满足。源码确认列表、详情和表单接入日期，定向测试覆盖日期校验，浏览器夹具已验证保存及手动重查。保存后返回报告仍显示上次检查结果，见 R3。 |
| AC3 | 不满足。单进程 HTTP 集成验证了鉴权、手动触发、防重、只读判定及快照回读，生产调度注册未变。定向对照复现窗口外净值漏报与跨进程防重缺口，见 R1、R2。 |
| AC4 | 通过。TASK-053 六槽修订与 NG6 / R12 例外已有登记。浏览器夹具覆盖六卡六灯、初始未知、按钮卡下落位和检查后刷新。HTTP 集成确认原 `tasks[]` 保持 5 项，新卡使用顶层快照。 |
| AC5 | 通过。浏览器夹具覆盖从卡片进入资产域详情、显示缺失理由及跳转每行编辑。源码确认详情页只读，返回看板链接存在。 |
| AC6 | 未通过。沿用交付的服务端、Worker 全量和两组浏览器夹具日志，另核对 §11 的构建与 lint 记录。独立审查发现未关闭问题，标准服务端语法入口仍有基线路径故障。 |

- **R1 · BLOCKER · AC3 最近三个市场日全空会漏报。** 在 2026-11-23 13:00 ET 检查 CN-FUND，目标窗口为 11-23、11-20、11-19。仅提供 11-18 的正常日桶净值时，结果为完整 1、全空 0。不给任何价格时全空为 1，仅给 11-19 净值时全空为 0。原因是 [检查服务](../../../../shared/services/assetIntegrity.service.js) 将候选日期合并，最早窗内日的旧桶候选与窗外开市日的正常日桶重叠。[天天基金采集器](../../../../shared/fetchers/tiantianFetcher.js) 正常按净值日期归桶，现有夹具把重叠日期直接视作旧桶，遗漏了该对照。待区分能确认归属的窗内价格与有歧义的旧桶，并补窗外有价、窗内全空的断言。
- **R2 · MAJOR · AC3 跨进程并发会创建两条检查记录。** 两个隔离 Node 进程调用真正的 [共享检查任务](../../../../shared/tasks/assetIntegrityCheck.js)，用模型替身拦截写入并保持两次检查同时进行。两次触发时间差 1 毫秒，均进入 `TaskRun.create` 并返回 `SUCCEEDED`。网页和 CLI 在独立进程运行，[互斥表](../../../../shared/services/taskRunner.js) 只在单进程生效，[唯一索引](../../../../shared/models/taskRun.js) 只拦截完全相同的 `runKey`。待明确跨入口的并发口径，并按约定补同进程与跨入口对照。
- **R3 · MAJOR · AC2 编辑保存后的报告仍为旧快照。** [表单](../../../../client/src/pages/Asset/AssetForm.jsx) 保存后返回[资产完整度详情](../../../../client/src/pages/Asset/AssetIntegrityDetail.jsx)，该页仍消费上次 TaskRun 的缺失清单。浏览器夹具要返回看板后二次点击检查才从 0/1 变成 1/1。待确认“修改后完整性检查结果随之更新”是否以这次手动重查为验收点，或落实保存后的报告更新，同时保持检查手动触发和历史记录语义。

独立实跑覆盖日期解析与回填、资产 API 校验、完整度服务和状态 API 定向用例，均通过。R1、R2 用 stdin 隔离对照，不入库。改动的后端 JavaScript 语法检查及文档检查通过。标准 `validate` 已复现基线 `server/config` 路径缺失，单文件语法检查用作补充。本轮未重新连接真实上游、启动生产服务或写入现有数据库，未重复交付全量回归。返工后按 R1–R3 复审。

### 2026-11-19 · 第一轮返工复审

**Fail。** 复审对象为 `feature/TASK-076-asset-information-completeness-check` @ `e9f81d2` 的当前返工工作树。Reviewer 未参与本轮实现或编写交付验收脚本。复审覆盖 R1–R3 和受影响的状态接口、任务防重与语法校验入口。

- **R1 已关闭。** 独立重跑原 CN-FUND 窗口。无净值、仅有窗口外 11-18 净值均报全空，只有窗内 11-19 净值时全空计数为 0。休市日 11-22 的旧桶兼容对照通过。
- **R2 已关闭。** 查阅 §11 的独立进程临时 MongoDB 验证和过期活跃记录对照，核对现有唯一索引与共享活跃键。独立复跑同进程跳过、数据库键冲突、跳过事件和任务完成释放键的定向测试，均通过。真实 MongoDB 对照沿用 §11 的交付证据。
- **R3 仍有一处未关闭。** 当前启用的受检资产保存日期后可立即更新，浏览器日志确认只追加一次 GET，无需再触发检查。**MAJOR / AC2：如在同一次表单保存中补填日期并停用受检资产，报告仍保留原来的缺日期理由。** 独立运行真实状态服务，模型替身按查询条件筛选。样本保持启用且填日期时缺失数从 1 降到 0，同时停用时缺失数仍为 1、总数仍为 1。状态服务传入的是[当前启用资产](../../../../shared/services/cronStatus.service.js)，[报告刷新](../../../../shared/services/assetIntegrity.service.js)由此漏掉仍在上次受检清单中的停用资产。按上次受检范围读取当前日期，并保留该次检查的分母、其它理由和时间，可覆盖此场景。

AC1、AC4、AC5 维持通过，AC3 复审通过。AC2 尚有上述缺口，AC6 的独立审查尚未通过。定向回归、标准服务端语法校验、文档检查均通过。全量服务端与 Worker、浏览器夹具及前端构建与 lint 沿用 §11 的返工证据。本次独立对照用 stdin 执行，未重跑实库、上游抓取或全量测试。

### 2026-11-20 · AC2 停用场景复审

**Pass。** 复审对象为 `feature/TASK-076-asset-information-completeness-check` @ `e9f81d2` 的最新返工工作树，含未提交改动。Reviewer 未参与实现或编写交付验收脚本。

- **R3 关闭，AC2 通过。** [日期刷新](../../../../shared/services/assetIntegrity.service.js)按上次受检资产 ID 补查当前已停用的资产。独立复跑 HTTP 回归，同次保存补日期及停用后，GET 即移除缺日期理由，保留受检分母、缺价理由和原检查时间。独立状态服务对照以模型替身按查询过滤，验证缺日期计数随补填和清空从 1 变为 0 再回到 1。未受检资产未进入报告，原 TaskRun 内容一致。查阅 §11 浏览器证据，确认保存后只发起 GET，下次手动检查才排除该停用资产。
- **AC1、AC3–AC5 维持通过。** R1、R2 沿用前次独立复审，本轮定向回归覆盖完整度服务、状态 API 和任务防重。
- **AC6 通过。** 本轮定向回归、标准服务端语法校验和文档检查通过。服务端和 Worker 全量、浏览器及临时 MongoDB 验证沿用 §11 最新交付证据。本轮独立对照经 stdin 在模型替身上执行，未连接真实上游或写入现有数据库。

## 13. Completion Record

> 待结案时填写：AC/验证证据引用、关闭依据、归档位置、`Merged` 由 Human 登记（本计划不自行判定）。计划完成后随独立任务留在 `development/tasks/active/`（或结案时随卡移入 `completed/`），不另设目录。

---

## 自检

- [x] Task 与批准依据对应，方案未改变需求（D-o 市场日按续 6 已裁决口径；新增 Decision 均标注待批）。
- [x] 步骤可执行、依赖明确、AC 有验证方法（W0–W7 + §7 逐条）。
- [x] 记录可追溯且只存一处，编号与相对链接正确（待 §5 链接校验确认）。
