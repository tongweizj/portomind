# PortoMind 系统功能架构清单（已归档）

> ⚠️ **本文已归档（2026-10-15），内容不再在此维护。** 原 `docs/architecture/functions.md` 的功能架构清单已按业务功能域**拆入产品线文档**——正文（功能域明细、API、数据模型、业务规则、技术债）见 [docs/product/lines/](../product/lines/) 下的 7 个产品线子文件，跨线的总览与全系统参考附录归入 [PL-0 平台基座线](../product/lines/PL-0-platform-foundation.md)；产品线划分与总览见 [PRODUCT_LINES.md](../product/PRODUCT_LINES.md)。本文件仅作历史留存，路径与链接已修正，**请勿据本文更新功能描述**。
>
> 状态：Archived（原为 Current；基于源码逐模块调研，已按 TASK-005 统一调度器 / shared 内核重构校正）
> 日期：2026-10-15（归档同日）
> 范围：`client/`、`server/`、`cron-worker/`、`shared/` 四模块全部已实现功能
> 阅读顺序建议：本文（功能全景）→ [ARCHITECTURE.md](../architecture/ARCHITECTURE.md)（架构分层）→ [API_CONTRACT.md](../dev/API_CONTRACT.md)（接口细节）→ [PRD.md](../product/specs/PRD.md)（需求基线）

---

## 1. 文档目的与调研方法

### 1.1 目的

本文是 PortoMind 当前实现的**功能架构清单**，回答三个问题：

1. **系统现在能做什么**——按业务功能域穷尽列出全部已落地能力。
2. **这些能力由谁承载**——每个功能对应的运行时组件、代码位置与 API 端点。
3. **功能之间的边界与依赖**——功能域如何划分、哪些是纯函数引擎、哪些跨进程复用。

本文以「功能」为编排单位（而非文件为单位），与 [API_CONTRACT.md](../dev/API_CONTRACT.md)（接口契约）、[ARCHITECTURE.md](../architecture/ARCHITECTURE.md)（分层与依赖规则）互补。

### 1.2 调研方法

- 通读 `shared/` 全部业务内核：`models`、`services`、`tasks`、`fetchers`、`constants`、`config`、`utils`。
- 通读 `server/` 的路由、控制器、中间件与任务 CLI 薄壳。
- 通读 `client/src` 全部页面、组件、hooks、services、constants、utils。
- 通读 `cron-worker/src` 全部调度器与任务。
- 交叉核对 `docs/product/specs/PRD.md` 的功能编码（AS/TR/CM/RB/AL/FAM）与 `docs/dev/API_CONTRACT.md` 端点表。

### 1.3 功能编码对照

PRD 采用模块化需求编码，本文沿用该编码以便双向追溯：

| 前缀 | 功能域 | 编号范围 | 对应章节 |
|---|---|---|---|
| `AS` | 资产管理与行情价格 | AS-01 ~ AS-11 | §4.1、§4.2 |
| `TR` | 交易记录与持仓计算 | TR-01 ~ TR-09 | §4.3、§4.4 |
| `CM` | 组合管理与配置 | CM-01 ~ CM-20 | §4.5 |
| `RB` | 再平衡 | RB-01 ~ RB-11 | §4.6 |
| `AL` | 提醒中心 | AL-01 ~ AL-10 | §4.7 |
| `FAM` | 家庭视图与汇率 | FAM-01 ~ FAM-04 | §4.8 |
| — | 估值分位 | AS-11 延伸 | §4.9 |
| — | 调度与数据质量 | — | §4.10 |
| — | 系统运维（日志） | — | §4.11 |

---

## 2. 系统总览

### 2.1 定位

PortoMind 是**自托管的个人 / 家庭投资组合管理应用**，面向单用户本地可信网络部署。核心业务闭环：

```
资产主数据 → 交易流水 → 持仓/盈亏 → 目标配置 → 再平衡建议 → 提醒中心 → 家庭 RMB 汇总
                              ↑                               ↑
                       行情价格同步（每日）            汇率采集（每日）
```

### 2.2 运行时形态（两进程 + 两代码模块）

仓库为 **npm workspaces monorepo**，四个 workspace 中 `shared/` 是**代码模块（不是进程）**，被 `server` 与 `cron-worker` 两个进程共同加载：

| 模块 | 目录 | 形态 | 职责 | 入口 |
|---|---|---|---|---|
| **共享内核** | `shared/` | 库（无进程） | 全部业务引擎：models / services / tasks / fetchers / constants / config / utils | `shared/index.js` |
| **Web 前端** | `client/` | 进程 | SPA 界面，全部业务操作与可视化 | `client/src/main.jsx` |
| **API 服务** | `server/` | 进程 | REST API + 调度只读状态接口；**不注册任何 cron** | `server/server.js` → `app.js` |
| **调度 Worker** | `cron-worker/` | 进程 | **全项目唯一调度所有者**：5 类定时任务的注册与触发 | `cron-worker/index.js` |

> **启动约束（TASK-005 后已收敛）**：`cron-worker` 是**唯一**会注册 cron 的进程，`server` 侧不存在调度启动路径，`SCHEDULER_ENABLED` 只由 worker 读取。生产环境由 PM2 分别保活 `portomind-api` 与 `portomind-worker`，不再使用系统 crontab。`server` 与 `cron-worker` **共享同一个 MongoDB**，也共享 `shared/` 同一份业务实现——业务逻辑不存在第二份拷贝。
>
> **职责边界**：`shared/` 承载「业务能力」，`cron-worker` 只持有「触发权」。因此 「API 手动触发端点」与「worker 定时触发」走的是**同一函数**，行为一致。详见 §4.10.1 与 [CRON_WORKER.md](../manual/CRON_WORKER.md) §3。

### 2.3 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19、Vite 6、React Router 7、TanStack Query 5、axios、recharts、Tailwind CSS 4、lucide-react |
| 共享内核 | Node.js（CommonJS）、Mongoose 6、axios、dayjs、winston（+ daily-rotate-file） |
| API 服务 | Node.js、Express 4、`@portomind/shared` |
| Worker | Node.js（CommonJS）、node-cron、`@portomind/shared`、p-limit、minimist、dotenv |
| 包管理 | npm workspaces（`shared` / `server` / `cron-worker` / `client`） |
| 测试 | Node.js 内置 `node --test`（HTTP 集成 + 表格驱动业务测试） |

### 2.4 外部集成

| 集成 | 用途 | 方向 | 覆盖市场 |
|---|---|---|---|
| Yahoo Finance Chart API | 行情抓取 | 出站 | 美股、加股（`.TO`）、港股（`.HK`） |
| 东方财富（push2 / push2his） | 行情抓取 | 出站 | A 股场内（`CN-SH` / `CN-SZ`），含个股 |
| 天天基金（fund.eastmoney.com） | 行情抓取 | 出站 | 场外基金（`CN-FUND`） |
| er-api（open.er-api.com） | 汇率采集 | 出站 | USD / CAD / HKD 对 CNY |
| MongoDB | 持久化 | 本地 | 唯一数据依赖 |

> 估值分位（AS-11）**无自动抓取**，以手动录入为主。

---

## 3. 功能域地图

### 3.1 全景功能清单

| # | 功能域 | 承载模块 | 核心能力概览 |
|---|---|---|---|
| 1 | 资产管理 | client + shared | 资产主数据 CRUD、搜索/排序/分页、大类分类、关注/启用 |
| 2 | 行情价格 | shared + cron-worker | 多源抓取、每日幂等同步、今日/历史查询、完整性检查与自动补全 |
| 3 | 交易记录 | client + shared | 交易 CRUD、超卖校验、分红、A 股整手提示、CSV 批量导入 |
| 4 | 持仓与成本引擎 | shared | 移动平均成本重放、持仓概览、持仓历史快照 |
| 5 | 组合管理 | client + shared | 组合 CRUD、账户类型、目标配置（资产级/大类级）、归档、级联删除、汇总卡片 |
| 6 | 再平衡 | client + shared | 阈值检测、建议生成（费用模型）、执行/撤销/重做；AUTO **触发**在 cron-worker |
| 7 | 提醒中心 | client + shared | 8 类规则、评估引擎、事件通知、未读徽标、规则管理；评估**触发**在 cron-worker |
| 8 | 家庭视图与汇率 | client + shared | RMB 折算家庭总资产、币种分桶、组合贡献；汇率采集**触发**在 cron-worker |
| 9 | 估值分位 | shared | 指数 PE/PB 历史分位录入与查询（供 AL-10 消费） |
| 10 | 任务调度与数据质量 | cron-worker | cron 调度（唯一所有者）、TaskRun 防重、逐资产故障隔离、交易日历 |
| 11 | 系统运维 | client + server | 统一响应/错误、traceId、日志查看、日志脱敏 |
| 12 | 设计系统 | client | Design token、布局框架、通用状态组件、涨跌色语义 |

> `shared` 在「承载模块」中表示该能力由两个进程共用的内核实现；后端 API 入口一律在 `server/`，定时入口一律在 `cron-worker/`。

### 3.2 功能域依赖关系

```text
资产管理 (1) ──┐
               ├──> 交易记录 (3) ──> 持仓/成本引擎 (4) ──┐
行情价格 (2) ──┘                                          ├──> 再平衡 (6)
                                                          │
组合管理 (5) ──(目标配置)─────────────────────────────────┘
                     │
                     ├──> 提醒中心 (7) ←── 估值分位 (9)
                     │
                     └──> 家庭视图 (8) ←── 汇率

任务调度 (10) ──驱动──> 行情价格 (2) / 提醒中心 (7) / 汇率 / 再平衡 (6)
系统运维 (11) ──横切──> 全部
```

---

## 4. 功能域详细清单

### 4.1 资产管理与维护（AS-01 ~ AS-03, AS-09）

**承载**：`client/src/pages/Asset/*`、`shared/services/asset.service.js`、`server/controllers/asset.controller.js`、`shared/models/asset.js`

| 功能 | 说明 | 前端入口 |
|---|---|---|
| AS-01 资产 CRUD | 创建/查询/更新/删除；`symbol` 全系统唯一、大写、正则 `^[A-Z0-9][A-Z0-9._-]*$`；`name` 必填 ≤120 | `/assets`、`/assets/new`、`/assets/edit/:id` |
| AS-02 资产属性 | `market` / `currency` / `type` / `tags` / `launchDate` / `active` / `watchlist` | `AssetForm` |
| AS-03 资产列表 | 按代码/名称/标签搜索；8 字段排序；`10/20/50` 分页；大类筛选（含「未分类」） | `AssetList` |
| AS-09 大类字段 | `assetClass ∈ {equity, bond, gold, cash, null}`，与 `type` **正交**（黄金 ETF：`type=etf` + `assetClass=gold`）；`null` = 未分类 | `AssetForm` 下拉 + 列表筛选/排序 |

**关键规则**

- `active` 控制资产能否用于**交易选择与行情同步**；`watchlist` **仅**表示关注偏好，二者独立、互不替代。
- 删除资产**不做级联校验**（交易引用不阻断删除）。
- 搜索走**转义后的正则**匹配 `symbol/name/tags`；排序白名单 + `_id` 次序保证稳定。
- 资产列表中的代码列可直达该资产的**价格历史页**。

**API**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/assets` | 列表：`page,pageSize,search,sortBy,sortOrder,active,watchlist,assetClass` |
| POST | `/api/assets` | 创建（`symbol` 重复 409） |
| GET / PUT / DELETE | `/api/assets/:id` | 详情 / 更新（冲突 409）/ 删除 |

**枚举**（`shared/constants/asset.constants.js`，server 与 cron-worker 共用；前端另有 `client/src/constants/enums.js` 一份）

- `ASSET_TYPES = ['stock','etf','fund','bond','cash']`
- `ASSET_CLASSES = ['equity','bond','gold','cash']`
- `ASSET_MARKETS = ['US','CA','CN-SH','CN-SZ','CN-FUND','HK']`
- `ASSET_CURRENCIES = ['USD','CAD','CNY','HKD']`
- `ASSET_SORT_FIELDS = ['symbol','name','market','currency','type','assetClass','active','watchlist','createdAt']`

---

### 4.2 行情价格（AS-04 ~ AS-08, AS-10）

**承载**：`client/src/pages/Prices/*`、`shared/services/price*.service.js`、`shared/fetchers/*`、`cron-worker/src/tasks/*`

#### 4.2.1 价格查询（读侧）

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

#### 4.2.2 行情同步（写侧）

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

---

### 4.3 交易记录（TR-01 ~ TR-03, TR-06 ~ TR-09）

**承载**：`client/src/pages/Transaction/*`、`shared/services/transaction.service.js`、`server/controllers/transaction.controller.js`、`shared/models/transaction.js`

| 功能 | 说明 | 前端入口 |
|---|---|---|
| TR-01 交易 CRUD | 全局交易列表 + 组合内流水视图，均分页；查询按 `date DESC, _id DESC` | `/transactions`、组合详情「交易记录」Tab |
| TR-02 交易字段 | `portfolioId` / `symbol` / `market` / `currency` / `assetType` / `action` / `quantity` / `price` / `fee` / `date` / `notes` | `AddTransaction`、`EditTransaction` |
| TR-03 超卖校验 | 重放时 `INSUFFICIENT_POSITION` 报错（消息含 symbol 与发生日期）；新增/修改/删除/导入**全部**校验 | 前端错误提示 |
| TR-06 fee 字段 | 买入 / 分红再投成本**含费**；卖出所得**扣费**、已实现盈亏口径同步 | 表单 fee 输入 |
| TR-07 分红类型 | `div_cash`（现金分红，不进持仓）/ `div_reinvest`（分红再投，等价买入转增） | 表单 action 选择 + 动态提示 |
| TR-08 A 股整手 | `CN-SH` / `CN-SZ` **买入**非 100 股整数倍 → **软警告不阻断**（前端 `confirm`，后端 `warnings:['CN_LOT_SIZE:symbol']`）；卖出与基金不受限 | 表单提交时提示 |
| TR-09 CSV 批量导入 | 上传 → 解析 → 自动列映射 → 人工校正 → 预览校验 → 提交 → 结果报告；≤500 行/批 | `/transactions/import` |

**action 枚举**：`buy | sell | div_cash | div_reinvest`（小写）。

**校验规则**

- `quantity > 0`、`price > 0`、`fee ≥ 0`、日期合法；禁止做空。
- 分页参数须匹配 `^[1-9]\d*$`，`pageSize ≤ 100`。
- 资产元数据（`assetType/market/currency`）由后端**按资产回填**，不由客户端指定；且要求资产 `active=true`。

#### TR-09 CSV 导入功能细节

**后端**（`POST /api/transactions/import`）：

1. 逐条字段校验 → 任一失败则**整批回滚**（`imported:0`，返回 `422` + `errors[]`）。
2. **幂等去重**：批次内去重 + 与库中按 `(portfolioId, symbol, action, quantity, price, 日, fee)` 比对 → `skipped`。
3. **超卖重放**：含批次内新增，按 symbol 分组重放，任意时点不足即整批回滚。
4. `insertMany` 批量写入（上限 **500** 行）。

**前端**（`ImportTransactions` + `utils/csvImport.js`）：

- `parseCsv`：手写解析器，支持引号包裹与 `""` 转义，兼容 `\n` / `\r\n`，跳过全空行。
- `mapColumns`：表头 → 字段自动映射，内置 **天天基金 / 雪球** 常见列名提示（代码、证券代码、份额、成交价格、单位净值、方向…），宽松匹配（忽略大小写/空格/括号）。
- `normalizeAction`：`买入/申购/买` → `buy`，`卖出/赎回/卖` → `sell`，`现金分红/分红/股息` → `div_cash`，`分红再投/红利再投/再投` → `div_reinvest`。
- `normalizeDate`：`YYYY-MM-DD` / `YYYY/MM/DD` / `YYYYMMDD` → `YYYY-MM-DD`。
- 预览前 50 行并逐行校验（错误行标红），有无效行则阻止提交。

**API**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/transactions/import` | 批量导入（整批回滚 + 幂等 + 超卖校验） |
| GET | `/api/transactions` | 全局列表：`page,pageSize,portfolioId,symbol` |
| POST | `/api/transactions` | 新建（返回 `warnings`） |
| GET / PUT / DELETE | `/api/transactions/:id` | 详情 / 更新 / 删除（均重放校验账本） |
| GET | `/api/portfolios/:pid/transactions` | 组合内流水 |

---

### 4.4 持仓与成本引擎（TR-04 ~ TR-05）

**承载**：`shared/services/transaction/positionCalculator.js`（**纯函数，不访问 DB、不做汇率换算**）、`shared/services/portfolio/positionTracker.js`（DB 适配）

#### 4.4.1 移动平均成本法（TR-04）

`calculatePositions(transactions, latestPrices)`：

- **排序**：按 `date` 升序，同日按 `_id` 字典序（`compareTransactions`）。
- **buy**：`quantity += qty`；`remainingCost += qty × price + fee`（成本含费）。
- **sell**：先算卖出前均价 `avgCost = remainingCost / quantity`；`quantity > 持仓 + 1e-10` 抛 `INSUFFICIENT_POSITION`；`realizedPnl += (price − avgCost) × qty − fee`（净得扣费）；清零时清空成本。
- **div_cash**：数量/成本/已实现盈亏**均不变**（不进持仓）。
- **div_reinvest**：等价 buy（数量与成本增加，含 fee）。
- **输出**：`avgCost / totalCost(=remainingCost) / latestPrice / marketValue / unrealizedPnl / pnlPct`，过滤 `quantity≈0`。
- **缺价处理**：`marketValue / unrealizedPnl / pnlPct` 为 `null`，**不按零价误算**。
- **多币种**：按 `currency` 隔离，**禁止跨币种相加**（全局原则）。

#### 4.4.2 持仓历史（TR-05）

`calculatePositionHistory(transactions, prices, interval)`：

- 按 `day / week / month` 分桶（`periodKey` 用 `MARKET_TIMEZONE`）。
- 逐期推进账本 + `latestPrices`，再对每期调用 `calculatePositions`，**保证概览与历史口径一致**。
- 多币种**按 currency 分行**；币种内缺价 → 该行 `marketValue` 为 `null`。
- `costBaseline` = 期末剩余成本，供图表叠加成本线。

#### 4.4.3 持仓 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/portfolios/:pid/stats/positions` | 持仓概览：分页 + 排序（`symbol`/`marketValue`/`pnlPct`/`quantity`/`avgCost`，`null` 排最后），`pageSize ≤ 100` |
| GET | `/api/portfolios/:pid/positions/history` | 持仓历史：`symbol` + `interval=day\|week\|month` |
| GET | `/api/portfolios/:id/stats` | 按 symbol 的统计数组（金额保留 2 位） |

**前端**（组合详情 Tab）：

- `PositionOverview`：内嵌 4 张 KPI 卡（**持仓总市值 / 今日盈亏（固定 `—`，因缺前收价）/ 累计盈亏比 / 持有资产数**）+ 9 列表格（资产 / 代码 / 类型 / 数量 / 平均成本 / 现价 / 市值 / 日收益 / 持有收益）。
- `PositionHistory`：多币种折线图（市值实线 + 剩余成本虚线）+ 明细表。

---

### 4.5 组合管理（CM-01 ~ CM-20）

**承载**：`client/src/pages/Portfolio/*`、`shared/services/portfolio/*`、`server/controllers/portfolio.controller.js`、`shared/models/portfolio.js`

| 功能 | 说明 |
|---|---|
| CM-01 组合 CRUD | 创建/查询/更新/删除；删除执行**应用层级联** |
| CM-02 基本属性 | `name`（必填）、`description` |
| CM-03 组合类型（风险定位） | `活钱 / 稳健 / 长期`，默认「稳健」 |
| CM-04 基础币种 | `CNY / CAD / USD`，默认 `CAD`；**仅记账币种，不参与折算** |
| CM-05 账户类型（账户载体） | `tiantian / xueqiu / tfsa / rrsp / resp / taxable / other`，默认 `other`；与 CM-03 **正交** |
| CM-06 目标配置 | 按 symbol 设置目标比例；不可重复；非空合计精确 **100%** |
| CM-07 目标校验反馈 | 合计 ≠100% 时保存被拒并提示 |
| CM-08 大类目标层 | `targets.level ∈ {asset, asset_class}` **二选一，混合禁止**；大类模式按类内市值占比摊分到 symbol |
| CM-09 再平衡参数 | 绝对偏离（默认 5%）、相对偏离（默认 10%）、时间间隔（默认 60 天），三项**可独立启停** |
| CM-10 检查频率 | `daily / weekly / monthly`，默认 `daily` |
| CM-11 列表卡片 | 名称、描述、类型、币种 |
| CM-12 卡片增强 | 市值（按币种分桶）、持仓资产数、漂移状态徽标、**未读提醒数** |
| CM-13 详情 Tab | 概览 / 持仓历史 / 再平衡 / 交易记录（实际生效 4 个 Tab） |
| CM-14 实时比例 | 目标 vs 实际比例，支持 `?level=asset_class`（币种内大类占比） |
| CM-15 汇总统计 | `GET /:id/stats` |
| CM-16 持仓概览 | 份额、平均成本、剩余成本、最新价、市值、未实现盈亏、盈亏比；搜索 + 排序分页 |
| CM-17 持仓历史 | 市值与剩余成本趋势（日/周/月），币种分组 |
| CM-18 组合内交易视图 | 分页；增删改统一走交易模块 |
| CM-19 级联删除 | 先删交易与再平衡记录，再删组合；子资源清理失败则**保留组合**避免孤儿 |
| CM-20 组合归档 | `archived=true`：不参与家庭市值、默认列表与再平衡调度，**数据保留** |

#### 4.5.1 目标配置校验（CM-06/07/08）

`validateTargets`（`shared/services/portfolio/validateTargets.js`，前后端同构 `client/src/utils/portfolioValidation.js`）：

- `symbol` 必填且唯一；`targetRatio ∈ [0, 100]`；`level ∈ {asset, asset_class}`。
- `asset_class` 级 symbol 必须是大类代码（`equity/bond/gold/cash`）。
- **禁止混合**：存在任一大类目标则全部必须为大类。
- **合计必须 100%**（容差 `1e-6`），否则 `INVALID_PORTFOLIO_TARGETS`。
- `normalizeTargets`：`asset` → symbol 大写；`asset_class` → symbol 小写。

#### 4.5.2 大类聚合（CM-08）

`shared/services/portfolio/assetClassAggregator.js`：

- `UNCLASSIFIED`：未分类持仓归入该桶，使偏离**可见**而非静默丢失。
- `aggregateByAssetClass`：按大类聚合市值（缺价持仓不参与）。
- `buildClassPositions`：把持仓聚合为「大类伪持仓」`{symbol, marketValue, currency:'AGG'}`，供 `evaluateThresholds` **复用 symbol 级口径**。
- `deriveSymbolTargets`：**大类目标 → symbol 目标摊分** = 大类目标 × symbol 市值在该大类内占比；未分类持仓目标为 0。

#### 4.5.3 组合汇总卡片（CM-12 / CM-20）

`shared/services/portfolio/summary.js`：

- 按币种分桶市值（**币种内缺价 → 该桶为 `null`**）。
- `drift` 复用 `evaluateThresholds` 口径（**仅取绝对/相对偏离，不含时间间隔**）；无目标/无持仓/缺价时为 `null`。
- 聚合每组合未读 `AlertEvent` 计数 → `stats.unreadAlertCount`。
- 默认**排除归档**，`?includeArchived=true` 包含。

#### 4.5.4 组合 API 与前端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/portfolios` | 创建（含 `targets` 规范化校验） |
| GET | `/api/portfolios` | 分页列表（`createdAt` 倒序） |
| GET | `/api/portfolios/summary` | 汇总卡片（`includeArchived`） |
| GET / PUT / DELETE | `/api/portfolios/:id` | 详情 / 更新 / 级联删除 |
| GET | `/api/portfolios/:id/stats/actual-ratios` | 实时比例（`level`） |
| GET | `/api/portfolios/:id/stats` | 汇总统计 |
| GET / PUT | `/api/portfolios/:pid/rebalance-settings` | 阈值读写 |

**前端页面**

- `List`：卡片网格 + 「显示已归档」开关 + 归档数量提示。
- `PortfolioForm`：基本信息（名称/类型/账户类型/币种/描述/归档）+ 目标配置（资产级/大类级切换、合计实时提示、提交前校验）。
- `Detail`：`PortfolioHeader`（返回/编辑/添加交易 + 类型/币种/最近再平衡 Chip）+ 4 Tab。
- `PortfolioCard`：市值分桶行、类型/账户/币种、`DriftBadge`（「偏离阈值」琥珀 / 「配置正常」绿）、未读提醒数。

> **未接入页面（遗留）**：`pages/Portfolio/Basic.jsx`（组合基本+删除）与 `pages/Portfolio/TargetAllocation.jsx`（目标回显）**未挂载任何路由或 Tab**，属历史实现。`KpiCards.jsx` 已被 `PositionOverview` 引用（有效）。

---

### 4.6 再平衡（RB-01 ~ RB-11）

**承载**：`shared/services/rebalance/*`、`client/src/pages/Portfolio/Rebalance*.jsx`

#### 4.6.1 阈值检测（RB-01）

`thresholdChecker.evaluateThresholds()`（**纯函数**）：逐 symbol 计算 `currentRatio / absoluteDeviation / relativeDeviation`；绝对偏离 > 阈值 **或** 相对偏离 > 阈值触发；时间间隔在 `lastExecutedAt` 为空（`NEVER_EXECUTED`）或 `elapsedDays ≥ timeInterval`（`TIME_INTERVAL_EXCEEDED`）触发；`totalValue ≤ 0` 记 `TOTAL_VALUE_ZERO`。返回 `{needsRebalance, triggeredThresholds, totalValue, details, reasons}`。大类模式用**大类伪持仓**评估。

#### 4.6.2 建议生成（RB-02 ~ RB-04, RB-11）

`suggestionGenerator.buildSuggestions()`（纯函数）：

1. **校验全部持仓有最新价**，否则 `MISSING_MARKET_PRICE`（RB-04）。
2. `investableValue = 当前总市值 + cashBudget`；≤0 返回空 + `TOTAL_VALUE_ZERO`。
3. **先卖后买**：先处理 `currentValue > desiredValue` 的卖出（数量 `min(现有持仓, 超配额/价)`），卖出净所得（扣费）计入资金池。
4. 买入按 `(目标缺口 / 总缺口) × 可用资金` 分配，扣除固定费与比例费反算可承受毛利；资金不足告警 `BUYS_LIMITED_BY_AVAILABLE_CASH`。
5. 每条建议计算 `postRebalanceRatio`；排序：先卖后买，同类按 symbol。
6. 返回 `{suggestions, warnings, funding{cashBudget, saleProceeds, availableForBuys, buySpend, remainingCash}}`。

**大类模式**（RB-11）：缺口告警 `CLASS_NO_POSITIONS:<class>`（新大类无持仓）/ `UNCLASSIFIED_POSITIONS`（未分类持仓）；建议标注 `assetClass`；`RebalanceRecord` 记 `classMode`。

#### 4.6.3 费用模型（RB-10）

`costEstimator.normalizeFeeModel()`：`{fixedFee, ratioFee, taxRate}` 非负，`ratioFee/taxRate ≤ 1`。
`estimateTradeCost()`：`estimatedFee = fixedFee + grossValue × ratioFee`；`estimatedTax = (action==='sell') ? grossValue × taxRate : 0`（**买入不计税**）。

#### 4.6.4 执行 / 撤销 / 重做（RB-05 ~ RB-07）

| 操作 | 前置条件 | 行为 |
|---|---|---|
| **执行** | 仅 `MANUAL`；record 为 `PENDING` | 严格比对提交建议与记录（symbol/action 精确，quantity/price 容差 `1e-8`，不一致 `SUGGESTIONS_CHANGED`）；按**先卖后买**生成 Transaction（`fee = estimatedCost`）；状态 → `EXECUTED` + `executedTransactionIds` |
| **撤销** | 仅 `EXECUTED` | **倒序**生成反向交易（buy↔sell，数量/价格/费用一致）；状态 → `REVOKED` + `reversalTransactionIds` |
| **重做** | 仅 `REVOKED` | 基于原建议创建**新 `PENDING`** 记录，`sourceRecordId` 指向原记录；仍需再次确认 |

> **硬约束**：`executeRebalance` 强制 `mode=MANUAL`，AUTO 传入即 `AUTO_EXECUTION_DISABLED`。**自动调度只能生成建议，绝不自动交易。**

#### 4.6.5 AUTO 调度（RB-08）

**载体**：`cron-worker/src/schedulers/rebalanceScheduler.js`（TASK-005 前是 API 进程内的 `scheduleManager.js`，现已在 `shared/services/rebalance/` 移除）。

**设计变更——「单日分发」**：AUTO 再平衡过去依赖「每个组合注册一个独立的 node-cron 实例」。调度迁到独立进程后，API 进程新增组合时无法跨进程动态注册 cron，因此改为**单一调度器每日分发**：

- 固定注册**一个** cron：默认 `0 0 * * *`（`REBALANCE_CHECK_CRON`，即每日 00:00）。
- 每次触发遍历全部**未归档**组合，按 `rebalanceSettings.rebalanceSchedule` 判断「今天是否到期」：

| `rebalanceSchedule` | 到期规则 |
|---|---|
| `daily` | 每天都到期 |
| `weekly` | 仅**周一**到期（对应原 `0 0 * * 1`） |
| `monthly` | 仅**每月 1 日**到期（对应原 `0 0 1 * *`） |

- 未到期的组合直接 `continue`，不产生 `TaskRun`；到期的组合逐个执行，**逐组合故障隔离**（单个组合抛错不影响后续组合）。

**语义保持**：`runKey` 仍按 `{schedule}:{periodKey}` 构造、`taskName` 仍为 `rebalance-suggestions:<portfolioId>`，因此 TaskRun 的**防重语义与迁移前完全一致**（同一周期不会重复生成建议）。

运行时**三层防护**：查库确认组合存在且未归档（否则 `REBALANCE_SCHEDULE_SKIPPED_ARCHIVED`）→ `runTrackedTask` 防重 → `checkThresholds` 无需再平衡则跳过；否则 `getSuggestions(mode=AUTO)` → `alertCenter.notify` 写 `AlertEvent`（level=action）。

#### 4.6.6 再平衡 API 与前端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/portfolios/:pid/rebalance/check` | 阈值检测 |
| POST | `/api/portfolios/:pid/rebalance/suggestions` | 生成建议（`feeModel` / `cashBudget`） |
| POST | `/api/portfolios/:pid/rebalance/execute` | 执行（`recordId` + `suggestions` + `mode=MANUAL`） |
| GET | `/api/portfolios/:pid/rebalance/history` | 历史记录（分页） |
| POST | `/api/rebalance/:recordId/revoke` | 撤销 |
| POST | `/api/rebalance/:recordId/reexecute` | 重做 |

**前端**（组合详情「再平衡」Tab 内 3 个子 Tab）：

- `RebalanceSuggester`：检查再平衡 / 生成建议 / 执行建议（确认「先卖后买」）；参数区（可投入现金、固定费、比例费、卖出税率）；阈值明细表；建议表；**双环饼图**（当前 vs 建议后比例）。
- `PortfolioRebalanceSettings`：三类阈值「启用勾选 + 数值」。
- `RebalanceHistory`：记录表 + 撤销（仅 EXECUTED）/ 重新生成待确认（仅 REVOKED，成功后跳建议子 Tab）。

---

### 4.7 提醒中心（AL-01 ~ AL-10）

**承载**：`shared/services/alertEngine.service.js`、`shared/services/alertCenter.service.js`、`cron-worker/src/schedulers/alertScheduler.js`、`client/src/pages/Alerts/AlertRules.jsx`、`client/src/pages/Dashboard.jsx`

#### 4.7.1 规则体系（AL-01 ~ AL-03, AL-09, AL-10）

**AlertRule** 字段：`scope`（`asset`/`portfolio`）、`portfolioId`、`symbol`、`name`、`ruleType`、`params`、`direction`（仅 signal：`buy/sell/hold`）、`reason`、`validUntil`、`cooldownDays`（默认 7，0–365）、`active`。

| ruleType | 中文 | 参数 | 触发条件 | 级别 |
|---|---|---|---|---|
| `price_above` | 价格高于 | `threshold` | 最新价 > 阈值 | info |
| `price_below` | 价格低于 | `threshold` | 最新价 < 阈值 | info |
| `gain_loss_pct` | 盈亏比例 | `pct` | `pct≥0` 浮盈 > pct（info）；`pct<0` 浮亏 < pct（warning） | info/warning |
| `drift_exceed` | 组合偏离 | `drift` | 组合触发阈值 | warning |
| `signal` | 人工信号 | `direction` + `validUntil` + `reason` | 有效期内常显，过期自动归档 | **action** |
| `high_52w` | 52 周新高 | `lookbackDays`（默认 365，1–3650） | 最新价 > 历史窗口（不含今日）最高（严格突破） | info |
| `low_52w` | 52 周新低 | `lookbackDays` | 最新价 < 历史窗口最低（严格突破） | info |
| `valuation_percentile` | 估值分位 | `indexCode` + `metric(pe\|pb)` + `threshold(0–100)` + `direction(above\|below)` | 分位 >/< 阈值（严格） | above=warning / below=info |

> **边界约定**：**恰好等于阈值不触发**，严格大于/小于才触发。

#### 4.7.2 评估引擎（AL-05）

`alertEngine.evaluateAll()`：每日跑批（默认 **04:00**，`ALERT_EVAL_CRON`）：

1. 取全部 `active` 规则；`signal` **单独处理**（过期置 `active=false` 归档；有效期内未 dismissed 则常显）。
2. 资产规则批量聚合最新价 / 持仓 / 漂移 / 52 周区间 / 估值分位。
3. **逐规则评估（故障隔离，单规则异常不中断批次）** → 去重 → 创建 `AlertEvent`。
4. 返回 `{evaluated, created, archived, failed}`。

#### 4.7.3 去重静默（AL-06）

`shouldSuppress`：同规则 `cooldownDays` 内不重复（`0` = 仅同日幂等）；**同日市场日相同也抑制**。

#### 4.7.4 事件与通知中心（AL-04, AL-07）

**AlertEvent**（**不可删除**，审计留存）：`ruleId`（再平衡通知为 null）、`portfolioId`、`symbol`、`level`（`info/warning/action`）、`title`、`content`、`snapshot`（触发时条件快照）、`triggeredAt`、`status`（`unread/read/dismissed`）。

**前端**：

- `Dashboard`（`/`，即通知中心）：状态筛选（未读/全部）+ 组合筛选；事件卡（`level` 色条、未读点、级别标签）；点击跳转（有 symbol → 价格历史；否则有 portfolioId → 再平衡 Tab）；**标记已读 / 忽略**；「立即评估」+「规则管理」入口。
- 顶栏**铃铛**：未读数（`useUnreadAlertCount` **5 秒轮询**），`>0` 显红点，`>99` 显「99+」。

#### 4.7.5 规则管理（AL-08）

`AlertRules`（`/alerts/rules`）：规则表（名称/类型/参数/作用域/状态）；新建/编辑表单（参数随类型动态渲染）；表单校验（资产级需 symbol、组合级需 portfolioId、signal 需 direction、估值分位需 indexCode 且阈值 0–100）；行操作：触发历史展开、编辑、删除（事件保留）；状态列点击切换 `active`。

#### 4.7.6 提醒 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/alerts/events/unread-count` | 未读数 `{count}` |
| GET | `/api/alerts/events` | 事件列表：`status,level,portfolioId,ruleId` |
| PATCH | `/api/alerts/events/:id/read` | 标记 `read`/`dismissed` |
| POST | `/api/alerts/evaluate` | 手动触发全量评估 |
| GET / POST | `/api/alerts/rules` | 规则列表 / 创建 |
| GET / PUT / DELETE | `/api/alerts/rules/:id` | 详情 / 更新 / 删除（**不级联删事件**） |

---

### 4.8 家庭视图与汇率（FAM-01 ~ FAM-04）

**承载**：`shared/services/familySummary.service.js`、`shared/services/fxRate.service.js`、`cron-worker/src/schedulers/fxScheduler.js`、`client/src/pages/Family.jsx`

| 功能 | 说明 |
|---|---|
| FAM-01 家庭 Dashboard | 以 RMB 折算的家庭总资产 + CNY/USD/CAD/HKD 各自金额分桶 |
| FAM-02 组合贡献分解 | 各组合市值、占家庭比例（RMB 基准） |
| FAM-03 待处理提醒入口 | 即通知中心（AL-07）落地形态 |
| FAM-04 最近动态 | 最近交易 + 最近再平衡记录 |

#### 4.8.1 RMB 折算规则

`buildFamilySummary`：CNY 恒为 1，外币取最新汇率。**关键保守原则**：**任一币种桶缺价或缺汇率 → 该组合 `cnyValue` 为 `null` 且不计入家庭总额**（宁可少报不可错报），前端显示「部分组合折算不完整（缺价或缺汇率）」。

#### 4.8.2 汇率服务

- 支持币种 `['USD','CAD','HKD']`，语义为「1 外币 = `rateToCny` 人民币」。
- `fetchFromProvider`：`https://open.er-api.com/v6/latest/CNY`（免费免 key），超时 15s，来源标记 `source='er-api'`。
- `upsertRate`：按 `(currency, date)` 幂等 upsert；手动录入标记 `source='manual'`。
- 采集调度：默认 **09:30**（`FX_SYNC_CRON`，央行中间价公布后）；**采集失败仅记日志**，不阻塞其他调度，家庭视图可手动兜底。

#### 4.8.3 前端（`/family`）

「同步汇率」按钮；**家庭总资产卡**（渐变蓝，含 `asOf` 与折算不完整提示）；**币种分桶卡**（固定顺序 USD/CAD/CNY/HKD，非 CNY 显示 `1 {currency} ≈ ¥{rate}`）；**组合贡献列表**（占比进度条，点击跳组合）；**最近动态**（交易：买红卖绿；再平衡：AUTO/手动 + EXECUTED/REVOKED 状态）；**汇率管理**（列表 + 手动录入表单）。

#### 4.8.4 家庭 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/family/summary` | 家庭汇总（`totalCny` + `buckets` + `fxRates` + `portfolioContributions` + 最近动态） |
| GET | `/api/family/fx/rates` | 最新汇率（含日期/来源） |
| PUT | `/api/family/fx/rates/:currency` | 手动录入（`USD/CAD/HKD`） |
| POST | `/api/family/fx/sync` | 触发采集（失败 `502`，提示可手动录入） |

---

### 4.9 估值分位（AS-11）

**承载**：`shared/services/valuation.service.js`、`shared/models/valuation.js`

- **Valuation** 字段：`indexCode`（如 `000300` 沪深300）、`indexName`、`metric`（`pe`/`pb`）、`value`（≥0）、`percentile`（0–100）、`date`、`source`（`manual`/`external`）、`note`。
- 按 `(indexCode, metric, date)` 幂等 upsert；列表每 `indexCode + metric` 取最新一条。
- **无自动抓取**，以手动录入为主（衔接 `index-valuation-selfcalc` 自算结果）；作为 **AL-10 估值分位规则的评估输入**。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/valuations` | 各指数最新分位列表 |
| PUT | `/api/valuations/:indexCode/:metric` | 手动录入（`metric ∈ {pe, pb}`） |

---

### 4.10 任务调度与数据质量

#### 4.10.1 调度清单

**唯一调度所有者：`cron-worker`**。全部 5 类定时任务均由 worker 注册，`server` 不注册任何 cron。

| 任务 | 调度器文件 | cron（默认） | 内容 | 开关 |
|---|---|---|---|---|
| 价格同步 | `schedulers/priceScheduler.js` | `0 3 * * *` | 逐资产开市校验 + 抓取 + 幂等入库 | `PRICE_SYNC_CRON` |
| 完整性检查 | `schedulers/healthScheduler.js` | `30 3 * * *` | 应有交易日 vs 实际，缺口自动补全 | `HEALTH_CHECK_CRON` |
| 提醒评估 | `schedulers/alertScheduler.js` | `0 4 * * *` | `evaluateAll()` 全量规则评估 | `ALERT_EVAL_CRON` |
| 汇率采集 | `schedulers/fxScheduler.js` | `30 9 * * *` | 三币种对 CNY 采集入库 | `FX_SYNC_CRON` |
| 自动再平衡 | `schedulers/rebalanceScheduler.js` | `0 0 * * *` | **单日分发**：逐组合判到期 → 阈值检查 → 生成建议 → 写 AlertEvent | `REBALANCE_CHECK_CRON` |

> 上述路径均相对 `cron-worker/src/`。五个调度器统一由 `createCronScheduler()` 工厂创建（`schedulers/cronScheduler.js`），共用 `SCHEDULER_TIMEZONE`。

全局总开关：`SCHEDULER_ENABLED=false` 时 worker 不注册任何调度器（`server` 不读取该变量）。调度时区 `SCHEDULER_TIMEZONE`（回落 `MARKET_TIMEZONE` → `America/Toronto`）。

> ✅ **覆盖完整性（TASK-005 已收口）**：单一所有者下**全部 5 类任务都会自动运行**。迁移前「`cron-worker` 缺提醒/汇率/再平衡、`server` 缺完整性检查」的覆盖缺口已消除——这正是本次架构收敛要解决的核心问题。决策依据见 [ADR-002](../architecture/adr/ADR-002-single-scheduler.md)，运维操作见 [CRON_WORKER.md](../manual/CRON_WORKER.md) §3。
>
> **启动自检**：worker 启动日志会打印 `SCHEDULERS_STARTED {"count":5,"owner":"cron-worker"}`。`count` 不足 5 说明有调度器注册失败或被环境变量关停。

#### 4.10.2 TaskRun 防重机制

**两层防重**：

1. **进程内锁**：`activeTasks` Map，以 `taskName` 为键；已在跑 → `SKIPPED/ALREADY_RUNNING`。
2. **数据库锁**：`TaskRun` 的 `{taskName, runKey}` **唯一索引**，重复插入 `11000` → `SKIPPED/DUPLICATE_RUN_KEY`（跨进程/跨重启有效）。

**状态流转**：`RUNNING` → `failureCount>0 ? PARTIAL : SUCCEEDED`；异常 → `FAILED`；`finally` 无条件释放内存锁。

**逐资产故障隔离**：单资产失败仅记录 `{item, category, provider, retryable, message}`，不中断整批。

#### 4.10.3 交易日历与市场时区

**交易日历**（`shared/services/calendar.service.js`，两进程共用；原仅 worker 持有，TASK-005 后并入 `shared`）：

- `isMarketOpenToday(market)`：周末直接 `false`；CN/HK 查静态节假日表，US/CA 按规则计算。
- **US**（NYSE）：元旦、MLK Day、Presidents' Day、Good Friday、Memorial Day、Juneteenth、Independence Day、Labor Day、Thanksgiving、Christmas（周末顺延）。
- **CA**（TSX）：元旦、Good Friday、Victoria Day、Canada Day、Labour Day、Truth and Reconciliation、Thanksgiving、Christmas、Boxing Day。
- `easterSunday`：Anonymous Gregorian 算法。
- **静态表告警**：CN/HK 年份未维护时按空表处理并打 warn（每 `(label, year)` 一次），避免「无节假日」被静默当全开市。
- 已维护：CN `2024/2025/2026`；HK `2024/2025/2026`；**2027+ 未维护**。

**市场时区**（`shared/config/markets.js`）：US `America/New_York`、CA `America/Toronto`、CN 系 `Asia/Shanghai`、HK `Asia/Hong_Kong`。

**日期归桶**（`shared/utils/marketTime.js`，两进程共用同一实现）：

- `MARKET_TIMEZONE`（默认 `America/Toronto`），启动时非法即抛错。
- `canonicalDayTimestamp`：把任意时间戳规范到该市场日 `startOf('day')` 的 UTC。
- `dateBounds` / `monthBounds`：市场日的 UTC `[start, end)` 边界。
- `todayString`：市场当日字符串（用于调度 `runKey`）。

#### 4.10.4 行情抓取适配与容错

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

#### 4.10.5 完整性检查（AS-07，worker 独有）

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

---

### 4.11 系统运维与横切关注点

**承载**：`server/middleware/*`、`server/utils/apiResponse.js`、`shared/config/logger.js`、`shared/utils/logSanitizer.js`、`client/src/pages/LogViewer.jsx`

| 能力 | 说明 |
|---|---|
| 统一响应格式 | 成功 `{success:true, data, pagination?}`；失败 `{success:false, message, traceId, details?}` |
| traceId | 每请求生成 UUID v4 → `req.traceId` + 响应头 `X-Trace-Id` |
| 请求日志 | `onFinished` 后记 `HTTP_ACCESS`：`{traceId, method, url(脱敏), status, durationMs}` |
| 全局错误处理 | `UNHANDLED_ERROR`；状态码推断（`ValidationError/CastError` → 400，`11000` → 409，否则 500） |
| 日志脱敏 | 敏感键（`authorization/cookie/password/secret/token/api-key/mongo_uri/database_url`）→ `[REDACTED]`；URL 查询串敏感参数同样处理；支持循环引用 |
| 日志配置 | `app-%DATE%.log`（含 exception/rejection handler）+ `task-%DATE%.log`；`LOG_MAX_FILES` 控制保留（默认 60d） |
| 日志查看页 | `/logs`：Server Log / Task Log 切换，日期 + 级别筛选，分页（手写 `useState/useEffect`，未走 Query） |
| CORS | `cors({origin: true})`——**当前实际允许任意来源**（白名单校验已注释） |
| 认证授权 | **当前无登录、无多用户、无资源级授权**，仅适合可信本地网络 |

---

## 5. API 端点总表

> 前缀 `/api`；`page/pageSize` 统一（`pageSize ≤ 100`，价格列表 ≤ 200）；创建返回 `201`，其余 `200`；错误码：`400` 参数/请求体无效、`404` 不存在、`409` 唯一键冲突、`422` 导入整批回滚、`500` 未处理错误、`502` 汇率采集失败。

| 模块 | 端点 |
|---|---|
| 资产 | `GET/POST /assets`、`GET/PUT/DELETE /assets/:id` |
| 价格 | `GET /prices/today`、`GET /prices/date/:date`、`GET /prices/symbol/:symbol/history`、`POST /prices`、`GET/PUT/DELETE /prices/:id` |
| 交易 | `GET/POST /transactions`、`POST /transactions/import`、`GET/PUT/DELETE /transactions/:id` |
| 组合 | `GET/POST /portfolios`、`GET /portfolios/summary`、`GET/PUT/DELETE /portfolios/:id` |
| 组合统计 | `GET /portfolios/:id/stats`、`GET /portfolios/:id/stats/actual-ratios`、`GET /portfolios/:pid/stats/positions`、`GET /portfolios/:pid/positions/history`、`GET /portfolios/:pid/transactions` |
| 再平衡 | `GET/PUT /portfolios/:pid/rebalance-settings`、`POST .../rebalance/check`、`POST .../rebalance/suggestions`、`POST .../rebalance/execute`、`GET .../rebalance/history`、`POST /rebalance/:recordId/revoke`、`POST /rebalance/:recordId/reexecute` |
| 提醒 | `GET /alerts/rules`、`POST /alerts/rules`、`GET/PUT/DELETE /alerts/rules/:id`、`GET /alerts/events`、`GET /alerts/events/unread-count`、`PATCH /alerts/events/:id/read`、`POST /alerts/evaluate` |
| 家庭 | `GET /family/summary`、`GET /family/fx/rates`、`PUT /family/fx/rates/:currency`、`POST /family/fx/sync` |
| 估值 | `GET /valuations`、`PUT /valuations/:indexCode/:metric` |
| 日志 | `GET /logs`、`GET /logs/tasks` |

详细请求/响应见 [API_CONTRACT.md](../dev/API_CONTRACT.md)。

---

## 6. 数据模型清单

**承载**：`shared/models/*.js`（**唯一实现**，server 与 cron-worker 均引用同一份，字段与索引只有一处定义）

| 模型 | 关键字段 | 唯一索引 / 主索引 |
|---|---|---|
| **Asset** | `symbol`(uniq, 大写, 正则)、`name`、`market`、`currency`、`type`、`assetClass`(可 null)、`tags[]`、`launchDate`、`active`、`watchlist` | `{symbol:1}` unique |
| **Portfolio** | `name`、`description`、`type`(活钱/稳健/长期)、`currency`、`accountType`、`archived`、`targets[{symbol,targetRatio,level}]`、`rebalanceSettings{absoluteDeviation,relativeDeviation,timeInterval,rebalanceSchedule}` | — |
| **Transaction** | `portfolioId`、`assetType`、`symbol`、`market`、`currency`、`action`、`quantity`、`price`、`fee`、`date`、`notes` | `{portfolioId,date:-1,_id:-1}`、`{portfolioId,symbol,date,_id}` |
| **Price** | `symbol`、`name`、`price`、`currency`、`market`、`timestamp`(UTC 市场日边界) | `{symbol,timestamp}` **unique**；`{timestamp:-1,symbol:1}` |
| **FxRate** | `currency`(USD/CAD/HKD)、`rateToCny`、`date`、`source`(er-api/manual)、`note` | `{currency,date:-1}` **unique** |
| **Valuation** | `indexCode`、`indexName`、`metric`(pe/pb)、`value`、`percentile`、`date`、`source`、`note` | `{indexCode,metric,date:-1}` **unique** |
| **RebalanceRecord** | `portfolioId`、`mode`(AUTO/MANUAL)、`suggestions[]`、`status`(PENDING/EXECUTED/REVOKED)、`triggeredThresholds[]`、`thresholdDetails[]`、`warnings[]`、`feeModel`、`cashBudget`、`funding`、`classMode`、`executedTransactionIds[]`、`reversalTransactionIds[]`、`sourceRecordId`、`executedAt`、`revokedAt` | — |
| **AlertRule** | `scope`、`portfolioId`、`symbol`、`name`、`ruleType`、`params`、`direction`、`reason`、`validUntil`、`cooldownDays`、`active` | `{active,ruleType}`、`{portfolioId,active}`、`{symbol,active}` |
| **AlertEvent** | `ruleId`、`portfolioId`、`symbol`、`level`、`title`、`content`、`snapshot`、`triggeredAt`、`status` | `{status,triggeredAt:-1}`、`{ruleId,triggeredAt:-1}`、`{portfolioId,status}` |
| **TaskRun** | `taskName`、`runKey`、`trigger`、`status`、`startedAt`、`endedAt`、`durationMs`、`totalCount`、`successCount`、`failureCount`、`failures[]` | `{taskName,runKey}` **unique**；`{startedAt:-1,taskName}` |

---

## 7. 前端页面与组件清单

### 7.1 路由表（`client/src/router.jsx`）

全部页面嵌套于 `<AppLayout />`（共享 Sidebar + 顶栏）。

| 路径 | 页面 | 功能 |
|---|---|---|
| `/` | `Dashboard` | 提醒中心（事件流/筛选/立即评估/规则入口） |
| `/family` | `Family` | 家庭视图 |
| `/alerts/rules` | `AlertRules` | 提醒规则管理 |
| `/transactions` | `TransactionList` | 全局交易列表 |
| `/transactions/new` | `AddTransaction` | 新增交易 |
| `/transactions/import` | `ImportTransactions` | CSV 导入向导 |
| `/transactions/edit/:id` | `EditTransaction` | 编辑交易 |
| `/assets` | `AssetList` | 资产列表 |
| `/assets/new`、`/assets/edit/:id` | `AssetForm` | 资产表单 |
| `/prices` | `Prices/Today` | 今日/指定日价格 |
| `/prices/:symbol/history` | `Prices/History` | 价格历史 |
| `/portfolios` | `Portfolio/List` | 组合卡片列表 |
| `/portfolios/new`、`/portfolios/edit/:id` | `PortfolioForm` | 组合表单 |
| `/portfolios/view/:id[/:tab]` | `Portfolio/Detail` | 组合详情（4 Tab） |
| `/logs` | `LogViewer` | 日志查看 |
| `*` | — | 重定向 `/portfolios` |

**组合详情 Tab**（默认 `positions`）：`positions` 持仓概览 / `position-history` 持仓历史 / `rebalance` 再平衡（3 子 Tab）/ `transactions` 交易记录。

### 7.2 组件清单

| 组件 | 职责 |
|---|---|
| `layout/AppLayout` | 主框架：Sidebar(232px) + 顶栏(64px，含未读铃铛) + `<Outlet/>` |
| `layout/Sidebar` | 8 项导航（激活态紫底紫字）+ 底部版本 `v0.9.2 · 自托管` |
| `DataState` | `LoadingState` / `EmptyState` / `ErrorState` 三态占位（全站复用） |
| `ButtonGroup` | 按 `type`（default/primary/danger）渲染按钮组 |
| `PortfolioCard` | 组合卡片：市值分桶 / 持仓数 / DriftBadge / 未读提醒数 |
| `TransactionTable` | 通用交易表（列可配，日期自动截取） |
| `KpiCards` | 4 张 KPI 卡（总市值 / 今日盈亏 / 累计盈亏比 / 持有资产数） |

### 7.3 状态与数据层

**TanStack Query hooks**（`retry:1`，`staleTime: 60s`）

| Hook | queryKey | 失效/轮询 |
|---|---|---|
| `usePortfolio(id)` | `['portfolio', id]` | — |
| `usePortfolios({includeArchived})` | `['portfolios-summary', ...]` | — |
| `useTransactions(portfolioId)` | `['transactions', pid]` | stale 30s |
| `useFamilySummary()` / `useFxRates()` | `['family-summary']` / `['fx-rates']` | — |
| `useUpsertFxRate()` / `useSyncFxRates()` | mutation | 失效 `fx-rates` + `family-summary` |
| `useAlertRules(params)` / `useAlertEvents(params)` | `['alert-rules'...]` / `['alert-events'...]` | events stale 30s |
| `useUnreadAlertCount()` | `['alert-unread-count']` | **`refetchInterval: 5000`**（全局轮询） |
| `useCreateAlertRule` / `useUpdateAlertRule` / `useDeleteAlertRule` | mutation | 失效 `alert-rules` |
| `useMarkAlertEventRead()` / `useEvaluateAlerts()` | mutation | 失效 `alert-events` + `alert-unread-count` + `portfolios-summary` |

> 资产/价格/交易/持仓/再平衡/日志页多为**直接调用 service + 组件内 `useState/useEffect`**，未走 Query hooks。

**Service 层**（10 个）：`api.js`（axios 实例，`baseURL = VITE_API_URL || /api`，超时 15s，响应拦截器直返 `data`、错误挂 `apiMessage/traceId/status`）+ `asset / portfolio / position / price / transaction / rebalance / alert / family / log` 九个领域 service。

### 7.4 设计系统

- **Design token**（`client/src/constants/design-tokens.js`）：品牌紫 `#635BFF`、品牌浅紫 `#EEEDFF`、页面底 `#F6F8FA`、卡片 `#FFFFFF`、边框 `#E3E8EE`、文本 `#0A2540/#5E6B7E/#8A95A5`、**涨 `#DF1B41` / 跌 `#0E9F6E`**（A 股约定）、警告 `#F5A524`。
- **布局 token**：`sidebarWidth 232`、`topbarHeight 64`、`contentPaddingX 32`、`contentPaddingY 24`。
- **字体**：中文 Noto Sans SC 优先，数字 Inter（`fontStack.numeric`）。
- **双轨样式**：布局/详情页用内联 token style，业务页面多用 Tailwind 工具类；两套并存。

---

## 8. 关键业务规则速查

| 主题 | 口径 |
|---|---|
| 成本法 | 移动平均成本；买入成本含费；卖出净得扣费；现金分红不进持仓；分红再投等价买入 |
| 超卖校验 | 重放时 `quantity > 持仓量 + 1e-10` 抛 `INSUFFICIENT_POSITION`（新增/更新/删除/导入均校验） |
| A 股整手 | CN-SH/CN-SZ 买入非 100 整数倍 → **软警告不阻断**；卖出与基金不受限 |
| 目标校验 | 合计必须 100%（容差 `1e-6`）；禁止 asset 与 asset_class 混合 |
| 多币种 | 组合内**不跨币种汇总**；缺价 → 该币种桶 `null`；**家庭层才做 RMB 折算** |
| 缺价原则 | 估值字段为 `null`，不按零价误算；家庭折算「宁可少报不可错报」 |
| 再平衡执行 | 仅 MANUAL；仅 PENDING 可执行；建议需与记录严格一致；撤销生成反向交易 |
| AUTO 调度 | **只生成建议 + 提醒，绝不自动交易** |
| 提醒触发 | 严格大于/小于（等于不触发）；`cooldownDays` + 同日幂等抑制；单规则故障隔离 |
| 归档 | `archived=true` 不参与列表默认/家庭汇总/自动再平衡调度，数据保留 |
| 行情市场日 | 价格 `timestamp` 规范到市场日 0 点 UTC；查询边界按 `MARKET_TIMEZONE` |
| 任务防重 | 进程内 Map 锁 + `TaskRun` 唯一索引双层 |

---

## 9. 已实现但未接入 / 技术债

### 9.1 前端未接入（遗留）

| 文件 | 状态 |
|---|---|
| `pages/Portfolio/Basic.jsx` | 组合基本信息 + 删除，**未被任何路由/Tab 引用** |
| `pages/Portfolio/TargetAllocation.jsx` | 目标配置回显，**未被引用** |
| `components/layout/Header.jsx`、`components/common/Header.jsx` | 旧版顶栏，未接入 |
| `components/AddTransactionForm.jsx` | 遗留内联表单，未被引用 |
| `components/layout/MainLayout.jsx`、`components/common/ErrorAlert.jsx`、`components/common/Loading.jsx`、`utils/formatters.js`、`utils/helpers.js`、`utils/chartConfig.js` | **空文件（0 字节）** |

### 9.2 架构级技术债

> **已清偿（TASK-005 / [ADR-002](../architecture/adr/ADR-002-single-scheduler.md)）**：原先「双份调度实现」与「调度覆盖缺口」两项技术债已通过本次重构消除——
> - 业务内核收敛到 `shared/`，`server/tasks/*` 与 `cron-worker/src/tasks/*` 只剩 CLI 薄壳，**不再有双份业务实现**。
> - 5 类定时任务全部由 `cron-worker` 注册，`server` 移除调度路径，**不存在覆盖缺口**。

- **两份枚举复制**：`ASSET_*` 常量在 `shared/constants`（server + worker 共用）与 `client/src/constants/enums.js` 各存一份，改动需**双向同步**（原为三份，已收敛）。
- **无认证授权**：API 不可暴露公网（ADR-001 为认证模板，尚未实施）。
- **CORS 开放（已确认为现状，非缺陷隐瞒）**：`server/app.js` 用 `cors({ origin: true })` 允许任意来源，白名单实现被整段注释、`CORS_ORIGINS` **未被读取**。已按「承认开放 + 文档如实说明」处理（见 [DEPLOYMENT.md](../manual/DEPLOYMENT.md) §安全边界）；上线前需二选一收口：恢复白名单生效，或在网络层确保不对外暴露。
- **前端数据层不统一**：Query hooks 与手写 `useEffect` 两套并存；`formatters/helpers/chartConfig` 为空文件。
- **节假日表需逐年维护**：CN/HK `2027+` 未维护，未维护年份按空表处理（已加 warn）。
- **完整性检查截断无提示**：缺失区间超 `maxRepairRanges=50` 时静默截断。
- **`integrityCheck.js` 偏大**（约 386 行），待拆分。
- **再平衡单日分发的隐式契约**：`rebalanceScheduler` 的到期规则（周一 / 每月 1 日）是硬编码的 `SCHEDULE_DUE_RULES`，新增 `rebalanceSchedule` 取值时必须同步补充规则，否则该频率**静默永不触发**。

---

## 10. 需求编码索引（PRD ↔ 实现）

| 编码 | 功能 | 关键实现位置 |
|---|---|---|
| AS-01~03 | 资产 CRUD / 属性 / 列表 | `shared/services/asset.service.js`、`client/src/pages/Asset/*` |
| AS-04~05 | 今日 / 历史价格页 | `shared/services/price.service.js`、`client/src/pages/Prices/*` |
| AS-06 | 每日同步 | `shared/tasks/dailySync.js`（内核）、`cron-worker/src/schedulers/priceScheduler.js`（触发） |
| AS-07 | 完整性检查 | `cron-worker/src/tasks/integrityCheck.js`、`cron-worker/src/schedulers/healthScheduler.js` |
| AS-08 | 港股支持 | `shared/config/markets.js`、`shared/fetchers/*` 路由 |
| AS-09 | assetClass 大类 | `shared/models/asset.js`、`shared/constants/asset.constants.js` |
| AS-10 | A 股个股 | `shared/fetchers/eastmoneyFetcher.js` |
| AS-11 | 估值分位 | `shared/services/valuation.service.js`、`shared/models/valuation.js` |
| TR-01~03 | 交易 CRUD / 字段 / 超卖 | `shared/services/transaction.service.js` |
| TR-04~05 | 成本重放 / 持仓历史 | `shared/services/transaction/positionCalculator.js` |
| TR-06~08 | fee / 分红 / 整手 | 同上 + `client/src/pages/Transaction/*` |
| TR-09 | CSV 导入 | `shared/services/transaction.service.js#importTransactions`、`client/src/utils/csvImport.js` |
| CM-01~20 | 组合管理全量 | `shared/services/portfolio/*`、`client/src/pages/Portfolio/*` |
| RB-01~11 | 再平衡全量 | `shared/services/rebalance/*`、`client/src/pages/Portfolio/Rebalance*.jsx` |
| AL-01~10 | 提醒中心全量 | `shared/services/alert*.service.js`、`client/src/pages/Alerts/*`、`Dashboard.jsx` |
| FAM-01~04 | 家庭视图 | `shared/services/familySummary.service.js`、`client/src/pages/Family.jsx` |

---

## 11. 维护规则

更新本文的时机：

- 新增或移除**功能域 / 页面 / API 端点 / 数据模型**。
- 跨进程 / 跨模块职责发生变化（如调度所有权在 `server` 与 `cron-worker` 之间迁移、业务内核在 `shared` 与进程目录之间搬迁）。
- 业务规则（成本法、校验口径、折算原则）发生变更。
- 技术债清单中的条目被清理或新增。

实现细节（字段级、参数级）应就近维护在代码或 [API_CONTRACT.md](../dev/API_CONTRACT.md)；本文保持「功能全景 + 边界 + 追溯」的粒度。

---

## 12. 相关文档

- [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — 架构分层、模块边界、依赖规则
- [API_CONTRACT.md](../dev/API_CONTRACT.md) — REST API 契约
- [PRD.md](../product/specs/PRD.md) — 产品需求基线（功能编码来源）
- [CLIENT.md](../manual/CLIENT.md) — 使用指南
- [DEPLOYMENT.md](../manual/DEPLOYMENT.md) / [DEPLOYMENT.md](../manual/DEPLOYMENT.md) / [CRON_WORKER.md](../manual/CRON_WORKER.md) — 开发 / 部署 / 生产操作
- [ROADMAP.md](../product/ROADMAP.md) — 路线图
- [standards/DOCS.md](../standards/DOCS.md) — 文档结构规范与单一归属规则
- [adr/ADR-001-authentication.md](../architecture/adr/ADR-001-authentication.md) / [adr/ADR-002-single-scheduler.md](../architecture/adr/ADR-002-single-scheduler.md) — 架构决策记录（认证模板 / 单一调度器与 shared 内核）
