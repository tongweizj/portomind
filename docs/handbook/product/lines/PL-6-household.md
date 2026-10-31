# PL-6 家庭总览线（Household）

> 版本：v1.1 · 日期：2026-10-26
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-6** 的明细子文件
> v1.1 修订：§1 开头补一句指向 [PRODUCT_LINES.md §1](../PRODUCT_LINES.md) 的链接（产品级定义唯一归属，路线 B）；本线内容未动。
> 内容范围：① 成熟度快评（总表 §2.4） ② 产品线 → 产品模块归属（总表 §3） ③ 全量功能评估 ④ 已实现功能点清单 ⑤ 架构实现明细（合并自原 `os/architecture/functions.md` §4.8，原文件已归档）
> 功能编码：`FAM-01~04` + `FxRate`（汇率），沿用 [PRD](../../../development/requirements/PRD.md)

---

## 1. 定位与价值主张

> 产品是什么、三条硬边界、价值主线：见 [PRODUCT_LINES.md §1](../PRODUCT_LINES.md)（唯一权威定义）。本节只写本线专属的定位与价值。

**价值主张：跨账户、跨币种，以 RMB 一屏看清家庭总资产。**

本线是唯一做**跨币种折算**的地方（组合内一律不跨币种汇总）。它回答家庭共同所有者最关心的一句话：「我们家一共多少钱、这些钱分布在哪、最近发生了什么」。

- **上游依赖**：PL-1 持仓、PL-2 价格、汇率服务。
- **下游影响**：无（终点视图）；其「提醒入口」指向 PL-5 通知中心。
- **保守原则**：**任一币种桶缺价或缺汇率 → 该组合 `cnyValue` 为 `null` 且不计入家庭总额**（宁可少报不可错报），前端显式提示「部分组合折算不完整」。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 中 | 汇总 / 分桶 / 贡献 / 动态 / 汇率齐全，但只有「看」 |
| 用户体验 | 中高 | 卡片与进度条成熟；但动态太少、无趋势 |
| 数据可信 | 中高 | 折算保守原则到位；汇率单源、缺汇率无补录引导 |

**主要短板**：① 只有「快照」无「趋势」；② 只有「看」无「目标」；③ 汇率单源 + 缺汇率静默为 `null`。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 用户价值 | 现状 |
|---|---|---|---|
| **M6.1 家庭汇总** | FAM-01 家庭 Dashboard、FAM-02 组合贡献、FAM-04 最近动态 | RMB 折算的家庭总资产 + 币种分桶 | 较完整；无趋势、动态太少 |
| **M6.2 汇率服务** | FxRate 采集 / 查询 / 手动录入、`/api/family/fx/*` | 折算所需的汇率底座（失败可兜底） | 较完整；单源、无「汇率过期」提示 |
| **M6.3 提醒入口** | FAM-03 待处理提醒入口 | 从总览直达待办 | 即 M5.3 通知中心，属**重复描述**（见合并项） |

---

## 4. 全量功能评估

> 判定标准见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码。

| 编号 | 功能 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| FAM-01 | 家庭 Dashboard | **强化** | 只有「当前快照」，无「总资产趋势」；家庭层无法回答「这个季度长没长」 | 增加家庭总资产时间序列（按日 / 周 / 月）与环比 | **P1** |
| FAM-02 | 组合贡献 | 保留 | 占比进度条 + 可下钻 | — | — |
| FAM-03 | 提醒入口 | **合并** | 与 AL-07 通知中心是同一物（PRD 已注明「即其落地形态」），列为独立编号属重复描述 | 在文档层面合并描述，避免重复评估与排期 | P3 |
| FAM-04 | 最近动态 | **强化** | 仅最近 10 笔，无法回溯 | 支持分页 / 按类型筛选 | P2 |
| FxRate | 汇率服务 | **强化** | 单源（er-api）+ 手动；缺汇率时结果静默为 `null`，无「去补录」引导 | 增加第二数据源或多日回退；组合页「家庭汇率」面板对「汇率过期 / 缺失」给出显式补录入口 | P2 |
| — | 历史时点汇率重算 | **强化（远期）** | PRD 已列为远期原则，但未排期、未明确取舍 | 明确「排期 or 放弃」——含则列入版本，不含则写入非目标 | P2 |

---

## 5. 已实现功能点清单

### M6.1 家庭汇总

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| FAM-01 | 家庭 Dashboard | 以 **RMB 折算**的家庭总资产（首页顶部卡）+ CNY / USD / CAD / HKD 各自金额分桶（港股 HKD 单列，组合列表页） | `/` + `/portfolios` |
| FAM-02 | 组合贡献分解 | 各组合市值与占家庭比例（RMB 基准），**堆叠条 + 图例**展示，点图例项直达该组合持仓；`ratio=null` 不占条宽并标「折算不完整」 | `/portfolios` |
| FAM-04 | 最近动态 | 最近交易（仅 5 条预览）+ 最近再平衡记录 10 条（交易买红卖绿、分红浅紫；再平衡标注 自动/手动 与 待确认/已执行/已撤销） | `/portfolios` |
| — | RMB 折算保守原则 | CNY 恒为 1，外币取最新汇率；**任一币种桶缺价或缺汇率 → 该组合 `cnyValue` 为 `null` 且不计入家庭总额**（宁可少报不可错报），前端提示「部分组合折算不完整」 | `familySummary.service.js` |
| — | 家庭区块宿主页 | 原独立「家庭视图」页已下线（TASK-050）：总资产卡在首页（含 `asOf` 与折算不完整提示）；币种分桶、组合占比条、最近交易/再平衡、汇率折叠面板并入组合列表页 | `/` + `/portfolios` |

### M6.2 汇率服务

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| — | 汇率模型与幂等 | `FxRate`（`currency(USD/CAD/HKD)` / `rateToCny` / `date` / `source` / `note`），按 `(currency,date)` **唯一索引**幂等 upsert | `shared/models/fxRate.js` |
| — | 汇率采集 | `fetchFromProvider`：`https://open.er-api.com/v6/latest/CNY`（免费免 key），超时 15s，来源标记 `source='er-api'` | `fxRate.service.js` |
| — | 手动录入兜底 | 采集失败或需修正时手动录入，标记 `source='manual'`（语义：1 外币 = `rateToCny` 人民币） | `PUT /api/family/fx/rates/:currency` |
| — | 采集调度 | 默认 **09:30**（`FX_SYNC_CRON`，央行中间价公布后）；**失败仅记日志**，不阻塞其他调度 | 定时（cron-worker） |
| — | 家庭 API | `GET /family/summary`、`GET /family/fx/rates`、`PUT /family/fx/rates/:currency`、`POST /family/fx/sync`（失败 `502` 并提示可手动录入） | API |

### M6.3 提醒入口

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| FAM-03 | 待处理提醒入口 | 即通知中心（AL-07）的落地形态——从家庭总览直达待办事件 | `/` |

---

## 6. 架构实现明细（合并自原 functions.md §4.8）

**承载**：`shared/services/familySummary.service.js`、`shared/services/fxRate.service.js`、`cron-worker/src/schedulers/fxScheduler.js`、`client/src/components/Household/*`（`TotalAssetsCard` / `CurrencyBuckets` / `ContributionBar` / `RecentTransactions` / `RecentRebalance` / `FxPanel`）

| 功能 | 说明 |
|---|---|
| FAM-01 家庭 Dashboard | 以 RMB 折算的家庭总资产 + CNY/USD/CAD/HKD 各自金额分桶 |
| FAM-02 组合贡献分解 | 各组合市值、占家庭比例（RMB 基准） |
| FAM-03 待处理提醒入口 | 即通知中心（AL-07）落地形态 |
| FAM-04 最近动态 | 最近交易 + 最近再平衡记录 |

### 6.1 RMB 折算规则

`buildFamilySummary`：CNY 恒为 1，外币取最新汇率。**关键保守原则**：**任一币种桶缺价或缺汇率 → 该组合 `cnyValue` 为 `null` 且不计入家庭总额**（宁可少报不可错报），前端显示「部分组合折算不完整（缺价或缺汇率）」。

### 6.2 汇率服务

- 支持币种 `['USD','CAD','HKD']`，语义为「1 外币 = `rateToCny` 人民币」。
- `fetchFromProvider`：`https://open.er-api.com/v6/latest/CNY`（免费免 key），超时 15s，来源标记 `source='er-api'`。
- `upsertRate`：按 `(currency, date)` 幂等 upsert；手动录入标记 `source='manual'`。
- 采集调度：默认 **09:30**（`FX_SYNC_CRON`，央行中间价公布后）；**采集失败仅记日志**，不阻塞其他调度，组合页「家庭汇率」面板可手动兜底。

### 6.3 前端（首页 + 组合列表页）

首页顶部**家庭总资产卡**（渐变蓝，含 `asOf` 与折算不完整提示，点击进组合管理）；组合列表页自上而下承接家庭五区块：**币种分桶卡**（固定顺序 USD/CAD/CNY/HKD，非 CNY 显示 `1 {currency} ≈ ¥{rate}`；符号用 `US$`/`CA$`）、**组合占比堆叠条 + 图例**（点图例跳该组合持仓）、**最近交易 5 条 + 查看全部**、**最近再平衡 10 条**、**家庭汇率折叠面板**（默认收起，含「同步汇率」与手动录入，展开后才请求 `fx-rates`）。口径说明恒显示：分桶与占比仅含未归档组合。

### 6.4 家庭 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/family/summary` | 家庭汇总（`totalCny` + `buckets` + `fxRates` + `portfolioContributions` + 最近动态） |
| GET | `/api/family/fx/rates` | 最新汇率（含日期/来源） |
| PUT | `/api/family/fx/rates/:currency` | 手动录入（`USD/CAD/HKD`） |
| POST | `/api/family/fx/sync` | 触发采集（失败 `502`，提示可手动录入） |

**数据模型**

| 模型 | 关键字段 | 唯一索引 / 主索引 |
|---|---|---|
| **FxRate** | `currency`(USD/CAD/HKD)、`rateToCny`、`date`、`source`(er-api/manual)、`note` | `{currency,date:-1}` **unique** |

---

## 7. 边界与已知缺口

- **只有快照无趋势**（FAM-01）：家庭层无法回答「这个季度长没长」。
- **只有「看」无「目标」**：本线无家庭级目标配置能力（PRD 亦未列）。
- **汇率单源**：仅 er-api，缺多日回退；缺汇率时静默为 `null`，无补录引导。
- **FAM-03 重复描述**：与 AL-07 是同一物，文档层面应合并。

---

## 8. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级）
- [PL-2 行情数据线](./PL-2-market-data.md) — 价格是折算输入
- [PL-3 组合与配置线](./PL-3-portfolio.md) — 组合是折算的聚合单元
- [PL-5 提醒与通知线](./PL-5-alerting.md) — FAM-03 的落地形态
- [PRD.md](../../../development/requirements/PRD.md) — 需求基线（功能编码来源）
- functions.md（已归档） — 本文 §6 的原始来源
