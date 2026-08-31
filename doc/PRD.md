# PortoMind 产品需求文档（PRD）

> **文档性质**：活文档（living document），随开发逐步更新。
> **来源**：合并《03_家庭投资组合管理平台方案》（需求设计）与《04_代码库差距分析》（现状扫描），取代两者成为唯一需求基线。
> **基线代码**：`main` 分支 `d6f98c5`（2026-08-31，D:\projects\portomind）。
> **现状对照**：`doc/PRODUCT_FEATURES.md`（2026-08-25 前端功能现状）。

## 0. 文档约定

| 标记 | 含义 |
|---|---|
| ✅ | 已实现（以现有代码为准） |
| ◐ | 部分实现 |
| 🔲 | 待开发 |
| P0 | 当前批次必须交付 |
| P1 | 下一批次 |
| P2 | 可选/远期 |

**更新方式**：每个功能模块按「模块概述 → 用户故事 → 功能需求明细 → 数据模型 → API → 验收标准 → 待开发项」模板编写，逐步细化。当前已完成细化：**4.1–4.5 全部五大模块**（2026-08-31）。

## 1. 产品概述

PortoMind 是 Max 家庭的自托管投资组合管理平台：家庭拥有多个投资组合（CN 侧天天基金/雪球，CA 侧 TFSA/RRSP/RESP），覆盖美国、加拿大、中国大陆、中国香港的股票与 ETF，提供交易记录、历史价格图表、交易提醒与再平衡建议。

**定位边界**（沿用 README 安全边界）：

| 做 | 不做 |
|---|---|
| 记录、分析、建议 | 连接券商、提交真实订单 |
| 家庭服务器部署，可信网络访问 | 公网暴露、多用户、登录体系（ROADMAP P1 前不做） |
| 日线行情为主的监控 | 分钟级实时行情、自动交易 |

## 2. 全局约定（2026-08-31 用户裁决）

| # | 议题 | 裁决 | 影响模块 |
|---|---|---|---|
| 1 | 家庭基准币种 | **RMB**；家庭视图须同时展示 **CNY / USD / CAD 三种币种各自的资产金额**（分桶展示），RMB 为折算基准总额。港股（HKD）资产折算 RMB 计入基准总额，分桶中单独列出 | §3 家庭层、§4.2 |
| 2 | 成本口径 | **平均成本法**（移动平均，已实现，保持不变） | §4.3 |
| 3 | 港股 | **纳入 MVP**：需监控腾讯（0700.HK）、比亚迪（1211.HK）等港股 | §4.2 ✅ 已实现（AS-08，2026-08-31） |
| 4 | 提醒推送渠道 | **仅 Dashboard 站内显示**（通知中心页面），不做邮件/Webhook | §4.4 |
| 5 | 部署形态 | 家庭服务器，不部署公网 | §1 |
| 6 | 旧 `canonical_schema.json` | 「建议操作/建议理由」并入提醒模块的 **signal 规则**，其余字段由现有模型覆盖 | §4.4 |

**其他全局口径**（继承现有实现）：

- 交易方向仅 `buy | sell`，数量价格必须大于零，禁止做空；
- 非空目标配置合计必须精确 100%；
- 再平衡只生成建议，「执行」仅在系统内创建交易流水；
- 日价格按 `MARKET_TIMEZONE` 解释，数据库存 UTC；
- 组合基础币种用于记账，跨币种折算仅在家庭视图发生（历史时点汇率，不用今日汇率重算历史市值——ROADMAP P3 原则）。

## 3. 家庭层（✅ 已实现——批次2，2026-08-31）

家庭 = 组合的集合，无独立账号体系。家庭层提供：

| 编号 | 需求 | 状态 | 优先级 |
|---|---|---|---|
| FAM-01 | 家庭 Dashboard：以 RMB 折算的家庭总资产 + CNY/USD/CAD（及 HKD，如有持仓）各自金额分桶展示 | ✅ | P0（批次2） |
| FAM-02 | 按组合贡献分解（各组合市值、占家庭比例，RMB 基准） | ✅ | P0（批次2） |
| FAM-03 | 待处理提醒入口（§4.4 通知中心） | ✅ | P0（批次1） |
| FAM-04 | 最近交易与再平衡动态 | ✅ | P1 |

前置依赖：**FxRate 汇率模型与每日采集**——`models/fxRate.js`（currency/rateToCny/date/source）+ `services/fxRate.service.js`（最新汇率查询 / 每日 09:30 采集 / 手动录入）+ `tasks/fxScheduler.js`。数据源为 er-api 公开源（免 key，USD/CAD/HKD → CNY 对价）；**采集失败不阻塞服务，可手动录入兜底**（source='manual'）。注：原方案拟用 BOC/央行中间价，实现选用 er-api 免 key 公开源（家庭服务器网络环境更易生效），口径一致、可替换。

## 4. 五大功能模块

### 4.1 组合管理（本期已细化）

#### 4.1.1 模块概述

家庭在同一系统内维护多个投资组合。每个组合是独立的记账单元：有自己的基础币种、目标配置、再平衡参数与完整交易流水。组合层不做跨币种折算——折算只发生在家庭层（§3）。

#### 4.1.2 用户故事

1. 作为家庭管理者，我要为每个真实账户建一个组合（天天基金、雪球、TFSA、RRSP、RESP…），以便分开记账、分开看再平衡；
2. 作为组合主人，我要为组合设置目标配置与再平衡阈值，让系统告诉我何时偏离、偏离多少；
3. 作为用户，我在组合列表一眼看到每个组合的市值与漂移状态，点进详情逐层下钻（持仓 → 交易 → 历史）；
4. 作为用户，删除组合前我要清楚知道级联后果并确认。

#### 4.1.3 功能需求明细

| 编号 | 需求 | 状态 | 优先级 | 验收标准 |
|---|---|---|---|---|
| CM-01 | 组合 CRUD：创建、查询、更新、删除 | ✅ | — | POST/GET/PUT/DELETE `/api/portfolios`，名称必填 |
| CM-02 | 组合基本属性：名称、描述 | ✅ | — | 名称非空 |
| CM-03 | 组合类型（风险定位）：活钱 / 稳健 / 长期 | ✅ | — | enum，默认稳健 |
| CM-04 | 基础币种：CNY / CAD / USD | ✅ | — | enum，默认 CAD；仅作记账币种，不参与折算 |
| CM-05 | **账户类型（账户载体）**：tiantian / xueqiu / tfsa / rrsp / resp / taxable / other | ✅ | — | 新增可选字段，默认 other；用于家庭视图按真实账户分组展示（CM-03 是风险定位，与账户类型正交） |
| CM-06 | 目标配置：按 symbol 设置目标比例 | ✅ | — | 目标不可重复；非空合计精确 100% |
| CM-07 | 目标配置校验反馈 | ✅ | — | 合计 ≠100% 时保存被拒并提示 |
| CM-08 | 目标配置按大类（asset class）聚合视图 | 🔲 | P2 | equity/bond/gold/cash 大类漂移视图，与 symbol 级并存 |
| CM-09 | 再平衡参数：绝对偏离阈值（默认 5%）、相对偏离阈值（默认 10%）、时间间隔（默认 60 天），三项可独立启停 | ✅ | — | 0–100% 范围校验；间隔 ≥1 天 |
| CM-10 | 再平衡检查频率：daily / weekly / monthly | ✅ | — | enum，默认 daily |
| CM-11 | 组合列表：卡片展示名称、描述、类型、币种 | ✅ | — | — |
| CM-12 | 组合列表卡片增强：当前市值（组合币种）、持仓资产数、漂移状态徽标、待处理提醒数 | ✅ | P1 | 市值按币种分桶 + 持仓数 + 漂移徽标 + 未读提醒数（`GET /api/portfolios/summary` 返回 `stats.unreadAlertCount`，组合卡片显示「N 条未读提醒」）全部落地 |
| CM-13 | 组合详情 Tab：概览 / 持仓 / 交易 / 持仓历史 / 再平衡 | ✅ | — | 路由 `PORTFOLIO_TAB` 模式 |
| CM-14 | 组合统计：实时持仓比例（目标 vs 实际） | ✅ | — | `GET /:id/stats/actual-ratios` |
| CM-15 | 组合统计：汇总统计 | ✅ | — | `GET /:id/stats` |
| CM-16 | 组合持仓概览：份额、平均成本、剩余成本、最新价、市值、未实现盈亏、盈亏比 | ✅ | — | 支持搜索与按市值/盈亏比排序分页 |
| CM-17 | 组合持仓历史：市值与剩余成本趋势（日/周/月粒度） | ✅ | — | 币种分组展示，不跨币种合计 |
| CM-18 | 组合内交易流水视图 | ✅ | — | 分页；增删改统一走交易模块 |
| CM-19 | 级联删除：删除组合同时删除其全部交易与再平衡记录 | ✅ | — | 先删子资源再删组合；失败时保留组合避免孤儿记录；前端二次确认并明示后果 |
| CM-20 | 组合归档（停用不删除，保留历史） | ✅ | P2 | 归档组合不参与家庭市值与再平衡调度，数据保留 |

#### 4.1.4 数据模型（现状 + 增量）

```
Portfolio {
  name            String  必填
  description     String
  type            enum ['活钱','稳健','长期'] 默认'稳健'        // 风险定位
  currency        enum ['CNY','CAD','USD']  默认'CAD'          // 记账币种
  targets         [{ symbol: String(大写唯一), targetRatio: 0–100 }]
  rebalanceSettings {
    absoluteDeviation  Number 默认 5     // %
    relativeDeviation  Number 默认 10    // %
    timeInterval       Number 默认 60    // 天
    rebalanceSchedule  enum ['daily','weekly','monthly'] 默认 'daily'
  }
  createdAt       Date
  // ✅ 已实现（T1，2026-08-31）：accountType enum ['tiantian','xueqiu','tfsa','rrsp','resp','taxable','other'] 默认 'other'
  // ✅ 已实现（T3，2026-08-31）：archived Boolean 默认 false
}
```

#### 4.1.5 API 面（现状）

| 方法 | 路径 | 用途 | 状态 |
|---|---|---|---|
| POST | `/api/portfolios` | 创建组合（含 targets） | ✅ |
| GET | `/api/portfolios` | 组合列表 | ✅ |
| GET | `/api/portfolios/:id` | 组合详情 | ✅ |
| PUT | `/api/portfolios/:id` | 更新组合 | ✅ |
| DELETE | `/api/portfolios/:id` | 级联删除 | ✅ |
| GET | `/api/portfolios/:id/stats` | 汇总统计 | ✅ |
| GET | `/api/portfolios/:id/stats/actual-ratios` | 目标 vs 实际比例 | ✅ |
| GET | `/api/portfolios/:pid/stats/positions` | 持仓概览 | ✅ |
| GET | `/api/portfolios/:pid/positions/history` | 持仓历史 | ✅ |
| GET | `/api/portfolios/:pid/transactions` | 组合内流水 | ✅ |
| GET/PUT | `/api/portfolios/:pid/rebalance-settings` | 再平衡参数 | ✅ |
| POST | `/api/portfolios/:pid/rebalance/check` | 阈值检查 | ✅ |
| POST | `/api/portfolios/:pid/rebalance/suggestions` | 生成建议 | ✅ |
| POST | `/api/portfolios/:pid/rebalance/execute` | 执行（创建内部交易） | ✅ |
| GET | `/api/portfolios/:pid/rebalance/history` | 再平衡历史 | ✅ |
| GET | `/api/family/summary` | 家庭汇总（RMB 基准 + 三币种分桶 + 组合贡献 + 最近动态） | ✅ 已实现（FAM-01/02/04） |
| GET | `/api/family/fx/rates` | 最新汇率列表（含日期/来源） | ✅ |
| PUT | `/api/family/fx/rates/:currency` | 手动录入汇率（source='manual'） | ✅ |
| POST | `/api/family/fx/sync` | 手动触发汇率采集（失败 502） | ✅ |

#### 4.1.6 测试要点

- targets 合计 100% 的通过/拒绝用例（99.9%、100.1%、空配置、重复 symbol）；
- 级联删除后：Transaction/RebalanceRecord 中该 portfolioId 记录数为 0；
- 删除中途失败时组合保留（子资源清理失败的容错路径）；
- 已有测试基线：`server/test/integration`（`npm test`）+ `npm run verify`。

#### 4.1.7 未实现项评估与开发计划（2026-08-31 实证核对）

§4.1 共 20 条需求：**19 条已实现**（T1/T2/T3 落地后），**仅剩 1 条未实现**（CM-08，T4 批次4）：

| 项 | 证据 | 规模 |
|---|---|---|
| ~~CM-05 accountType~~ ✅ **T1 已完成** | `models/portfolio.js` 增加 accountType（默认 other）；表单下拉 + 卡片徽标 + API 文档 + 2 条模型测试 | 小 |
| ~~CM-12 列表卡片增强~~ ✅ **T2 已完成** | `GET /api/portfolios/summary` + PortfolioCard 市值分桶/持仓数/漂移徽标；批次1 补充未读提醒数后全量落地 | 中 |
| ~~CM-20 归档~~ ✅ **T3 已完成** | model `archived`（默认 false）+ 列表过滤/归档开关/卡片徽标 + 再平衡调度三层防护 + 10 条测试 | 小 |
| CM-08 大类层级 | `models/asset.js` 无 assetClass 字段（受 AS-09 阻塞） | 大 |

**开发计划（T1→T2→T3 顺序执行，T4 暂缓）**：

| 任务 | 内容 | 关键设计决策 | 验收 |
|---|---|---|---|
| **T1 · CM-05 账户类型** ✅ **已完成（2026-08-31）** | model `accountType` enum 默认 other + PortfolioForm 下拉 + PortfolioCard 徽标 + API_CONTRACT 文档 + 2 条模型测试 | 与 type（风险定位）正交；存量组合读取侧按 other 兜底 | `npm test` 60/60 通过；`npm run lint` 清洁；`npm run build` 成功 |
| **T2 · CM-12 卡片增强** ✅ **已完成（2026-08-31，提醒数待批次1）** | ① `GET /api/portfolios/summary`（`services/portfolio/summary.js`：buildPortfolioSummary 纯函数 + computeSummary 编排）② PortfolioCard 市值分桶/持仓数/漂移徽标 ③ usePortfolios 切换到 summary | 市值按币种分桶（不跨币种合计）；缺价币种桶为 null 显示「—」；drift 仅计绝对/相对偏离（timeInterval 不算漂移）；无 targets/无持仓/缺价 → drift null | `npm test` 70/70（新增 10 条）；lint 清洁；build 成功 |
| **T3 · CM-20 归档** ✅ **已完成（2026-08-31）** | ① model `archived` 默认 false ② summary 默认过滤 + `?includeArchived=true` + List「显示已归档」开关 + 卡片「已归档」徽标（opacity 弱化）+ Form 归档复选框（仅编辑）③ initSchedules 查询过滤 + 循环防御 + cron 回调运行时守卫 | 归档不删除任何数据；运行时守卫以数据库当前状态为准（注册后归档也生效）；是批次2 家庭视图排除归档组合的前置 | `npm test` 80/80（新增 10 条：模型默认值/调度过滤/运行时守卫/summary 过滤/HTTP 契约）；lint 清洁；build 成功 |
| **T4 · CM-08 大类层级** | 暂缓至批次4（前置 AS-09 assetClass 字段 + 存量补数据） | targets 需支持 level: asset_class；thresholdChecker/suggestionGenerator 均需扩展 | 见 PRD §4.5 RB-11 |

**验证方式**：T1-T3 每任务完成即 `npm test`（58 用例 + 新增用例，无需 MongoDB）；端到端验证需本地 MongoDB（`npm run verify`，Windows 侧 MongoDB 可用性待确认）。

**CM-12 特别说明**：待处理提醒数字段已在批次1 落地（`stats.unreadAlertCount` + 组合卡片徽标），CM-12 全部完成。

### 4.2 资产管理与历史价格（已细化）

#### 4.2.1 模块概述

资产是全局主数据：同一 symbol 全系统唯一，可被多个组合的 targets 与交易引用。价格是资产行情时序（按日），由 cron-worker 自动采集，前端只读。资产市场覆盖美股、加股、A股（沪/深）、场外基金、**港股（裁决 #3，AS-08 已实现并实测腾讯/比亚迪）**。

#### 4.2.2 用户故事

1. 作为用户，我要登记腾讯（0700.HK）、比亚迪（1211.HK）等港股资产，与美/加/A股资产一样自动同步日线；
2. 作为用户，我要查看任一资产的历史价格走势（折线图 + 表格），配合持仓成本判断买卖点；
3. 作为用户，我要知道哪些资产今天没同步上、哪些有历史缺口（数据质量可见）。

#### 4.2.3 功能需求明细

| 编号 | 需求 | 状态 | 优先级 | 验收标准 |
|---|---|---|---|---|
| AS-01 | 资产 CRUD | ✅ | — | symbol 唯一、大写、正则 `^[A-Z0-9][A-Z0-9._-]*$`；name 必填 ≤120 字符 |
| AS-02 | 资产属性：market（US/CA/CN-SH/CN-SZ/CN-FUND）、currency（USD/CAD/CNY）、type（stock/etf/fund/bond/cash）、tags、launchDate、active、watchlist | ✅ | — | active 控制可否用于交易/同步；watchlist 仅展示偏好，两者独立 |
| AS-03 | 资产列表：按代码/名称/标签搜索，8 字段排序，10/20/50 分页 | ✅ | — | — |
| AS-04 | 今日价格页：各资产最近一条价格 + 指定日期查询 + 手动刷新 | ✅ | — | — |
| AS-05 | 历史价格页：折线图 + 每日价格表格 + 年月筛选 + 分页 | ✅ | — | — |
| AS-06 | 每日同步：默认 03:00（`PRICE_SYNC_CRON`）逐资产「开市校验 → fetcher 路由 → 幂等入库」，TaskRun 防重追踪，休市记 skip | ✅ | — | Price 以 symbol+timestamp 唯一索引幂等；逐资产故障隔离（单资产失败不影响其余） |
| AS-07 | 完整性检查：默认 03:30（`HEALTH_CHECK_CRON`），按 launchDate 推断应有交易日数，缺口可选自动补全（`INTEGRITY_AUTO_REPAIR` 默认开） | ✅ | — | 未填 launchDate 的资产跳过并记 `SKIPPED_NO_LAUNCH_DATE` |
| AS-08 | **港股支持**：market 增加 `HK`、currency 增加 `HKD`、路由 Yahoo（`XXXX.HK` 代码）、交易日历增加 HK 节假日 | ✅ | **P0（批次1）** | 已实测：`0700.HK`（腾讯 453 HKD）、`1211.HK`（比亚迪 87.2 HKD）实时+历史（2024 年 1 月 K 线）+ 开市判断全部通过；`.HK` 后缀与场外基金 `.CN` 推断互斥无冲突；HK 节假日静态表 2024/2025 官方 + 2026 推算（需逐年核对 HKEX 公告） |
| AS-09 | assetClass 大类字段（equity/bond/gold/cash） | 🔲 | P2（批次4） | 为 CM-08 大类目标层与家庭视图大类分组铺垫；存量资产需补数据 |
| AS-10 | A股股票日线（非 ETF） | ✅ | — | 东方财富 fetcher 按 secid 路由：5/6/9 开头→上海 `1.x`，其余→深圳 `0.x`；实测个股后确认 |
| AS-11 | 估值分位（A股宽基 PE/PB 历史分位） | 🔲 | P2 | 衔接 index-valuation-selfcalc 产出，作提醒规则输入（§4.4） |

#### 4.2.4 数据源与路由（现状）

| market | fetcher | 说明 |
|---|---|---|
| CN-FUND | 天天基金 | 场外基金净值 |
| CN-SH / CN-SZ | 东方财富 | 实时 push2（push2delay 回退）+ 历史 K 线；单请求粒度超时控制 |
| US / CA | Yahoo | 加股带 `.TO` 后缀 |
| HK（✅ 批次1） | Yahoo | `0700.HK` 形式；Yahoo 原生支持，已实测腾讯/比亚迪实时+历史 |
| （无 market） | 按符号推断 | `.CN`→天天基金；`.SS/.SZ`/6 位数字→东方财富；`.HK`→Yahoo；其余→Yahoo |

交易日历：US/CA 节假日按规则计算（周末+法定+顺延）；CN 为逐年静态表（`config/markets.js`，未维护年份打 warn 不静默）；**HK 已加入**（静态表 2024/2025 官方 + 2026 推算，未维护年份打 `HK_HOLIDAYS_YEAR_NOT_MAINTAINED` warn，与 CN 同模式）。

#### 4.2.5 API 面（现状）

| 方法 | 路径 | 用途 | 状态 |
|---|---|---|---|
| GET/POST | `/api/assets` | 列表（搜索/排序/分页）/ 创建 | ✅ |
| GET/PUT/DELETE | `/api/assets/:id` | 详情 / 更新 / 删除（前端二次确认） | ✅ |
| GET | `/api/prices/today` | 各资产最新价格 | ✅ |
| GET | `/api/prices/date/:date` | 指定日期全量价格 | ✅ |
| GET | `/api/prices/symbol/:symbol/history` | 单资产历史（年月筛选+分页） | ✅ |
| POST/GET/PUT/DELETE | `/api/prices/:id` 等 | 价格手工维护 | ✅ |
| — | HK 相关枚举与日历扩展 | — | ✅ 已实现（AS-08） |

#### 4.2.6 测试要点

- priceFetch 路由：CN-FUND/CN-SH/CN-SZ/US/CA/HK（market 字段与 `.HK` 后缀推断）各走对 fetcher，`.HK` 与 `.CN` 互斥；
- 幂等：同一 (symbol, timestamp) 重复入库不产生重复记录；
- 完整性检查：launchDate 缺失跳过、缺口检测、自动补全触发；
- 港股验收：0700.HK 抓取（含历史 K 线）、HK 开市判断（含节假日）、组合内持仓计算含 HKD 不与 CNY 混算。

#### 4.2.7 待开发项汇总

| 项 | 优先级 | 批次 |
|---|---|---|
| ~~AS-08 港股（枚举+路由+日历+实测）~~ ✅ 已完成（2026-08-31） | P0 | 1 |
| AS-09 assetClass 字段 | P2 | 4 |
| AS-11 估值分位接入 | P2 | — |

### 4.3 交易记录（已细化）

#### 4.3.1 模块概述

交易流水是组合账本的唯一事实来源（source of truth）：持仓不直接存储，而是由交易按时间顺序重放推导（移动平均成本法，裁决 #2）。录入即生效，编辑/删除历史交易会重算其后所有持仓快照。

#### 4.3.2 用户故事

1. 作为用户，我录入每笔真实买卖（选组合、选资产、方向、数量、价格、日期），系统自动算出持仓与成本；
2. 作为用户，我要防止录错：卖出超过持仓量必须被拒绝，且告诉我哪天不够；
3. 作为用户，我要补录历史交易（CSV 批量导入天天基金/雪球的历史单）。

#### 4.3.3 功能需求明细

| 编号 | 需求 | 状态 | 优先级 | 验收标准 |
|---|---|---|---|---|
| TR-01 | 交易 CRUD | ✅ | — | 全局交易列表 + 组合内流水视图，均分页 |
| TR-02 | 交易字段：portfolioId、symbol、market、currency、assetType、action（buy/sell）、quantity、price、date、notes | ✅ | — | quantity/price 必须大于零；禁止做空；选择资产自动带出 market/currency/type |
| TR-03 | 超卖校验 | ✅ | — | 重放时 `INSUFFICIENT_POSITION` 报错，消息含 symbol 与发生日期 |
| TR-04 | 移动平均成本重放：按 date+_id 排序；buy 累加数量与成本；sell 按卖出前均价减记成本、累计已实现盈亏；清零清理 | ✅ | — | 输出 avgCost / remainingCost / realizedPnl / marketValue / unrealizedPnl / pnlPct；缺最新价时市值与盈亏为 null 不误算 |
| TR-05 | 持仓历史：日/周/月粒度快照（增量账本重放），按币种分组隔离 | ✅ | — | `costBaseline` = 期末剩余成本，供图表叠加成本线；不跨币种合计 |
| TR-06 | fee 字段：买入 `remainingCost += qty×price + fee`；卖出所得扣减 fee；已实现盈亏口径同步 | 🔲 | P1（批次3） | 与再平衡建议的费用模型（§4.5）统一口径；迁移默认 0 |
| TR-07 | 分红类型 `div_cash` / `div_reinvest` | 🔲 | P1（批次3） | div_cash 计入现金（不进持仓）；div_reinvest 转增持仓；重放与统计兼容 |
| TR-08 | A股整手校验：CN 市场 buy 非 100 股整数倍 | 🔲 | P1（批次3） | **警告不阻断**（默认裁决）；卖出与基金不受限 |
| TR-09 | CSV 批量导入 | 🔲 | P1（批次3） | 按 ROADMAP P2 流程：上传 → 字段映射预览 → 校验 → 幂等导入 → 错误报告；定义天天基金/雪球模板、日期与数字区域格式、重复交易键、整批回滚 |

#### 4.3.4 数据模型（现状 + 增量）

```
Transaction {
  portfolioId  ObjectId → Portfolio（索引）
  assetType / market / currency   enum 同 Asset（冗余存储，重放无需联表）
  symbol       String 大写
  action       enum ['buy','sell']
  quantity     Number > 0
  price        Number > 0
  date         Date
  notes        String ≤500
}
// 🔲 P1 增量：fee Number ≥0 默认0；action 枚举扩展 'div_cash' | 'div_reinvest'
// 索引：{portfolioId, date:-1, _id:-1} 与 {portfolioId, symbol, date:1, _id:1}（重放排序）
```

#### 4.3.5 API 面（现状）

| 方法 | 路径 | 用途 | 状态 |
|---|---|---|---|
| GET/POST | `/api/transactions` | 列表 / 创建 | ✅ |
| GET/PUT/DELETE | `/api/transactions/:id` | 详情 / 编辑 / 删除 | ✅ |
| GET | `/api/portfolios/:pid/transactions` | 组合内流水 | ✅ |
| POST | `/api/transactions/import` | CSV 幂等导入 | 🔲 P1（批次3） |

#### 4.3.6 测试要点

- 重放排序：同日多笔按 _id 决胜，结果确定；
- 超卖边界：恰好卖光（quantity==持仓）合法、清零后成本归零；
- 缺价格容错：无最新价的持仓市值/盈亏为 null，历史快照按币种缺价标记；
- fee 引入后：买入成本含费、卖出净得扣费、均价与已实现盈亏不回溯漂移（仅影响之后交易）；
- 已有基线：`position.calculator.test.js`、`transaction.module.test.js`（`npm test` 58 用例含）。

#### 4.3.7 待开发项汇总

| 项 | 优先级 | 批次 |
|---|---|---|
| TR-06 fee | P1 | 3 |
| TR-07 分红 | P1 | 3 |
| TR-08 A股整手警告 | P1 | 3 |
| TR-09 CSV 导入 | P1 | 3 |

### 4.4 提醒（✅ 已实现——批次1，2026-08-31）

#### 4.4.1 模块概述

提醒回答「每个资产现在该买、该卖还是持有」。两层机制：

1. **规则引擎**（自动）：用户对资产/组合配置量化规则，系统每日跑批评估并产生事件；
2. **信号登记**（人工）：把外部投资建议（E大「ETF拯救世界」、有知有行）手动登记为带方向、理由、有效期的信号规则，到期自动归档——落地裁决 #6（旧 `canonical_schema.json` 的「建议操作/建议理由」并入本模块）。

展示渠道：**仅 Dashboard 通知中心**（裁决 #4），不做邮件/Webhook/外部推送。

实现情况（2026-08-31）：`alertRule.js` / `alertEvent.js` 模型、`alertEngine.service.js` 评估引擎（5 规则类型 + 逐规则故障隔离 + cooldown 去重 + 同日幂等）、`alertScheduler.js` 每日 04:00 跑批、`/api/alerts` 六端点、Dashboard 通知中心（Header 未读徽标 + 面板）与规则管理页全部落地；原 `alertCenter.service.js` 桩已改造为再平衡通知写入 AlertEvent（action 级）。

#### 4.4.2 用户故事

1. 作为用户，我给腾讯设「股价高于 450 提醒」，给 XEQT 设「浮亏超 10% 提醒」，第二天开盘后在 Dashboard 看到；
2. 作为用户，E大发了一期「卖出一份沪深300」的建议，我登记为信号规则（方向+理由+30 天有效期），持有期间 Dashboard 常显，过期自动归档；
3. 作为用户，组合漂移超过阈值时我收到 `drift_exceed` 事件，点进去直达再平衡面板；
4. 作为用户，我不想被同一规则每天轰炸：触发后合理静默期内不重复。

#### 4.4.3 功能需求明细

| 编号 | 需求 | 状态 | 优先级 | 验收标准 |
|---|---|---|---|---|
| AL-01 | AlertRule CRUD：名称、作用域（资产级/组合级）、规则类型、参数、启停 | ✅ | **P0（批次1）** | 资产级规则绑定 (portfolioId, symbol) 或全局 symbol；组合级绑定 portfolioId |
| AL-02 | 规则类型 MVP 集：`price_above` / `price_below`（到价）、`gain_loss_pct`（相对成本±%）、`drift_exceed`（组合漂移%）、`signal`（人工信号） | ✅ | **P0（批次1）** | 评估输入：最新价（Price）、持仓成本（positions）、漂移（复用 thresholdChecker 口径） |
| AL-03 | signal 规则：方向（buy/sell/hold）+ 理由 + 有效期 validUntil | ✅ | **P0（批次1）** | 有效期内持续展示于通知中心；过期自动 `active=false` 归档，事件保留历史 |
| AL-04 | AlertEvent：触发记录（级别 info/warning/action、标题、内容、触发时快照值）、已读状态 | ✅ | **P0（批次1）** | 事件不可删（审计），可标记已读/忽略 |
| AL-05 | 评估引擎：每日价格同步后跑批（建议 04:00，`ALERT_EVAL_CRON`），复用 createCronScheduler + runTrackedTask | ✅ | **P0（批次1）** | 逐规则故障隔离（单规则异常记 error 不中断批次）；TaskRun 可追踪 |
| AL-06 | 去重静默：同规则触发后 cooldownDays（默认 7）内不重复产生事件 | ✅ | **P0（批次1）** | 静默期内条件持续满足也只留一条活跃事件 |
| AL-07 | Dashboard 通知中心：未读徽标 + 面板（未读/全部/按组合筛选），点击事件跳转对应资产或再平衡页 | ✅ | **P0（批次1）** | 即 FAM-03 的落地形态；signal 类事件常显直至过期或手动处理 |
| AL-08 | 规则管理页：规则列表 + 新建/编辑/启停 + 触发历史查看 | ✅ | **P0（批次1）** | — |
| AL-09 | 52 周新高/新低规则 | 🔲 | P2 | 批次1 后 |
| AL-10 | 估值分位规则（A股宽基 PE/PB 分位，输入来自 AS-11） | 🔲 | P2 | 依赖 AS-11 |

#### 4.4.4 数据模型（✅ 已实现 2026-08-31）

```
AlertRule {
  scope         enum ['asset','portfolio']        // asset 级须带 symbol；portfolio 级用于 drift/signal
  portfolioId   ObjectId → Portfolio（asset 级可空=跨组合关注）
  symbol        String（scope='asset' 时必填）
  name          String 必填
  ruleType      enum ['price_above','price_below','gain_loss_pct','drift_exceed','signal']
  params        Mixed（如 { threshold: 450 } / { pct: -10 } / { drift: 5 }）
  direction     enum ['buy','sell','hold']（signal 必填）
  reason        String（signal 的建议理由，来自 E大/有知有行原文摘录）
  validUntil    Date（signal 可选；普通规则可空=长期）
  cooldownDays  Number 默认 7
  active        Boolean 默认 true
  createdAt / updatedAt
}

AlertEvent {
  ruleId        ObjectId → AlertRule（索引）
  portfolioId / symbol（冗余，便于筛选跳转）
  level         enum ['info','warning','action']
  title / content
  snapshot      Mixed（触发时价格/成本/漂移值，便于回看当时条件）
  triggeredAt   Date（索引）
  status        enum ['unread','read','dismissed'] 默认 'unread'
}
```

#### 4.4.5 API 面（✅ 已实现 2026-08-31）

| 方法 | 路径 | 用途 | 状态 |
|---|---|---|---|
| GET/POST | `/api/alerts/rules` | 规则列表 / 创建 | ✅ |
| GET/PUT/DELETE | `/api/alerts/rules/:id` | 详情 / 编辑 / 删除 | ✅ |
| GET | `/api/alerts/events` | 事件列表（未读/组合/类型筛选，分页） | ✅ |
| PATCH | `/api/alerts/events/:id/read` | 标记已读/忽略 | ✅ |
| GET | `/api/alerts/events/unread-count` | Dashboard 徽标 | ✅ |

#### 4.4.6 测试要点

- 每种规则类型的触发/不触发边界（恰好等于阈值按不触发处理，严格大于才触发——实施时定死并写进用例）；
- cooldown 去重：条件持续满足时 N 天内仅一条；
- signal 过期归档：validUntil 之后评估跳过且规则置 inactive；
- 逐规则故障隔离：构造异常规则不影响批次内其他规则评估；
- 评估幂等：同一天重复跑批不产生重复事件（按 ruleId+日期幂等键）。

#### 4.4.7 待开发项汇总

| 项 | 优先级 | 批次 |
|---|---|---|
| ~~AL-01~08 提醒中心整体（模型+引擎+通知中心+规则管理）~~ ✅ 已完成（2026-08-31） | P0 | 1 |
| AL-09 52周新高低 | P2 | — |
| AL-10 估值分位规则 | P2 | — |

### 4.5 再平衡建议（已细化）

#### 4.5.1 模块概述

再平衡是系统的决策闭环：「阈值检查 → 生成建议 → 用户确认执行（生成内部交易）→ 撤销/重做」。**永不自动交易**（安全边界）：AUTO 模式也只是自动生成待确认建议。建议按组合币种计算，不做跨币种折算。

#### 4.5.2 用户故事

1. 作为用户，我设好目标配置与阈值，系统每天检查，偏离超限时告诉我哪个资产超了、超多少；
2. 作为用户，生成建议时我输入「本次可投入现金」和费率假设，系统给出先卖后买的交易清单（数量、金额、费用、调整后比例）；
3. 作为用户，我确认执行后系统自动生成交易流水；后悔了可以撤销（生成反向流水），撤销后可重新生成建议；
4. 作为用户，我能在双层饼图里直观看到「当前 vs 执行后」的比例变化。

#### 4.5.3 功能需求明细

| 编号 | 需求 | 状态 | 优先级 | 验收标准 |
|---|---|---|---|---|
| RB-01 | 阈值检查：绝对偏离（默认 5%）、相对偏离（默认 10%）按 symbol 计算；时间间隔（默认 60 天）距上次 EXECUTED 记录 | ✅ | — | 三项可独立启停；任一触发即 `needsRebalance`；reasons 含 `TOTAL_VALUE_ZERO` / `NEVER_EXECUTED` / `TIME_INTERVAL_EXCEEDED` |
| RB-02 | 建议生成：先卖后买（卖出净得才可用于买入）；买入按缺口比例分配可用资金；费用模型（固定费+比例费+卖出税率） | ✅ | — | 每条建议含方向/数量/成交额/费用/税/调整后比例 `postRebalanceRatio`；funding 汇总（卖出所得/可用资金/买入支出/剩余现金） |
| RB-03 | 建议输入：可投入现金 cashBudget、费率假设 | ✅ | — | cashBudget ≥0 校验 |
| RB-04 | 警告体系：`MISSING_PRICE:symbol`（缺价跳过）、`BUYS_LIMITED_BY_AVAILABLE_CASH`（资金不足）、`TOTAL_VALUE_ZERO` | ✅ | — | 去重后返回 |
| RB-05 | 执行：确认后按建议创建内部交易流水（不连券商）；RebalanceRecord PENDING→EXECUTED | ✅ | — | executedTransactionIds 关联生成交易 |
| RB-06 | 撤销：对 EXECUTED 记录生成反向交易，状态→REVOKED | ✅ | — | reversalTransactionIds 关联；持仓与成本恢复 |
| RB-07 | 重做：对 REVOKED 记录可重新生成待确认建议（sourceRecordId 链） | ✅ | — | — |
| RB-08 | AUTO 调度：按 rebalanceSchedule（daily/weekly/monthly）自动检查并生成建议（不自动执行） | ✅ | — | 触发 alertCenter.notify → 写入 AlertEvent（action 级），Dashboard 通知中心可见（已接入） |
| RB-09 | 前端：待确认建议恢复展示、最近执行记录、双层饼图（当前 vs 执行后） | ✅ | — | — |
| RB-10 | 建议费用模型与交易 fee 字段口径统一 | 🔲 | P1（批次3） | TR-06 落地后，建议预估费用与实际交易记录 fee 可对账 |
| RB-11 | 大类层再平衡（equity/bond/gold/cash） | 🔲 | P2（批次4） | 依赖 AS-09 + CM-08 |

#### 4.5.4 数据模型（现状）

```
RebalanceRecord {
  portfolioId, timestamp
  mode              enum ['AUTO','MANUAL']
  suggestions       [Mixed]（SuggestionGenerator 输出）
  status            enum ['PENDING','EXECUTED','REVOKED']
  triggeredThresholds [String] / thresholdDetails [Mixed] / warnings [String]
  feeModel          Mixed（fixedFee/ratioFee/sellTax）
  cashBudget        Number
  funding           Mixed
  executedTransactionIds / reversalTransactionIds  [ObjectId → Transaction]
  sourceRecordId    ObjectId → RebalanceRecord（重做链）
  executedAt / revokedAt
}
```

#### 4.5.5 API 面（现状）

见 §4.1.5 组合 API 面的 rebalance 部分（check / suggestions / execute / history 均已实现 ✅，挂 `/api/portfolios/:pid/rebalance/*`）。

#### 4.5.6 测试要点

- 先卖后买资金约束：无外部现金时买入总额 ≤ 卖出净得；
- 费用模型：fixedFee/ratioFee/sellTax 组合的边界（零费率、全额费用吃掉所得）；
- 阈值边界：恰好等于阈值不触发（严格大于触发）；
- 执行-撤销-重做闭环的交易流水与持仓还原；
- 缺价资产：进 warnings 不中断整体建议；
- 已有基线：`rebalance.module.test.js`（58 用例中占比最高的一组）。

#### 4.5.7 待开发项汇总

| 项 | 优先级 | 批次 |
|---|---|---|
| RB-10 费用口径统一 | P1 | 3 |
| RB-11 大类层再平衡 | P2 | 4 |

## 5. 里程碑（按裁决更新）

| 批次 | 内容 | 关键交付 |
|---|---|---|
| 1 | **提醒中心 + 港股接入** ✅ **已完成（2026-08-31）** | AlertRule/AlertEvent + 04:00 跑批 + Dashboard 通知中心 + 规则管理页（仅 Dashboard 显示）；HK market + HKD + Yahoo 港股实测（0700.HK/1211.HK） |
| 2 | **汇率 + 家庭视图** ✅ **已完成（2026-08-31）** | FxRate 模型与每日采集（er-api 公开源 + 手动录入兜底）；`/api/family/summary`（RMB 基准 + 币种分桶 + 组合贡献 + 最近动态）；家庭视图页（总资产卡片/分桶卡/贡献列表/动态流/汇率管理）。注：CM-05 accountType / CM-12 卡片增强已在批次1 前完成（T1/T2） |
| 3 | **交易增强** | fee / 分红 / A股整手 / CSV 导入 |
| 4 | **大类配置层**（可选） | asset_class 聚合视图与再平衡 |

## 6. 更新记录

| 日期 | 变更 |
|---|---|
| 2026-08-31 | 合并 03（方案）/ 04（差距分析）创建本 PRD；录入 6 项用户裁决；细化 4.1 组合管理；代码库由 WSL 迁至 D:\projects\portomind（基线 `d6f98c5`） |
| 2026-08-31 | 细化完成其余四章：4.2 资产管理与历史价格（AS-01~11，含港股设计与数据源路由表）、4.3 交易记录（TR-01~09，含 fee/分红/整手/CSV 增量）、4.4 提醒（AL-01~10 整体新建，含 AlertRule/AlertEvent 数据模型与 API 设计）、4.5 再平衡建议（RB-01~11）；五大模块 PRD 全部完成 |
| 2026-08-31 | §4.1.7 改写为实证评估 + 开发计划：16/20 已实现，T1 accountType → T2 卡片增强（summary 端点 + 市值按币种分桶）→ T3 归档，T4 大类层级暂缓（AS-09 阻塞） |
| 2026-08-31 | **T1 完成**：工作区已有未提交的 accountType 实现（模型/枚举/表单/卡片/API文档/测试），逐项核对符合规格后全量验证（npm test 60/60、lint 清洁、build 成功），CM-05 置 ✅ |
| 2026-08-31 | **T2 完成**：新增 `GET /api/portfolios/summary`（summary.js 纯函数+编排，10 条新测试），PortfolioCard 市值按币种分桶/持仓数/漂移徽标，usePortfolios 切换 summary；CM-12 置 ◐（提醒数留批次1）。提交 49b4edb(T1)/6fc6846(PRD)/本次 T2 |
| 2026-08-31 | **T3 完成**：CM-20 组合归档落地——model `archived` 默认 false；summary 默认排除归档、`?includeArchived=true` 可选包含；List「显示已归档」开关 + 卡片徽标 + Form 归档复选框；再平衡调度三层防护（initSchedules 查询过滤 + 循环防御 + cron 回调运行时守卫）；CM-20 置 ✅，§4.1 待实现仅剩 CM-08（T4，批次4） |
| 2026-08-31 | **AS-08 港股支持完成（批次1）**：server/cron-worker/client 三份枚举同步加 `HK`/`HKD`；fetcher 路由 market=HK 与 `.HK` 后缀 → Yahoo（`.CN` 互斥）；HK 交易日历（Asia/Hong_Kong 时区 + 2024/2025 官方节假日表 + 2026 推算，未维护年份告警 `HK_HOLIDAYS_YEAR_NOT_MAINTAINED`）；yahooFetcher `.HK` → market=HK。实测验收：0700.HK（腾讯 453 HKD）/1211.HK（比亚迪 87.2 HKD）实时+历史+开市判断通过。cron-worker 69/69、server 80/80、lint/build 清洁 |
| 2026-08-31 | **提醒中心完成（批次1，AL-01~08）**：AlertRule/AlertEvent 模型（scope/ruleType/params/direction/validUntil/cooldownDays；事件含 level/snapshot/status 审计不可删）；alertEngine 评估引擎（5 规则类型严格边界、逐规则故障隔离、cooldown 去重、同日幂等、signal 常显/过期归档、drift 复用组合徽标口径）；alertScheduler 04:00 跑批（ALERT_EVAL_CRON + runTrackedTask）；/api/alerts 六端点；alertCenter.notify 改造为写 AlertEvent（再平衡通知入库）；summary 补 unreadAlertCount（CM-12 落地）；客户端 Header 未读徽标（5s 轮询）+ Dashboard 通知中心（未读/全部/组合筛选/标读/忽略/跳转）+ 规则管理页 + PortfolioCard 未读提醒数。测试 server 102/102（新增 22：engine 11 + api 11），lint/build 清洁 |
| 2026-08-31 | **PRD 状态勾选（批次1 收官核对）**：CM-12 ◐→✅（未读提醒数落地）、FAM-03 🔲→✅（通知中心即其落地形态）、§4.1.7 完成度 16/20→19/20（CM-05/12/20 划线标注 T1/T2/T3）、§4.1.4 增量注释更新、§4.2/§4.4 概述与数据模型标题更新、RB-08 验收标准更新（通知中心已接入）、里程碑批次1 标 ✅、批次2 交付列表移除已提前完成的 CM-05/CM-12 |
| 2026-08-31 | **家庭层完成（批次2，FAM-01/02/04）**：FxRate 模型（currency/rateToCny/date/source，按 (currency,date) 幂等 upsert）+ fxRate.service（getLatestRates/upsertRate/syncLatestRates，er-api 免 key 公开源，失败降级可手动录入）+ fxScheduler 每日 09:30 采集；familySummary.service（buildCurrencyBuckets/buildFamilySummary 纯函数 + computeFamilySummary 编排：RMB 基准总资产、USD/CAD/CNY/HKD 分桶、组合贡献占比、缺价/缺汇率标 null 不误报、最近交易/再平衡动态）；/api/family 四端点；客户端家庭视图页（总资产卡片 + 分桶卡 + 贡献列表 + 动态流 + 汇率管理）。测试 server 114/114（新增 12：family.summary），lint/build 清洁 |
