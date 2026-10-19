# PL-1 投资账本线（Ledger）

> 版本：v1.0 · 日期：2026-10-15
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-1** 的明细子文件
> 内容范围：① 成熟度快评（总表 §2.4） ② 产品线 → 产品模块归属（总表 §3） ③ 全量功能评估 ④ 已实现功能点清单 ⑤ 架构实现明细（合并自原 `architecture/functions.md` §4.1 / §4.3 / §4.4，原文件已[归档](../../archive/functions.md)）
> 功能编码：`AS-01~03` / `AS-09`（资产）· `TR-01~03` / `TR-06~09`（交易）· `TR-04~05`（持仓与成本），沿用 [PRD](../specs/PRD.md)

---

## 1. 定位与价值主张

**价值主张：忠实记录每一笔真实交易，自动推导持仓与成本——系统的唯一事实来源。**

本线的关键认知是：

> **持仓不由存储提供，而由交易重放推导**（事实来源 = 交易流水）。

行情提供价格、组合提供目标、再平衡提供动作，但「我到底持有多少、成本多少」只能由本线回答。

- **上游依赖**：无。
  资产主数据是全系统引用的锚点。
- **下游影响**：
  - PL-3 组合洞察 / 
  - PL-4 再平衡建议 / 
  - PL-6 家庭汇总全部建立在本线口径之上。
- **断链后果**：资产被误删或交易录错 → 持仓「无主」→ 漂移、建议、家庭总额全部失真。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 高 | 资产 / 交易 / 成本三条主链齐全，CSV 导入打通批量录入 |
| 用户体验 | 中 | 录入体验与批量维护是短板：资产补分类只能逐条、导入成功批次不可回滚 |
| 数据可信 | 高 | 纯函数成本引擎、缺价不误算、超卖全路径（新增 / 修改 / 删除 / 导入）校验 |

**主要短板**：

① 录入体验与批量维护；

② **资产删除不做校验**（AS-01，P0 底线风险）。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 用户价值 | 现状 |
|---|---|---|---|
| **M1.1 资产主数据** | AS-01 资产 CRUD、AS-02 资产属性、AS-03 资产列表、AS-09 大类字段 | 定义「我能记哪些标的」，是下游一切引用的锚点 | 较完整；删除无级联校验，存量补分类缺工具 |
| **M1.2 交易流水** | TR-01 交易 CRUD、TR-02 交易字段、TR-03 超卖校验、TR-06 fee、TR-07 分红、TR-08 A股整手、TR-09 CSV 导入 | 把真实成交变成结构化事实 | 较完整；导入成功批次不可回滚 |
| **M1.3 持仓与成本引擎** | TR-04 移动平均成本重放、TR-05 持仓历史快照 | 由交易自动推导持仓 / 成本 / 盈亏 | 完整；纯函数、口径自洽 |

---

## 4. 全量功能评估

> 判定标准（保留 / 强化 / 修改 / 合并 / 删除）见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码，只产出建议。

| 编号 | 功能 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| AS-01 | 资产 CRUD | **修改** | 删除资产不做级联校验：已被交易引用的资产被删后，持仓出现「无主标的」，账本出现无法解释的悬空 | 有交易引用时禁止删除，或改为软删除（`active=false` + 归档）；删除前列出影响面 | **P0** |
| AS-02 | 资产属性 | 保留 | 字段够用，`active` 与 `watchlist` 语义已清晰区分 | 后续可选加「费率 / 分红率」等投资属性 | P3 |
| AS-03 | 资产列表 | **强化** | 缺批量操作；存量资产需逐条补大类，是 CM-08 大类目标的前置痛点 | 增加批量分类 / 批量启用停用、「未分类」快捷筛选与一键补全 | **P1** |
| AS-09 | 大类字段 | **强化** | 字段与正交语义到位，但**存量补分类缺工具**（与 AS-03 同一问题） | 与 AS-03 合并解决；提供「未分类资产」专列表 | P1 |
| TR-01 | 交易 CRUD | 保留 | 全局 + 组合内双视图，分页齐全 | — | — |
| TR-02 | 交易字段 | **修改** | `fee` 单一字段无法区分佣金 / 税费；长期记账需要分列 | 评估拆分 `fee`（佣金）与 `tax`（税费），或增加可选备注字段 | P2 |
| TR-03 | 超卖校验 | **强化** | 后端强校验已足够；前端缺少提交前的即时提示，报错才反查 | 表单侧实时计算「当日可用持仓」并提示；错误文案附可用数量 | P2 |
| TR-06 | fee 字段 | 保留 | 成本含费、净得扣费、与再平衡费用口径统一，逻辑自洽 | — | — |
| TR-07 | 分红类型 | **强化** | 覆盖现金 / 再投，但**未覆盖公司行为「拆股 / 合股」**，长期持有必遇 | 评估增加 `split` / 合并类型（或按面值调整），否则需人工改历史 | P2 |
| TR-08 | A股整手 | 保留 | 软警告不阻断是合理取舍（避免记账僵化） | 可将「是否警告」做成组合级配置 | P3 |
| TR-09 | CSV 批量导入 | **强化** | 失败可整批回滚，但**成功批次不可回滚**；无导入历史 | 增加导入批次记录 + 「撤销该批次」；展示跳过 / 失败明细 | **P1** |
| TR-04 | 移动平均成本重放 | 保留 | 纯函数、口径确定、缺价不误算——账本地基，质量高 | — | — |
| TR-05 | 持仓历史 | **强化** | 市值 + 成本趋势已够「看」；缺「已实现盈亏 / 累计现金流」维度 | 增加已实现盈亏时间序列与累计分红维度 | P2 |

---

## 5. 已实现功能点清单

### M1.1 资产主数据

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| AS-01 | 资产 CRUD | 创建 / 查询 / 更新 / 删除资产；`symbol` 全系统唯一、强制大写、正则 `^[A-Z0-9][A-Z0-9._-]*$`；`name` 必填 ≤120 字符 | `/assets`、`/assets/new`、`/assets/edit/:id` |
| AS-02 | 资产属性 | 维护 `market` / `currency` / `type` / `tags` / `launchDate` / `active` / `watchlist`；`active` 控制可否交易与同步，`watchlist` 仅关注偏好，二者独立 | `AssetForm` |
| AS-03 | 资产列表 | 按代码 / 名称 / 标签搜索（转义正则）、8 字段排序、10/20/50 分页、大类筛选（含「未分类」） | `AssetList` |
| AS-09 | 大类字段 | `assetClass ∈ {equity,bond,gold,cash,null}`，与 `type` **正交**（黄金 ETF = `type:etf` + `assetClass:gold`）；`null` 表示未分类 | `AssetForm` 下拉 + 列表筛选排序 |
| — | 资产 → 价格历史直达 | 列表中代码列可一键跳转到该资产的价格历史页 | `AssetList` |

**关键规则**：删除资产**不做级联校验**（交易引用不阻断删除）；排序白名单 + `_id` 次序保证稳定。

### M1.2 交易流水

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| TR-01 | 交易 CRUD | 全局交易列表 + 组合内流水视图，均分页；按 `date DESC, _id DESC` 排序 | `/transactions`、组合详情「交易记录」Tab |
| TR-02 | 交易字段 | `portfolioId` / `symbol` / `market` / `currency` / `assetType` / `action` / `quantity` / `price` / `fee` / `date` / `notes`；资产元数据由后端按资产回填 | `AddTransaction` / `EditTransaction` |
| TR-03 | 超卖校验 | 账本重放时抛 `INSUFFICIENT_POSITION`（消息含 symbol 与发生日期）；**新增 / 修改 / 删除 / 导入全部校验**，禁止做空 | 前端错误提示 |
| TR-06 | fee 费用字段 | 买入与分红再投**成本含费**；卖出所得**扣费**、已实现盈亏口径同步；不回溯漂移 | 交易表单 fee 输入 |
| TR-07 | 分红类型 | `div_cash` 现金分红（不进持仓，数量/成本/已实现盈亏均不变）；`div_reinvest` 分红再投（等价买入，转增持仓、成本含费） | 表单 action 选择 + 动态提示 |
| TR-08 | A 股整手提示 | CN-SH / CN-SZ **买入**非 100 股整数倍 → **软警告不阻断**（前端 `confirm` + 后端 `warnings:['CN_LOT_SIZE:symbol']`）；卖出与基金不受限 | 提交时提示 |
| TR-09 | CSV 批量导入 | 上传 → 解析 → 自动列映射 → 人工校正 → 预览校验 → 提交 → 结果报告；失败**整批回滚**（`422`）、幂等去重、超卖重放、≤500 行 / 批 | `/transactions/import` |
| — | CSV 前端工具集 | `parseCsv`（引号/转义/`\n`/`\r\n` 兼容）、`mapColumns`（内置天天基金 / 雪球常见列名，宽松匹配）、`normalizeAction`（买入/申购/赎回…→ 枚举）、`normalizeDate`（多格式 → `YYYY-MM-DD`）、预览前 50 行错误标红 | `utils/csvImport.js` |

### M1.3 持仓与成本引擎

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| TR-04 | 移动平均成本重放 | **纯函数**（不访问 DB、不做汇率）：按 `date`+`_id` 排序重放；buy 累加数量与成本（含费）；sell 按卖出前均价减记成本并计 `realizedPnl`（净得扣费）；输出 `avgCost / remainingCost / marketValue / unrealizedPnl / pnlPct`；**缺价时估值字段为 `null`，不按零价误算** | `shared/services/transaction/positionCalculator.js` |
| TR-05 | 持仓历史快照 | 按 `day/week/month` 分桶，逐期推进账本后逐期调用 `calculatePositions`，**保证与概览口径一致**；多币种按 currency 分行，`costBaseline` 供成本线叠加 | `/api/portfolios/:pid/positions/history` |
| — | 持仓概览（API + 前端） | 分页 + 排序（`symbol/marketValue/pnlPct/quantity/avgCost`，`null` 排最后）；`PositionOverview` 内嵌 4 张 KPI 卡（持仓总市值 / 今日盈亏〔固定 `—`，缺前收价〕/ 累计盈亏比 / 持有资产数）+ 9 列表格 | 组合详情「持仓概览」Tab |
| — | 持仓历史可视化 | 多币种折线图（市值实线 + 剩余成本虚线）+ 明细表 | `PositionHistory`（组合详情 Tab） |

---

## 6. 架构实现明细（合并自原 functions.md §4.1 / §4.3 / §4.4）

### 6.1 资产管理与维护（AS-01 ~ AS-03, AS-09）

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

### 6.2 交易记录（TR-01 ~ TR-03, TR-06 ~ TR-09）

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

### 6.3 持仓与成本引擎（TR-04 ~ TR-05）

**承载**：`shared/services/transaction/positionCalculator.js`（**纯函数，不访问 DB、不做汇率换算**）、`shared/services/portfolio/positionTracker.js`（DB 适配）

#### 6.3.1 移动平均成本法（TR-04）

`calculatePositions(transactions, latestPrices)`：

- **排序**：按 `date` 升序，同日按 `_id` 字典序（`compareTransactions`）。
- **buy**：`quantity += qty`；`remainingCost += qty × price + fee`（成本含费）。
- **sell**：先算卖出前均价 `avgCost = remainingCost / quantity`；`quantity > 持仓 + 1e-10` 抛 `INSUFFICIENT_POSITION`；`realizedPnl += (price − avgCost) × qty − fee`（净得扣费）；清零时清空成本。
- **div_cash**：数量/成本/已实现盈亏**均不变**（不进持仓）。
- **div_reinvest**：等价 buy（数量与成本增加，含 fee）。
- **输出**：`avgCost / totalCost(=remainingCost) / latestPrice / marketValue / unrealizedPnl / pnlPct`，过滤 `quantity≈0`。
- **缺价处理**：`marketValue / unrealizedPnl / pnlPct` 为 `null`，**不按零价误算**。
- **多币种**：按 `currency` 隔离，**禁止跨币种相加**（全局原则）。

#### 6.3.2 持仓历史（TR-05）

`calculatePositionHistory(transactions, prices, interval)`：

- 按 `day / week / month` 分桶（`periodKey` 用 `MARKET_TIMEZONE`）。
- 逐期推进账本 + `latestPrices`，再对每期调用 `calculatePositions`，**保证概览与历史口径一致**。
- 多币种**按 currency 分行**；币种内缺价 → 该行 `marketValue` 为 `null`。
- `costBaseline` = 期末剩余成本，供图表叠加成本线。

#### 6.3.3 持仓 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/portfolios/:pid/stats/positions` | 持仓概览：分页 + 排序（`symbol`/`marketValue`/`pnlPct`/`quantity`/`avgCost`，`null` 排最后），`pageSize ≤ 100` |
| GET | `/api/portfolios/:pid/positions/history` | 持仓历史：`symbol` + `interval=day\|week\|month` |
| GET | `/api/portfolios/:id/stats` | 按 symbol 的统计数组（金额保留 2 位） |

**前端**（组合详情 Tab）：

- `PositionOverview`：内嵌 4 张 KPI 卡（**持仓总市值 / 今日盈亏（固定 `—`，因缺前收价）/ 累计盈亏比 / 持有资产数**）+ 9 列表格（资产 / 代码 / 类型 / 数量 / 平均成本 / 现价 / 市值 / 日收益 / 持有收益）。
- `PositionHistory`：多币种折线图（市值实线 + 剩余成本虚线）+ 明细表。

**数据模型**（`shared/models/*.js`，唯一实现）

| 模型 | 关键字段 | 唯一索引 / 主索引 |
|---|---|---|
| **Asset** | `symbol`(uniq, 大写, 正则)、`name`、`market`、`currency`、`type`、`assetClass`(可 null)、`tags[]`、`launchDate`、`active`、`watchlist` | `{symbol:1}` unique |
| **Transaction** | `portfolioId`、`assetType`、`symbol`、`market`、`currency`、`action`、`quantity`、`price`、`fee`、`date`、`notes` | `{portfolioId,date:-1,_id:-1}`、`{portfolioId,symbol,date,_id}` |

---

## 7. 边界与已知缺口

- **资产删除无级联校验**（AS-01）：本线最严重的信任风险，属 P0 底线项。
- **CSV 导入无批次记录**（TR-09）：失败可整批回滚，但成功批次无法撤销。
- **枚举两份**：`shared/constants` 与 `client/src/constants/enums.js` 各一份，改动需双向同步（跨线技术债，详见 [PL-0](./PL-0-platform-foundation.md)）。
- 本线自身**无未接入遗留文件**；跨线遗留清单见 [PL-0](./PL-0-platform-foundation.md) §遗留与死代码。

---

## 8. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级）
- [PL-2 行情数据线](./PL-2-market-data.md) — 价格输入（本线估值字段的依赖方）
- [PL-3 组合与配置线](./PL-3-portfolio.md) — 本线下游：组合洞察
- [PL-0 平台基座线](./PL-0-platform-foundation.md) — 技术债 / 遗留 / 数据模型总表
- [PRD.md](../specs/PRD.md) — 需求基线（功能编码来源）
- [CLIENT.md](../../manual/CLIENT.md) — 使用指南（业务口径）
- [functions.md（已归档）](../../archive/functions.md) — 本文 §6 的原始来源
